import { EventEmitter } from 'events'
import { requestLogger } from './requestLogger'
import type { Request, Response, NextFunction } from 'express'

describe('requestLogger middleware (OPS-5)', () => {
  it('calls next and logs method/path/status once the response finishes', () => {
    const lines: string[] = []
    const mw = requestLogger((line) => lines.push(line))

    const req = { method: 'GET', originalUrl: '/api/tasks/1' } as Request
    const res = new EventEmitter() as unknown as Response & EventEmitter
    ;(res as unknown as { statusCode: number }).statusCode = 200
    const next = jest.fn() as unknown as NextFunction

    mw(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(lines).toHaveLength(0) // nothing logged until the response finishes

    res.emit('finish')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^GET \/api\/tasks\/1 200 \d+ms$/)
  })
})
