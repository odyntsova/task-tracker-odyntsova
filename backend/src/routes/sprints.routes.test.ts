import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockSprintFindUnique = jest.fn()
const mockTaskFindMany = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    sprint: { findUnique: mockSprintFindUnique, findMany: jest.fn(), create: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    task: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: mockTaskFindMany, count: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

const token = jwt.sign({ userId: 'user-1', role: 'QA' }, 'test-secret')

beforeEach(() => {
  mockSprintFindUnique.mockReset()
  mockTaskFindMany.mockReset()
})

describe('GET /api/sprints/:id', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/sprints/sprint-1')
    expect(res.status).toBe(401)
  })

  it('returns the sprint with its tasks', async () => {
    mockSprintFindUnique.mockResolvedValue({
      id: 'sprint-1',
      name: 'Sprint 1',
      tasks: [{ id: 'task-1', title: 'T', assignee: null }],
    })

    const res = await request(app).get('/api/sprints/sprint-1').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe('sprint-1')
    expect(res.body.data.tasks).toHaveLength(1)
  })

  it('returns 404 for a missing sprint', async () => {
    mockSprintFindUnique.mockResolvedValue(null)

    const res = await request(app).get('/api/sprints/ghost').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Sprint not found')
  })
})

describe('GET /api/sprints/:id/burndown (SPRINT-4)', () => {
  it('returns 404 for a missing sprint', async () => {
    mockSprintFindUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/sprints/ghost/burndown').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('computes ideal + actual remaining per day', async () => {
    // 3-day sprint, 2 tasks; one completed on day 1
    mockSprintFindUnique.mockResolvedValue({
      id: 'sprint-1',
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-07-03T00:00:00Z'),
    })
    mockTaskFindMany.mockResolvedValue([
      { completedAt: new Date('2026-07-01T10:00:00Z') },
      { completedAt: null },
    ])

    const res = await request(app)
      .get('/api/sprints/sprint-1/burndown')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(2)
    expect(res.body.data.points).toHaveLength(3)
    // ideal burns down linearly from 2 to 0
    expect(res.body.data.points[0].ideal).toBe(2)
    expect(res.body.data.points[2].ideal).toBe(0)
    // one task done on day 1 → remaining 1 from day 1 onward
    expect(res.body.data.points.map((p: { remaining: number }) => p.remaining)).toEqual([1, 1, 1])
    expect(res.body.data.points[0].date).toBe('2026-07-01')
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/sprints/sprint-1/burndown')
    expect(res.status).toBe(401)
  })
})
