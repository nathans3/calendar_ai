import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import nodemailer from 'nodemailer'
import { randomBytes } from 'crypto'
import db from '../db/client'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

const JWT_EXPIRES = '30d'

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

// ── Read JWT_SECRET lazily at call time, NOT at module load time ──────────
function getSecret(): string {
  return process.env.JWT_SECRET || 'dev_secret_change_in_production'
}

function signToken(userId: string) {
  return jwt.sign({ userId }, getSecret(), { expiresIn: JWT_EXPIRES } as jwt.SignOptions)
}

// ── Nodemailer transporter (SMTP via env) ─────────────────
function getMailer() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  })
}

async function sendVerificationEmail(email: string, token: string) {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim()
  const link = `${clientUrl}/verify-email?token=${token}`
  const mailer = getMailer()
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@calendarai.app',
    to: email,
    subject: 'Verify your Calendar AI email',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fafaf8;border-radius:12px">
        <h2 style="color:#1a1a1a;margin:0 0 8px">Verify your email</h2>
        <p style="color:#555;margin:0 0 24px">Click the button below to activate your Calendar AI account. This link expires in 24 hours.</p>
        <a href="${link}" style="display:inline-block;background:#4a7c59;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a>
        <p style="color:#999;font-size:12px;margin-top:24px">Or paste this URL: ${link}</p>
      </div>`,
  })
}

const strongPassword = z.string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.')

const SignupSchema = z.object({
  email: z.string().email().transform(s => s.trim().toLowerCase()),
  password: strongPassword,
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
    const verificationToken = randomBytes(32).toString('hex')
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    const result = await db.query(
      `INSERT INTO users(email, password_hash, full_name, school_name, plan, email_verified, verification_token, verification_expires, provider)
       VALUES($1,$2,$3,$4,'pro',FALSE,$5,$6,'local') RETURNING id, email, full_name, school_name, plan`,
      [email, passwordHash, fullName, schoolName, verificationToken, verificationExpires]
    )
    const user = result.rows[0]

    // Send verification email (non-fatal — account is created regardless)
    try {
      await sendVerificationEmail(email, verificationToken)
    } catch (mailErr) {
      console.error('Verification email send error:', mailErr)
    }

    res.status(201).json({
      requiresVerification: true,
      email,
      message: 'Account created. Please check your email to verify your address before logging in.',
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
      'SELECT id, email, password_hash, full_name, school_name, plan, email_verified, provider FROM users WHERE email=$1',
      [email]
    )
    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    const user = result.rows[0]

    // Google-only accounts have no password — tell them to use Google
    if (user.provider === 'google' && !user.password_hash) {
      return res.status(401).json({ message: 'This account uses Google sign-in. Please click "Continue with Google".' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' })
    }

    // Block login until email is verified
    if (!user.email_verified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in.',
        requiresVerification: true,
        email,
      })
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

// ── GET /api/auth/verify-email?token=... ─────────────────
router.get('/verify-email', async (req: Request, res: Response) => {
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim()
  try {
    const token = (req.query.token as string || '').trim()
    if (!token) return res.redirect(`${clientUrl}/verify-email?error=missing`)

    const result = await db.query(
      `SELECT id, email_verified, verification_expires FROM users
       WHERE verification_token=$1`,
      [token]
    )
    if (result.rows.length === 0) {
      return res.redirect(`${clientUrl}/verify-email?error=invalid`)
    }
    const user = result.rows[0]
    if (user.email_verified) {
      return res.redirect(`${clientUrl}/verify-email?status=already`)
    }
    if (new Date(user.verification_expires) < new Date()) {
      return res.redirect(`${clientUrl}/verify-email?error=expired`)
    }
    await db.query(
      `UPDATE users SET email_verified=TRUE, verification_token=NULL, verification_expires=NULL, updated_at=NOW()
       WHERE id=$1`,
      [user.id]
    )
    return res.redirect(`${clientUrl}/verify-email?status=success`)
  } catch (err) {
    console.error('Verify email error:', err)
    const clientUrl2 = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim()
    return res.redirect(`${clientUrl2}/verify-email?error=server`)
  }
})

// ── POST /api/auth/resend-verification ───────────────────
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const email = ((req.body.email as string) || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ message: 'Email required.' })

    const result = await db.query(
      'SELECT id, email_verified FROM users WHERE email=$1',
      [email]
    )
    // Always respond the same way to prevent user enumeration
    if (result.rows.length === 0 || result.rows[0].email_verified) {
      return res.json({ message: 'If that email needs verification, a new link has been sent.' })
    }

    const token = randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await db.query(
      'UPDATE users SET verification_token=$1, verification_expires=$2, updated_at=NOW() WHERE id=$3',
      [token, expires, result.rows[0].id]
    )
    try {
      await sendVerificationEmail(email, token)
    } catch (mailErr) {
      console.error('Resend verification email error:', mailErr)
    }
    res.json({ message: 'Verification email sent. Please check your inbox.' })
  } catch (err) {
    console.error('Resend verification error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── Google OAuth ──────────────────────────────────────────
// Step 1: redirect browser to Google consent screen
router.get('/google', (_req: Request, res: Response) => {
  const clientId     = process.env.GOOGLE_CLIENT_ID || ''
  const clientUrl    = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim()
  const backendUrl   = process.env.BACKEND_URL || 'http://localhost:4000'
  const redirectUri  = `${backendUrl}/api/auth/google/callback`
  const scope        = 'openid email profile'
  const state        = randomBytes(16).toString('hex')

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id',     clientId)
  url.searchParams.set('redirect_uri',  redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope',         scope)
  url.searchParams.set('state',         state)
  url.searchParams.set('access_type',   'online')
  url.searchParams.set('prompt',        'select_account')

  // Store state in a short-lived cookie to validate on callback
  res.cookie('oauth_state', state, { httpOnly: true, maxAge: 10 * 60 * 1000, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' })
  res.redirect(url.toString())
})

// Step 2: Google redirects back here
router.get('/google/callback', async (req: Request, res: Response) => {
  const clientUrl  = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim()
  try {
    const { code, state, error } = req.query as Record<string, string>

    if (error) return res.redirect(`${clientUrl}/login?error=google_denied`)

    // Validate state to prevent CSRF
    const storedState = (req as any).cookies?.oauth_state
    res.clearCookie('oauth_state')
    if (!storedState || storedState !== state) {
      return res.redirect(`${clientUrl}/login?error=oauth_state`)
    }

    const backendUrl  = process.env.BACKEND_URL || 'http://localhost:4000'
    const redirectUri = `${backendUrl}/api/auth/google/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID     || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })
    const tokenData: any = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('Google token exchange failed', tokenData)
      return res.redirect(`${clientUrl}/login?error=google_token`)
    }

    // Fetch user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const googleUser: any = await userInfoRes.json()
    const email      = (googleUser.email || '').toLowerCase()
    const googleId   = googleUser.sub || ''
    const fullName   = googleUser.name || ''

    if (!email || !googleId) {
      return res.redirect(`${clientUrl}/login?error=google_profile`)
    }

    // Upsert user: find by email OR provider_id
    let userId: string
    const existing = await db.query(
      'SELECT id, provider FROM users WHERE email=$1',
      [email]
    )
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id
      // If they previously signed up with email/password, link Google to their account
      await db.query(
        `UPDATE users SET provider_id=$1, email_verified=TRUE, last_login=NOW(), updated_at=NOW()
         WHERE id=$2`,
        [googleId, userId]
      )
    } else {
      // New user via Google — create account (no password, pre-verified)
      const newUser = await db.query(
        `INSERT INTO users(email, password_hash, full_name, plan, email_verified, provider, provider_id)
         VALUES($1,'',$2,'pro',TRUE,'google',$3)
         RETURNING id`,
        [email, fullName, googleId]
      )
      userId = newUser.rows[0].id
    }

    const jwtToken = signToken(userId)
    res
      .cookie('cal_ai_token', jwtToken, COOKIE_OPTS)
      .redirect(`${clientUrl}/login?token=${encodeURIComponent(jwtToken)}`)
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    const cu = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].trim()
    res.redirect(`${cu}/login?error=google_server`)
  }
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
    const schoolYear = rawPeriods?._v === 2 ? (rawPeriods.schoolYear || '2025–2026') : '2025–2026'
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
      schoolYear,
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
    const { fullName, schoolName, schoolDayStart, schoolDayEnd, periods, specialDays, timezone, schoolYear } = req.body

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
      const newSY      = schoolYear  !== undefined ? schoolYear  : (Array.isArray(raw) ? '2025–2026' : (raw?._v === 2 ? raw.schoolYear || '2025–2026' : '2025–2026'))
      periodsPayload = JSON.stringify({ _v: 2, regular: newRegular, special: newSpecial, timezone: newTz, schoolYear: newSY })
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
    const retSY = rawPeriods2?._v === 2 ? (rawPeriods2.schoolYear || '2025–2026') : '2025–2026'
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
      schoolYear: retSY,
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