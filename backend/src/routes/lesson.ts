import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import db from '../db/client'

const router = Router()
router.use(authenticate)

// ── GET /api/lessons/:courseId?month=YYYY-MM ──────────────
// Returns all lessons for a course (optionally filtered by month)
router.get('/:courseId', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId } = req.params
    const { month } = req.query // 'YYYY-MM'

    // Verify ownership
    const owner = await db.query(
      'SELECT id FROM courses WHERE id=$1 AND user_id=$2',
      [courseId, req.userId]
    )
    if (owner.rows.length === 0) {
      return res.status(404).json({ message: 'Calendar not found.' })
    }

    let query = `
      SELECT
        id, course_id,
        TO_CHAR(date, 'YYYY-MM-DD') AS date,
        lesson_plan, deadlines, milestones, assessments, hw, notes,
        updated_at
      FROM lessons
      WHERE course_id=$1`
    const params: any[] = [courseId]

    if (month && typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
      query += ` AND TO_CHAR(date, 'YYYY-MM') = $2`
      params.push(month)
    }

    query += ' ORDER BY date ASC'

    const result = await db.query(query, params)

    // Return as an object keyed by date for easy frontend lookup
    const byDate: Record<string, any> = {}
    for (const row of result.rows) {
      byDate[row.date] = {
        date: row.date,
        lessonPlan: row.lesson_plan,
        deadlines: row.deadlines,
        milestones: row.milestones,
        assessments: row.assessments,
        hw: row.hw,
        notes: row.notes,
      }
    }
    res.json(byDate)
  } catch (err) {
    console.error('Get lessons error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PUT /api/lessons/:courseId/:date — upsert a day ──────
router.put('/:courseId/:date', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, date } = req.params

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' })
    }

    // Verify course ownership
    const owner = await db.query(
      'SELECT id FROM courses WHERE id=$1 AND user_id=$2',
      [courseId, req.userId]
    )
    if (owner.rows.length === 0) {
      return res.status(404).json({ message: 'Calendar not found.' })
    }

    const { lessonPlan = '', deadlines = '', milestones = '', assessments = '', hw = '', notes = '' } = req.body

    // ── Closed-day guard ─────────────────────────────────
    // If this day already has a closure marker (notes field set), block all
    // lesson-content writes UNLESS the request is only updating the notes field
    // itself (e.g. the teacher is renaming or clearing the closure reason).
    const existing = await db.query(
      `SELECT notes FROM lessons WHERE course_id=$1 AND date=$2`,
      [courseId, date]
    )
    const existingNotes = existing.rows[0]?.notes || ''
    const isContentWrite = lessonPlan || deadlines || milestones || assessments || hw
    if (existingNotes && isContentWrite && notes === existingNotes) {
      // Day is closed and caller is trying to add lesson content — reject
      return res.status(409).json({
        message: `This day is marked as "${existingNotes}" and cannot accept lesson content. Clear the day note first to re-enable scheduling.`,
        closedDay: true,
        closureReason: existingNotes,
      })
    }

    await db.query(
      `INSERT INTO lessons(course_id, date, lesson_plan, deadlines, milestones, assessments, hw, notes)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(course_id, date)
       DO UPDATE SET
         lesson_plan  = EXCLUDED.lesson_plan,
         deadlines    = EXCLUDED.deadlines,
         milestones   = EXCLUDED.milestones,
         assessments  = EXCLUDED.assessments,
         hw           = EXCLUDED.hw,
         notes        = EXCLUDED.notes,
         updated_at   = NOW()`,
      [courseId, date, lessonPlan, deadlines, milestones, assessments, hw, notes]
    )

    res.json({ message: 'Lesson saved.', courseId, date })
  } catch (err) {
    console.error('Save lesson error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── DELETE /api/lessons/:courseId/:date ───────────────────
router.delete('/:courseId/:date', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, date } = req.params

    const owner = await db.query(
      'SELECT id FROM courses WHERE id=$1 AND user_id=$2',
      [courseId, req.userId]
    )
    if (owner.rows.length === 0) {
      return res.status(404).json({ message: 'Calendar not found.' })
    }

    await db.query('DELETE FROM lessons WHERE course_id=$1 AND date=$2', [courseId, date])
    res.json({ message: 'Lesson cleared.' })
  } catch (err) {
    console.error('Delete lesson error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

export default router
