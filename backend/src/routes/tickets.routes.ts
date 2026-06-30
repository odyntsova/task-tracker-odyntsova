import { Router } from 'express'
import { PrismaClient, TicketType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { requireAuth, requireVerified, AuthRequest } from '../middleware/auth'

export const ticketsRouter = Router()
const prisma = new PrismaClient()

const TYPES = ['bug', 'feature', 'fix'] as const
const STATES = ['new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done'] as const

const ticketInclude = {
  team: { select: { id: true, name: true } },
  epic: { select: { id: true, title: true } },
  createdBy: { select: { id: true, email: true } },
} satisfies Prisma.TicketInclude

const createSchema = z.object({
  teamId: z.string().uuid(),
  type: z.enum(TYPES),
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  epicId: z.string().uuid().nullable().optional(),
  state: z.enum(STATES).optional(),
})

const updateSchema = z.object({
  teamId: z.string().uuid().optional(),
  type: z.enum(TYPES).optional(),
  title: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  epicId: z.string().uuid().nullable().optional(),
  state: z.enum(STATES).optional(),
})

ticketsRouter.use(requireAuth, requireVerified)

// Validates that an epic (when set) belongs to the given team.
async function epicBelongsToTeam(epicId: string, teamId: string): Promise<boolean> {
  const epic = await prisma.epic.findUnique({ where: { id: epicId } })
  return !!epic && epic.teamId === teamId
}

// --- Board list: GET /api/tickets?teamId=&type=&epicId=&q= -----------------
ticketsRouter.get('/', async (req, res) => {
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined
  if (!teamId) {
    res.status(422).json({ data: null, error: 'teamId is required' })
    return
  }
  const type = typeof req.query.type === 'string' ? req.query.type : undefined
  const epicId = typeof req.query.epicId === 'string' ? req.query.epicId : undefined
  const q = typeof req.query.q === 'string' ? req.query.q : undefined

  const tickets = await prisma.ticket.findMany({
    where: {
      teamId,
      ...(type ? { type: type as TicketType } : {}),
      ...(epicId ? { epicId } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
    },
    include: ticketInclude,
    orderBy: { modifiedAt: 'desc' },
  })
  res.json({ data: tickets, error: null })
})

ticketsRouter.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const { teamId, type, title, body, epicId, state } = parsed.data

  if (!(await prisma.team.findUnique({ where: { id: teamId } }))) {
    res.status(422).json({ data: null, error: 'Team does not exist' })
    return
  }
  if (epicId && !(await epicBelongsToTeam(epicId, teamId))) {
    res.status(422).json({ data: null, error: 'Epic must belong to the same team as the ticket' })
    return
  }

  const ticket = await prisma.ticket.create({
    data: { teamId, type, title, body, epicId: epicId ?? null, state: state ?? 'new', createdById: req.userId! },
    include: ticketInclude,
  })
  res.status(201).json({ data: ticket, error: null })
})

ticketsRouter.get('/:id', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: ticketInclude })
  if (!ticket) {
    res.status(404).json({ data: null, error: 'Ticket not found' })
    return
  }
  res.json({ data: ticket, error: null })
})

ticketsRouter.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Invalid input' })
    return
  }
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!ticket) {
    res.status(404).json({ data: null, error: 'Ticket not found' })
    return
  }

  const next = {
    teamId: parsed.data.teamId ?? ticket.teamId,
    type: parsed.data.type ?? ticket.type,
    title: parsed.data.title ?? ticket.title,
    body: parsed.data.body ?? ticket.body,
    state: parsed.data.state ?? ticket.state,
    epicId: parsed.data.epicId !== undefined ? parsed.data.epicId : ticket.epicId,
  }

  if (parsed.data.teamId && !(await prisma.team.findUnique({ where: { id: next.teamId } }))) {
    res.status(422).json({ data: null, error: 'Team does not exist' })
    return
  }
  // The (team, epic) pair must be consistent — rejects a team change that
  // leaves an epic from a different team.
  if (next.epicId && !(await epicBelongsToTeam(next.epicId, next.teamId))) {
    res.status(422).json({ data: null, error: 'Epic must belong to the same team as the ticket' })
    return
  }

  // Only persist (and advance modifiedAt) when something actually changed.
  const data: Prisma.TicketUpdateInput = {}
  if (next.teamId !== ticket.teamId) data.team = { connect: { id: next.teamId } }
  if (next.type !== ticket.type) data.type = next.type
  if (next.title !== ticket.title) data.title = next.title
  if (next.body !== ticket.body) data.body = next.body
  if (next.state !== ticket.state) data.state = next.state
  if (next.epicId !== ticket.epicId)
    data.epic = next.epicId ? { connect: { id: next.epicId } } : { disconnect: true }

  if (Object.keys(data).length === 0) {
    const current = await prisma.ticket.findUnique({ where: { id: ticket.id }, include: ticketInclude })
    res.json({ data: current, error: null })
    return
  }

  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data, include: ticketInclude })
  res.json({ data: updated, error: null })
})

ticketsRouter.delete('/:id', async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } })
  if (!ticket) {
    res.status(404).json({ data: null, error: 'Ticket not found' })
    return
  }
  await prisma.ticket.delete({ where: { id: ticket.id } }) // comments cascade
  res.status(204).send()
})

// --- Comments --------------------------------------------------------------
const commentSchema = z.object({ body: z.string().trim().min(1) })

ticketsRouter.get('/:id/comments', async (req, res) => {
  if (!(await prisma.ticket.findUnique({ where: { id: req.params.id } }))) {
    res.status(404).json({ data: null, error: 'Ticket not found' })
    return
  }
  const comments = await prisma.comment.findMany({
    where: { ticketId: req.params.id },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ data: comments, error: null })
})

ticketsRouter.post('/:id/comments', async (req: AuthRequest, res) => {
  if (!(await prisma.ticket.findUnique({ where: { id: req.params.id } }))) {
    res.status(404).json({ data: null, error: 'Ticket not found' })
    return
  }
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Comment body is required' })
    return
  }
  // Adding a comment must NOT touch the ticket's modifiedAt.
  const comment = await prisma.comment.create({
    data: { ticketId: req.params.id, authorId: req.userId!, body: parsed.data.body },
    include: { author: { select: { id: true, email: true } } },
  })
  res.status(201).json({ data: comment, error: null })
})

// Edit / delete own comment (stretch). Only the author may modify a comment.
ticketsRouter.patch('/:id/comments/:commentId', async (req: AuthRequest, res) => {
  const parsed = commentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ data: null, error: 'Comment body is required' })
    return
  }
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } })
  if (!comment || comment.ticketId !== req.params.id) {
    res.status(404).json({ data: null, error: 'Comment not found' })
    return
  }
  if (comment.authorId !== req.userId) {
    res.status(403).json({ data: null, error: 'You can only edit your own comments' })
    return
  }
  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { body: parsed.data.body },
    include: { author: { select: { id: true, email: true } } },
  })
  res.json({ data: updated, error: null })
})

ticketsRouter.delete('/:id/comments/:commentId', async (req: AuthRequest, res) => {
  const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } })
  if (!comment || comment.ticketId !== req.params.id) {
    res.status(404).json({ data: null, error: 'Comment not found' })
    return
  }
  if (comment.authorId !== req.userId) {
    res.status(403).json({ data: null, error: 'You can only delete your own comments' })
    return
  }
  await prisma.comment.delete({ where: { id: comment.id } })
  res.status(204).send()
})
