import request from 'supertest'
import jwt from 'jsonwebtoken'

const mockUserFindMany = jest.fn()
const mockUserFindUnique = jest.fn()
const mockUserUpdate = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findMany: mockUserFindMany, findUnique: mockUserFindUnique, update: mockUserUpdate, create: jest.fn() },
    task: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    project: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  })),
}))

process.env.JWT_SECRET = 'test-secret'

import { app } from '../app'

const token = jwt.sign({ userId: 'user-1', role: 'QA' }, 'test-secret')
const adminToken = jwt.sign({ userId: 'admin-1', role: 'ADMIN' }, 'test-secret')

beforeEach(() => {
  mockUserFindMany.mockReset()
  mockUserFindUnique.mockReset()
  mockUserUpdate.mockReset()
})

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

describe('PATCH /api/users/:id/role (RBAC-5)', () => {
  it('lets an ADMIN change another user\'s role (200)', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u2', role: 'DEVELOPER' })
    mockUserUpdate.mockResolvedValue({ id: 'u2', name: 'U', email: 'u@e.com', role: 'PM' })

    const res = await request(app)
      .patch('/api/users/u2/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'PM' })

    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe('PM')
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u2' }, data: { role: 'PM' } })
    )
  })

  it('forbids a non-admin (403)', async () => {
    const res = await request(app)
      .patch('/api/users/u2/role')
      .set('Authorization', `Bearer ${token}`) // QA
      .send({ role: 'PM' })

    expect(res.status).toBe(403)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).patch('/api/users/u2/role').send({ role: 'PM' })
    expect(res.status).toBe(401)
  })

  it('returns 422 on an invalid role', async () => {
    const res = await request(app)
      .patch('/api/users/u2/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'SUPERUSER' })

    expect(res.status).toBe(422)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('prevents an admin from changing their OWN role (403)', async () => {
    const res = await request(app)
      .patch('/api/users/admin-1/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'DEVELOPER' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/your own role/)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-existent user', async () => {
    mockUserFindUnique.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/users/ghost/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'PM' })

    expect(res.status).toBe(404)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })
})
