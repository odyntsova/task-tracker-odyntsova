import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.routes'
import { teamsRouter } from './routes/teams.routes'
import { epicsRouter } from './routes/epics.routes'
import { ticketsRouter } from './routes/tickets.routes'
import { requestLogger } from './middleware/requestLogger'

export const app = express()

app.use(requestLogger())
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' }))
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/teams', teamsRouter)
app.use('/api/epics', epicsRouter)
app.use('/api/tickets', ticketsRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
