import { Router, Response } from 'express'
import OpenAI from 'openai'
import db from '../db/client'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ── Tool definitions ──────────────────────────────────────

// Used ONLY in generate-calendar — sending only this one tool prevents
// the model wasting input tokens on irrelevant tool schemas.
const CREATE_LESSON_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'createLesson',
    description: 'Create or fully replace content on a specific date.',
    parameters: {
      type: 'object',
      properties: {
        date:        { type: 'string', description: 'YYYY-MM-DD' },
        lessonPlan:  { type: 'string', description: 'Lesson plan text' },
        milestones:  { type: 'string', description: 'Unit or milestone marker' },
        assessments: { type: 'string', description: 'Quiz, test, or project name' },
        hw:          { type: 'string', description: 'Homework assignment' },
        deadlines:   { type: 'string', description: 'Any deadline' },
      },
      required: ['date'],
    },
  },
}

const AI_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  CREATE_LESSON_TOOL,
  {
    type: 'function',
    function: {
      name: 'moveLesson',
      description: 'Reschedule content by DELETING it from the source date and RECREATING it on the destination date. This is a physical delete + recreate — the source date will show a strikethrough/deletion and the destination will show the recreated content. Use for any reschedule/postpone/move request. When moving due to a school closure (holiday, day off, teacher work day, etc.), pass the exact reason the teacher gave in closureReason so the source day is automatically marked as closed.',
      parameters: {
        type: 'object',
        properties: {
          fromDate:       { type: 'string', description: 'YYYY-MM-DD — date to delete content FROM' },
          toDate:         { type: 'string', description: 'YYYY-MM-DD — date to recreate content ON. MUST NOT be a closed/blocked day.' },
          fields:         { type: 'array', items: { type: 'string' }, description: 'Fields to move: lessonPlan, assessments, hw, deadlines, milestones. Omit to move all.' },
          reason:         { type: 'string', description: 'Why this date is better' },
          closureReason:  { type: 'string', description: 'If moving because the source day is closed or unavailable, pass the exact reason the teacher gave here (e.g. "No School", "Professional Development", "Field Trip", "Holiday"). This will mark the source day as closed automatically. Do NOT default to "Snow Day" — use the teacher\'s exact words.' },
        },
        required: ['fromDate', 'toDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteLesson',
      description: 'Delete/clear all content from a specific date. Use when the teacher wants to remove something entirely (not move it). Different from clearDay — this is for targeted deletion with a reason.',
      parameters: {
        type: 'object',
        properties: {
          date:   { type: 'string', description: 'YYYY-MM-DD — the date to delete content from' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Specific fields to delete, or omit to delete everything' },
          reason: { type: 'string', description: 'Why this content is being deleted' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insertAssessment',
      description: 'Add a quiz, test, exam, essay, or project to a specific date.',
      parameters: {
        type: 'object',
        properties: {
          date:  { type: 'string', description: 'YYYY-MM-DD' },
          title: { type: 'string', description: 'Name of the assessment' },
          type:  { type: 'string', enum: ['quiz', 'test', 'exam', 'essay', 'project'] },
        },
        required: ['date', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clearDay',
      description: 'Clear all content from a specific date.',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'markDay',
      description: 'Mark a date with a special note (e.g. "No School", "Professional Development", "Field Trip", "Holiday"). This blocks that date from being scheduled and adds a visible label. Use whenever the teacher mentions a day off, closure, or special event. Always use the exact reason the teacher provides — do NOT default to "Snow Day" unless the teacher explicitly says snow day.',
      parameters: {
        type: 'object',
        properties: {
          date:  { type: 'string', description: 'YYYY-MM-DD — the date to mark' },
          label: { type: 'string', description: 'The exact reason the teacher gave for the day being unavailable (e.g. "No School", "Professional Development Day", "Field Trip", "Holiday"). Use the teacher\'s exact words. Only use "Snow Day" if the teacher explicitly mentioned snow or a snow day.' },
          clearContent: { type: 'boolean', description: 'If true, also clear any lesson/hw/assessment content on this date' },
        },
        required: ['date', 'label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addEvent',
      description: 'Add an event, meeting, appointment, or reminder to the teacher\'s personal schedule.',
      parameters: {
        type: 'object',
        properties: {
          title:       { type: 'string',  description: 'Event title, e.g. "Teacher Meeting"' },
          date:        { type: 'string',  description: 'YYYY-MM-DD' },
          startTime:   { type: 'string',  description: 'HH:MM in 24-hour format, e.g. "14:00"' },
          endTime:     { type: 'string',  description: 'HH:MM in 24-hour format, e.g. "15:00"' },
          allDay:      { type: 'boolean', description: 'True for all-day events with no specific time' },
          location:    { type: 'string',  description: 'Optional location' },
          description: { type: 'string',  description: 'Optional notes' },
          color:       { type: 'string',  enum: ['blue', 'sage', 'amber', 'purple', 'red'], description: 'Event color' },
          schoolWide:  { type: 'boolean', description: 'True if this is a school-wide event' },
          repeatRule:  { type: 'string',  enum: ['none', 'daily', 'weekly', 'monthly'], description: 'Recurrence rule — use weekly for events that repeat every week, daily for daily, monthly for monthly. Defaults to none.' },
        },
        required: ['title', 'date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteEvent',
      description: 'Delete/remove an existing event from the teacher\'s schedule by its ID. Use when the teacher says to remove, cancel, or delete an event.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'The ID of the event to delete' },
          title:   { type: 'string', description: 'Title of the event (for confirmation message)' },
        },
        required: ['eventId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moveEvent',
      description: 'Move an existing event to a different date and/or time. Use when the teacher says to reschedule, move, or change the time of an event.',
      parameters: {
        type: 'object',
        properties: {
          eventId:   { type: 'string', description: 'The ID of the event to move' },
          title:     { type: 'string', description: 'Title of the event (for confirmation)' },
          newDate:   { type: 'string', description: 'New date YYYY-MM-DD (omit to keep same date)' },
          newStartTime: { type: 'string', description: 'New start time HH:MM 24h (omit to keep same)' },
          newEndTime:   { type: 'string', description: 'New end time HH:MM 24h (omit to keep same)' },
        },
        required: ['eventId'],
      },
    },
  },
]

// ── Vector search helper ──────────────────────────────────
async function searchDocuments(courseId: string, query: string, limit = 6, types?: string[]): Promise<string[]> {
  try {
    const embRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query })
    const vec = `[${embRes.data[0].embedding.join(',')}]`
    const typeFilter = types && types.length > 0 ? `AND type = ANY($4::text[])` : ''
    const params: any[] = [courseId, vec, limit]
    if (types && types.length > 0) params.push(types)
    const result = await db.query(
       `SELECT chunk_text FROM documents
       WHERE course_id=$1 AND embedding IS NOT NULL
       ${typeFilter}
       ORDER BY embedding <=> $2::vector LIMIT $3`,
      params
    )
    return result.rows.map((r: any) => r.chunk_text)
  } catch { return [] }
}// ── Build diff objects from a tool call ───────────────────
function buildDiff(tool: string, args: any, existingData: Record<string, any>): any[] {
  const diffs: any[] = []
  if (tool === 'createLesson') {
    const existing = existingData[args.date] || {}
    for (const field of ['lessonPlan', 'milestones', 'assessments', 'hw', 'deadlines']) {
      if (args[field] !== undefined && args[field] !== existing[field]) {
        diffs.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${field}`,
          tool: 'createLesson',
          date: args.date,
          field,
          before: existing[field] || '',
          after: args[field],
          status: 'pending',
          allArgs: args,
        })
      }
    }
  } else if (tool === 'insertAssessment') {
    const existing = existingData[args.date] || {}
    diffs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-assessment`,
      tool: 'insertAssessment',
      date: args.date,
      field: 'assessments',
      before: existing.assessments || '',
      after: `${args.title}${args.type ? ` (${args.type})` : ''}`,
      status: 'pending',
      allArgs: args,
    })
  } else if (tool === 'moveLesson') {
    // A move produces TWO visible changes:
    // 1. Clear the source date fields
    // 2. Set the destination date with the moved content
    // We represent both as separate diffs so the teacher sees exactly what happens.
    const fieldsToMove: string[] = args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']
    const srcData = existingData[args.fromDate] || {}

    // Build a summary of what content is moving
    const movingSummary = [
      srcData.lessonPlan, srcData.assessments, srcData.milestones,
    ].filter(Boolean).join(' | ') || `Content from ${args.fromDate}`

    // Change 1: show source being cleared
    diffs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-move-src`,
      tool: 'moveLesson',
      date: args.fromDate,
      field: 'lessonPlan',
      before: movingSummary,
      after: '',
      status: 'pending',
      allArgs: args,
      moveRole: 'source',
    })

    // Change 2: show destination receiving content
    const destData = existingData[args.toDate] || {}
    diffs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-move-dst`,
      tool: 'moveLesson',
      date: args.toDate,
      field: 'lessonPlan',
      before: destData.lessonPlan || '',
      after: movingSummary,
      status: 'pending',
      allArgs: args,
      moveRole: 'destination',
    })
  } else if (tool === 'deleteLesson') {
    const srcData = existingData[args.date] || {}
    const summary = [srcData.lessonPlan, srcData.assessments].filter(Boolean).join(' | ') || '(content)'
    diffs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-delete`,
      tool: 'deleteLesson',
      date: args.date,
      field: 'lessonPlan',
      before: summary,
      after: '(deleted)',
      status: 'pending',
      allArgs: args,
    })
  } else if (tool === 'clearDay') {
    diffs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-clear`,
      tool: 'clearDay',
      date: args.date,
      field: 'lessonPlan',
      before: existingData[args.date]?.lessonPlan || '(has content)',
      after: '(cleared)',
      status: 'pending',
      allArgs: args,
    })
  } else if (tool === 'markDay') {
    const existing = existingData[args.date] || {}
    diffs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-mark`,
      tool: 'markDay',
      date: args.date,
      field: 'notes',
      before: existing.notes || '',
      after: args.label,
      status: 'pending',
      allArgs: args,
    })
  }
  return diffs
}

// ── Sanitize conversation history ─────────────────────────
// Strips assistant tool_calls turns that have no matching tool responses.
function sanitizeHistory(history: any[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const safe: OpenAI.Chat.ChatCompletionMessageParam[] = []
  for (let i = 0; i < history.length; i++) {
    const msg = history[i]
    if (msg.role === 'assistant' && msg.tool_calls?.length > 0) {
      const expectedIds = new Set(msg.tool_calls.map((tc: any) => tc.id))
      let j = i + 1
      while (j < history.length && history[j].role === 'tool') {
        expectedIds.delete(history[j].tool_call_id); j++
      }
      if (expectedIds.size > 0) {
        if (msg.content) safe.push({ role: 'assistant', content: msg.content })
        i = j - 1
      } else {
        safe.push(msg)
        while (i + 1 < history.length && history[i + 1].role === 'tool') { i++; safe.push(history[i]) }
      }
    } else if (msg.role !== 'tool') {
      safe.push(msg)
    }
  }
  return safe
}

// ── Build updated history to return to client ─────────────
function buildUpdatedHistory(previous: any[], userMessage: string, assistantMessage: OpenAI.Chat.ChatCompletionMessage): any[] {
  const hist = [...previous, { role: 'user', content: userMessage }]
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    hist.push({ role: 'assistant', content: assistantMessage.content || null, tool_calls: assistantMessage.tool_calls })
    for (const tc of assistantMessage.tool_calls) {
      hist.push({ role: 'tool', tool_call_id: tc.id, content: 'Changes proposed to teacher for review.' })
    }
  } else {
    hist.push({ role: 'assistant', content: assistantMessage.content || '' })
  }
  return hist
}

// ── Apply a list of changes directly to the lessons table ─
// Shared between /apply-changes and /generate-calendar so
// generate-calendar can write to DB without a second round-trip.
async function applyChangesToDb(courseId: string, changes: any[]): Promise<{ applied: number; errors: string[] }> {
  let applied = 0
  const errors: string[] = []

  for (const change of changes) {
    try {
      const { tool, allArgs, field, after, date } = change

      if (tool === 'createLesson') {
        const args = allArgs || { date, [field]: after }
        await db.query(
          `INSERT INTO lessons(course_id, date, lesson_plan, deadlines, milestones, assessments, hw)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT(course_id, date) DO UPDATE SET
             lesson_plan  = CASE WHEN $3 != '' THEN $3 ELSE lessons.lesson_plan END,
             deadlines    = CASE WHEN $4 != '' THEN $4 ELSE lessons.deadlines END,
             milestones   = CASE WHEN $5 != '' THEN $5 ELSE lessons.milestones END,
             assessments  = CASE WHEN $6 != '' THEN $6 ELSE lessons.assessments END,
             hw           = CASE WHEN $7 != '' THEN $7 ELSE lessons.hw END,
             updated_at   = NOW()`,
          [courseId, args.date, args.lessonPlan||'', args.deadlines||'', args.milestones||'', args.assessments||'', args.hw||'']
        )
        applied++
      } else if (tool === 'insertAssessment') {
        const args = allArgs || {}
        const txt = `${args.title}${args.type ? ` (${args.type})` : ''}`
        await db.query(
          `INSERT INTO lessons(course_id, date, assessments) VALUES($1,$2,$3)
           ON CONFLICT(course_id, date) DO UPDATE SET
             assessments = CASE WHEN lessons.assessments='' THEN $3 ELSE lessons.assessments||', '||$3 END,
             updated_at  = NOW()`,
          [courseId, args.date, txt]
        )
        applied++
      } else if (tool === 'moveLesson') {
        // Only execute the actual DB move when processing the SOURCE diff.
        // The destination diff is purely for UI display — the DB op already covers both sides.
        if (change.moveRole === 'destination') { applied++; continue }

        const args = allArgs || {}
        const fieldMap: Record<string,string> = { lessonPlan:'lesson_plan', assessments:'assessments', hw:'hw', deadlines:'deadlines', milestones:'milestones' }
        const fields = args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']
        // Use embedded sourceContent from pending diff if available (avoids a DB re-query
        // that could return empty if data was never written / already cleared)
        let srcData: Record<string,string>
        if (args.sourceContent) {
          // Map camelCase sourceContent keys to DB column names
          srcData = {
            lesson_plan: args.sourceContent.lessonPlan  || '',
            deadlines:   args.sourceContent.deadlines   || '',
            milestones:  args.sourceContent.milestones  || '',
            assessments: args.sourceContent.assessments || '',
            hw:          args.sourceContent.hw          || '',
          }
        } else {
          const src = await db.query(`SELECT lesson_plan,deadlines,milestones,assessments,hw FROM lessons WHERE course_id=$1 AND date=$2`, [courseId, args.fromDate])
          srcData = src.rows[0] || {}
        }
        const destValues: Record<string,string> = {}
        for (const f of fields) { const col = fieldMap[f]; if (col && srcData[col]) destValues[col] = srcData[col] }
        if (Object.keys(destValues).length > 0) {
          await db.query(
            `INSERT INTO lessons(course_id,date,lesson_plan,deadlines,milestones,assessments,hw) VALUES($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT(course_id,date) DO UPDATE SET
               lesson_plan=CASE WHEN $3!='' THEN $3 ELSE lessons.lesson_plan END,
               deadlines=CASE WHEN $4!='' THEN $4 ELSE lessons.deadlines END,
               milestones=CASE WHEN $5!='' THEN $5 ELSE lessons.milestones END,
               assessments=CASE WHEN $6!='' THEN $6 ELSE lessons.assessments END,
               hw=CASE WHEN $7!='' THEN $7 ELSE lessons.hw END,updated_at=NOW()`,
            [courseId,args.toDate,destValues.lesson_plan||'',destValues.deadlines||'',destValues.milestones||'',destValues.assessments||'',destValues.hw||'']
          )
        }
        // Clear the source
        const clearCols = fields.map((f: string) => fieldMap[f]).filter(Boolean)
        if (clearCols.length > 0) {
          const setClauses = clearCols.map((col: string) => `${col}=''`).join(',')
          await db.query(`UPDATE lessons SET ${setClauses},updated_at=NOW() WHERE course_id=$1 AND date=$2`, [courseId, args.fromDate])
        }
        applied++
      } else if (tool === 'deleteLesson') {
        const args = allArgs || {}
        const fieldMap: Record<string,string> = { lessonPlan:'lesson_plan', assessments:'assessments', hw:'hw', deadlines:'deadlines', milestones:'milestones' }
        const fields: string[] = args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']
        const cols = fields.map((f: string) => fieldMap[f]).filter(Boolean)
        if (cols.length > 0) {
          const setClauses = cols.map((col: string) => `${col}=''`).join(',')
          await db.query(`UPDATE lessons SET ${setClauses},updated_at=NOW() WHERE course_id=$1 AND date=$2`, [courseId, args.date])
        }
        applied++
      } else if (tool === 'clearDay') {
        const args = allArgs || {}
        await db.query(`UPDATE lessons SET lesson_plan='',deadlines='',milestones='',assessments='',hw='',updated_at=NOW() WHERE course_id=$1 AND date=$2`, [courseId, args.date])
        applied++
      } else if (tool === 'markDay') {
        const args = allArgs || {}
        // Write the label into the notes field and optionally clear lesson content
        await db.query(
          `INSERT INTO lessons(course_id, date, notes, lesson_plan, deadlines, milestones, assessments, hw)
           VALUES($1,$2,$3,'','','','','')
           ON CONFLICT(course_id, date) DO UPDATE SET
             notes = $3,
             lesson_plan  = CASE WHEN $4 THEN '' ELSE lessons.lesson_plan END,
             deadlines    = CASE WHEN $4 THEN '' ELSE lessons.deadlines END,
             milestones   = CASE WHEN $4 THEN '' ELSE lessons.milestones END,
             assessments  = CASE WHEN $4 THEN '' ELSE lessons.assessments END,
             hw           = CASE WHEN $4 THEN '' ELSE lessons.hw END,
             updated_at   = NOW()`,
          [courseId, args.date, args.label, args.clearContent === true]
        )
        applied++
      }
    } catch (err: any) {
      console.error(`Apply change error for ${change.tool} on ${change.date}:`, err.message)
      errors.push(change.id || change.date)
    }
  }
  return { applied, errors }
}

// ── POST /api/ai/chat ─────────────────────────────────────
router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const { message, courseId, calendarContext, selectedDate, conversationHistory, eventsContext, attachedDocTypes } = req.body
    if (!message) return res.status(400).json({ message: 'Message is required.' })

    // scheduleMode: no courseId, or the literal string "schedule" sent by the schedule page sidebar
    const isScheduleMode = !courseId || courseId === 'schedule'

    let course = { name: 'My Schedule', period: '' }
    let ragContext = ''

    if (!isScheduleMode) {
      // Validate that courseId looks like a UUID before querying
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidPattern.test(courseId)) {
        return res.status(400).json({ message: 'Invalid courseId.' })
      }
      const courseRes = await db.query('SELECT id,name,period FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
      if (courseRes.rows.length === 0) return res.status(404).json({ message: 'Course not found.' })
      course = courseRes.rows[0]

      // Only run RAG when the user explicitly attached documents to this message
      if (Array.isArray(attachedDocTypes) && attachedDocTypes.length > 0) {
        const ragChunks = await searchDocuments(courseId, message, 6, attachedDocTypes)
        ragContext = ragChunks.length > 0 ? `\n\n--- RELEVANT COURSE DOCUMENTS ---\n${ragChunks.join('\n\n---\n')}\n--- END DOCUMENTS ---` : ''
      }
    }

    // For schedule mode: fetch the user's upcoming events from DB so AI knows their IDs
    let eventsContextStr = ''
    if (isScheduleMode) {
      try {
        const upcoming = await db.query(
          `SELECT id, title, TO_CHAR(date,'YYYY-MM-DD') AS date,
            TO_CHAR(start_time,'HH24:MI') AS start_time,
            TO_CHAR(end_time,'HH24:MI') AS end_time,
            all_day, location
           FROM events WHERE user_id=$1 AND date >= CURRENT_DATE - INTERVAL '7 days'
           ORDER BY date, start_time LIMIT 50`,
          [req.userId]
        )
        if (upcoming.rows.length > 0) {
          eventsContextStr = '\n\n--- YOUR UPCOMING EVENTS (with IDs for delete/move) ---\n' +
            upcoming.rows.map((e: any) =>
              `[ID:${e.id}] ${e.date} ${e.all_day ? '(all day)' : `${e.start_time || ''}–${e.end_time || ''}`}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`
            ).join('\n') + '\n--- END EVENTS ---'
        }
      } catch {}
    }

    // Build a set of closed-day dates from calendarContext so we can enforce them server-side too
    const closedDays = new Set<string>(
      calendarContext
        ? Object.entries(calendarContext)
            .filter(([, d]: [string, any]) => d.notes && d.notes.trim())
            .map(([date]) => date)
        : []
    )

    const calContextStr = calendarContext && Object.keys(calendarContext).length > 0
      ? `\n\n--- CURRENT CALENDAR STATE ---\n${
          Object.entries(calendarContext)
            .sort(([a],[b]) => a.localeCompare(b))
            .map(([date, data]: [string, any]) =>
              `${date}${data.priority ? ` [Priority:${data.priority}]` : ''}${data.notes ? ` [CLOSED: ${data.notes}]` : ''}: ${[
                data.notes && `🚫 CLOSED — ${data.notes}`,
                data.lessonPlan && `Lesson: ${data.lessonPlan.slice(0,80)}`,
                data.assessments && `Assessment: ${data.assessments}`,
                data.milestones && `Milestone: ${data.milestones}`,
                data.hw && `HW: ${data.hw}`,
                data.deadlines && `Deadline: ${data.deadlines}`,
              ].filter(Boolean).join(' | ')}`
            ).join('\n')
        }\n--- END CALENDAR ---\n\n🚫 CLOSED DAYS (absolutely no scheduling allowed):\n${
          closedDays.size > 0
            ? [...closedDays].sort().map(d => `  • ${d}: ${(calendarContext as any)[d]?.notes}`).join('\n')
            : '  (none)'
        }\n\nCRITICAL: Never call createLesson, insertAssessment, or moveLesson with a toDate that is in the CLOSED DAYS list above. If asked to reschedule TO a closed day, find the next available open school day instead.`
      : ''

    // Use a timezone-safe date: get the actual wall-clock date in US Eastern
    // to avoid the UTC+1day shift that happens after 7pm EST / 8pm EDT
    // Build today string using Intl.DateTimeFormat directly with explicit timezone
    // to avoid any UTC-offset issues on servers running in non-EST zones.
    const fmt = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts }).format(new Date())
    const nowEST    = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2') // MM/DD/YYYY → YYYY-MM-DD
    const dayOfWeek = fmt({ weekday: 'long' })
    const todayStr  = `${dayOfWeek}, ${fmt({ month: 'long', day: 'numeric', year: 'numeric' })}`

    const systemPrompt = isScheduleMode
      ? `You are a helpful AI assistant for a teacher's personal schedule and calendar.
Today: ${todayStr} (${nowEST})
${selectedDate ? `Selected date: ${selectedDate}` : ''}${eventsContextStr}${calContextStr}

CRITICAL — ACTION FIRST:
- ALWAYS call the appropriate tool immediately. Do NOT describe what you are about to do — just do it.
- Only respond in text AFTER the tool call to confirm what was done.

Your job:
- addEvent: create a new event — call this IMMEDIATELY whenever the teacher wants to add something
- deleteEvent: permanently remove an event — use the [ID:...] from the events list above
- moveEvent: reschedule an event — use the [ID:...] from the events list above
- After calling a tool, confirm in one sentence: "Added X on Y at Z" / "Deleted X" / "Moved X to Y"
- Be concise and action-oriented`
      : `You are an expert AI assistant for a teacher's course planning calendar.
Course: "${course.name}" (${course.period})
Today: ${todayStr} (${nowEST})
${selectedDate ? `Selected date: ${selectedDate}` : ''}${ragContext}${calContextStr}

CRITICAL — ACT IMMEDIATELY:
- When the teacher asks you to add, create, update, move, delete, or change ANYTHING on the calendar — call the tool RIGHT AWAY.
- Do NOT write text saying "I'll add..." or "I'll schedule..." or "Here's the lesson plan:" — call the tool and let the calendar show the change.
- Do NOT include the lesson content in your text response — put it in the tool call only.
- Only write a brief confirmation AFTER calling the tool (e.g. "Added the quiz to March 20." or "Moved the test to Wednesday.").
- If the teacher's request is ambiguous about the date, use your best judgment and act — do not ask for clarification unless truly impossible to infer.
- Saturday (day 6) and Sunday (day 0) are NEVER valid lesson dates — never call createLesson, insertAssessment, or moveLesson for a weekend date.

TOOLS AVAILABLE:
- createLesson: add or update content on a date — use for any "add", "create", "update", "make more detailed", "change the lesson" request
- insertAssessment: schedule a quiz/test/exam on a date
- moveLesson: move content FROM one date TO another
- deleteLesson: remove content from a date entirely
- markDay: mark a date with a label (No School, etc.)
- clearDay: wipe everything from a date

RULES FOR MOVES AND DELETIONS:
- When asked to move something, ALWAYS use moveLesson
- NEVER reschedule TO a closed/blocked day
- Space out assessments — do not put a test on a date that already has one
- Never schedule assessments on Mondays unless explicitly asked

SCHOOL CLOSURES AND DAYS OFF:
- When a teacher mentions any day off: call markDay with clearContent=true, then moveLesson for displaced content
- Use the EXACT reason the teacher gave (not "Snow Day" unless they said snow day)
- NEVER move content to another closed/blocked day

PRIORITY TIERS:
- Tier 1: Finals, state exams — NEVER move without explicit request
- Tier 2: Unit tests, essays — move only when necessary
- Tier 3: Quizzes, chapter reviews — reschedulable with good reason
- Tier 4: Regular lessons — freely reschedulable
- Tier 5: Homework, warm-ups — lowest priority`

    const safeHistory = sanitizeHistory(Array.isArray(conversationHistory) ? conversationHistory : [])
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: message },
    ]

    // Detect if the message is action-oriented (add/update/move/delete/schedule/make/create)
    // vs purely conversational/analytical. For action requests: force tool use ('required').
    // For questions/analysis: allow text-only ('auto').
    const actionKeywords = /\b(add|create|make|schedule|insert|update|change|edit|modify|move|reschedule|delete|remove|clear|mark|set|put|write|fill|generate|redo|undo|replace|swap|fix|improve|expand|shorten|detail|revise|push|shift|bump)\b/i
    const isActionRequest = actionKeywords.test(message)
    const chosenToolChoice: OpenAI.Chat.ChatCompletionToolChoiceOption = isActionRequest ? 'required' : 'auto'

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', messages, tools: AI_TOOLS, tool_choice: chosenToolChoice, max_tokens: 1500,
    })

    const responseMessage = completion.choices[0].message
    const content = responseMessage.content || ''

    const allDiffs: any[] = []
    const createdEvents: any[] = []
    const deletedEvents: any[] = []
    const movedEvents: any[] = []

    if (responseMessage.tool_calls) {
      for (const call of responseMessage.tool_calls) {
        try {
          const args = JSON.parse(call.function.arguments)
          if (call.function.name === 'addEvent') {
            // Schedule mode: create the event directly in the DB
            const {
              title, date, startTime, endTime,
              allDay = false, schoolWide = false,
              location = '', description = '', color = 'blue', repeatRule = 'none',
            } = args
            if (title && date) {
              try {
                const result = await db.query(
                  `INSERT INTO events(user_id, title, date, start_time, end_time, all_day, school_wide, repeat_rule, location, description, color)
                   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                   RETURNING id, title, TO_CHAR(date,'YYYY-MM-DD') AS date,
                     TO_CHAR(start_time,'HH24:MI') AS "startTime",
                     TO_CHAR(end_time,'HH24:MI') AS "endTime",
                     all_day AS "allDay", school_wide AS "schoolWide",
                     repeat_rule AS "repeatRule",
                     location, description, color`,
                  [req.userId, title, date,
                   allDay ? null : startTime || null,
                   allDay ? null : endTime || null,
                   allDay, schoolWide, repeatRule || 'none', location, description, color]
                )
                createdEvents.push(result.rows[0])
              } catch (dbErr: any) {
                console.error('addEvent DB error:', dbErr.message)
              }
            }
          } else if (call.function.name === 'deleteEvent') {
            const { eventId, title } = args
            if (eventId) {
              try {
                const result = await db.query(
                  `DELETE FROM events WHERE id=$1 AND user_id=$2 RETURNING id, title`,
                  [eventId, req.userId]
                )
                if (result.rows.length > 0) {
                  deletedEvents.push({ id: eventId, title: result.rows[0].title || title || 'Event' })
                }
              } catch (dbErr: any) {
                console.error('deleteEvent DB error:', dbErr.message)
              }
            }
          } else if (call.function.name === 'moveEvent') {
            const { eventId, title, newDate, newStartTime, newEndTime } = args
            if (eventId) {
              try {
                // Build dynamic SET clause for only the fields being changed
                const setClauses: string[] = ['updated_at = NOW()']
                const params: any[] = [eventId, req.userId]
                if (newDate)      { params.push(newDate);      setClauses.push(`date = $${params.length}`) }
                if (newStartTime) { params.push(newStartTime); setClauses.push(`start_time = $${params.length}`) }
                if (newEndTime)   { params.push(newEndTime);   setClauses.push(`end_time = $${params.length}`) }

                if (setClauses.length > 1) {
                  const result = await db.query(
                    `UPDATE events SET ${setClauses.join(', ')}
                     WHERE id=$1 AND user_id=$2
                     RETURNING id, title, TO_CHAR(date,'YYYY-MM-DD') AS date,
                       TO_CHAR(start_time,'HH24:MI') AS "startTime",
                       TO_CHAR(end_time,'HH24:MI') AS "endTime",
                       all_day AS "allDay", school_wide AS "schoolWide",
                       location, description, color`,
                    params
                  )
                  if (result.rows.length > 0) {
                    movedEvents.push(result.rows[0])
                  }
                }
              } catch (dbErr: any) {
                console.error('moveEvent DB error:', dbErr.message)
              }
            }
          } else if (call.function.name === 'markDay') {
            // Propose as a PENDING suggestion — user accepts/declines on the calendar
            // Always clear lesson content when marking a day as closed
            const markArgs = { ...args, clearContent: true }
            const existingNotes = (calendarContext as any)?.[args.date]?.notes || ''
            allDiffs.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}-mark`,
              tool: 'markDay', date: args.date, field: 'notes',
              before: existingNotes, after: args.label, status: 'pending', allArgs: markArgs,
            })
          } else if (call.function.name === 'moveLesson') {
            // Block move if destination is a closed day
            if (closedDays.has(args.toDate)) {
              const reason = (calendarContext as any)?.[args.toDate]?.notes || 'closed day'
              console.warn(`[AI] Blocked moveLesson to closed day ${args.toDate} (${reason})`)
              continue
            }
            // Block move if destination is a weekend
            const isWeekendDst = (ds: string) => { const d = new Date(ds + 'T12:00:00Z').getUTCDay(); return d === 0 || d === 6 }
            if (isWeekendDst(args.toDate)) {
              console.warn(`[AI] Blocked moveLesson to weekend ${args.toDate}`)
              continue
            }
            // Propose as PENDING suggestions — fetch current content from calendarContext
            // (no DB writes here; user accepts/declines on the calendar)
            const ctxSrc = (calendarContext as any)?.[args.fromDate] || {}
            const movingSummary = [
              ctxSrc.lessonPlan, ctxSrc.assessments, ctxSrc.milestones,
            ].filter(Boolean).join(' | ') || `Content from ${args.fromDate}`
            const closureLabel = args.closureReason || ''
            const ts = Date.now()
            // Embed actual field values so applyChangesToDb can use them without re-querying DB
            const sourceContent = {
              lessonPlan:  ctxSrc.lessonPlan  || '',
              deadlines:   ctxSrc.deadlines   || '',
              milestones:  ctxSrc.milestones  || '',
              assessments: ctxSrc.assessments || '',
              hw:          ctxSrc.hw          || '',
            }
            const enrichedArgs = { ...args, sourceContent }
            allDiffs.push(
              { id: `${ts}-move-src`,   tool: 'moveLesson', date: args.fromDate, field: 'lessonPlan', before: movingSummary, after: '',            status: 'pending', allArgs: enrichedArgs, moveRole: 'source' },
              { id: `${ts+1}-move-dst`, tool: 'moveLesson', date: args.toDate,   field: 'lessonPlan', before: '',            after: movingSummary, status: 'pending', allArgs: enrichedArgs, moveRole: 'destination' }
            )
            // If moving due to a closure, also propose a markDay on the source as pending
            if (closureLabel) {
              allDiffs.push({
                id: `${ts+2}-mark-src`,
                tool: 'markDay', date: args.fromDate, field: 'notes',
                before: ctxSrc.notes || '', after: closureLabel, status: 'pending',
                allArgs: { date: args.fromDate, label: closureLabel, clearContent: true },
              })
            }
          } else {
            // ── Closed-day guard for lesson tools ────────────
            // Block createLesson and insertAssessment if they target a closed day
            if (
              (call.function.name === 'createLesson' || call.function.name === 'insertAssessment') &&
              closedDays.has(args.date)
            ) {
              const reason = (calendarContext as any)?.[args.date]?.notes || 'closed day'
              console.warn(`[AI] Blocked ${call.function.name} on closed day ${args.date} (${reason})`)
              // Don't add a diff — skip silently so the AI's text response still shows
              continue
            }
            // ── Weekend guard ─────────────────────────────────
            const isWeekend = (ds: string) => { const d = new Date(ds + 'T12:00:00Z').getUTCDay(); return d === 0 || d === 6 }
            if (
              (call.function.name === 'createLesson' || call.function.name === 'insertAssessment') &&
              isWeekend(args.date)
            ) {
              console.warn(`[AI] Blocked ${call.function.name} on weekend ${args.date}`)
              continue
            }
            allDiffs.push(...buildDiff(call.function.name, args, calendarContext || {}))
          }
        } catch {}
      }
    }

    res.json({
      content,
      changes: allDiffs,
      createdEvents,
      deletedEvents,
      movedEvents,
      updatedHistory: buildUpdatedHistory(
        Array.isArray(conversationHistory) ? conversationHistory : [],
        message,
        responseMessage
      ),
    })
  } catch (err: any) {
    console.error('AI chat error:', err)
    res.status(500).json({ message: err.message || 'AI service error.' })
  }
})

// ── POST /api/ai/apply-changes ────────────────────────────
router.post('/apply-changes', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, changes } = req.body
    if (!courseId || !Array.isArray(changes)) return res.status(400).json({ message: 'courseId and changes array required.' })

    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })

    const accepted = changes.filter((c: any) => c.status === 'accepted')
    const { applied, errors } = await applyChangesToDb(courseId, accepted)

    try {
      await db.query(
        `INSERT INTO ai_change_logs(course_id,user_id,prompt,changes,status) VALUES($1,$2,$3,$4,$5)`,
        [courseId, req.userId, 'apply-changes', JSON.stringify(accepted), errors.length === 0 ? 'accepted' : 'partial']
      )
    } catch {}

    res.json({ message: `Applied ${applied} change(s).${errors.length > 0 ? ` ${errors.length} failed.` : ''}`, applied, errors })
  } catch (err: any) {
    console.error('Apply changes error:', err)
    res.status(500).json({ message: err.message || 'Failed to apply changes.' })
  }
})

// ── Helpers for generate-calendar ────────────────────────

function getSchoolDays(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T12:00:00Z')
  const endDate = new Date(end + 'T12:00:00Z')
  while (cur <= endDate) {
    const dow = cur.getUTCDay()
    if (dow >= 1 && dow <= 5) days.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return days
}

function groupByMonth(dates: string[]): Array<{ label: string; dates: string[] }> {
  const map = new Map<string, string[]>()
  for (const d of dates) {
    const key = d.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(d)
  }
  return Array.from(map.entries()).map(([key, ds]) => ({
    label: new Date(key + '-15T12:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    dates: ds,
  }))
}

// Ask the AI to extract holiday/no-school dates from the context text.
// Returns a Set of YYYY-MM-DD strings to exclude from school days.
async function extractHolidaysFromContext(
  openaiClient: OpenAI,
  contextText: string,
  startDate: string,
  endDate: string
): Promise<Set<string>> {
  const excluded = new Set<string>()
  if (!contextText.trim()) return excluded
  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a date parser. Extract all school holidays, breaks, no-school days, and closures from the provided text.
Return ONLY a JSON array of YYYY-MM-DD date strings. For multi-day ranges, list every individual date.
Only include dates between ${startDate} and ${endDate}.
If no dates are found, return [].
Respond with ONLY the JSON array, no explanation, no markdown.`,
        },
        { role: 'user', content: contextText.slice(0, 6000) },
      ],
    })
    const raw = (completion.choices[0].message.content || '').trim()
    const clean = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const dates = JSON.parse(clean)
    if (Array.isArray(dates)) {
      for (const d of dates) {
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) excluded.add(d)
      }
    }
    console.log(`Extracted ${excluded.size} holiday/break dates from context`)
  } catch (e: any) {
    console.warn('Holiday extraction failed (non-fatal):', e.message)
  }
  return excluded
}

// Extract the last day of school from the school calendar text.
// Returns a YYYY-MM-DD string, or null if not found.
async function extractLastDayOfSchool(
  openaiClient: OpenAI,
  contextText: string,
  startDate: string,
  endDate: string
): Promise<string | null> {
  if (!contextText.trim()) return null
  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 100,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a date parser. Find the last day of school (last instructional day, last day of classes, last student day, end of school year) from the provided text.
Return ONLY a single YYYY-MM-DD date string. Only include dates between ${startDate} and ${endDate}.
If not found, return null.
Respond with ONLY the date string or the word null.`,
        },
        { role: 'user', content: contextText.slice(0, 6000) },
      ],
    })
    const raw = (completion.choices[0].message.content || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      console.log(`[generate-calendar] Last day of school extracted: ${raw}`)
      return raw
    }
    return null
  } catch (e: any) {
    console.warn('Last day extraction failed (non-fatal):', e.message)
    return null
  }
}

// Extract single-session / early-dismissal / modified-schedule days from the school calendar.
// These are INSTRUCTIONAL days with a different schedule — NOT holidays or no-school days.
// Returns array of { date, label } objects.
async function extractSingleSessionDays(
  openaiClient: OpenAI,
  contextText: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; label: string }>> {
  if (!contextText.trim()) return []
  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 600,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a school calendar parser. Find all single-session days, early dismissal days, half days, and modified-schedule days from the provided text.
IMPORTANT: These are days where school IS in session but with a shortened or modified schedule — NOT holidays or no-school days.
Return ONLY a JSON array of objects with shape { "date": "YYYY-MM-DD", "label": "Single Session" | "Early Dismissal" | "Half Day" | exact label from text }.
Only include dates between ${startDate} and ${endDate}.
If none found, return [].
Respond with ONLY the JSON array, no explanation, no markdown.`,
        },
        { role: 'user', content: contextText.slice(0, 6000) },
      ],
    })
    const raw = (completion.choices[0].message.content || '').trim()
    const clean = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((e: any) =>
        e && typeof e.date === 'string' && typeof e.label === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
      )
      console.log(`[generate-calendar] Extracted ${valid.length} single-session/early-dismissal days`)
      return valid
    }
    return []
  } catch (e: any) {
    console.warn('Single session day extraction failed (non-fatal):', e.message)
    return []
  }
}

// Ask the AI to extract key school events (conferences, spirit week, back to school night, etc.)
// from the school calendar section. Returns an array of { date, label } objects.
async function extractKeyDatesFromContext(
  openaiClient: OpenAI,
  contextText: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; label: string }>> {
  const keyDates: Array<{ date: string; label: string }> = []
  if (!contextText.trim()) return keyDates
  try {
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a school calendar parser. Extract all notable school events that happen ON school days from the provided text.
Examples: Back to School Night, Parent-Teacher Conferences, Spirit Week, Field Day, Picture Day, Open House, Report Card Day, Pep Rally, standardized testing days, marking period ends, etc.
Do NOT include holidays, breaks, or no-school days.
Return ONLY a JSON array of objects with shape { "date": "YYYY-MM-DD", "label": "Event Name" }.
Only include dates between ${startDate} and ${endDate}.
If the text mentions a range (e.g. "Spirit Week Oct 7-11"), list each individual school day.
If no events are found, return [].
Respond with ONLY the JSON array, no explanation, no markdown.`,
        },
        { role: 'user', content: contextText.slice(0, 6000) },
      ],
    })
    const raw = (completion.choices[0].message.content || '').trim()
    const clean = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (
          entry && typeof entry.date === 'string' && typeof entry.label === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
        ) {
          keyDates.push({ date: entry.date, label: entry.label })
        }
      }
    }
    console.log(`[generate-calendar] Extracted ${keyDates.length} key school event dates`)
  } catch (e: any) {
    console.warn('Key date extraction failed (non-fatal):', e.message)
  }
  return keyDates
}

// ── POST /api/ai/generate-calendar ───────────────────────
// Generates a lesson plan starting from today for maxDays school days.
// Batches into 10-day chunks to stay within token limits.
// Respects school calendar holidays extracted from context.
router.post('/generate-calendar', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, contextText, maxDays, startDate } = req.body
    if (!courseId) return res.status(400).json({ message: 'courseId required.' })
    if (!contextText?.trim()) return res.status(400).json({ message: 'No context provided. Please add a syllabus or description.' })

    const owner = await db.query('SELECT id,name,period FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })
    const course = owner.rows[0]

    // Determine start date:
    // - undefined / 'today' → today in US Eastern
    // - 'ai' → let AI pick (we'll pass hint to context; for now default to today, AI can override via keyDates)
    // - 'YYYY-MM-DD' → use that date directly
    const fmtEst = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts }).format(new Date())
    const todayEST = fmtEst({ year: 'numeric', month: '2-digit', day: '2-digit' })
      .replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2')

    // Resolve planStartDate
    let planStartDate = todayEST
    if (startDate && startDate !== 'today' && startDate !== 'ai' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      planStartDate = startDate
    }
    // For 'ai' mode, add a hint to the context so the AI can pick from keyDates
    const aiStartHint = startDate === 'ai'
      ? '\n\n[PLANNING HINT]\nDetermine the best start date for planning based on the school calendar and syllabus. Look for the first day of school, semester start, or the first instructional day after any breaks.'
      : ''

    // Honour the requested maxDays (default 22 = ~1 month, max 200)
    const cap = typeof maxDays === 'number' && maxDays > 0 ? Math.min(maxDays, 200) : 22

    // Build a date range wide enough to contain `cap` school days after removing holidays
    const endEstimate = new Date(planStartDate + 'T12:00:00Z')
    endEstimate.setUTCDate(endEstimate.getUTCDate() + Math.ceil(cap * 2) + 30)
    const rangeEnd = endEstimate.toISOString().slice(0, 10)

    // Pull stored documents via RAG
    const ragChunks = await searchDocuments(courseId, contextText.slice(0, 500), 8)
    const ragContext = ragChunks.length > 0
      ? '\n\n[STORED DOCUMENTS - additional context]\n' + ragChunks.join('\n---\n')
      : ''

    // Parse contextText to find the school calendar section specifically
    const schoolCalMatch = contextText.match(/\[SCHOOL CALENDAR\]([\s\S]*?)(?=\[|$)/i)
    const schoolCalText = schoolCalMatch ? schoolCalMatch[1].trim() : ''

    // Extract teacher instructions
    const teacherInstrMatch = contextText.match(/\[TEACHER INSTRUCTIONS\]([\s\S]*?)(?=\[|$)/i)
    const teacherInstructions = (teacherInstrMatch ? teacherInstrMatch[1].trim() : '') + aiStartHint

    // Extract requirements
    const requirementsMatchEarly = contextText.match(/\[REQUIREMENTS\]([\s\S]*?)(?=\[|$)/i)
    const requirementsText = requirementsMatchEarly ? requirementsMatchEarly[1].trim() : ''

    // Combine both into one string for quota/hw parsing
    const allRulesText = [teacherInstructions, requirementsText].filter(Boolean).join('\n')

    // Extract holidays ONLY from the school calendar section
    const [holidays, keyDates, lastDayOfSchool, singleSessionDays] = schoolCalText.trim()
      ? await Promise.all([
          extractHolidaysFromContext(openai, schoolCalText, planStartDate, rangeEnd),
          extractKeyDatesFromContext(openai, schoolCalText, planStartDate, rangeEnd),
          extractLastDayOfSchool(openai, schoolCalText, planStartDate, rangeEnd),
          extractSingleSessionDays(openai, schoolCalText, planStartDate, rangeEnd),
        ])
      : [new Set<string>(), [] as Array<{ date: string; label: string }>, null as string | null, [] as Array<{ date: string; label: string }>]

    // Hard cutoff: if we found a last day of school, never plan beyond it
    const hardEndDate = lastDayOfSchool && lastDayOfSchool < rangeEnd ? lastDayOfSchool : rangeEnd
    if (lastDayOfSchool) {
      console.log(`[generate-calendar] Hard end date (last day of school): ${hardEndDate}`)
    }

    // Build final school day list excluding holidays, capped at last day of school
    const allSchoolDays = getSchoolDays(planStartDate, hardEndDate).filter(d => !holidays.has(d))
    const cappedDays = allSchoolDays.slice(0, cap)

    console.log(`[generate-calendar] start=${planStartDate}, cap=${cap}, allSchoolDays=${allSchoolDays.length}, holidays=${holidays.size}, cappedDays=${cappedDays.length}, range=${planStartDate}→${rangeEnd}`)
    console.log(`[generate-calendar] First 10 cappedDays: ${cappedDays.slice(0,10).join(', ')}`)

    if (cappedDays.length === 0) {
      return res.status(400).json({ message: 'No school days found in the requested range.' })
    }

    // ── Write holidays to DB as labeled no-school days ──────────────
    // Holidays were extracted from the school calendar but previously only silently
    // excluded from the day list. Now we also create a lesson record with notes set
    // to a label so they visibly appear on the calendar as closed days.
    if (holidays.size > 0) {
      // Build a label map from the raw school calendar text — try to match each date
      // to the event name mentioned near it. Fall back to "No School" if not found.
      let holidayLabelMap: Map<string, string> = new Map()
      if (schoolCalText) {
        try {
          const labelCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 800,
            temperature: 0,
            messages: [
              {
                role: 'system',
                content: `You are a date parser. For each holiday/no-school date provided, return a short descriptive label (e.g. "Thanksgiving Break", "Winter Break", "MLK Day", "Spring Break", "No School").
Return ONLY a JSON object mapping YYYY-MM-DD to a label string. Use the exact event name from the text when possible.
Respond with ONLY the JSON object, no explanation, no markdown.`,
              },
              {
                role: 'user',
                content: `School calendar text:\n${schoolCalText.slice(0, 4000)}\n\nDates to label: ${[...holidays].sort().join(', ')}`,
              },
            ],
          })
          const raw = (labelCompletion.choices[0].message.content || '').trim()
          const clean = raw.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
          const parsed = JSON.parse(clean)
          if (parsed && typeof parsed === 'object') {
            for (const [date, label] of Object.entries(parsed)) {
              if (typeof label === 'string') holidayLabelMap.set(date, label)
            }
          }
        } catch (e: any) {
          console.warn('Holiday label extraction failed (non-fatal):', e.message)
        }
      }

      for (const hDate of holidays) {
        const label = holidayLabelMap.get(hDate) || 'No School'
        try {
          await db.query(
            `INSERT INTO lessons(course_id, date, notes, lesson_plan, deadlines, milestones, assessments, hw)
             VALUES($1,$2,$3,'','','','','')
             ON CONFLICT(course_id, date) DO UPDATE SET notes = $3, updated_at = NOW()`,
            [courseId, hDate, label]
          )
        } catch (e: any) {
          console.warn(`Failed to write holiday record for ${hDate}:`, e.message)
        }
      }
      console.log(`[generate-calendar] Wrote ${holidays.size} holiday records to DB`)
    }

    const months = groupByMonth(cappedDays)

    // Build context sections. Each section is extracted once and trimmed to a generous budget.
    // Requirements and teacher instructions are treated as mandatory rules — surfaced at top.
    const syllabusMatch   = contextText.match(/\[SYLLABUS\]([\s\S]*?)(?=\[|$)/i)
    const meetingMatch    = contextText.match(/\[MEETING SCHEDULE\]([\s\S]*?)(?=\[|$)/i)

    const syllabusText     = syllabusMatch  ? syllabusMatch[1].trim().slice(0, 2500)  : ''
    const meetingSchedText = meetingMatch   ? meetingMatch[1].trim().slice(0, 600)    : ''
    // requirementsText already extracted above (used for quota parsing too) — full text, no truncation beyond 1500
    const requireTextFull  = requirementsText.slice(0, 1500)

    // Fallback: if no tagged sections, just use the raw contextText trimmed
    const syllabusBlock = syllabusText || (!schoolCalText && !teacherInstructions && !requirementsText ? contextText.slice(0, 2500) : '')

    // Course context block — syllabus + meeting schedule only (requirements go to the rules block)
    const courseContextBlock = [
      syllabusBlock     ? `[SYLLABUS]\n${syllabusBlock}`             : '',
      meetingSchedText  ? `[MEETING SCHEDULE]\n${meetingSchedText}` : '',
    ].filter(Boolean).join('\n\n')

    // Mandatory rules block — both requirements AND teacher instructions combined at top of prompt
    const combinedRules = [requireTextFull, teacherInstructions].filter(Boolean).join('\n\n')
    const teacherRulesBlock = combinedRules
      ? `══════════════════════════════════════════════
MANDATORY RULES — HIGHEST PRIORITY — READ FIRST
Every rule below is non-negotiable. Follow each one exactly as written. Do not substitute, skip, or reinterpret.
${combinedRules}
══════════════════════════════════════════════`
      : ''

    // RAG chunks supplement (trimmed)
    const ragBlock = ragContext ? ragContext.slice(0, 800) : ''

    // Build key dates block — these are real dates the AI MUST reference
    const keyDatesBlock = keyDates.length > 0
      ? `\nSCHOOL CALENDAR KEY DATES (instructional days with notable events — you MUST reflect these in lessonPlan or milestones on these exact dates):\n` +
        keyDates.map(kd => `  • ${kd.date}: ${kd.label}`).join('\n')
      : ''

    // Single session / early dismissal days block
    const singleSessionBlock = singleSessionDays.length > 0
      ? `\nSINGLE SESSION / EARLY DISMISSAL DAYS (school IS in session, but shorter — plan accordingly, lighter content):\n` +
        singleSessionDays.map(s => `  • ${s.date}: ${s.label}`).join('\n')
      : ''

    const systemPrompt = `You are an expert curriculum planner. Create a detailed, specific lesson plan for every date you receive.
${
  teacherRulesBlock ? `\n${teacherRulesBlock}\n` : ''
}
Course: "${course.name}" (${course.period})
Total plan: ${cappedDays[0]} to ${cappedDays[cappedDays.length - 1]} (${cappedDays.length} instructional days)
${
  courseContextBlock ? `\nCOURSE CONTEXT:\n${courseContextBlock}` : ''
}${
  ragBlock ? `\n\n${ragBlock}` : ''
}${keyDatesBlock}${singleSessionBlock}

CRITICAL RULES — follow every one without exception:
1. Call createLesson for EVERY SINGLE date you are given. Zero exceptions. Do not skip any date.
2. lessonPlan: write a specific, concrete description of what is taught that day (not "continue unit" — name the actual topic)
3. milestones: mark the START of each new unit only (e.g. "Unit 2 begins: Polynomials") — blank on all other days; also note KEY SCHOOL EVENTS on the appropriate date
4. MANDATORY RULES (listed at the very top of this prompt) take absolute precedence over ALL other rules. They are not suggestions — follow each one exactly as written, character by character.
5. assessments: ONLY use the ASSESSMENT QUOTA STATUS numbers provided in the user message. Count every assessment you have placed. Do NOT add extras beyond the quota. Do NOT use defaults.
6. hw: ONLY use the HW FREQUENCY rule provided in the user message. Do NOT default to "every day" — use exactly what is specified.
7. Pace the entire syllabus evenly across all ${cappedDays.length} days — spread topics proportionally
8. All dates given to you are confirmed instructional days (holidays already removed).
9. Never place two assessments on consecutive days. Never place an assessment on a Monday.`

    let totalApplied = 0
    const allErrors: string[] = []

    // ── Parse combined rules for exact quotas ─────────────────────
    // allRulesText combines both [REQUIREMENTS] and [TEACHER INSTRUCTIONS] so counts
    // like "2 tests, 2 quizzes" entered in either field are picked up correctly.
    interface Quota { target: number; placed: number; label: string }
    const quotas: Record<string, Quota> = {}

    if (allRulesText) {
      const instr = allRulesText.toLowerCase()
      // Match patterns: "2 tests", "3 unit tests", "4 quizzes", "1 midterm", "2 exams", "1 project"
      const patterns: Array<{ regex: RegExp; key: string; label: string }> = [
        { regex: /(\d+)\s+(?:unit\s+)?tests?\b/,     key: 'tests',    label: 'tests' },
        { regex: /(\d+)\s+quizzes?\b/,                key: 'quizzes',  label: 'quizzes' },
        { regex: /(\d+)\s+exams?\b/,                  key: 'exams',    label: 'exams' },
        { regex: /(\d+)\s+projects?\b/,               key: 'projects', label: 'projects' },
        { regex: /(\d+)\s+essays?\b/,                 key: 'essays',   label: 'essays' },
        { regex: /(\d+)\s+midterms?\b/,               key: 'midterms', label: 'midterms' },
      ]
      for (const p of patterns) {
        const m = instr.match(p.regex)
        if (m) quotas[p.key] = { target: parseInt(m[1], 10), placed: 0, label: p.label }
      }
    }

    // Extract HW frequency descriptor from combined rules for injection into batch messages
    let hwFrequencyNote = ''
    if (allRulesText) {
      const instr = allRulesText.toLowerCase()
      if (/every\s+other\s+day|alternate\s+days?|every\s+2\s+days?/.test(instr)) {
        hwFrequencyNote = 'HW FREQUENCY: assign homework on EVERY OTHER day only — skip at least one day between each HW assignment. This is a strict requirement.'
      } else if (/no\s+homework|without\s+homework/.test(instr)) {
        hwFrequencyNote = 'HW FREQUENCY: do NOT assign any homework (teacher has explicitly excluded it).'
      } else if (/(\d+)\s+(?:times?|days?)\s+(?:per|a)\s+week/.test(instr)) {
        const m = instr.match(/(\d+)\s+(?:times?|days?)\s+(?:per|a)\s+week/)
        if (m) hwFrequencyNote = `HW FREQUENCY: assign homework exactly ${m[1]} days per week — spread evenly across the week.`
      } else if (/every\s+day|daily\s+homework|homework\s+every\s+day/.test(instr)) {
        hwFrequencyNote = 'HW FREQUENCY: assign homework every school day.'
      }
    }

    console.log(`[generate-calendar] Parsed quotas: ${JSON.stringify(quotas)}, hwNote: ${hwFrequencyNote || '(default)'}`)

    // Token budget per day.
    const tokensPerDay = 220
    const OUTPUT_BUFFER = 500

    // Always use batches of 5 — small enough to reliably complete, large enough to be efficient.
    const BATCH_SIZE = 5

    console.log(`[generate-calendar] months=${months.length}, BATCH_SIZE=${BATCH_SIZE}, tokensPerDay=${tokensPerDay}`)

    for (const month of months) {
      const batches: string[][] = []
      for (let i = 0; i < month.dates.length; i += BATCH_SIZE) {
        batches.push(month.dates.slice(i, i + BATCH_SIZE))
      }

      for (const batch of batches) {
        const filledDates = new Set<string>()
        const batchDiffs: any[] = []

        // ── Build live quota status for this batch ──────────────
        const totalPlaced = Object.values(quotas).reduce((s, q) => s + q.placed, 0)
        const totalTarget = Object.values(quotas).reduce((s, q) => s + q.target, 0)
        const remainingDays = cappedDays.length - cappedDays.indexOf(batch[0])

        let quotaBlock = ''
        if (Object.keys(quotas).length > 0) {
          const lines: string[] = []
          for (const q of Object.values(quotas)) {
            const remaining = q.target - q.placed
            lines.push(`  • ${q.label}: need ${q.target} total — placed ${q.placed} so far — ${remaining} MORE needed across remaining ${remainingDays} days`)
          }
          // Figure out optimal spacing for remaining assessments
          const totalRemaining = Object.values(quotas).reduce((s, q) => s + Math.max(0, q.target - q.placed), 0)
          const spacingNote = totalRemaining > 0 && remainingDays > 0
            ? `  → Space remaining assessments: roughly every ${Math.floor(remainingDays / Math.max(totalRemaining, 1))} days`
            : '  → All assessment quotas are met — do NOT add more assessments'
          quotaBlock = `
ASSESSMENT QUOTA STATUS (MANDATORY — match these counts exactly):
${lines.join('\n')}
${spacingNote}`
        }

        const hwBlock = hwFrequencyNote ? `\n${hwFrequencyNote}` : ''

        const batchUserMessage = `Fill a lesson plan for ALL ${batch.length} of these dates in ${month.label}.

Dates (${batch.length}): ${batch.join(', ')}
${quotaBlock}${hwBlock}

You must call createLesson exactly ${batch.length} times — once per date. Do not skip any.
MATCH THE QUOTAS EXACTLY. Count carefully before placing each assessment.
For the hw field: follow the HW FREQUENCY rule above exactly — do not use the default pattern.`

        // First pass
        console.log(`[generate-calendar] Batch ${batch[0]}→${batch[batch.length-1]} (${batch.length} days), max_tokens=${batch.length * tokensPerDay + OUTPUT_BUFFER}`)
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: batchUserMessage },
            ],
            tools: [CREATE_LESSON_TOOL],
            tool_choice: 'auto',
            max_tokens: batch.length * tokensPerDay + OUTPUT_BUFFER,
            temperature: 0.3,
          })

          if (completion.choices[0].message.tool_calls) {
            for (const call of completion.choices[0].message.tool_calls) {
              try {
                const args = JSON.parse(call.function.arguments)
                batchDiffs.push(...buildDiff(call.function.name, args, {}))
                if (args.date) filledDates.add(args.date)
                // Update quota counters from AI output
                if (args.assessments) {
                  const aLower = args.assessments.toLowerCase()
                  if (quotas.tests    && /\btest\b/.test(aLower))   quotas.tests.placed++
                  if (quotas.quizzes  && /\bquiz\b/.test(aLower))   quotas.quizzes.placed++
                  if (quotas.exams    && /\bexam\b/.test(aLower))   quotas.exams.placed++
                  if (quotas.projects && /\bproject\b/.test(aLower)) quotas.projects.placed++
                  if (quotas.essays   && /\bessay\b/.test(aLower))   quotas.essays.placed++
                  if (quotas.midterms && /\bmidterm\b/.test(aLower)) quotas.midterms.placed++
                }
              } catch {}
            }
          }
          console.log(`[generate-calendar] Batch got ${filledDates.size}/${batch.length} dates. finish_reason=${completion.choices[0].finish_reason}`)
          console.log(`[generate-calendar] Quota state after batch: ${JSON.stringify(Object.fromEntries(Object.entries(quotas).map(([k,v]) => [k, `${(v as Quota).placed}/${(v as Quota).target}`])))}`)
        } catch (firstErr: any) {
          console.error(`First pass failed for batch ${batch[0]}-${batch[batch.length-1]}:`, firstErr.message)
        }

        // Second pass: retry missed dates (no size guard — always retry)
        const missed = batch.filter(d => !filledDates.has(d))
        if (missed.length > 0) {
          console.log(`Retrying ${missed.length} missed dates: ${missed.join(', ')}`)
          try {
            const followUp = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: `These dates still need lesson plans: ${missed.join(', ')}. Call createLesson once for each of these ${missed.length} dates now.${hwFrequencyNote ? '\n' + hwFrequencyNote : ''}`,
                },
              ],
              tools: [CREATE_LESSON_TOOL],
              tool_choice: 'auto',
              max_tokens: missed.length * tokensPerDay + OUTPUT_BUFFER,
              temperature: 0.3,
            })
            if (followUp.choices[0].message.tool_calls) {
              for (const call of followUp.choices[0].message.tool_calls) {
                try {
                  const args = JSON.parse(call.function.arguments)
                  batchDiffs.push(...buildDiff(call.function.name, args, {}))
                  if (args.assessments) {
                    const aLower = args.assessments.toLowerCase()
                    if (quotas.tests    && /\btest\b/.test(aLower))   quotas.tests.placed++
                    if (quotas.quizzes  && /\bquiz\b/.test(aLower))   quotas.quizzes.placed++
                    if (quotas.exams    && /\bexam\b/.test(aLower))   quotas.exams.placed++
                    if (quotas.projects && /\bproject\b/.test(aLower)) quotas.projects.placed++
                    if (quotas.essays   && /\bessay\b/.test(aLower))   quotas.essays.placed++
                    if (quotas.midterms && /\bmidterm\b/.test(aLower)) quotas.midterms.placed++
                  }
                } catch {}
              }
            }
          } catch (retryErr: any) {
            console.warn('Retry pass failed:', retryErr.message)
          }
        }

        // Write batch to DB
        if (batchDiffs.length > 0) {
          const byDateField = new Map<string, any>()
          for (const d of batchDiffs) byDateField.set(`${d.date}::${d.field}`, d)
          const dedupedDiffs = Array.from(byDateField.values()).map(d => ({ ...d, status: 'accepted' }))
          const { applied, errors } = await applyChangesToDb(courseId, dedupedDiffs)
          totalApplied += applied
          allErrors.push(...errors)
        }
      }
    }

    if (totalApplied === 0) {
      return res.status(500).json({ message: 'AI did not generate any lessons. Try adding more detail to your context.' })
    }

    res.json({
      applied: totalApplied,
      months: months.length,
      message: `Generated and saved ${totalApplied} lesson entries across ${months.length} months.`,
    })
  } catch (err: any) {
    console.error('Generate calendar error:', err)
    res.status(500).json({ message: err.message || 'Generation failed.' })
  }
})

// ── POST /api/ai/store-context ────────────────────────────
// Stores plain text (from AI Setup modal) as searchable chunks
// in the documents table so the sidebar AI can retrieve it via RAG.
// Called automatically after generate-calendar succeeds.
router.post('/store-context', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, contextText, docType = 'ai_setup' } = req.body
    if (!courseId || !contextText?.trim()) {
      return res.status(400).json({ message: 'courseId and contextText required.' })
    }
    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })

    // Delete any existing context of this type before re-storing
    await db.query('DELETE FROM documents WHERE course_id=$1 AND type=$2', [courseId, docType])

    // Split into ~700-char chunks for embedding
    const chunkSize = 700
    const words = contextText.split(/\s+/)
    const chunks: string[] = []
    let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > chunkSize && cur.length > 0) {
        chunks.push(cur.trim())
        cur = w
      } else {
        cur = (cur + ' ' + w).trim()
      }
    }
    if (cur.length > 20) chunks.push(cur.trim())

    let stored = 0
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embRes = await openai.embeddings.create({ model: 'text-embedding-3-small', input: chunks[i] })
        const vec = `[${embRes.data[0].embedding.join(',')}]`
        await db.query(
          `INSERT INTO documents(course_id, type, filename, raw_text, chunk_index, chunk_text, embedding)
           VALUES($1,$2,$3,$4,$5,$6,$7::vector)`,
          [courseId, docType, 'AI Setup Context', i === 0 ? contextText : null, i, chunks[i], vec]
        )
        stored++
      } catch (chunkErr: any) {
        console.warn(`Failed to embed chunk ${i}:`, chunkErr.message)
      }
    }

    res.json({ message: `Stored ${stored} chunks for RAG.`, chunks: stored })
  } catch (err: any) {
    console.error('Store context error:', err)
    res.status(500).json({ message: err.message || 'Failed to store context.' })
  }
})

export default router