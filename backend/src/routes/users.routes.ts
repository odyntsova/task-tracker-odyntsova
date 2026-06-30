import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'

export const usersRouter = Router()
const prisma = new PrismaClient()

// Any authenticated team member can list users — needed to populate assignee
// pickers in the UI. passwordHash is never selected.
usersRouter.get('/', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  })
  res.json({ data: users, error: null })
})
