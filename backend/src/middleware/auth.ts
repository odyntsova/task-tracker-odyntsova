import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export interface AuthRequest extends Request {
  userId?: string
}

/** Verifies the bearer token and attaches userId. */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    res.status(401).json({ data: null, error: 'Unauthorized' })
    return
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ data: null, error: 'Invalid or expired token' })
  }
}

/**
 * Business endpoints additionally require a verified email — a newly registered
 * account cannot use the main application until the address is verified.
 */
export async function requireVerified(req: AuthRequest, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { emailVerifiedAt: true },
  })
  if (!user) {
    res.status(401).json({ data: null, error: 'Unauthorized' })
    return
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({ data: null, error: 'Email not verified' })
    return
  }
  next()
}
