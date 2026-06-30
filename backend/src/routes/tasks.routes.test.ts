import request from 'supertest'
import jwt from 'jsonwebtoken'

// --- Mocks ---------------------------------------------------------------
const mockTaskFindUnique = jest.fn()
const mockTaskUpdate = jest.fn()
const mockTaskDelete = jest.fn()
const mockUserFindUnique = jest.fn()
const mockSprintFindUnique = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    task: {
      findUnique: mockTaskFindUnique,
      update: mockTaskUpdate,
      delete: mockTaskDelete,
      // included so other routers mounted on the same app don't crash
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    project: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    sprint: { findUnique: mockSprintFindUnique, findMany: jest.fn(), create: jest.fn() },
    user: { findUnique: mockUserFindUnique, create: jest.fn() },
    $transaction: jest.fn(),
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

// --- Helpers -------------------------------------------------------------
const tokenFor = (role: string) => jwt.sign({ userId: 'user-1', role }, 'test-secret')
// Default actor is a QA (can view/update, but NOT delete tasks).
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokenFor('QA')}`)
const authAs = (role: string, req: request.Test) =>
  req.set('Authorization', `Bearer ${tokenFor(role)}`)
// Sign a token for an arbitrary user id (to simulate non-owners) — RBAC-6.
const authAsUser = (userId: string, role: string, req: request.Test) =>
  req.set('Authorization', `Bearer ${jwt.sign({ userId, role }, 'test-secret')}`)

const sampleTask = () => ({
  id: 'task-1',
  title: 'Existing task',
  description: null,
  status: 'TODO',
  priority: 'MEDIUM',
  assigneeId: null,
  assignee: null,
  projectId: 'project-1',
  creatorId: 'user-1',
})

beforeEach(() => {
  mockTaskFindUnique.mockReset()
  mockTaskUpdate.mockReset()
  mockTaskDelete.mockReset()
  mockUserFindUnique.mockReset()
  mockSprintFindUnique.mockReset()
})

// --- Auth guard ----------------------------------------------------------
describe('Tasks routes — auth guard', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/tasks/task-1')
    expect(res.status).toBe(401)
    expect(mockTaskFindUnique).not.toHaveBeenCalled()
  })
})

// --- GET /api/tasks/:id --------------------------------------------------
describe('GET /api/tasks/:id', () => {
  it('returns the task when it exists', async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask())

    const res = await auth(request(app).get('/api/tasks/task-1'))

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('task-1')
    expect(res.body.error).toBeNull()
  })

  it('returns 404 when the task does not exist', async () => {
    mockTaskFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).get('/api/tasks/ghost'))

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Task not found')
  })
})

// --- PATCH /api/tasks/:id ------------------------------------------------
describe('PATCH /api/tasks/:id', () => {
  it('updates an existing task', async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'IN_PROGRESS' })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'IN_PROGRESS' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('IN_PROGRESS')
    expect(mockTaskUpdate).toHaveBeenCalled()
  })

  it('returns 404 when updating a non-existent task (and never calls update)', async () => {
    mockTaskFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).patch('/api/tasks/ghost')).send({ status: 'DONE' })

    expect(res.status).toBe(404)
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('returns 422 on an invalid status value', async () => {
    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'NOT_A_STATUS' })

    expect(res.status).toBe(422)
    // validation must short-circuit before touching the DB
    expect(mockTaskFindUnique).not.toHaveBeenCalled()
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('returns 422 when assigneeId is not a UUID', async () => {
    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ assigneeId: 'not-a-uuid' })

    expect(res.status).toBe(422)
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('accepts an empty patch body (no fields changed)', async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockTaskUpdate.mockResolvedValue(sampleTask())

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({})

    expect(res.status).toBe(200)
  })

  // --- RBAC-6: who may edit a task ---------------------------------------

  it('lets the creator edit their own task (200)', async () => {
    // sampleTask.creatorId === 'user-1'; default token is user-1
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'IN_PROGRESS' })

    const res = await authAsUser('user-1', 'DEVELOPER', request(app).patch('/api/tasks/task-1')).send({
      status: 'IN_PROGRESS',
    })

    expect(res.status).toBe(200)
  })

  it('lets the assignee edit the task (200)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), creatorId: 'someone-else', assigneeId: 'user-2' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'IN_PROGRESS' })

    const res = await authAsUser('user-2', 'QA', request(app).patch('/api/tasks/task-1')).send({
      status: 'IN_PROGRESS',
    })

    expect(res.status).toBe(200)
  })

  it('forbids a non-owner DEVELOPER/QA from editing (403, no update)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), creatorId: 'owner', assigneeId: 'someone' })

    const res = await authAsUser('intruder', 'DEVELOPER', request(app).patch('/api/tasks/task-1')).send({
      status: 'IN_PROGRESS',
    })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('lets a PM edit any task even if not owner/assignee (200)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), creatorId: 'owner', assigneeId: 'someone' })
    mockTaskUpdate.mockResolvedValue(sampleTask())

    const res = await authAsUser('pm-user', 'PM', request(app).patch('/api/tasks/task-1')).send({
      priority: 'HIGH',
    })

    expect(res.status).toBe(200)
  })

  // --- TASK-3: status transition rules -----------------------------------

  it('rejects an illegal transition TODO → DONE (422, no update)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), status: 'TODO' })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'DONE' })

    expect(res.status).toBe(422)
    expect(res.body.error).toMatch(/Invalid status transition/)
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('rejects reopening DONE → TODO (422)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), status: 'DONE' })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'TODO' })

    expect(res.status).toBe(422)
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('allows a legal transition IN_REVIEW → DONE (200)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), status: 'IN_REVIEW' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'DONE' })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'DONE' })

    expect(res.status).toBe(200)
    expect(mockTaskUpdate).toHaveBeenCalled()
  })

  it('stamps completedAt when a task enters DONE', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), status: 'IN_REVIEW' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'DONE' })

    await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'DONE' })

    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: expect.any(Date) }) })
    )
  })

  it('clears completedAt when a task leaves DONE', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), status: 'DONE' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'IN_PROGRESS' })

    await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'IN_PROGRESS' })

    expect(mockTaskUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ completedAt: null }) })
    )
  })

  it('allows a no-op transition to the same status (200)', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), status: 'TODO' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), status: 'TODO' })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ status: 'TODO' })

    expect(res.status).toBe(200)
  })

  // --- TASK-4: assignee existence ----------------------------------------

  it('assigns the task when the assignee exists (200)', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111'
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockUserFindUnique.mockResolvedValue({ id: uuid, name: 'Dev', email: 'd@e.com', role: 'DEVELOPER' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), assigneeId: uuid })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ assigneeId: uuid })

    expect(res.status).toBe(200)
    expect(mockUserFindUnique).toHaveBeenCalledWith({ where: { id: uuid } })
    expect(mockTaskUpdate).toHaveBeenCalled()
  })

  it('rejects assigning to a non-existent user (422, no update)', async () => {
    const uuid = '22222222-2222-2222-2222-222222222222'
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockUserFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ assigneeId: uuid })

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('Assignee does not exist')
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('allows unassigning (assigneeId: null) without an existence check', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), assigneeId: 'someone' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), assigneeId: null })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ assigneeId: null })

    expect(res.status).toBe(200)
    expect(mockUserFindUnique).not.toHaveBeenCalled()
  })

  // --- SPRINT-3: add/remove task to/from a sprint ------------------------

  it('adds the task to a sprint in the same project (200)', async () => {
    const sprintId = '33333333-3333-3333-3333-333333333333'
    mockTaskFindUnique.mockResolvedValue(sampleTask()) // projectId: project-1
    mockSprintFindUnique.mockResolvedValue({ id: sprintId, projectId: 'project-1' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), sprintId })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ sprintId })

    expect(res.status).toBe(200)
    expect(mockTaskUpdate).toHaveBeenCalled()
  })

  it('rejects adding the task to a sprint from a different project (422)', async () => {
    const sprintId = '33333333-3333-3333-3333-333333333333'
    mockTaskFindUnique.mockResolvedValue(sampleTask()) // projectId: project-1
    mockSprintFindUnique.mockResolvedValue({ id: sprintId, projectId: 'OTHER-project' })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ sprintId })

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('Sprint belongs to a different project')
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('rejects adding the task to a non-existent sprint (422)', async () => {
    const sprintId = '44444444-4444-4444-4444-444444444444'
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockSprintFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ sprintId })

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('Sprint does not exist')
    expect(mockTaskUpdate).not.toHaveBeenCalled()
  })

  it('removes the task from its sprint (sprintId: null) without a lookup', async () => {
    mockTaskFindUnique.mockResolvedValue({ ...sampleTask(), sprintId: 'old-sprint' })
    mockTaskUpdate.mockResolvedValue({ ...sampleTask(), sprintId: null })

    const res = await auth(request(app).patch('/api/tasks/task-1')).send({ sprintId: null })

    expect(res.status).toBe(200)
    expect(mockSprintFindUnique).not.toHaveBeenCalled()
  })
})

// --- DELETE /api/tasks/:id (RBAC: ADMIN/PM only) -------------------------
describe('DELETE /api/tasks/:id', () => {
  it('lets an ADMIN delete an existing task (204)', async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockTaskDelete.mockResolvedValue(sampleTask())

    const res = await authAs('ADMIN', request(app).delete('/api/tasks/task-1'))

    expect(res.status).toBe(204)
    expect(mockTaskDelete).toHaveBeenCalledWith({ where: { id: 'task-1' } })
  })

  it('lets a PM delete a task (204)', async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask())
    mockTaskDelete.mockResolvedValue(sampleTask())

    const res = await authAs('PM', request(app).delete('/api/tasks/task-1'))

    expect(res.status).toBe(204)
  })

  it('forbids a DEVELOPER from deleting a task (403, never touches DB)', async () => {
    const res = await authAs('DEVELOPER', request(app).delete('/api/tasks/task-1'))

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
    expect(mockTaskFindUnique).not.toHaveBeenCalled()
    expect(mockTaskDelete).not.toHaveBeenCalled()
  })

  it('forbids a QA from deleting a task (403)', async () => {
    const res = await authAs('QA', request(app).delete('/api/tasks/task-1'))

    expect(res.status).toBe(403)
    expect(mockTaskDelete).not.toHaveBeenCalled()
  })

  it('returns 404 when an ADMIN deletes a non-existent task', async () => {
    mockTaskFindUnique.mockResolvedValue(null)

    const res = await authAs('ADMIN', request(app).delete('/api/tasks/ghost'))

    expect(res.status).toBe(404)
    expect(mockTaskDelete).not.toHaveBeenCalled()
  })
})
