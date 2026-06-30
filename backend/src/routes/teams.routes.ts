import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requireVerified } from '../middleware/auth'

export const teamsRouter = Router()
const prisma = new PrismaClient()

const nameSchema = z.object({ name: z.string().trim().min(1).max(200) })

teamsRouter.use(requireAuth, requireVerified)

teamsRouter.get('/', async (_req, res) => {
  const teams = await prisma.team.findMany({ orderBy: { name: 'asc' } })
  res.json({ data: teams, error: null })
})

// Case-insensitive uniqueness check (Postgres `mode: insensitive`).
async function nameTaken(name: string, exceptId?: string) {
  const existing = await prisma.team.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
  })
  return !!existing
}

teamsRouter.post('/', async (req, res) => {
  const parsed = nameSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Team name is required' })
    return
  }
  if (await nameTaken(parsed.data.name)) {
    res.status(409).json({ data: null, error: 'A team with this name already exists' })
    return
  }
  const team = await prisma.team.create({ data: { name: parsed.data.name } })
  res.status(201).json({ data: team, error: null })
})

teamsRouter.patch('/:id', async (req, res) => {
  const parsed = nameSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Team name is required' })
    return
  }
  const team = await prisma.team.findUnique({ where: { id: req.params.id } })
  if (!team) {
    res.status(404).json({ data: null, error: 'Team not found' })
    return
  }
  if (await nameTaken(parsed.data.name, team.id)) {
    res.status(409).json({ data: null, error: 'A team with this name already exists' })
    return
  }
  const updated = await prisma.team.update({ where: { id: team.id }, data: { name: parsed.data.name } })
  res.json({ data: updated, error: null })
})

teamsRouter.delete('/:id', async (req, res) => {
  const team = await prisma.team.findUnique({ where: { id: req.params.id } })
  if (!team) {
    res.status(404).json({ data: null, error: 'Team not found' })
    return
  }
  const [tickets, epics] = await Promise.all([
    prisma.ticket.count({ where: { teamId: team.id } }),
    prisma.epic.count({ where: { teamId: team.id } }),
  ])
  if (tickets > 0 || epics > 0) {
    res.status(409).json({ data: null, error: 'Cannot delete a team that still has tickets or epics' })
    return
  }
  await prisma.team.delete({ where: { id: team.id } })
  res.status(204).send()
})
