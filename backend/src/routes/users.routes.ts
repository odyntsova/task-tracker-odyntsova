import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'

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

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'PM', 'DEVELOPER', 'QA', 'QA_AUTO']),
})

// RBAC-5: only an ADMIN may change roles (admin panel).
usersRouter.patch('/:id/role', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = updateRoleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid role' })
    return
  }

  // Guard against self-lockout: an admin cannot change their own role.
  if (req.params.id === req.userId) {
    res.status(403).json({ data: null, error: 'You cannot change your own role' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.id } })
  if (!user) {
    res.status(404).json({ data: null, error: 'User not found' })
    return
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true },
  })

  res.json({ data: updated, error: null })
})
