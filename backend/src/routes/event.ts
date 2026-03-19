import { Router, Response } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import db from '../db/client'

const router = Router()
router.use(authenticate)

// ── Expand repeating events into instances within a date range ──
function expandRepeating(
  event: any,
  rangeStart: string,  // 'YYYY-MM-DD'
  rangeEnd: string,    // 'YYYY-MM-DD'
): any[] {
  if (!event.repeatRule || event.repeatRule === 'none') return []

  const result: any[] = []
  const start = new Date(event.date + 'T12:00:00Z')
  const end   = new Date(rangeEnd + 'T12:00:00Z')
  const rStart= new Date(rangeStart + 'T12:00:00Z')
  // Generate up to 3 years of future instances
  const hardLimit = new Date(start)
  hardLimit.setFullYear(hardLimit.getFullYear() + 3)
  let cap = end < hardLimit ? end : hardLimit
  // If the event has a specific end date, honour it
  if (event.repeatEndDate) {
    const endDateCap = new Date(event.repeatEndDate + 'T12:00:00Z')
    if (endDateCap < cap) cap = endDateCap
  }

  const cursor = new Date(start)
  // Advance past the original event date to avoid duplicating it
  advanceByRule(cursor, event.repeatRule)

  let count = 0
  while (cursor <= cap && count < 500) {
    const ds = cursor.toISOString().slice(0, 10)
    if (cursor >= rStart) {
      result.push({ ...event, id: `${event.id}__${ds}`, date: ds, repeatParentId: event.id })
    }
    advanceByRule(cursor, event.repeatRule)
    count++
  }
  return result
}

function advanceByRule(d: Date, rule: string) {
  switch (rule) {
    case 'daily':   d.setUTCDate(d.getUTCDate() + 1); break
    case 'weekly':  d.setUTCDate(d.getUTCDate() + 7); break
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break
  }
}

// ── GET /api/events?month=YYYY-MM ─────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { month } = req.query

    // Fetch base events — for the requested month AND any repeating events
    // that started before/during the requested month (they may have instances in it)
    let query = `
      SELECT
        id, user_id, title,
        TO_CHAR(date, 'YYYY-MM-DD') AS date,
        TO_CHAR(start_time, 'HH24:MI') AS start_time,
        TO_CHAR(end_time, 'HH24:MI') AS end_time,
        all_day, school_wide, repeat_rule,
        TO_CHAR(repeat_end_date, 'YYYY-MM-DD') AS repeat_end_date,
        location, description, color
      FROM events
      WHERE user_id=$1
        AND (
          TO_CHAR(date, 'YYYY-MM') = $2
          OR repeat_rule != 'none'
        )`
    const params: any[] = [req.userId]

    const monthStr = (month && typeof month === 'string' && /^\d{4}-\d{2}$/.test(month))
      ? month
      : new Date().toISOString().slice(0, 7)
    params.push(monthStr)

    query += ' ORDER BY date ASC, start_time ASC NULLS FIRST'

    const result = await db.query(query, params)

    // Normalize base events
    const baseEvents = result.rows.map(e => ({
      id: e.id,
      title: e.title,
      date: e.date,
      startTime: e.start_time || undefined,
      endTime: e.end_time || undefined,
      allDay: e.all_day,
      schoolWide: e.school_wide,
      repeatRule: e.repeat_rule,
      repeatEndDate: e.repeat_end_date || undefined,
      location: e.location,
      description: e.description,
      color: e.color,
    }))

    // Expand repeating events into instances within a generous window
    // (month ±1 day so week-view borders work)
    const [year, mon] = monthStr.split('-').map(Number)
    const rangeStart = new Date(Date.UTC(year, mon - 1, 1))
    const rangeEnd   = new Date(Date.UTC(year, mon, 0)) // last day of month
    const rsStr = rangeStart.toISOString().slice(0, 10)
    const reStr = rangeEnd.toISOString().slice(0, 10)

    const allEvents: any[] = []
    for (const ev of baseEvents) {
      allEvents.push(ev)
      if (ev.repeatRule && ev.repeatRule !== 'none') {
        const instances = expandRepeating(ev, rsStr, reStr)
        allEvents.push(...instances)
      }
    }

    // Filter to only events in the requested month (remove base event if it's in another month)
    const filtered = allEvents.filter(e => e.date.startsWith(monthStr))

    res.json(filtered)
  } catch (err) {
    console.error('Get events error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/events ──────────────────────────────────────
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      title, date, startTime, endTime,
      allDay = false, schoolWide = false,
      repeatRule = 'none', repeatEndDate, location = '', description = '', color = 'blue'
    } = req.body

    if (!title?.trim() || !date) {
      return res.status(400).json({ message: 'Title and date are required.' })
    }

    const result = await db.query(
      `INSERT INTO events(user_id, title, date, start_time, end_time, all_day, school_wide, repeat_rule, repeat_end_date, location, description, color)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, title, TO_CHAR(date,'YYYY-MM-DD') AS date,
         TO_CHAR(start_time,'HH24:MI') AS start_time,
         TO_CHAR(end_time,'HH24:MI') AS end_time,
         all_day, school_wide, repeat_rule,
         TO_CHAR(repeat_end_date,'YYYY-MM-DD') AS repeat_end_date,
         location, description, color`,
      [req.userId, title.trim(), date,
       allDay ? null : startTime || null,
       allDay ? null : endTime || null,
       allDay, schoolWide, repeatRule,
       repeatRule !== 'none' && repeatEndDate ? repeatEndDate : null,
       location, description, color]
    )

    const e = result.rows[0]
    res.status(201).json({
      id: e.id, title: e.title, date: e.date,
      startTime: e.start_time || undefined,
      endTime: e.end_time || undefined,
      allDay: e.all_day, schoolWide: e.school_wide,
      repeatRule: e.repeat_rule, repeatEndDate: e.repeat_end_date || undefined,
      location: e.location,
      description: e.description, color: e.color,
    })
  } catch (err) {
    console.error('Create event error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PATCH /api/events/:id  (also aliased as PUT) ──────────
async function updateEvent(req: AuthRequest, res: Response) {
  try {
    const {
      title, date, startTime, endTime,
      allDay, schoolWide, repeatRule, repeatEndDate, location, description, color
    } = req.body

    // Don't update instances of repeating events (their id contains '__')
    const baseId = req.params.id.includes('__') ? req.params.id.split('__')[0] : req.params.id

    const result = await db.query(
      `UPDATE events SET
        title        = COALESCE($3, title),
        date         = COALESCE($4::date, date),
        start_time   = CASE WHEN $5::boolean THEN NULL ELSE COALESCE($6::time, start_time) END,
        end_time     = CASE WHEN $5::boolean THEN NULL ELSE COALESCE($7::time, end_time) END,
        all_day      = COALESCE($5, all_day),
        school_wide  = COALESCE($8, school_wide),
        repeat_rule  = COALESCE($9, repeat_rule),
        repeat_end_date = $13::date,
        location     = COALESCE($10, location),
        description  = COALESCE($11, description),
        color        = COALESCE($12, color),
        updated_at   = NOW()
       WHERE id=$1 AND user_id=$2
       RETURNING id, title, TO_CHAR(date,'YYYY-MM-DD') AS date,
         TO_CHAR(start_time,'HH24:MI') AS start_time,
         TO_CHAR(end_time,'HH24:MI') AS end_time,
         all_day, school_wide, repeat_rule,
         TO_CHAR(repeat_end_date,'YYYY-MM-DD') AS repeat_end_date,
         location, description, color`,
      [baseId, req.userId, title, date, allDay, startTime, endTime, schoolWide, repeatRule, location, description, color,
       repeatRule !== 'none' && repeatEndDate ? repeatEndDate : null]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found.' })
    }

    const e = result.rows[0]
    res.json({
      id: e.id, title: e.title, date: e.date,
      startTime: e.start_time || undefined,
      endTime: e.end_time || undefined,
      allDay: e.all_day, schoolWide: e.school_wide,
      repeatRule: e.repeat_rule, repeatEndDate: e.repeat_end_date || undefined,
      location: e.location,
      description: e.description, color: e.color,
    })
  } catch (err) {
    console.error('Update event error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
}
router.patch('/:id', updateEvent)
router.put('/:id', updateEvent)

// ── DELETE /api/events/:id ────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      'DELETE FROM events WHERE id=$1 AND user_id=$2 RETURNING id',
      [req.params.id, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found.' })
    }
    res.json({ message: 'Event deleted.', id: req.params.id })
  } catch (err) {
    console.error('Delete event error:', err)
    res.status(500).json({ message: 'Server error.' })
  }
})

export default router
