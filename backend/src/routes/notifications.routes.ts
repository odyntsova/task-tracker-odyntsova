import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth, AuthRequest } from '../middleware/auth'

export const notificationsRouter = Router()
const prisma = new PrismaClient()

// List the current user's notifications (most recent first) + unread count.
notificationsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  const [notifications, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: req.userId, readAt: null } }),
  ])

  res.json({ data: notifications, error: null, meta: { unread } })
})

// Mark a single notification as read (only your own).
notificationsRouter.post('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  const result = await prisma.notification.updateMany({
    where: { id: req.params.id, userId: req.userId },
    data: { readAt: new Date() },
  })

  if (result.count === 0) {
    res.status(404).json({ data: null, error: 'Notification not found' })
    return
  }
  res.json({ data: null, error: null })
})

// Mark all of the current user's notifications as read.
notificationsRouter.post('/read-all', requireAuth, async (req: AuthRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId, readAt: null },
    data: { readAt: new Date() },
  })
  res.json({ data: null, error: null })
})
