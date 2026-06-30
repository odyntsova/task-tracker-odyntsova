import { Router } from 'express'
import { PrismaClient, TaskStatus, TaskPriority } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth'
import { CAN_MANAGE_PROJECTS } from '../permissions'

export const projectsRouter = Router()
const prisma = new PrismaClient()

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable().optional(),
})

const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
})

// TASK-5: filtering, sorting, search and pagination for the task list.
const listTasksQuerySchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'BLOCKED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  // a UUID to filter by assignee, or the literal "unassigned" for null assignee
  assignee: z.union([z.string().uuid(), z.literal('unassigned')]).optional(),
  q: z.string().min(1).max(200).optional(), // search in title
  sortBy: z.enum(['createdAt', 'title', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

projectsRouter.get('/', requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  })
  res.json({ data: projects, error: null })
})

projectsRouter.get('/:id', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } })
  if (!project) {
    res.status(404).json({ data: null, error: 'Project not found' })
    return
  }
  res.json({ data: project, error: null })
})

projectsRouter.post('/', requireAuth, requireRole(...CAN_MANAGE_PROJECTS), async (req: AuthRequest, res) => {
  const parsed = createProjectSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }

  const project = await prisma.project.create({ data: parsed.data })
  res.status(201).json({ data: project, error: null })
})

projectsRouter.get('/:id/tasks', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } })
  if (!project) {
    res.status(404).json({ data: null, error: 'Project not found' })
    return
  }

  const parsed = listTasksQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid query parameters' })
    return
  }
  const { status, priority, assignee, q, sortBy, order, page, limit } = parsed.data

  const where = {
    projectId: req.params.id,
    ...(status ? { status: status as TaskStatus } : {}),
    ...(priority ? { priority: priority as TaskPriority } : {}),
    ...(assignee ? { assigneeId: assignee === 'unassigned' ? null : assignee } : {}),
    // Postgres supports case-insensitive search via mode: 'insensitive'
    ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
  }

  // count uses the SAME where as findMany so meta.total reflects the filtered set
  const [tasks, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      include: { assignee: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { [sortBy]: order },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.task.count({ where }),
  ])

  res.json({ data: tasks, error: null, meta: { page, limit, total } })
})

projectsRouter.post('/:id/tasks', requireAuth, async (req: AuthRequest, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } })
  if (!project) {
    res.status(404).json({ data: null, error: 'Project not found' })
    return
  }

  const parsed = createTaskSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }

  const task = await prisma.task.create({
    data: { ...parsed.data, projectId: req.params.id, creatorId: req.userId! },
    include: { assignee: { select: { id: true, name: true, email: true, role: true } } },
  })

  res.status(201).json({ data: task, error: null })
})

// --- Sprints (SPRINT-1) ----------------------------------------------------

const createSprintSchema = z
  .object({
    name: z.string().min(1).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((s) => s.endDate > s.startDate, {
    message: 'endDate must be after startDate',
  })

projectsRouter.get('/:id/sprints', requireAuth, async (req, res) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id } })
  if (!project) {
    res.status(404).json({ data: null, error: 'Project not found' })
    return
  }

  const sprints = await prisma.sprint.findMany({
    where: { projectId: req.params.id },
    orderBy: { startDate: 'desc' },
  })
  res.json({ data: sprints, error: null })
})

projectsRouter.post(
  '/:id/sprints',
  requireAuth,
  requireRole(...CAN_MANAGE_PROJECTS),
  async (req, res) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!project) {
      res.status(404).json({ data: null, error: 'Project not found' })
      return
    }

    const parsed = createSprintSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({ data: null, error: 'Invalid input' })
      return
    }

    const sprint = await prisma.sprint.create({
      data: { ...parsed.data, projectId: req.params.id },
    })
    res.status(201).json({ data: sprint, error: null })
  }
)
