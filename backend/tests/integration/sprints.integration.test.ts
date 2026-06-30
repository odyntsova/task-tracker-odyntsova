import request from 'supertest'
import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client'
import { app } from '../../src/app'

const prisma = new PrismaClient()

async function cleanDb() {
  await prisma.task.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.sprint.deleteMany()
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

describe('Integration: sprints on real data', () => {
  it('PM creates a sprint and it is persisted + listed', async () => {
    await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })

    const created = await request(app)
      .post(`/api/projects/${project.id}/sprints`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sprint 1', startDate: '2026-07-01', endDate: '2026-07-14' })

    expect(created.status).toBe(201)
    expect(await prisma.sprint.count()).toBe(1)

    const list = await request(app)
      .get(`/api/projects/${project.id}/sprints`)
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].name).toBe('Sprint 1')
  })

  it('forbids a DEVELOPER from creating a sprint (403, nothing persisted)', async () => {
    await createUser('DEVELOPER', 'dev@example.com')
    const token = await loginToken('dev@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })

    const res = await request(app)
      .post(`/api/projects/${project.id}/sprints`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Nope', startDate: '2026-07-01', endDate: '2026-07-14' })

    expect(res.status).toBe(403)
    expect(await prisma.sprint.count()).toBe(0)
  })

  it('rejects a sprint whose endDate is before startDate (422)', async () => {
    await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })

    const res = await request(app)
      .post(`/api/projects/${project.id}/sprints`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad', startDate: '2026-07-14', endDate: '2026-07-01' })

    expect(res.status).toBe(422)
    expect(await prisma.sprint.count()).toBe(0)
  })

  it('adds a task to a sprint of the same project (SPRINT-3)', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const sprint = await prisma.sprint.create({
      data: { name: 'S', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-14'), projectId: project.id },
    })
    const task = await prisma.task.create({
      data: { title: 'T', projectId: project.id, creatorId: pm.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sprintId: sprint.id })

    expect(res.status).toBe(200)
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored!.sprintId).toBe(sprint.id)
  })

  it('rejects moving a task into a sprint of a DIFFERENT project (422)', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const projectA = await prisma.project.create({ data: { name: 'A' } })
    const projectB = await prisma.project.create({ data: { name: 'B' } })
    const sprintB = await prisma.sprint.create({
      data: { name: 'SB', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-14'), projectId: projectB.id },
    })
    const taskA = await prisma.task.create({
      data: { title: 'TA', projectId: projectA.id, creatorId: pm.id },
    })

    const res = await request(app)
      .patch(`/api/tasks/${taskA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sprintId: sprintB.id })

    expect(res.status).toBe(422)
    const stored = await prisma.task.findUnique({ where: { id: taskA.id } })
    expect(stored!.sprintId).toBeNull() // unchanged
  })

  it('burndown reflects a task completed via the API (SPRINT-4)', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const sprint = await prisma.sprint.create({
      data: { name: 'S', startDate: new Date('2026-07-01'), endDate: new Date('2026-07-03'), projectId: project.id },
    })
    // two tasks in the sprint; one will be completed
    const t1 = await prisma.task.create({
      data: { title: 'A', status: 'IN_REVIEW', projectId: project.id, creatorId: pm.id, sprintId: sprint.id },
    })
    await prisma.task.create({
      data: { title: 'B', status: 'TODO', projectId: project.id, creatorId: pm.id, sprintId: sprint.id },
    })

    // complete t1 via the API (IN_REVIEW → DONE) — this stamps completedAt
    const done = await request(app)
      .patch(`/api/tasks/${t1.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DONE' })
    expect(done.status).toBe(200)
    expect(await prisma.task.findUnique({ where: { id: t1.id } }).then((t) => t!.completedAt)).not.toBeNull()

    const res = await request(app)
      .get(`/api/sprints/${sprint.id}/burndown`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(2)
    // last day remaining should be 1 (one task still open)
    const last = res.body.data.points[res.body.data.points.length - 1]
    expect(last.remaining).toBe(1)
  })

  it('GET /api/sprints/:id returns the sprint with its tasks', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const token = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const sprint = await prisma.sprint.create({
      data: {
        name: 'Sprint 1',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-14'),
        projectId: project.id,
      },
    })
    await prisma.task.create({
      data: { title: 'Sprint task', projectId: project.id, creatorId: pm.id, sprintId: sprint.id },
    })

    const res = await request(app)
      .get(`/api/sprints/${sprint.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.tasks).toHaveLength(1)
    expect(res.body.data.tasks[0].title).toBe('Sprint task')
  })
})
