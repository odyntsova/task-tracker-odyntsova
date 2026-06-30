import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { rateLimit } from '../middleware/rateLimit'
import { issueTokens, hashToken, generateRefreshTokenValue } from '../tokens'
import { sendEmail } from '../mailer'

const authLimiter = rateLimit({ windowMs: 60_000, max: 200 })

export const authRouter = Router()
const prisma = new PrismaClient()

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

// argon2's verify() throws on a malformed/legacy (non-argon2) hash. An uncaught
// throw here would crash the whole process, so treat any failure as a mismatch.
async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(storedHash, password)
  } catch {
    return false
  }
}

// Sign-up enforces the password policy; login only needs a non-empty password.
const credsSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(72),
})
const loginSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(1).max(72),
})

// Issues a fresh verification token, invalidating any earlier unused ones.
async function sendVerificationEmail(userId: string, email: string) {
  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  })
  const token = generateRefreshTokenValue()
  await prisma.emailVerificationToken.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS) },
  })
  await sendEmail({
    to: email,
    subject: 'Verify your email',
    text: `Confirm your email with this token: ${token}`,
  })
}

// --- Sign up --------------------------------------------------------------
authRouter.post('/signup', authLimiter, async (req, res) => {
  const parsed = credsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const { email, password } = parsed.data

  if (await prisma.user.findUnique({ where: { email } })) {
    res.status(409).json({ data: null, error: 'Email already registered' })
    return
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await argonHash(password) },
  })
  await sendVerificationEmail(user.id, user.email)

  // No auto-login: the user verifies, then logs in.
  res.status(201).json({ data: { id: user.id, email: user.email }, error: null })
})

// --- Log in ---------------------------------------------------------------
authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    res.status(401).json({ data: null, error: 'Invalid email or password' })
    return
  }

  const tokens = await issueTokens(prisma, user)
  res.json({
    data: {
      user: { id: user.id, email: user.email, emailVerified: !!user.emailVerifiedAt },
      tokens,
    },
    error: null,
  })
})

// --- Email verification ---------------------------------------------------
const tokenSchema = z.object({ token: z.string().min(1) })

authRouter.post('/verify-email', authLimiter, async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  })
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    res.status(400).json({ data: null, error: 'Invalid or expired verification token' })
    return
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])
  res.json({ data: null, error: null })
})

// Resend — public; used from the login/verification screen by unverified users.
const emailOnlySchema = z.object({ email: z.string().trim().email().toLowerCase() })
authRouter.post('/resend-verification', authLimiter, async (req, res) => {
  const parsed = emailOnlySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (user && !user.emailVerifiedAt) {
    await sendVerificationEmail(user.id, user.email)
  }
  res.json({ data: null, error: null }) // never reveal account existence/state
})

// --- Session ---------------------------------------------------------------
authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, emailVerifiedAt: true, createdAt: true },
  })
  if (!user) {
    res.status(404).json({ data: null, error: 'User not found' })
    return
  }
  res.json({ data: { ...user, emailVerified: !!user.emailVerifiedAt }, error: null })
})

const refreshSchema = z.object({ refreshToken: z.string().min(1) })
authRouter.post('/refresh', authLimiter, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.refreshToken) },
    include: { user: true },
  })
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    res.status(401).json({ data: null, error: 'Invalid or expired refresh token' })
    return
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } })
  const tokens = await issueTokens(prisma, stored.user)
  res.json({ data: { tokens }, error: null })
})

authRouter.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  const refreshToken = (req.body?.refreshToken as string | undefined) ?? ''
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), userId: req.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  res.json({ data: null, error: null })
})

// --- Password reset (stretch) ---------------------------------------------
const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(8).max(72) })

authRouter.post('/forgot-password', authLimiter, async (req, res) => {
  const parsed = emailOnlySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (user) {
    const token = generateRefreshTokenValue()
    await prisma.passwordResetToken.create({
      data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) },
    })
    await sendEmail({ to: user.email, subject: 'Password reset', text: `Reset token: ${token}` })
  }
  res.json({ data: null, error: null })
})

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  })
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    res.status(400).json({ data: null, error: 'Invalid or expired reset token' })
    return
  }
  const passwordHash = await argonHash(parsed.data.password)
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ])
  res.json({ data: null, error: null })
})
