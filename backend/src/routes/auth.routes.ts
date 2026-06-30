import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { rateLimit } from '../middleware/rateLimit'
import { issueTokens, hashToken } from '../tokens'

// Generous enough for local dev / test suites, while still capping brute-force
// attempts. Production should tune this lower (and back it with a shared store).
const authLimiter = rateLimit({ windowMs: 60_000, max: 200 })

export const authRouter = Router()
const prisma = new PrismaClient()

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(72),
})

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  // Email is lowercased on the way in so it matches the case-insensitive
  // lookup performed at login (see BUG-1).
  email: z.string().email().toLowerCase(),
  // Min 8 for a sane policy, max 72 because bcrypt truncates beyond that.
  password: z.string().min(8).max(72),
})

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }

  const { name, email, password } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ data: null, error: 'Email already registered' })
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)

  // Role is never taken from the request body — new users default to DEVELOPER
  // and roles are assigned later by an admin. This prevents privilege escalation
  // via a forged "role" field.
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'DEVELOPER' },
  })

  const tokens = await issueTokens(prisma, user)

  res.status(201).json({
    data: {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tokens,
    },
    error: null,
  })
})

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }

  const { email, password } = parsed.data
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ data: null, error: 'Invalid email or password' })
    return
  }

  const tokens = await issueTokens(prisma, user)

  res.json({
    data: {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      tokens,
    },
    error: null,
  })
})

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  if (!user) {
    res.status(404).json({ data: null, error: 'User not found' })
    return
  }

  res.json({ data: user, error: null })
})

const refreshSchema = z.object({ refreshToken: z.string().min(1) })

// AUTH-3: exchange a valid refresh token for a new access + refresh token pair.
// The old refresh token is rotated out (revoked) so it cannot be reused.
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

  const isValid = stored && !stored.revokedAt && stored.expiresAt > new Date()
  if (!isValid) {
    res.status(401).json({ data: null, error: 'Invalid or expired refresh token' })
    return
  }

  // Rotate: revoke the presented token, then issue a fresh pair.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  })

  const tokens = await issueTokens(prisma, stored.user)
  res.json({ data: { tokens }, error: null })
})

// AUTH-4: logout revokes the supplied refresh token (best-effort, idempotent).
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
