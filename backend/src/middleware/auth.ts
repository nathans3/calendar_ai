import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  userId?: string
}

// ── Read JWT_SECRET at call time, never at module load time ──────────────
// If this were a module-level const it would be captured before dotenv runs,
// causing token verification to use a different secret than the one that
// signed the token → every authenticated request returns 401 Unauthorized.
function getSecret(): string {
  return process.env.JWT_SECRET || 'dev_secret_change_in_production'
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined

  // Support both Authorization: Bearer header and httpOnly cookie
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]
  } else if (req.cookies?.cal_ai_token) {
    token = req.cookies.cal_ai_token
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized. Please log in.' })
  }

  try {
    const decoded = jwt.verify(token, getSecret()) as { userId: string }
    req.userId = decoded.userId
    next()
  } catch {
    res.status(401).json({ message: 'Session expired. Please log in again.' })
  }
}