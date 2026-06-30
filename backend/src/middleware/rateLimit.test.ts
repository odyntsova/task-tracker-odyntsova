import { rateLimit } from './rateLimit'
import type { Request, Response } from 'express'

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {}
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code
    return res as Response
  })
  res.json = jest.fn().mockImplementation((b: unknown) => {
    res.body = b
    return res as Response
  })
  res.setHeader = jest.fn() as unknown as Response['setHeader']
  return res as Response & { statusCode?: number; body?: { error: string } }
}

const reqFrom = (ip: string) => ({ ip }) as Request

describe('rateLimit middleware', () => {
  it('allows requests up to the max, then returns 429', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 2 })
    const next = jest.fn()

    // first two pass
    limiter(reqFrom('1.1.1.1'), mockRes(), next)
    limiter(reqFrom('1.1.1.1'), mockRes(), next)
    expect(next).toHaveBeenCalledTimes(2)

    // third is blocked
    const blocked = mockRes()
    limiter(reqFrom('1.1.1.1'), blocked, next)
    expect(next).toHaveBeenCalledTimes(2) // not called again
    expect(blocked.statusCode).toBe(429)
    expect(blocked.body?.error).toMatch(/Too many requests/)
  })

  it('tracks limits independently per IP', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 })
    const next = jest.fn()

    limiter(reqFrom('1.1.1.1'), mockRes(), next) // ok
    const blockedA = mockRes()
    limiter(reqFrom('1.1.1.1'), blockedA, next) // blocked
    expect(blockedA.statusCode).toBe(429)

    // a different IP still has its own budget
    const next2 = jest.fn()
    limiter(reqFrom('2.2.2.2'), mockRes(), next2)
    expect(next2).toHaveBeenCalledTimes(1)
  })

  it('resets the window after windowMs elapses', () => {
    jest.useFakeTimers()
    const limiter = rateLimit({ windowMs: 1000, max: 1 })
    const next = jest.fn()

    limiter(reqFrom('1.1.1.1'), mockRes(), next) // ok
    const blocked = mockRes()
    limiter(reqFrom('1.1.1.1'), blocked, next)
    expect(blocked.statusCode).toBe(429)

    jest.advanceTimersByTime(1001)
    const after = jest.fn()
    limiter(reqFrom('1.1.1.1'), mockRes(), after)
    expect(after).toHaveBeenCalledTimes(1) // window reset → allowed again

    jest.useRealTimers()
  })
})
