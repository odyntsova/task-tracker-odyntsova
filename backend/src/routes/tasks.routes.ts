import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { CAN_DELETE_TASKS } from '../permissions'
import { canTransition, TaskStatus } from '../taskStatus'

export const tasksRouter = Router()
const prisma = new PrismaClient()

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  // null removes the task from its sprint; a UUID adds it (SPRINT-3)
  sprintId: z.string().uuid().nullable().optional(),
})

tasksRouter.get('/:id', requireAuth, async (req, res) => {
  const task = await prisma.task.findUnique({
    where: { id: req.params.id },
    include: { assignee: { select: { id: true, name: true, email: true, role: true } } },
  })

  if (!task) {
    res.status(404).json({ data: null, error: 'Task not found' })
    return
  }

  res.json({ data: task, error: null })
})

tasksRouter.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  const parsed = updateTaskSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }

  const task = await prisma.task.findUnique({ where: { id: req.params.id } })
  if (!task) {
    res.status(404).json({ data: null, error: 'Task not found' })
    return
  }

  // TASK-3: enforce the status workflow.
  if (parsed.data.status) {
    if (!canTransition(task.status as TaskStatus, parsed.data.status)) {
      res.status(422).json({
        data: null,
        error: `Invalid status transition: ${task.status} → ${parsed.data.status}`,
      })
      return
    }
  }

  // TASK-4: a non-null assignee must reference an existing user.
  if (parsed.data.assigneeId) {
    const assignee = await prisma.user.findUnique({ where: { id: parsed.data.assigneeId } })
    if (!assignee) {
      res.status(422).json({ data: null, error: 'Assignee does not exist' })
      return
    }
  }

  // SPRINT-3: a non-null sprint must exist and belong to the task's project.
  if (parsed.data.sprintId) {
    const sprint = await prisma.sprint.findUnique({ where: { id: parsed.data.sprintId } })
    if (!sprint) {
      res.status(422).json({ data: null, error: 'Sprint does not exist' })
      return
    }
    if (sprint.projectId !== task.projectId) {
      res.status(422).json({ data: null, error: 'Sprint belongs to a different project' })
      return
    }
  }

  const updated = await prisma.task.update({
    where: { id: req.params.id },
    data: parsed.data,
    include: { assignee: { select: { id: true, name: true, email: true, role: true } } },
  })

  res.json({ data: updated, error: null })
})

tasksRouter.delete('/:id', requireAuth, requireRole(...CAN_DELETE_TASKS), async (req, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } })
  if (!task) {
    res.status(404).json({ data: null, error: 'Task not found' })
    return
  }

  await prisma.task.delete({ where: { id: req.params.id } })
  res.status(204).send()
})
