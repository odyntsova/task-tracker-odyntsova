import request from 'supertest'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { app } from '../../src/app'

const prisma = new PrismaClient()

async function cleanDb() {
  await prisma.comment.deleteMany()
  await prisma.taskActivity.deleteMany()
  await prisma.task.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.passwordResetToken.deleteMany()
  await prisma.emailVerificationToken.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
}

beforeEach(cleanDb)
afterAll(async () => {
  await cleanDb()
  await prisma.$disconnect()
})

// Builds a project with a known mix of tasks and returns the auth token.
async function seedTasks() {
  const dev = await prisma.user.create({
    data: { name: 'Dev', email: 'dev@example.com', passwordHash: await bcrypt.hash('password123', 10), role: 'DEVELOPER' },
  })
  const qa = await prisma.user.create({
    data: { name: 'QA', email: 'qa@example.com', passwordHash: await bcrypt.hash('password123', 10), role: 'QA' },
  })
  const project = await prisma.project.create({ data: { name: 'Filter project' } })

  await prisma.task.createMany({
    data: [
      { title: 'Fix login bug', status: 'TODO', priority: 'HIGH', projectId: project.id, creatorId: dev.id, assigneeId: dev.id },
      { title: 'Write login tests', status: 'IN_PROGRESS', priority: 'MEDIUM', projectId: project.id, creatorId: qa.id, assigneeId: qa.id },
      { title: 'Refactor dashboard', status: 'TODO', priority: 'LOW', projectId: project.id, creatorId: dev.id },
      { title: 'Deploy script', status: 'DONE', priority: 'HIGH', projectId: project.id, creatorId: dev.id, assigneeId: dev.id },
    ],
  })

  const login = await request(app).post('/api/auth/login').send({ email: 'dev@example.com', password: 'password123' })
  return { token: login.body.data.tokens.accessToken as string, projectId: project.id, devId: dev.id }
}

const authGet = (url: string, token: string) =>
  request(app).get(url).set('Authorization', `Bearer ${token}`)

describe('Integration: task filtering on real data', () => {
  it('filters by status and counts only the filtered set (meta.total fix)', async () => {
    const { token, projectId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?status=TODO`, token)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    // total reflects the FILTER, not all 4 tasks in the project
    expect(res.body.meta.total).toBe(2)
    expect(res.body.data.every((t: { status: string }) => t.status === 'TODO')).toBe(true)
  })

  it('filters by priority', async () => {
    const { token, projectId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?priority=HIGH`, token)

    expect(res.body.meta.total).toBe(2)
    expect(res.body.data.every((t: { priority: string }) => t.priority === 'HIGH')).toBe(true)
  })

  it('filters by assignee', async () => {
    const { token, projectId, devId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?assignee=${devId}`, token)

    expect(res.body.meta.total).toBe(2)
  })

  it('returns only unassigned tasks for assignee=unassigned', async () => {
    const { token, projectId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?assignee=unassigned`, token)

    expect(res.body.meta.total).toBe(1)
    expect(res.body.data[0].title).toBe('Refactor dashboard')
  })

  it('searches by title substring', async () => {
    const { token, projectId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?q=login`, token)

    expect(res.body.meta.total).toBe(2) // "Fix login bug" + "Write login tests"
  })

  it('sorts by title ascending', async () => {
    const { token, projectId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?sortBy=title&order=asc`, token)

    const titles = res.body.data.map((t: { title: string }) => t.title)
    expect(titles).toEqual([...titles].sort())
  })

  it('combines a filter with pagination correctly', async () => {
    const { token, projectId } = await seedTasks()

    const res = await authGet(`/api/projects/${projectId}/tasks?status=TODO&limit=1&page=1`, token)

    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta).toEqual({ page: 1, limit: 1, total: 2 })
  })
})
