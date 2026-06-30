import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockSprintFindUnique = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    sprint: { findUnique: mockSprintFindUnique, findMany: jest.fn(), create: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    task: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

const token = jwt.sign({ userId: 'user-1', role: 'QA' }, 'test-secret')

beforeEach(() => mockSprintFindUnique.mockReset())

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
