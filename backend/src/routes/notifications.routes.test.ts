import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockFindMany = jest.fn()
const mockCount = jest.fn()
const mockUpdateMany = jest.fn()
const mockTransaction = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    notification: { findMany: mockFindMany, count: mockCount, updateMany: mockUpdateMany },
    user: { findUnique: jest.fn(), create: jest.fn() },
    task: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    project: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    sprint: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    $transaction: mockTransaction,
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

const token = jwt.sign({ userId: 'user-1', role: 'QA' }, 'test-secret')
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`)

beforeEach(() => {
  mockFindMany.mockReset()
  mockCount.mockReset()
  mockUpdateMany.mockReset()
  mockTransaction.mockReset()
})

describe('GET /api/notifications', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/notifications')
    expect(res.status).toBe(401)
  })

  it('returns the list plus an unread count in meta', async () => {
    mockTransaction.mockResolvedValue([[{ id: 'n1', readAt: null }], 1])

    const res = await auth(request(app).get('/api/notifications'))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta.unread).toBe(1)
  })
})

describe('POST /api/notifications/:id/read', () => {
  it('marks a notification read (200)', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const res = await auth(request(app).post('/api/notifications/n1/read'))

    expect(res.status).toBe(200)
    // scoped to the current user
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'n1', userId: 'user-1' } })
    )
  })

  it('returns 404 when the notification is not the current user\'s', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })

    const res = await auth(request(app).post('/api/notifications/other/read'))

    expect(res.status).toBe(404)
  })
})

describe('POST /api/notifications/read-all', () => {
  it('marks all the user\'s notifications read', async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 })

    const res = await auth(request(app).post('/api/notifications/read-all'))

    expect(res.status).toBe(200)
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', readAt: null } })
    )
  })
})
