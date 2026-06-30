import { Request, Response, NextFunction } from 'express'

interface Options {
  windowMs: number
  max: number
}

interface Bucket {
  count: number
  resetAt: number
}

/**
 * A small in-memory fixed-window rate limiter, keyed by client IP.
 * Returns 429 once a client exceeds `max` requests within `windowMs`.
 *
 * Intentionally dependency-free and per-instance: each route gets its own
 * bucket map. For multi-instance production deployments this should be backed
 * by a shared store (e.g. Redis) — see OPS notes.
 */
export function rateLimit({ windowMs, max }: Options) {
  const buckets = new Map<string, Bucket>()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const bucket = buckets.get(key)

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    bucket.count += 1
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ data: null, error: 'Too many requests, please try again later' })
      return
    }

    next()
  }
}
