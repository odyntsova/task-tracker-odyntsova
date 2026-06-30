import request from 'supertest'
import jwt from 'jsonwebtoken'

// --- Mocks ---------------------------------------------------------------
const mockProjectFindMany = jest.fn()
const mockProjectFindUnique = jest.fn()
const mockProjectCreate = jest.fn()
const mockTaskCreate = jest.fn()
const mockTaskFindMany = jest.fn()
const mockTaskCount = jest.fn()
const mockSprintFindMany = jest.fn()
const mockSprintCreate = jest.fn()
const mockTaskGroupBy = jest.fn()
const mockTransaction = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    project: {
      findMany: mockProjectFindMany,
      findUnique: mockProjectFindUnique,
      create: mockProjectCreate,
    },
    task: {
      create: mockTaskCreate,
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: mockTaskFindMany,
      count: mockTaskCount,
      groupBy: mockTaskGroupBy,
    },
    sprint: { findMany: mockSprintFindMany, create: mockSprintCreate },
    user: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: mockTransaction,
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

// --- Helpers -------------------------------------------------------------
const tokenFor = (role: string) => jwt.sign({ userId: 'user-1', role }, 'test-secret')
// Default actor is a PM (allowed to manage projects).
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${tokenFor('PM')}`)
const authAs = (role: string, req: request.Test) =>
  req.set('Authorization', `Bearer ${tokenFor(role)}`)

const sampleProject = () => ({
  id: 'project-1',
  name: 'Task Tracker MVP',
  description: 'Demo',
})

beforeEach(() => {
  mockProjectFindMany.mockReset()
  mockProjectFindUnique.mockReset()
  mockProjectCreate.mockReset()
  mockTaskCreate.mockReset()
  mockTaskFindMany.mockReset()
  mockTaskCount.mockReset()
  mockSprintFindMany.mockReset()
  mockSprintCreate.mockReset()
  mockTaskGroupBy.mockReset()
  mockTransaction.mockReset()
})

// --- Auth guard ----------------------------------------------------------
describe('Projects routes — auth guard', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/projects')
    expect(res.status).toBe(401)
    expect(mockProjectFindMany).not.toHaveBeenCalled()
  })
})

// --- GET /api/projects ---------------------------------------------------
describe('GET /api/projects', () => {
  it('returns the list of projects', async () => {
    mockProjectFindMany.mockResolvedValue([sampleProject()])

    const res = await auth(request(app).get('/api/projects'))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  it('returns an empty array when there are no projects', async () => {
    mockProjectFindMany.mockResolvedValue([])

    const res = await auth(request(app).get('/api/projects'))

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

// --- GET /api/projects/:id -----------------------------------------------
describe('GET /api/projects/:id', () => {
  it('returns the project when it exists', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())

    const res = await auth(request(app).get('/api/projects/project-1'))

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('project-1')
  })

  it('returns 404 for a missing project', async () => {
    mockProjectFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).get('/api/projects/ghost'))

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Project not found')
  })
})

// --- POST /api/projects --------------------------------------------------
describe('POST /api/projects', () => {
  it('creates a project and returns 201', async () => {
    mockProjectCreate.mockResolvedValue(sampleProject())

    const res = await auth(request(app).post('/api/projects')).send({ name: 'New Project' })

    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('project-1')
  })

  it('returns 422 when name is missing', async () => {
    const res = await auth(request(app).post('/api/projects')).send({ description: 'no name' })

    expect(res.status).toBe(422)
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })

  it('returns 422 when name exceeds 100 chars', async () => {
    const res = await auth(request(app).post('/api/projects')).send({ name: 'x'.repeat(101) })

    expect(res.status).toBe(422)
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })

  it('lets an ADMIN create a project (201)', async () => {
    mockProjectCreate.mockResolvedValue(sampleProject())

    const res = await authAs('ADMIN', request(app).post('/api/projects')).send({ name: 'X' })

    expect(res.status).toBe(201)
  })

  it('forbids a DEVELOPER from creating a project (403, never touches DB)', async () => {
    const res = await authAs('DEVELOPER', request(app).post('/api/projects')).send({ name: 'X' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })

  it('forbids a QA from creating a project (403)', async () => {
    const res = await authAs('QA', request(app).post('/api/projects')).send({ name: 'X' })

    expect(res.status).toBe(403)
    expect(mockProjectCreate).not.toHaveBeenCalled()
  })
})

// --- GET /api/projects/:id/tasks (pagination) ----------------------------
describe('GET /api/projects/:id/tasks', () => {
  it('returns paginated tasks with meta', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTransaction.mockResolvedValue([[{ id: 'task-1' }, { id: 'task-2' }], 2])

    const res = await auth(request(app).get('/api/projects/project-1/tasks'))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2 })
  })

  it('honours page and limit query params in meta', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTransaction.mockResolvedValue([[], 50])

    const res = await auth(request(app).get('/api/projects/project-1/tasks?page=3&limit=10'))

    expect(res.status).toBe(200)
    expect(res.body.meta).toEqual({ page: 3, limit: 10, total: 50 })
  })

  it('returns 404 when the project does not exist', async () => {
    mockProjectFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).get('/api/projects/ghost/tasks'))

    expect(res.status).toBe(404)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  // --- TASK-5: filtering / sorting / search ------------------------------

  it('builds a where clause from status, priority, assignee and search filters', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTransaction.mockResolvedValue([[], 0])
    const assigneeId = '11111111-1111-1111-1111-111111111111'

    await auth(
      request(app).get(
        `/api/projects/project-1/tasks?status=DONE&priority=HIGH&assignee=${assigneeId}&q=login`
      )
    )

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 'project-1',
          status: 'DONE',
          priority: 'HIGH',
          assigneeId,
          title: { contains: 'login', mode: 'insensitive' },
        },
      })
    )
  })

  it('translates assignee=unassigned into assigneeId: null', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTransaction.mockResolvedValue([[], 0])

    await auth(request(app).get('/api/projects/project-1/tasks?assignee=unassigned'))

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assigneeId: null }) })
    )
  })

  it('applies sortBy and order to orderBy', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTransaction.mockResolvedValue([[], 0])

    await auth(request(app).get('/api/projects/project-1/tasks?sortBy=title&order=asc'))

    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { title: 'asc' } })
    )
  })

  it('counts the FILTERED set (count uses the same where as findMany)', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTransaction.mockResolvedValue([[], 0])

    await auth(request(app).get('/api/projects/project-1/tasks?status=BLOCKED'))

    expect(mockTaskCount).toHaveBeenCalledWith({
      where: { projectId: 'project-1', status: 'BLOCKED' },
    })
  })

  it('returns 422 on an invalid sortBy value', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())

    const res = await auth(request(app).get('/api/projects/project-1/tasks?sortBy=evil'))

    expect(res.status).toBe(422)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('returns 422 on an invalid status filter', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())

    const res = await auth(request(app).get('/api/projects/project-1/tasks?status=NOPE'))

    expect(res.status).toBe(422)
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

// --- POST /api/projects/:id/tasks ----------------------------------------
describe('POST /api/projects/:id/tasks', () => {
  it('creates a task under the project with the creator from the token', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTaskCreate.mockResolvedValue({ id: 'task-1', title: 'New', projectId: 'project-1' })

    const res = await auth(request(app).post('/api/projects/project-1/tasks')).send({ title: 'New' })

    expect(res.status).toBe(201)
    // creatorId comes from the JWT (user-1), never from the request body
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: 'project-1', creatorId: 'user-1' }),
      })
    )
  })

  it('defaults priority to MEDIUM when not provided', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTaskCreate.mockResolvedValue({ id: 'task-1' })

    await auth(request(app).post('/api/projects/project-1/tasks')).send({ title: 'New' })

    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 'MEDIUM' }) })
    )
  })

  it('returns 404 when creating a task under a missing project', async () => {
    mockProjectFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).post('/api/projects/ghost/tasks')).send({ title: 'New' })

    expect(res.status).toBe(404)
    expect(mockTaskCreate).not.toHaveBeenCalled()
  })

  it('returns 422 on an empty title (project exists)', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())

    const res = await auth(request(app).post('/api/projects/project-1/tasks')).send({ title: '' })

    expect(res.status).toBe(422)
    expect(mockTaskCreate).not.toHaveBeenCalled()
  })
})

// --- Sprints (SPRINT-1) --------------------------------------------------
describe('GET /api/projects/:id/sprints', () => {
  it('lists sprints for a project', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockSprintFindMany.mockResolvedValue([{ id: 'sprint-1', name: 'Sprint 1' }])

    const res = await auth(request(app).get('/api/projects/project-1/sprints'))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  it('returns 404 for a missing project', async () => {
    mockProjectFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).get('/api/projects/ghost/sprints'))

    expect(res.status).toBe(404)
    expect(mockSprintFindMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/projects/:id/sprints', () => {
  const validSprint = {
    name: 'Sprint 1',
    startDate: '2026-07-01',
    endDate: '2026-07-14',
  }

  it('lets a PM create a sprint (201)', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockSprintCreate.mockResolvedValue({ id: 'sprint-1', ...validSprint })

    const res = await auth(request(app).post('/api/projects/project-1/sprints')).send(validSprint)

    expect(res.status).toBe(201)
    expect(mockSprintCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: 'project-1' }) })
    )
  })

  it('forbids a DEVELOPER from creating a sprint (403)', async () => {
    const res = await authAs('DEVELOPER', request(app).post('/api/projects/project-1/sprints')).send(
      validSprint
    )

    expect(res.status).toBe(403)
    expect(mockSprintCreate).not.toHaveBeenCalled()
  })

  it('returns 422 when endDate is not after startDate', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())

    const res = await auth(request(app).post('/api/projects/project-1/sprints')).send({
      name: 'Bad sprint',
      startDate: '2026-07-14',
      endDate: '2026-07-01',
    })

    expect(res.status).toBe(422)
    expect(mockSprintCreate).not.toHaveBeenCalled()
  })

  it('returns 404 when creating a sprint under a missing project', async () => {
    mockProjectFindUnique.mockResolvedValue(null)

    const res = await auth(request(app).post('/api/projects/ghost/sprints')).send(validSprint)

    expect(res.status).toBe(404)
    expect(mockSprintCreate).not.toHaveBeenCalled()
  })
})

describe('GET /api/projects/:id/report (REP-1/REP-2)', () => {
  it('returns 404 for a missing project', async () => {
    mockProjectFindUnique.mockResolvedValue(null)
    const res = await auth(request(app).get('/api/projects/ghost/report'))
    expect(res.status).toBe(404)
  })

  it('aggregates task metrics and per-sprint velocity', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTaskGroupBy.mockImplementation(({ by }: { by: string[] }) => {
      if (by.includes('status'))
        return Promise.resolve([
          { status: 'TODO', _count: { _all: 2 } },
          { status: 'DONE', _count: { _all: 3 } },
        ])
      if (by.includes('priority')) return Promise.resolve([{ priority: 'HIGH', _count: { _all: 5 } }])
      if (by.includes('sprintId')) return Promise.resolve([{ sprintId: 's1', _count: { _all: 3 } }])
      return Promise.resolve([])
    })
    mockSprintFindMany.mockResolvedValue([{ id: 's1', name: 'Sprint 1' }])

    const res = await auth(request(app).get('/api/projects/project-1/report'))

    expect(res.status).toBe(200)
    expect(res.body.data.tasks.total).toBe(5)
    expect(res.body.data.tasks.completed).toBe(3)
    expect(res.body.data.tasks.completionRate).toBe(60)
    expect(res.body.data.tasks.byStatus).toMatchObject({ TODO: 2, DONE: 3, IN_PROGRESS: 0 })
    expect(res.body.data.tasks.byPriority).toMatchObject({ HIGH: 5, LOW: 0 })
    expect(res.body.data.velocity).toEqual([{ sprintId: 's1', name: 'Sprint 1', completed: 3 }])
  })

  it('handles an empty project (completionRate 0)', async () => {
    mockProjectFindUnique.mockResolvedValue(sampleProject())
    mockTaskGroupBy.mockResolvedValue([])
    mockSprintFindMany.mockResolvedValue([])

    const res = await auth(request(app).get('/api/projects/project-1/report'))

    expect(res.status).toBe(200)
    expect(res.body.data.tasks.total).toBe(0)
    expect(res.body.data.tasks.completionRate).toBe(0)
    expect(res.body.data.velocity).toEqual([])
  })
})
