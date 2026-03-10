// ─── MUST be first — loads .env before any other module reads process.env ─────
import './env'

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import authRoutes from './routes/auth'
import calendarRoutes from './routes/calendar'
import lessonRoutes from './routes/lesson'
import eventRoutes from './routes/event'
import aiRoutes from './routes/ai'
import uploadRoutes from './routes/upload'

const app = express()
const PORT = process.env.PORT || 4000

// ─── Middleware ──────────────────────────────────────────
// CLIENT_URL can be a comma-separated list for multi-origin support
// e.g.  CLIENT_URL=https://my-app.up.railway.app,http://localhost:3000
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// ─── Routes ──────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/calendars', calendarRoutes)
app.use('/api/lessons', lessonRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/upload', uploadRoutes)

// ─── Health check ────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── Global error handler ────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ message: 'Internal server error.' })
})

// ─── Start ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✦ Calendar AI backend → http://localhost:${PORT}`)
})

export default app