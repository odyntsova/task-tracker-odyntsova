import request from 'supertest'
import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client'
import { app } from '../../src/app'

// Real DB — no jest.mock here. Uses DATABASE_URL/JWT_SECRET from the npm script.
const prisma = new PrismaClient()

async function cleanDb() {
  await prisma.comment.deleteMany()
  await prisma.taskActivity.deleteMany()
  // Delete in FK-safe order: tasks → refresh tokens → projects → users.
  await prisma.task.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.passwordResetToken.deleteMany()
  await prisma.emailVerificationToken.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
}

async function createUser(role: UserRole, email: string, password = 'password123') {
  return prisma.user.create({
    data: { name: `${role} user`, email, passwordHash: await bcrypt.hash(password, 10), role },
  })
}

async function loginToken(email: string, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password })
  return res.body.data.tokens.accessToken as string
}

beforeEach(cleanDb)

afterAll(async () => {
  await cleanDb()
  await prisma.$disconnect()
})

describe('Integration: registration persists to the real DB', () => {
  it('stores a new user with a lowercased email and DEVELOPER role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Olena', email: 'Olena.QA@Example.COM', password: 'password123' })

    expect(res.status).toBe(201)

    const stored = await prisma.user.findUnique({ where: { email: 'olena.qa@example.com' } })
    expect(stored).not.toBeNull()
    expect(stored!.role).toBe('DEVELOPER')
    // password is hashed, never stored in plain text
    expect(stored!.passwordHash).not.toBe('password123')
  })

  it('enforces the unique-email constraint at the DB level (409 on duplicate)', async () => {
    await createUser('QA', 'dupe@example.com')

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dupe', email: 'dupe@example.com', password: 'password123' })

    expect(res.status).toBe(409)
    const count = await prisma.user.count({ where: { email: 'dupe@example.com' } })
    expect(count).toBe(1)
  })

  it('supports the full register → login round trip', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Round', email: 'round@example.com', password: 'password123' })

    // login with a DIFFERENT case — must still match (BUG-1 parity, real DB)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ROUND@example.com', password: 'password123' })

    expect(res.status).toBe(200)
    expect(res.body.data.user.email).toBe('round@example.com')
  })
})

describe('Integration: refresh-token flow (AUTH-3/AUTH-4)', () => {
  async function registerAndGetTokens(email: string) {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'R', email, password: 'password123' })
    return res.body.data.tokens as { accessToken: string; refreshToken: string }
  }

  it('issues a refresh token on register and rotates it on /refresh', async () => {
    const { refreshToken } = await registerAndGetTokens('refresh@example.com')
    expect(refreshToken).toEqual(expect.any(String))

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken })

    expect(res.status).toBe(200)
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String))
    // rotation: a new refresh token, different from the old one
    expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken)
    // the old token row is now revoked
    expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1)
  })

  it('rejects reuse of a rotated (revoked) refresh token with 401', async () => {
    const { refreshToken } = await registerAndGetTokens('reuse@example.com')
    await request(app).post('/api/auth/refresh').send({ refreshToken }) // rotates it

    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken })

    expect(reuse.status).toBe(401)
  })

  it('logout revokes the refresh token so it can no longer be used', async () => {
    const { accessToken, refreshToken } = await registerAndGetTokens('logout@example.com')

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })

    const afterLogout = await request(app).post('/api/auth/refresh').send({ refreshToken })
    expect(afterLogout.status).toBe(401)
  })
})

describe('Integration: RBAC against real users', () => {
  it('lets an ADMIN create a project (201) and persists it', async () => {
    await createUser('ADMIN', 'admin@example.com')
    const token = await loginToken('admin@example.com')

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Real Project' })

    expect(res.status).toBe(201)
    const count = await prisma.project.count()
    expect(count).toBe(1)
  })

  it('forbids a DEVELOPER from creating a project (403, nothing persisted)', async () => {
    await createUser('DEVELOPER', 'dev@example.com')
    const token = await loginToken('dev@example.com')

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sneaky Project' })

    expect(res.status).toBe(403)
    expect(await prisma.project.count()).toBe(0)
  })
})

describe('Integration: GET /api/users on real data', () => {
  it('lists all users without exposing passwordHash', async () => {
    await createUser('ADMIN', 'admin@example.com')
    await createUser('QA', 'qa@example.com')
    const token = await loginToken('admin@example.com')

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    for (const user of res.body.data) {
      expect(user).not.toHaveProperty('passwordHash')
      expect(user).toHaveProperty('role')
    }
  })
})

describe('Integration: task creation + pagination on real data', () => {
  it('creates a task under a project and returns it in the paginated list', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })

    const created = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Real task', priority: 'HIGH' })

    expect(created.status).toBe(201)
    // creatorId is taken from the token, not the body
    const stored = await prisma.task.findUnique({ where: { id: created.body.data.id } })
    expect(stored!.creatorId).toBe(pm.id)

    const list = await request(app)
      .get(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.meta).toEqual({ page: 1, limit: 20, total: 1 })
  })

  it('paginates correctly across multiple tasks', async () => {
    await createUser('PM', 'pm2@example.com')
    const token = await loginToken('pm2@example.com')
    const project = await prisma.project.create({ data: { name: 'P2' } })

    // create 25 tasks
    for (let i = 0; i < 25; i++) {
      await request(app)
        .post(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: `Task ${i}` })
    }

    const page2 = await request(app)
      .get(`/api/projects/${project.id}/tasks?page=2&limit=10`)
      .set('Authorization', `Bearer ${token}`)

    expect(page2.status).toBe(200)
    expect(page2.body.data).toHaveLength(10)
    expect(page2.body.meta).toEqual({ page: 2, limit: 10, total: 25 })
  })
})

describe('Integration: role management (RBAC-5)', () => {
  it('ADMIN promotes a user; the new role persists and is enforced', async () => {
    await createUser('ADMIN', 'admin@example.com')
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    const adminToken = await loginToken('admin@example.com')

    const res = await request(app)
      .patch(`/api/users/${dev.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'PM' })

    expect(res.status).toBe(200)
    const stored = await prisma.user.findUnique({ where: { id: dev.id } })
    expect(stored!.role).toBe('PM')
  })

  it('non-admin cannot change roles (403, unchanged)', async () => {
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    await createUser('QA', 'qa@example.com')
    const qaToken = await loginToken('qa@example.com')

    const res = await request(app)
      .patch(`/api/users/${dev.id}/role`)
      .set('Authorization', `Bearer ${qaToken}`)
      .send({ role: 'ADMIN' })

    expect(res.status).toBe(403)
    const stored = await prisma.user.findUnique({ where: { id: dev.id } })
    expect(stored!.role).toBe('DEVELOPER')
  })
})

describe('Integration: password reset (AUTH-6)', () => {
  const sent: import('../../src/mailer').EmailMessage[] = []
  beforeAll(() => {
    const { setEmailTransport } = require('../../src/mailer')
    setEmailTransport({ async send(m: import('../../src/mailer').EmailMessage) { sent.push(m) } })
  })

  it('full flow: forgot → email token → reset → old password fails, new works, sessions revoked', async () => {
    await createUser('DEVELOPER', 'reset-me@example.com')
    // a live session that should be revoked by the reset
    const oldLogin = await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'password123' })
    const oldRefresh = oldLogin.body.data.tokens.refreshToken

    sent.length = 0
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: 'reset-me@example.com' })
    expect(forgot.status).toBe(200)
    // extract the raw token from the captured email
    const token = sent[sent.length - 1].text.split(': ')[1]
    expect(token).toBeTruthy()

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'brandnewpass1' })
    expect(reset.status).toBe(200)

    // old password no longer works
    const oldPw = await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'password123' })
    expect(oldPw.status).toBe(401)
    // new password works
    const newPw = await request(app).post('/api/auth/login').send({ email: 'reset-me@example.com', password: 'brandnewpass1' })
    expect(newPw.status).toBe(200)
    // the pre-reset refresh token was revoked
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: oldRefresh })
    expect(reuse.status).toBe(401)
  })

  it('a used reset token cannot be reused (400)', async () => {
    await createUser('DEVELOPER', 'once@example.com')
    sent.length = 0
    await request(app).post('/api/auth/forgot-password').send({ email: 'once@example.com' })
    const token = sent[sent.length - 1].text.split(': ')[1]

    await request(app).post('/api/auth/reset-password').send({ token, password: 'firstpass12' })
    const second = await request(app).post('/api/auth/reset-password').send({ token, password: 'secondpass12' })
    expect(second.status).toBe(400)
  })
})

describe('Integration: email verification (AUTH-7)', () => {
  const vSent: import('../../src/mailer').EmailMessage[] = []
  beforeAll(() => {
    const { setEmailTransport } = require('../../src/mailer')
    setEmailTransport({ async send(m: import('../../src/mailer').EmailMessage) { vSent.push(m) } })
  })

  it('register emails a verification token; verify-email marks the user verified', async () => {
    vSent.length = 0
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'V', email: 'verify@example.com', password: 'password123' })
    expect(reg.status).toBe(201)

    const verifyMail = vSent.find((m) => m.subject === 'Verify your email')
    expect(verifyMail).toBeTruthy()
    const token = verifyMail!.text.split(': ')[1]

    const before = await prisma.user.findUnique({ where: { email: 'verify@example.com' } })
    expect(before!.emailVerifiedAt).toBeNull()

    const res = await request(app).post('/api/auth/verify-email').send({ token })
    expect(res.status).toBe(200)

    const after = await prisma.user.findUnique({ where: { email: 'verify@example.com' } })
    expect(after!.emailVerifiedAt).not.toBeNull()
  })
})
