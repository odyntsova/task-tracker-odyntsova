import { app, request, prisma, cleanDb, bearer } from './helpers'
import { setEmailTransport, EmailMessage } from '../../src/mailer'

const sent: EmailMessage[] = []
beforeAll(() => setEmailTransport({ async send(m) { sent.push(m) } }))
beforeEach(async () => {
  await cleanDb()
  sent.length = 0
})
afterAll(async () => {
  await cleanDb()
  await prisma.$disconnect()
})

const tokenFromLastEmail = () => sent[sent.length - 1].text.split(': ')[1]

describe('Auth: signup + verification', () => {
  it('signs up an unverified user and emails a verification token (no auto-login)', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'A@Example.com', password: 'password123' })
    expect(res.status).toBe(201)
    expect(res.body.data).not.toHaveProperty('tokens')

    const user = await prisma.user.findUnique({ where: { email: 'a@example.com' } })
    expect(user!.emailVerifiedAt).toBeNull()
    expect(sent.some((m) => m.subject === 'Verify your email')).toBe(true)
  })

  it('rejects duplicate email (409) and short password (422)', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'dup@example.com', password: 'password123' })
    const dup = await request(app).post('/api/auth/signup').send({ email: 'dup@example.com', password: 'password123' })
    expect(dup.status).toBe(409)

    const weak = await request(app).post('/api/auth/signup').send({ email: 'x@example.com', password: 'short' })
    expect(weak.status).toBe(422)
  })

  it('blocks business endpoints until verified, then allows after verification', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'v@example.com', password: 'password123' })
    const login = await request(app).post('/api/auth/login').send({ email: 'v@example.com', password: 'password123' })
    expect(login.status).toBe(200)
    const token = login.body.data.tokens.accessToken

    const blocked = await request(app).get('/api/teams').set('Authorization', `Bearer ${token}`)
    expect(blocked.status).toBe(403)

    const verify = await request(app).post('/api/auth/verify-email').send({ token: tokenFromLastEmail() })
    expect(verify.status).toBe(200)

    const ok = await request(app).get('/api/teams').set('Authorization', `Bearer ${token}`)
    expect(ok.status).toBe(200)
  })

  it('resend invalidates the previous token; used/old token rejected (400)', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'r@example.com', password: 'password123' })
    const firstToken = tokenFromLastEmail()

    await request(app).post('/api/auth/resend-verification').send({ email: 'r@example.com' })
    const secondToken = tokenFromLastEmail()
    expect(secondToken).not.toBe(firstToken)

    expect((await request(app).post('/api/auth/verify-email').send({ token: firstToken })).status).toBe(400)
    expect((await request(app).post('/api/auth/verify-email').send({ token: secondToken })).status).toBe(200)
  })

  it('rejects an expired verification token (400) and leaves the account unverified', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'exp@example.com', password: 'password123' })
    const token = tokenFromLastEmail()

    // Tokens live for 24h; force this one into the past to exercise the expiry guard.
    const user = await prisma.user.findUnique({ where: { email: 'exp@example.com' } })
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user!.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(400)
    const after = await prisma.user.findUnique({ where: { email: 'exp@example.com' } })
    expect(after!.emailVerifiedAt).toBeNull()
  })
})

describe('Auth: password reset (stretch)', () => {
  it('forgot → reset → login with the new password; old password rejected', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'pr@example.com', password: 'oldpassword1' })
    await request(app).post('/api/auth/forgot-password').send({ email: 'pr@example.com' })
    const token = tokenFromLastEmail()

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword1' })
    expect(reset.status).toBe(200)

    expect((await request(app).post('/api/auth/login').send({ email: 'pr@example.com', password: 'newpassword1' })).status).toBe(200)
    expect((await request(app).post('/api/auth/login').send({ email: 'pr@example.com', password: 'oldpassword1' })).status).toBe(401)
  })

  it('rejects an invalid reset token (400) and re-using a spent one (400)', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'pr2@example.com', password: 'oldpassword1' })
    await request(app).post('/api/auth/forgot-password').send({ email: 'pr2@example.com' })
    const token = tokenFromLastEmail()

    expect((await request(app).post('/api/auth/reset-password').send({ token: 'not-real', password: 'newpassword1' })).status).toBe(400)
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword1' })).status).toBe(200)
    // single-use: the token is spent
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'another12' })).status).toBe(400)
  })
})

describe('Auth: login + session', () => {
  it('wrong password → 401; /me requires auth', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'l@example.com', password: 'password123' })
    expect((await request(app).post('/api/auth/login').send({ email: 'l@example.com', password: 'nope' })).status).toBe(401)
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
  })

  it('a legacy/non-argon2 password hash yields 401, not a server crash', async () => {
    // Pre-argon2 accounts stored a bcrypt hash; argon2 verify() throws on it.
    // The login route must treat that as a mismatch instead of letting the
    // rejection crash the process.
    await prisma.user.create({
      data: { email: 'legacy@example.com', passwordHash: '$2a$10$abcdefghijklmnopqrstuv', emailVerifiedAt: new Date() },
    })
    const res = await request(app).post('/api/auth/login').send({ email: 'legacy@example.com', password: 'whatever123' })
    expect(res.status).toBe(401)
  })

  it('/me returns the current user and verification flag, never the hash', async () => {
    const u = await prisma.user.create({
      data: { email: 'me@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    })
    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(u.id))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ email: 'me@example.com', emailVerified: true })
    expect(res.body.data).not.toHaveProperty('passwordHash')
  })
})
