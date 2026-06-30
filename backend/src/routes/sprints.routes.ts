import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'

export const sprintsRouter = Router()
const prisma = new PrismaClient()

// Returns a sprint together with its tasks (and each task's assignee).
sprintsRouter.get('/:id', requireAuth, async (req, res) => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: req.params.id },
    include: {
      tasks: {
        include: { assignee: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!sprint) {
    res.status(404).json({ data: null, error: 'Sprint not found' })
    return
  }

  res.json({ data: sprint, error: null })
})
