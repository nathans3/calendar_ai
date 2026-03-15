import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import db from '../db/client'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

const JWT_EXPIRES = '7d'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

// ── Read JWT_SECRET lazily at call time, NOT at module load time ──────────
// This is critical: if this function were a module-level constant, it would
// capture process.env.JWT_SECRET before dotenv has run — resulting in tokens
// signed with the fallback secret that the middleware then fails to verify.
function getSecret(): string {
  return process.env.JWT_SECRET || 'dev_secret_change_in_production'
}

function signToken(userId: string) {
  return jwt.sign({ userId }, getSecret(), { expiresIn: JWT_EXPIRES } as jwt.SignOptions)
}

const SignupSchema = z.object({
  email: z.string().email().transform(s => s.trim().toLowerCase()),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().optional().default(''),
  schoolName: z.string().optional().default(''),
})

const LoginSchema = z.object({
  email: z.string().email().transform(s => s.trim().toLowerCase()),
  password: z.string().min(1),
})

// ── POST /api/auth/signup ─────────────────────────────────
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = SignupSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input.' })
    }
    const { email, password, fullName, schoolName } = parsed.data

    const existing = await db.query('SELECT id FROM users WHERE email=$1', [email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in.' })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // All new accounts get 'pro' so AI features work immediately
    const result = await db.query(
      `INSERT INTO users(email, password_hash, full_name, school_name, plan)
       VALUES($1,$2,$3,$4,'pro') RETURNING id, email, full_name, school_name, plan`,
      [email, passwordHash, fullName, schoolName]
    )
    const user = result.rows[0]
    const token = signToken(user.id)

    res
      .cookie('cal_ai_token', token, COOKIE_OPTS)
      .status(201)
      .json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          schoolName: user.school_name,
          plan: user.plan,
        },
        message: 'Account created successfully.',
      })
  } catch (err) {
    console.error('Signup error:', err)
    res.status(500).json({ message: 'Server error. Please try again.' })
  }
})

// ── POST /api/auth/login ──────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = LoginSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid email or password.' })
    }
    const { email, password } = parsed.data

    const result = await db.query(
      'SELECT id, email, password_hash, full_name, school_name, plan FROM users WHERE email=$1',
      [email]
    )
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    // Upgrade any existing free-plan users to pro on login
    if (user.plan !== 'pro') {
      await db.query('UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2', ['pro', user.id])
      user.plan = 'pro'
    }

    // Track last login time
    await db.query('UPDATE users SET last_login=NOW() WHERE id=$1', [user.id])

    const token = signToken(user.id)

    res
      .cookie('cal_ai_token', token, COOKIE_OPTS)
      .json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          schoolName: user.school_name,
          plan: user.plan,  // always 'pro'
        },
      })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ message: 'Server error. Please try again.' })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('cal_ai_token').json({ message: 'Logged out.' })
})

// ── GET /api/auth/me ──────────────────────────────────────
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT id, email, full_name, school_name, plan FROM users WHERE id=$1',
      [req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' })
    }
    const user = result.rows[0]

    // Ensure any user fetched here also gets upgraded to pro
    if (user.plan !== 'pro') {
      await db.query('UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2', ['pro', user.id])
      user.plan = 'pro'
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      schoolName: user.school_name,
      plan: user.plan,
    })
  } catch (err) {
    console.error('Me error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/auth/forgot-password ───────────────────────
router.post('/forgot-password', async (_req: Request, res: Response) => {
  res.json({ message: 'If that email is in our system, we will send a reset link shortly.' })
})

// ── GET /api/auth/profile ─────────────────────────────────
// Returns user settings including periods configuration
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, email, full_name, school_name, plan,
              school_day_start, school_day_end, periods
       FROM users WHERE id=$1`,
      [req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' })
    }
    const user = result.rows[0]
    // Decode periods — may be plain array (v1) or wrapper object { _v:2, regular, special }
    let regularPeriods: any[] = []
    let specialDays: any[] = []
    const rawPeriods = user.periods
    if (Array.isArray(rawPeriods)) {
      regularPeriods = rawPeriods
    } else if (rawPeriods && rawPeriods._v === 2) {
      regularPeriods = rawPeriods.regular || []
      specialDays    = rawPeriods.special  || []
    }
    const timezone = rawPeriods?._v === 2 ? (rawPeriods.timezone || 'America/New_York') : 'America/New_York'
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      schoolName: user.school_name,
      plan: user.plan,
      schoolDayStart: user.school_day_start || '08:00',
      schoolDayEnd: user.school_day_end || '15:00',
      periods: regularPeriods,
      specialDays,
      timezone,
    })
  } catch (err) {
    console.error('Profile get error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PUT /api/auth/profile ─────────────────────────────────
// Updates user profile settings including periods
router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fullName, schoolName, schoolDayStart, schoolDayEnd, periods, specialDays, timezone } = req.body

    // Validate periods array structure
    if (periods !== undefined && !Array.isArray(periods)) {
      return res.status(400).json({ message: 'periods must be an array.' })
    }

    // Encode periods + specialDays + timezone into a single JSONB column as versioned wrapper
    let periodsPayload: any = null
    if (periods !== undefined || specialDays !== undefined || timezone !== undefined) {
      // Fetch current value to merge
      const cur = await db.query(`SELECT periods FROM users WHERE id=$1`, [req.userId])
      const raw = cur.rows[0]?.periods
      let curRegular = Array.isArray(raw) ? raw : (raw?._v === 2 ? raw.regular || [] : [])
      let curSpecial = Array.isArray(raw) ? [] : (raw?._v === 2 ? raw.special || [] : [])
      const curTz = Array.isArray(raw) ? 'America/New_York' : (raw?._v === 2 ? raw.timezone || 'America/New_York' : 'America/New_York')
      const newRegular = periods    !== undefined ? periods    : curRegular
      const newSpecial = specialDays !== undefined ? specialDays : curSpecial
      const newTz      = timezone   !== undefined ? timezone   : curTz
      periodsPayload = JSON.stringify({ _v: 2, regular: newRegular, special: newSpecial, timezone: newTz })
    }

    const result = await db.query(
      `UPDATE users SET
        full_name        = COALESCE($2, full_name),
        school_name      = COALESCE($3, school_name),
        school_day_start = COALESCE($4, school_day_start),
        school_day_end   = COALESCE($5, school_day_end),
        periods          = COALESCE($6::jsonb, periods),
        updated_at       = NOW()
       WHERE id=$1
       RETURNING id, email, full_name, school_name, plan, school_day_start, school_day_end, periods`,
      [
        req.userId,
        fullName   || null,
        schoolName || null,
        schoolDayStart || null,
        schoolDayEnd   || null,
        periodsPayload,
      ]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' })
    }
    const user = result.rows[0]
    // Decode stored periods wrapper
    const rawPeriods2 = user.periods
    let retRegular = []
    let retSpecial: any[] = []
    if (Array.isArray(rawPeriods2)) {
      retRegular = rawPeriods2
    } else if (rawPeriods2 && rawPeriods2._v === 2) {
      retRegular = rawPeriods2.regular || []
      retSpecial = rawPeriods2.special  || []
    }
    const retTz = rawPeriods2?._v === 2 ? (rawPeriods2.timezone || 'America/New_York') : 'America/New_York'
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      schoolName: user.school_name,
      plan: user.plan,
      schoolDayStart: user.school_day_start || '08:00',
      schoolDayEnd: user.school_day_end || '15:00',
      periods: retRegular,
      specialDays: retSpecial,
      timezone: retTz,
    })
  } catch (err) {
    console.error('Profile update error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/auth/admin/users ─────────────────────────────
// Protected by ADMIN_SECRET env var — only for the app owner
router.get('/admin/users', async (req: Request, res: Response) => {
  try {
    const adminKey = req.headers['x-admin-key']
    const secret = process.env.ADMIN_SECRET
    if (!secret || adminKey !== secret) {
      return res.status(403).json({ message: 'Forbidden.' })
    }
    const result = await db.query(
      `SELECT id, email, full_name, school_name, plan, created_at, last_login
       FROM users ORDER BY created_at DESC`
    )
    const stats = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')  AS signups_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS signups_30d,
        COUNT(*) FILTER (WHERE last_login  >= NOW() - INTERVAL '7 days')  AS logins_7d,
        COUNT(*) FILTER (WHERE last_login  >= NOW() - INTERVAL '30 days') AS logins_30d
      FROM users
    `)
    res.json({ users: result.rows, stats: stats.rows[0] })
  } catch (err) {
    console.error('Admin users error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

export default router