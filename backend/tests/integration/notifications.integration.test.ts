import request from 'supertest'
import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client'
import { app } from '../../src/app'
import { setEmailTransport, EmailMessage } from '../../src/mailer'

// Capture emails the app tries to send (NOTIF-3).
const sentEmails: EmailMessage[] = []
beforeAll(() => setEmailTransport({ async send(m) { sentEmails.push(m) } }))

const prisma = new PrismaClient()

async function cleanDb() {
  await prisma.comment.deleteMany()
  await prisma.task.deleteMany()
  await prisma.refreshToken.deleteMany()
  await prisma.passwordResetToken.deleteMany()
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

describe('Integration: notifications (NOTIF-1/2)', () => {
  it('assigning a task notifies the assignee, who can list and read it', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const qa = await createUser('QA', 'qa@example.com')
    const pmToken = await loginToken('pm@example.com')
    const qaToken = await loginToken('qa@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'Important task', projectId: project.id, creatorId: pm.id },
    })

    // PM assigns the task to QA
    const assign = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ assigneeId: qa.id })
    expect(assign.status).toBe(200)

    // QA sees one unread notification
    const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${qaToken}`)
    expect(list.status).toBe(200)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].type).toBe('TASK_ASSIGNED')
    expect(list.body.meta.unread).toBe(1)

    // PM has none (no self-notification)
    const pmList = await request(app).get('/api/notifications').set('Authorization', `Bearer ${pmToken}`)
    expect(pmList.body.data).toHaveLength(0)

    // QA marks it read → unread drops to 0
    const notifId = list.body.data[0].id
    const read = await request(app)
      .post(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${qaToken}`)
    expect(read.status).toBe(200)

    const after = await request(app).get('/api/notifications').set('Authorization', `Bearer ${qaToken}`)
    expect(after.body.meta.unread).toBe(0)
  })

  it('also delivers an email to the assignee on assignment (NOTIF-3)', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const qa = await createUser('QA', 'qa@example.com')
    const pmToken = await loginToken('pm@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'Emailed task', projectId: project.id, creatorId: pm.id },
    })

    sentEmails.length = 0
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ assigneeId: qa.id })

    expect(sentEmails.some((e) => e.to === 'qa@example.com')).toBe(true)
  })

  it('a status change by someone else notifies the assignee', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const qa = await createUser('QA', 'qa@example.com')
    const pmToken = await loginToken('pm@example.com')
    const qaToken = await loginToken('qa@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', status: 'IN_REVIEW', projectId: project.id, creatorId: pm.id, assigneeId: qa.id },
    })

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ status: 'DONE' })

    const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${qaToken}`)
    expect(list.body.data.some((n: { type: string }) => n.type === 'TASK_STATUS_CHANGED')).toBe(true)
  })

  it('cannot read another user\'s notification (404)', async () => {
    const pm = await createUser('PM', 'pm@example.com')
    const qa = await createUser('QA', 'qa@example.com')
    const pmToken = await loginToken('pm@example.com')
    const qaToken = await loginToken('qa@example.com')
    const project = await prisma.project.create({ data: { name: 'P' } })
    const task = await prisma.task.create({
      data: { title: 'T', projectId: project.id, creatorId: pm.id },
    })
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ assigneeId: qa.id })

    const qaList = await request(app).get('/api/notifications').set('Authorization', `Bearer ${qaToken}`)
    const notifId = qaList.body.data[0].id

    // PM tries to mark QA's notification read
    const res = await request(app)
      .post(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${pmToken}`)
    expect(res.status).toBe(404)
  })
})
