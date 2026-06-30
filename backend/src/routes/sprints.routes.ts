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

// SPRINT-4: burndown data — ideal vs. actual remaining task count per day.
sprintsRouter.get('/:id/burndown', requireAuth, async (req, res) => {
  const sprint = await prisma.sprint.findUnique({ where: { id: req.params.id } })
  if (!sprint) {
    res.status(404).json({ data: null, error: 'Sprint not found' })
    return
  }

  const tasks = await prisma.task.findMany({
    where: { sprintId: req.params.id },
    select: { completedAt: true },
  })
  const total = tasks.length

  // Build the list of calendar days from startDate to endDate (inclusive, UTC).
  const start = new Date(sprint.startDate)
  const end = new Date(sprint.endDate)
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1)

  const points = Array.from({ length: dayCount }, (_, i) => {
    const day = new Date(start.getTime() + i * MS_PER_DAY)
    const endOfDay = new Date(day.getTime() + MS_PER_DAY) // exclusive upper bound
    const completedByDay = tasks.filter((t) => t.completedAt && t.completedAt < endOfDay).length
    const ideal = dayCount === 1 ? 0 : Math.round((total * (1 - i / (dayCount - 1))) * 100) / 100
    return {
      date: day.toISOString().slice(0, 10),
      ideal,
      remaining: total - completedByDay,
    }
  })

  res.json({ data: { total, points }, error: null })
})
