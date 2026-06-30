import request from 'supertest'
import bcrypt from 'bcryptjs'

// --- Mocks ---------------------------------------------------------------
const mockFindUnique = jest.fn()
const mockCreate = jest.fn()

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findUnique: mockFindUnique, create: mockCreate },
  })),
}))

// JWT_SECRET must be set before the app/routes import jsonwebtoken usage
process.env.JWT_SECRET = 'test-secret'

// Import app AFTER mocks and env are in place
import { app } from '../app'

// --- Fixtures ------------------------------------------------------------
const PASSWORD = 'correct-horse'
let passwordHash: string

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4)
})

beforeEach(() => {
  mockFindUnique.mockReset()
  mockCreate.mockReset()
})

const existingUser = () => ({
  id: 'user-1',
  name: 'Kateryna',
  email: 'qa@example.com',
  role: 'QA',
  passwordHash,
})

// --- Tests ---------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('returns 200 with a token and user on correct credentials', async () => {
    mockFindUnique.mockResolvedValue(existingUser())

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'qa@example.com', password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body.error).toBeNull()
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String))
    expect(res.body.data.user).toMatchObject({
      email: 'qa@example.com',
      role: 'QA',
    })
    // password hash must never leak to the client
    expect(res.body.data.user).not.toHaveProperty('passwordHash')
  })

  it('returns 401 on wrong password', async () => {
    mockFindUnique.mockResolvedValue(existingUser())

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'qa@example.com', password: 'wrong-password' })

    expect(res.status).toBe(401)
    expect(res.body.data).toBeNull()
    expect(res.body.error).toBe('Invalid email or password')
  })

  it('returns 401 when the user does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: PASSWORD })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid email or password')
  })

  it('returns 422 on invalid input (missing password)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'qa@example.com' })

    expect(res.status).toBe(422)
    expect(res.body.error).toBe('Invalid input')
    // should fail validation before touching the database
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns 422 on malformed email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: PASSWORD })

    expect(res.status).toBe(422)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns 422 on an empty body', async () => {
    const res = await request(app).post('/api/auth/login').send({})

    expect(res.status).toBe(422)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('rejects a SQL-injection string in the email as invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: "' OR 1=1--", password: PASSWORD })

    // It is not a valid email, so it never reaches the database.
    expect(res.status).toBe(422)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('ignores unexpected extra fields in the body', async () => {
    mockFindUnique.mockResolvedValue(existingUser())

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'qa@example.com', password: PASSWORD, isAdmin: true })

    expect(res.status).toBe(200)
    // The forged "isAdmin" field must not influence the returned user.
    expect(res.body.data.user.role).toBe('QA')
  })

  // --- Regression guards for fixed bugs -----------------------------------

  it('normalises the email to lowercase before the DB lookup (BUG-1 fix)', async () => {
    mockFindUnique.mockResolvedValue(existingUser())

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'QA@Example.com', password: PASSWORD })

    expect(res.status).toBe(200)
    // The email is lowercased so it matches the stored "qa@example.com".
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: 'qa@example.com' },
    })
  })

  it('rejects a password longer than 72 bytes with 422 (BUG-2 fix)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'qa@example.com', password: 'x'.repeat(73) })

    expect(res.status).toBe(422)
    // Validation fails before bcrypt/DB are ever touched.
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('still accepts a password of exactly 72 bytes (boundary)', async () => {
    mockFindUnique.mockResolvedValue(existingUser())

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'qa@example.com', password: 'x'.repeat(72) })

    // Wrong password vs the fixture hash, but it passes validation → reaches auth.
    expect(res.status).toBe(401)
    expect(mockFindUnique).toHaveBeenCalled()
  })
})

describe('POST /api/auth/register', () => {
  const validBody = {
    name: 'New User',
    email: 'new@example.com',
    password: 'password123',
  }

  it('creates a user and returns 201 with a token', async () => {
    mockFindUnique.mockResolvedValue(null) // email not taken
    mockCreate.mockResolvedValue({
      id: 'user-2',
      name: 'New User',
      email: 'new@example.com',
      role: 'DEVELOPER',
    })

    const res = await request(app).post('/api/auth/register').send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String))
    expect(res.body.data.user).toMatchObject({ email: 'new@example.com', role: 'DEVELOPER' })
    expect(res.body.data.user).not.toHaveProperty('passwordHash')
  })

  it('stores the email lowercased (BUG-1 parity with login)', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({
      id: 'user-2',
      name: 'New User',
      email: 'mixed@example.com',
      role: 'DEVELOPER',
    })

    await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: 'Mixed@Example.COM' })

    // Both the duplicate-check and the create must use the lowercased email.
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'mixed@example.com' } })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'mixed@example.com' }) })
    )
  })

  it('hashes the password (never stores it in plain text)', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'u', name: 'N', email: 'new@example.com', role: 'DEVELOPER' })

    await request(app).post('/api/auth/register').send(validBody)

    const passwordHash = mockCreate.mock.calls[0][0].data.passwordHash
    expect(passwordHash).not.toBe('password123')
    expect(await bcrypt.compare('password123', passwordHash)).toBe(true)
  })

  it('never lets the client set its own role (no privilege escalation)', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'u', name: 'N', email: 'new@example.com', role: 'DEVELOPER' })

    await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, role: 'ADMIN' })

    // The forged role is ignored; create is always called with DEVELOPER.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'DEVELOPER' }) })
    )
  })

  it('returns 409 when the email is already registered', async () => {
    mockFindUnique.mockResolvedValue(existingUser())

    const res = await request(app).post('/api/auth/register').send(validBody)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('Email already registered')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 422 on a password shorter than 8 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, password: 'short' })

    expect(res.status).toBe(422)
    expect(mockFindUnique).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123' })

    expect(res.status).toBe(422)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
