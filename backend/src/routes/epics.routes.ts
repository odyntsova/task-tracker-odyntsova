import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requireVerified } from '../middleware/auth'

export const epicsRouter = Router()
const prisma = new PrismaClient()

const createSchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
})
const updateSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
})

epicsRouter.use(requireAuth, requireVerified)

// Optionally scope to a team: GET /api/epics?teamId=...
epicsRouter.get('/', async (req, res) => {
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined
  const epics = await prisma.epic.findMany({
    where: teamId ? { teamId } : {},
    orderBy: { title: 'asc' },
  })
  res.json({ data: epics, error: null })
})

epicsRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const team = await prisma.team.findUnique({ where: { id: parsed.data.teamId } })
  if (!team) {
    res.status(422).json({ data: null, error: 'Team does not exist' })
    return
  }
  const epic = await prisma.epic.create({
    data: { teamId: parsed.data.teamId, title: parsed.data.title, description: parsed.data.description ?? null },
  })
  res.status(201).json({ data: epic, error: null })
})

epicsRouter.get('/:id', async (req, res) => {
  const epic = await prisma.epic.findUnique({ where: { id: req.params.id } })
  if (!epic) {
    res.status(404).json({ data: null, error: 'Epic not found' })
    return
  }
  res.json({ data: epic, error: null })
})

// The team is fixed at creation — teamId in the body is ignored.
epicsRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const epic = await prisma.epic.findUnique({ where: { id: req.params.id } })
  if (!epic) {
    res.status(404).json({ data: null, error: 'Epic not found' })
    return
  }
  const updated = await prisma.epic.update({ where: { id: epic.id }, data: parsed.data })
  res.json({ data: updated, error: null })
})

epicsRouter.delete('/:id', async (req, res) => {
  const epic = await prisma.epic.findUnique({ where: { id: req.params.id } })
  if (!epic) {
    res.status(404).json({ data: null, error: 'Epic not found' })
    return
  }
  const referencing = await prisma.ticket.count({ where: { epicId: epic.id } })
  if (referencing > 0) {
    res.status(409).json({ data: null, error: 'Cannot delete an epic that is referenced by tickets' })
    return
  }
  await prisma.epic.delete({ where: { id: epic.id } })
  res.status(204).send()
})
