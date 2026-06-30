import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockUserFindMany = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findMany: mockUserFindMany, findUnique: jest.fn(), create: jest.fn() },
    task: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

const token = jwt.sign({ userId: 'user-1', role: 'QA' }, 'test-secret')

beforeEach(() => mockUserFindMany.mockReset())

describe('GET /api/users', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(401)
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })

  it('returns the list of users (without passwordHash) for an authenticated user', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'u1', name: 'Ann', email: 'a@e.com', role: 'QA' },
      { id: 'u2', name: 'Bob', email: 'b@e.com', role: 'DEVELOPER' },
    ])

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    // the select must exclude passwordHash
    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, email: true, role: true },
      })
    )
    expect(res.body.data[0]).not.toHaveProperty('passwordHash')
  })
})
