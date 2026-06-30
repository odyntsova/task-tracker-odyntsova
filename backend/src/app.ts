import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.routes'
import { tasksRouter } from './routes/tasks.routes'
import { projectsRouter } from './routes/projects.routes'
import { usersRouter } from './routes/users.routes'
import { sprintsRouter } from './routes/sprints.routes'
import { notificationsRouter } from './routes/notifications.routes'

export const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }))
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/users', usersRouter)
app.use('/api/sprints', sprintsRouter)
app.use('/api/notifications', notificationsRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
