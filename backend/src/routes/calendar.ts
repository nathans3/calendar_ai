import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import db from '../db/client'

const router = Router()

// All calendar routes require authentication
router.use(authenticate)

// ── Helper: keep period event titles in sync ──────────────
// Finds weekly sage events whose title matches the bare period label
// (e.g. "Period 1" or "Period 1 (Old Name)") and renames them to
// "Period 1 (Course Name)".  Safe to call with any pool/client.
async function renamePeriodEvents(
  userId: string,
  periodLabel: string,   // e.g. "Period 1"
  courseName: string,    // e.g. "AP Econ"
  _unused: null,
  pool: typeof db
): Promise<void> {
  try {
    // Match events whose title starts with the period label (with or without existing parens)
    const newTitle = `${periodLabel} (${courseName})`
    await pool.query(
      `UPDATE events
       SET title = $3, updated_at = NOW()
       WHERE user_id = $1
         AND color = 'sage'
         AND repeat_rule = 'weekly'
         AND (title = $2 OR title LIKE $4)`,
      [userId, periodLabel, newTitle, `${periodLabel} (%`]
    )
  } catch (e: any) {
    console.warn('[renamePeriodEvents] non-fatal:', e.message)
  }
}

// ── GET /api/calendars — list user's courses ──────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT id, name, period, color, created_at FROM courses WHERE user_id=$1 ORDER BY period ASC',
      [req.userId]
    )
    res.json(result.rows)
  } catch (err) {
    console.error('Get calendars error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/calendars — create a course ────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, period, color } = req.body
    if (!name?.trim() || !period?.trim()) {
      return res.status(400).json({ message: 'Name and period are required.' })
    }

    const result = await db.query(
      `INSERT INTO courses(user_id, name, period, color)
       VALUES($1,$2,$3,$4) RETURNING id, name, period, color, created_at`,
      [req.userId, name.trim(), period.trim(), color || 'sage']
    )
    const course = result.rows[0]

    // Update any weekly period events that match this period label to show the course name
    // e.g. "Period 1" → "Period 1 (AP Econ)"
    await renamePeriodEvents(req.userId!, period.trim(), name.trim(), null, db)

    res.status(201).json(course)
  } catch (err) {
    console.error('Create calendar error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/calendars/:id ────────────────────────────────
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'SELECT id, name, period, color, created_at FROM courses WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Calendar not found.' })
    }
    res.json(result.rows[0])
  } catch (err) {
    console.error('Get calendar error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PATCH /api/calendars/:id — update name/period/color ──
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, period, color } = req.body
    const result = await db.query(
      `UPDATE courses SET
        name = COALESCE($3, name),
        period = COALESCE($4, period),
        color = COALESCE($5, color),
        updated_at = NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id, name, period, color`,
      [req.params.id, req.userId, name, period, color]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Calendar not found.' })
    }
    const updated = result.rows[0]
    // Keep period events in sync with the new name/period
    await renamePeriodEvents(req.userId!, updated.period, updated.name, null, db)
    res.json(result.rows[0])
  } catch (err) {
    console.error('Update calendar error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── DELETE /api/calendars/:id ─────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Get the calendar's period label before deleting so we can clean up events
    const calResult = await db.query(
      'SELECT id, name, period FROM courses WHERE id=$1 AND user_id=$2',
      [req.params.id, req.userId]
    )
    if (calResult.rows.length === 0) {
      return res.status(404).json({ message: 'Calendar not found.' })
    }
    const { period } = calResult.rows[0]

    // Delete the calendar
    await db.query('DELETE FROM courses WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])

    // Clean up the weekly period event(s) in the events table that belonged to this calendar.
    // Only delete if NO other calendar still uses the same period label.
    const remaining = await db.query(
      'SELECT id FROM courses WHERE user_id=$1 AND period=$2',
      [req.userId, period]
    )
    if (remaining.rows.length === 0 && period) {
      await db.query(
        `DELETE FROM events WHERE user_id=$1 AND color='sage' AND repeat_rule='weekly' AND (title=$2 OR title LIKE $3)`,
        [req.userId, period, `${period} (%`]
      )
    }

    res.json({ message: 'Calendar deleted.', id: req.params.id })
  } catch (err) {
    console.error('Delete calendar error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

export default router
