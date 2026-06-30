import request from 'supertest'
import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client'
import { app } from '../../src/app'

const prisma = new PrismaClient()

async function cleanDb() {
  await prisma.comment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.passwordResetToken.deleteMany()
  await prisma.emailVerificationToken.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
}

async function createUser(role: UserRole, email: string) {
  return prisma.user.create({
    data: { name: `${role} user`, email, passwordHash: await bcrypt.hash('password123', 10), role },
  })
}

async function loginToken(email: string) {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'password123' })
  return res.body.data.tokens.accessToken as string
}

beforeEach(cleanDb)
afterAll(async () => {
  await cleanDb()
  await prisma.$disconnect()
})

describe('Integration: status transitions on real data', () => {
  it('persists a legal transition TODO → IN_PROGRESS', async () => {
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    const token = await loginToken('dev@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', status: 'TODO', projectId: project.id, creatorId: dev.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'IN_PROGRESS' })

    expect(res.status).toBe(200)
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored!.status).toBe('IN_PROGRESS')
  })

  it('rejects an illegal transition TODO → DONE and leaves status unchanged', async () => {
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    const token = await loginToken('dev@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', status: 'TODO', projectId: project.id, creatorId: dev.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DONE' })

    expect(res.status).toBe(422)
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored!.status).toBe('TODO') // unchanged
  })
})

describe('Integration: RBAC-6 task edit ownership on real data', () => {
  it('forbids a non-owner DEVELOPER from editing someone else\'s task (403)', async () => {
    const owner = await createUser('DEVELOPER', 'owner@example.com')
    await createUser('DEVELOPER', 'intruder@example.com')
    const intruderToken = await loginToken('intruder@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'Owned task', status: 'TODO', projectId: project.id, creatorId: owner.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({ status: 'IN_PROGRESS' })

    expect(res.status).toBe(403)
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored!.status).toBe('TODO') // unchanged
  })

  it('lets a PM edit any task (200)', async () => {
    const owner = await createUser('DEVELOPER', 'owner@example.com')
    await createUser('PM', 'pm@example.com')
    const pmToken = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'Owned task', status: 'TODO', projectId: project.id, creatorId: owner.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ status: 'IN_PROGRESS' })

    expect(res.status).toBe(200)
  })
})

describe('Integration: assignee existence on real data', () => {
  it('assigns a task to an existing user', async () => {
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    const assignee = await createUser('QA', 'qa@example.com')
    const token = await loginToken('dev@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', projectId: project.id, creatorId: dev.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeId: assignee.id })

    expect(res.status).toBe(200)
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored!.assigneeId).toBe(assignee.id)
  })

  it('rejects assigning to a non-existent user (422, assignee unchanged)', async () => {
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    const token = await loginToken('dev@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', projectId: project.id, creatorId: dev.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeId: '99999999-9999-9999-9999-999999999999' })

    expect(res.status).toBe(422)
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored!.assigneeId).toBeNull()
  })
})

describe('Integration: task comments (TASK-6)', () => {
  it('adds a comment (author from token) and lists it', async () => {
    const dev = await createUser('DEVELOPER', 'dev@example.com')
    const token = await loginToken('dev@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', projectId: project.id, creatorId: dev.id },
    })

    const created = await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'First!' })
    expect(created.status).toBe(201)
    expect(created.body.data.author.id).toBe(dev.id)

    const list = await request(app)
      .get(`/api/tasks/${task.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].body).toBe('First!')
  })
})
