'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar, Plus, LogOut, X, ArrowRight, ChevronRight, ChevronDown,
  Upload, BookOpen, CalendarDays, Loader2, Sparkles,
  CheckCircle, AlertCircle, FileText, Clock, Settings, School,
  Trash2, GripVertical, Check, Copy, HelpCircle
} from 'lucide-react'
import { api, apiExtended, Course, ApiError, clearSession, PeriodConfig, UserProfile } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'

const COLOR_CYCLE = ['sage', 'amber', 'blue', 'purple', 'red']
const dotMap: Record<string, string> = {
  sage: 'bg-sage', amber: 'bg-amber', blue: 'bg-blue-500', purple: 'bg-purple-500', red: 'bg-red-500',
}
const colorOptions = ['sage', 'amber', 'blue', 'purple', 'red']

function periodNum(p: string) {
  const m = p.match(/\d+/)
  return m ? parseInt(m[0]) : 999
}

// ── Generation phase — explicit discriminated union ──
type GenPhase =
  | { phase: 'idle' }
  | { phase: 'creating' }
  | { phase: 'extracting'; label: string; current: number; total: number }
  | { phase: 'generating' }
  | { phase: 'storing' }
  | { phase: 'done'; applied: number; months: number }
  | { phase: 'error'; message: string }

// Duration options — all start from TODAY
const DURATION_OPTIONS = [
  { value: 5,   label: '1 Week',          detail: '~5 school days — quick start' },
  { value: 10,  label: '2 Weeks',         detail: '~10 school days' },
  { value: 22,  label: '1 Month',         detail: '~22 school days — recommended' },
  { value: 45,  label: '1 Marking Period',detail: '~45 school days' },
  { value: 90,  label: 'Full Semester',   detail: '~90 school days — takes 1–3 min', warn: true },
]

interface DocField {
  key:     'syllabusText' | 'schoolCalText' | 'meetingText' | 'requirementsText'
  fileKey: 'syllabusFile' | 'schoolCalFile' | 'meetingFile' | 'reqFile'
  label:   string
  placeholder: string
}
const DOC_FIELDS: DocField[] = [
  { key: 'syllabusText',     fileKey: 'syllabusFile',  label: 'Syllabus',                   placeholder: 'Paste syllabus content, unit list, or topics…' },
  { key: 'schoolCalText',    fileKey: 'schoolCalFile', label: 'School calendar / key dates', placeholder: 'Paste holidays, breaks, exam weeks, marking periods…' },
  { key: 'meetingText',      fileKey: 'meetingFile',   label: 'Class meeting schedule',      placeholder: 'Paste bell schedule or which days class meets…' },
  { key: 'requirementsText', fileKey: 'reqFile',       label: 'Requirements',                placeholder: 'e.g. 4 tests required, state standards to cover…' },
]

const FIELD_HELP: Record<string, { title: string; example: string }> = {
  syllabusText: {
    title: 'Syllabus',
    example: `Unit 1: Linear Equations (2 weeks)
Unit 2: Systems of Equations (2 weeks)
Unit 3: Polynomials (3 weeks)
Unit 4: Quadratic Functions (3 weeks)
Unit 5: Exponential & Logarithmic Functions (3 weeks)
Midterm Exam – end of Unit 3
Final Exam – end of semester`,
  },
  schoolCalText: {
    title: 'School Calendar / Key Dates',
    example: `Sept 2 – Labor Day (no school)
Oct 14–18 – Fall Break
Nov 27–29 – Thanksgiving Break
Dec 23 – Jan 3 – Winter Break
Jan 20 – MLK Day (no school)
Feb 17 – Presidents' Day (no school)
Apr 14–18 – Spring Break
May 26 – Memorial Day (no school)
June 6 – Last Day of School
Marking Period 1: Sept 3 – Nov 1
Marking Period 2: Nov 4 – Jan 17`,
  },
  meetingText: {
    title: 'Class Meeting Schedule',
    example: `Class meets every day, Period 3 (10:15–11:00 AM).

Or for block schedules:
Monday/Wednesday/Friday: Periods 1–4
Tuesday/Thursday: Periods 5–8

Or rotating schedule:
Day 1: A, B, C, D blocks
Day 2: E, F, G, H blocks`,
  },
  requirementsText: {
    title: 'Requirements',
    example: `- 4 unit tests required (one per marking period)
- At least 1 quiz per unit (min 5 quizzes total)
- 2 major projects: midterm and final
- Weekly homework assignments
- No tests the week before a break
- Review day required before every test
- State standards: CCSS.MATH.HSA (Algebra)`,
  },
  additionalInfo: {
    title: 'Instructions',
    example: `- No homework on Fridays
- Space tests at least 2 weeks apart
- Include a review day before every major exam
- First week should be introductory / review
- Keep the last week of the semester for review and final prep
- Label milestone days like "Unit 1 Begins" and "Unit 1 Ends"`,
  },
}

// ─── Help Tooltip ──────────────────────────────────────────
function HelpTooltip({ fieldKey }: { fieldKey: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const help = FIELD_HELP[fieldKey]
  if (!help) return null

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-4 h-4 flex items-center justify-center rounded-full transition-colors ${open ? 'text-sage bg-sage/15' : 'text-ink-300 hover:text-sage hover:bg-sage/10'}`}
        title={`See an example for ${help.title}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-full mt-1.5 w-72 bg-white border border-ink-900/12 rounded-xl shadow-xl p-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-[11px] font-bold text-ink-600 uppercase tracking-wide">Example: {help.title}</span>
            <button onClick={() => setOpen(false)} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-ink-900/8 text-ink-400">
              <X className="w-3 h-3" />
            </button>
          </div>
          <pre className="font-body text-[11px] text-ink-700 leading-relaxed whitespace-pre-wrap bg-ink-50/60 rounded-lg p-2.5 border border-ink-900/6">
            {help.example}
          </pre>
        </div>
      )}
    </div>
  )
}

interface AIFormFields {
  syllabusText: string;     syllabusFile:  File | null
  schoolCalText: string;    schoolCalFile: File | null
  meetingText: string;      meetingFile:   File | null
  requirementsText: string; reqFile:       File | null
  additionalInfo: string
  maxDays: number
}

// ─── Utilities ────────────────────────────────────────────
// Format HH:MM → 12-hour display
function fmt12(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2,'0')} ${ampm}`
}

// ─── Manage School Schedule Section ───────────────────────
function ManageScheduleSection() {
  const [open,          setOpen]          = useState(false)
  const [profile,       setProfile]       = useState<UserProfile | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState(false)
  const [error,         setError]         = useState('')

  // Local editable state
  const [schoolDayStart, setSchoolDayStart] = useState('08:00')
  const [schoolDayEnd,   setSchoolDayEnd]   = useState('15:00')
  const [periods,        setPeriods]        = useState<PeriodConfig[]>([])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    api.profile.get()
      .then(p => {
        setProfile(p)
        setSchoolDayStart(p.schoolDayStart || '08:00')
        setSchoolDayEnd(p.schoolDayEnd || '15:00')
        setPeriods(p.periods || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  const addPeriod = () => {
    const id = `p${Date.now()}`
    // Auto-compute start time from previous period's end time
    const lastEnd = periods.length > 0 ? periods[periods.length - 1].endTime : schoolDayStart
    const [h, m] = lastEnd.split(':').map(Number)
    const startMins = h * 60 + m
    const endMins   = startMins + 45
    const toHHMM = (mins: number) => {
      const hh = Math.floor(mins / 60) % 24
      const mm = mins % 60
      return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`
    }
    setPeriods(prev => [...prev, {
      id,
      label: `Period ${prev.length + 1}`,
      durationMinutes: 45,
      startTime: toHHMM(startMins),
      endTime:   toHHMM(endMins),
    }])
  }

  const updatePeriod = (id: string, field: keyof PeriodConfig, value: string | number) => {
    setPeriods(prev => prev.map(p => {
      if (p.id !== id) return p
      const updated = { ...p, [field]: value }
      // Auto-update endTime when startTime or durationMinutes changes
      if (field === 'startTime' || field === 'durationMinutes') {
        const [h, m] = (field === 'startTime' ? String(value) : updated.startTime).split(':').map(Number)
        const dur = field === 'durationMinutes' ? Number(value) : updated.durationMinutes
        const endMins = h * 60 + m + dur
        updated.endTime = `${String(Math.floor(endMins / 60) % 24).padStart(2,'0')}:${String(endMins % 60).padStart(2,'0')}`
      }
      return updated
    }))
  }

  const removePeriod = (id: string) => setPeriods(prev => prev.filter(p => p.id !== id))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.profile.update({ schoolDayStart, schoolDayEnd, periods })

      // Seed each period as a real weekly recurring event on My Schedule.
      // We use the next occurrence of each weekday (Mon–Fri) as the base date
      // so the weekly repeat fills the calendar automatically.
      // We create 5 events per period (one per weekday) so they appear every day.
      const today = new Date()
      const WEEKDAYS = [1, 2, 3, 4, 5] // Mon–Fri

      for (const p of periods) {
        for (const targetDow of WEEKDAYS) {
          // Find next date that falls on targetDow
          const base = new Date(today)
          const diff = (targetDow - base.getDay() + 7) % 7
          base.setDate(base.getDate() + diff)
          const dateStr = base.toISOString().slice(0, 10)
          try {
            await api.events.create({
              title: p.label,
              date: dateStr,
              startTime: p.startTime,
              endTime: p.endTime,
              allDay: false,
              schoolWide: false,
              repeatRule: 'weekly',
              color: 'sage',
            } as any)
          } catch {}
        }
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-ink-900/2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <School className="w-4 h-4 text-ink-400" />
          <h2 className="font-body font-semibold text-sm text-ink-900">School Schedule</h2>
          {profile && profile.periods.length > 0 && (
            <span className="font-body text-xs text-ink-400 bg-ink-900/6 px-2 py-0.5 rounded-full">
              {profile.periods.length} period{profile.periods.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-ink-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-ink-900/8 px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-sage animate-spin" />
            </div>
          ) : (
            <>
              {/* School day start/end */}
              <div>
                <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">School Day Hours</p>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className="font-body text-xs text-ink-500 mb-1 block">School day starts</label>
                    <input type="time" value={schoolDayStart}
                      onChange={e => setSchoolDayStart(e.target.value)}
                      className="input-field text-sm py-2 w-full" />
                  </div>
                  <div className="flex-1">
                    <label className="font-body text-xs text-ink-500 mb-1 block">School day ends</label>
                    <input type="time" value={schoolDayEnd}
                      onChange={e => setSchoolDayEnd(e.target.value)}
                      className="input-field text-sm py-2 w-full" />
                  </div>
                </div>
              </div>

              {/* Periods list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide">Periods</p>
                  <button onClick={addPeriod} className="flex items-center gap-1.5 font-body text-xs text-sage hover:text-sage-700 transition-colors">
                    <Plus className="w-3.5 h-3.5" />Add period
                  </button>
                </div>

                {periods.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-ink-900/10 rounded-xl">
                    <p className="font-body text-sm text-ink-400 mb-1">No periods yet</p>
                    <p className="font-body text-xs text-ink-300">Add periods like "Period 7/8" or "Period 3" with their times</p>
                    <button onClick={addPeriod} className="mt-3 btn-sage py-1.5 px-4 text-xs gap-1.5">
                      <Plus className="w-3 h-3" />Add first period
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {periods.map((p, idx) => (
                      <div key={p.id} className="bg-ink-50/60 border border-ink-900/8 rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-body text-[10px] text-ink-400 font-semibold uppercase tracking-wide w-4">{idx + 1}</span>
                          <input
                            type="text"
                            value={p.label}
                            onChange={e => updatePeriod(p.id, 'label', e.target.value)}
                            placeholder="e.g. Period 7/8"
                            className="flex-1 input-field text-sm py-1.5 font-medium"
                          />
                          <button onClick={() => removePeriod(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 pl-6">
                          <div className="flex items-center gap-1.5 flex-1">
                            <Clock className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                            <input type="time" value={p.startTime}
                              onChange={e => updatePeriod(p.id, 'startTime', e.target.value)}
                              className="input-field text-xs py-1.5 flex-1 min-w-0" />
                            <span className="font-body text-xs text-ink-400">–</span>
                            <input type="time" value={p.endTime}
                              onChange={e => updatePeriod(p.id, 'endTime', e.target.value)}
                              className="input-field text-xs py-1.5 flex-1 min-w-0" />
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <input type="number" min={1} max={240} value={p.durationMinutes}
                              onChange={e => updatePeriod(p.id, 'durationMinutes', parseInt(e.target.value) || 45)}
                              className="input-field text-xs py-1.5 w-16 text-center" />
                            <span className="font-body text-[10px] text-ink-400">min</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Summary preview */}
              {periods.length > 0 && (
                <div className="bg-sage/5 border border-sage/15 rounded-xl px-4 py-3">
                  <p className="font-body text-xs font-semibold text-sage-700 mb-2">Schedule Preview</p>
                  <div className="space-y-1">
                    {periods.map(p => (
                      <div key={p.id} className="flex items-center justify-between">
                        <span className="font-body text-xs text-ink-700">{p.label}</span>
                        <span className="font-mono text-xs text-ink-400">{fmt12(p.startTime)} – {fmt12(p.endTime)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="font-body text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={handleSave} disabled={saving}
                  className={`btn-sage py-2 px-5 text-sm gap-2 ${saving ? 'opacity-60 cursor-not-allowed' : ''}`}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
                  {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Schedule'}
                </button>
              </div>
              <p className="font-body text-[11px] text-ink-400 -mt-2">
                This schedule syncs to your <Link href="/app/schedule" className="text-sage underline underline-offset-2">My Schedule</Link> view.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Create Calendar Modal ─────────────────────────────────
function CreateCalendarModal({ onClose, onCreated, takenPeriods }: {
  onClose: () => void
  onCreated: (cal: Course) => void
  takenPeriods: string[]
}) {
  const [step, setStep]                   = useState(1)
  const [form, setForm]                   = useState({ name: '', period: '', color: 'sage' })
  const [genStatus, setGenStatus]         = useState<GenPhase>({ phase: 'idle' })
  const [profilePeriods, setProfilePeriods] = useState<PeriodConfig[]>([])
  const [periodsLoaded, setPeriodsLoaded] = useState(false)

  const [ai, setAi] = useState<AIFormFields>({
    syllabusText: '',     syllabusFile:  null,
    schoolCalText: '',    schoolCalFile: null,
    meetingText: '',      meetingFile:   null,
    requirementsText: '', reqFile:       null,
    additionalInfo: '',
    maxDays: 22,
  })

  // Load saved periods for the period dropdown
  useEffect(() => {
    api.profile.get()
      .then(p => {
        const periods = p.periods ?? []
        setProfilePeriods(periods)
        const firstAvailable = periods.find(p => !takenPeriods.includes(p.label))
        if (firstAvailable) setForm(f => ({ ...f, period: firstAvailable.label }))
      })
      .catch(() => {})
      .finally(() => setPeriodsLoaded(true))
  }, [])

  const isRunning = genStatus.phase !== 'idle' && genStatus.phase !== 'done' && genStatus.phase !== 'error'
  const isDone    = genStatus.phase === 'done'
  const isError   = genStatus.phase === 'error'

  const hasAnyContent = !!(
    ai.syllabusText || ai.syllabusFile ||
    ai.schoolCalText || ai.schoolCalFile ||
    ai.meetingText || ai.meetingFile ||
    ai.requirementsText || ai.reqFile ||
    ai.additionalInfo
  )

  const handleCreateEmpty = async () => {
    setGenStatus({ phase: 'creating' })
    try {
      const cal = await api.calendars.create(form)
      onCreated(cal)
      onClose()
    } catch (err) {
      setGenStatus({ phase: 'error', message: err instanceof ApiError ? err.message : 'Failed to create calendar.' })
    }
  }

  const handleCreateWithAI = async () => {
    if (!hasAnyContent || isRunning) return

    // Step 1 — create the course record
    setGenStatus({ phase: 'creating' })
    let cal: Course
    try {
      cal = await api.calendars.create(form)
    } catch (err) {
      setGenStatus({ phase: 'error', message: err instanceof ApiError ? err.message : 'Failed to create calendar.' })
      return
    }

    // Step 2 — extract text from every uploaded file
    const sources: Array<{ file: File | null; text: string; label: string; prefix: string }> = [
      { file: ai.syllabusFile,   text: ai.syllabusText,     label: 'Syllabus',         prefix: 'SYLLABUS' },
      { file: ai.schoolCalFile,  text: ai.schoolCalText,    label: 'School Calendar',  prefix: 'SCHOOL CALENDAR' },
      { file: ai.meetingFile,    text: ai.meetingText,      label: 'Meeting Schedule', prefix: 'MEETING SCHEDULE' },
      { file: ai.reqFile,        text: ai.requirementsText, label: 'Requirements',     prefix: 'REQUIREMENTS' },
    ]
    const active = sources.filter(s => s.file || s.text.trim())
    const contextParts: string[] = []

    for (let i = 0; i < active.length; i++) {
      const src = active[i]
      setGenStatus({ phase: 'extracting', label: src.label, current: i + 1, total: active.length })
      let extracted = src.text.trim()
      if (src.file) {
        try {
          const res = await apiExtended.upload.extractText(src.file)
          extracted = [res.text, src.text.trim()].filter(Boolean).join('\n')
        } catch (e) {
          console.warn('Extraction failed for', src.label, e)
        }
      }
      if (extracted) contextParts.push(`[${src.prefix}]\n${extracted}`)
    }

    if (ai.additionalInfo.trim()) {
      contextParts.push(`[TEACHER INSTRUCTIONS]\n${ai.additionalInfo.trim()}`)
    }

    const contextText = contextParts.join('\n\n')
    if (!contextText.trim()) {
      setGenStatus({ phase: 'error', message: 'Could not extract any text. Please type content into the text boxes and try again.' })
      return
    }

    // Step 3 — generate (starts from today automatically on backend)
    setGenStatus({ phase: 'generating' })
    let result: { applied: number; months: number }
    try {
      result = await apiExtended.ai.generateCalendar({
        courseId: cal.id,
        contextText,
        maxDays: ai.maxDays,
      })
    } catch (err) {
      setGenStatus({
        phase: 'error',
        message: `Calendar created, but AI generation failed: ${err instanceof ApiError ? err.message : 'unknown error'}. Open the calendar and use the AI sidebar instead.`,
      })
      setTimeout(() => onCreated(cal), 3000)
      return
    }

    // Step 4 — store each document section separately for RAG (best-effort)
    setGenStatus({ phase: 'storing' })
    const docTypeMap: Record<string, string> = {
      'SYLLABUS': 'syllabus',
      'SCHOOL CALENDAR': 'school_calendar',
      'MEETING SCHEDULE': 'meeting_schedule',
      'REQUIREMENTS': 'requirements',
      'TEACHER INSTRUCTIONS': 'requirements',
    }
    for (const part of contextParts) {
      const match = part.match(/^\[([A-Z ]+)\]/)
      const prefix = match?.[1] || ''
      const docType = docTypeMap[prefix] || 'ai_setup'
      const body = part.replace(/^\[[A-Z ]+\]\n/, '').trim()
      if (!body) continue
      try {
        await apiExtended.ai.storeContext(cal.id, body, docType)
      } catch (e) {
        console.warn('RAG storage failed for', docType, e)
      }
    }

    setGenStatus({ phase: 'done', applied: result.applied, months: result.months })
    setTimeout(() => onCreated(cal), 1500)
  }

  const phaseLabel = (): string => {
    switch (genStatus.phase) {
      case 'creating':   return 'Creating calendar…'
      case 'extracting': return `Reading ${genStatus.label} (${genStatus.current}/${genStatus.total})…`
      case 'generating': return 'AI is planning your lessons…'
      case 'storing':    return 'Saving context for AI sidebar…'
      case 'done':       return `Done! ${genStatus.applied} lessons saved across ${genStatus.months} month(s).`
      case 'error':      return genStatus.message
      default:           return ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
      <div className="bg-cream-100 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-ink-900/8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex gap-1">
                {[1, 2].map(s => (
                  <div key={s} className={`h-1.5 rounded-full transition-all duration-300 ${s === step ? 'w-8 bg-sage' : s < step ? 'w-8 bg-sage/40' : 'w-4 bg-ink-900/15'}`} />
                ))}
              </div>
              <span className="font-body text-xs text-ink-400">Step {step} of 2</span>
            </div>
            <h2 className="font-display text-2xl text-ink-900">{step === 1 ? 'New Course Calendar' : 'AI Setup (optional)'}</h2>
          </div>
          <button onClick={onClose} disabled={isRunning} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-900/6 disabled:opacity-40">
            <X className="w-4 h-4 text-ink-500" />
          </button>
        </div>

        {/* ── Step 1 ── */}
        {step === 1 && (
          <div className="px-7 py-6 space-y-5">
            {/* Gate: no periods configured */}
            {periodsLoaded && profilePeriods.length === 0 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <School className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-body text-sm font-medium text-amber-800">Set up your school schedule first</p>
                  <p className="font-body text-xs text-amber-600 mt-0.5">
                    You need to add periods in the <strong>School Schedule</strong> section before creating a course calendar.
                  </p>
                  <button onClick={onClose} className="font-body text-xs text-amber-700 underline mt-1">
                    Close and set up schedule →
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="label">Course Name <span className="text-red-400">*</span></label>
              <input type="text" placeholder="e.g. AP Calculus BC" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" autoFocus />
            </div>
            <div>
              <label className="label">Period <span className="text-red-400">*</span></label>
              {(() => {
                const availablePeriods = profilePeriods.filter(p => !takenPeriods.includes(p.label))
                if (!periodsLoaded) return (
                  <div className="input-field flex items-center gap-2 text-ink-400 text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading periods…
                  </div>
                )
                if (profilePeriods.length === 0) return (
                  <input type="text" placeholder="e.g. Period 3" value={form.period}
                    onChange={e => setForm({ ...form, period: e.target.value })} className="input-field" disabled />
                )
                if (availablePeriods.length === 0) return (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body text-sm text-amber-700">All periods already have a calendar. Delete an existing calendar to free up a period.</p>
                  </div>
                )
                return (
                  <select value={form.period}
                    onChange={e => setForm({ ...form, period: e.target.value })}
                    className="input-field">
                    {availablePeriods.map(p => (
                      <option key={p.id} value={p.label}>
                        {p.label}{p.startTime ? ` (${fmt12(p.startTime)}–${fmt12(p.endTime)})` : ''}
                      </option>
                    ))}
                  </select>
                )
              })()}
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex gap-2 mt-1">
                {colorOptions.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full transition-all ${dotMap[c]} ${form.color === c ? 'ring-2 ring-offset-2 ring-ink-900/30 scale-110' : 'opacity-60 hover:opacity-100'}`} />
                ))}
              </div>
            </div>
            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!form.name.trim() || !form.period.trim() || (periodsLoaded && profilePeriods.length === 0) || (periodsLoaded && profilePeriods.filter(p => !takenPeriods.includes(p.label)).length === 0)}
                className={`btn-sage px-7 ${!form.name.trim() || !form.period.trim() || (periodsLoaded && profilePeriods.length === 0) || (periodsLoaded && profilePeriods.filter(p => !takenPeriods.includes(p.label)).length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div className="px-7 py-6 space-y-5">

            {/* Status banner */}
            {genStatus.phase !== 'idle' && (
              <div className={`rounded-xl px-4 py-3 flex items-start gap-3 ${isError ? 'bg-red-50 border border-red-200' : isDone ? 'bg-sage/10 border border-sage/20' : 'bg-blue-50 border border-blue-200'}`}>
                {isError  ? <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" /> :
                 isDone   ? <CheckCircle className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" /> :
                            <Loader2 className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />}
                <div>
                  <p className={`font-body text-sm ${isError ? 'text-red-700' : isDone ? 'text-sage-800' : 'text-blue-700'}`}>{phaseLabel()}</p>
                  {isError && <button onClick={() => setGenStatus({ phase: 'idle' })} className="font-body text-xs text-red-600 underline mt-1">Try again</button>}
                </div>
              </div>
            )}

            {/* Progress steps */}
            {isRunning && (
              <div className="flex items-center gap-1.5 text-[11px] font-body flex-wrap">
                {[
                  { label: 'Create',    active: genStatus.phase === 'creating' },
                  { label: 'Read docs', active: genStatus.phase === 'extracting' },
                  { label: 'AI plan',   active: genStatus.phase === 'generating' },
                  { label: 'Save RAG',  active: genStatus.phase === 'storing' },
                ].map((s, i) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    {i > 0 && <div className="w-3 h-px bg-ink-900/20" />}
                    <span className={`px-2 py-0.5 rounded-full ${s.active ? 'bg-sage text-white' : 'bg-ink-900/8 text-ink-400'}`}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Form — hidden while running or done */}
            {!isRunning && !isDone && (
              <>
                <p className="font-body text-sm text-ink-500 leading-relaxed">
                  Give the AI context to plan your calendar. It will start building from <strong className="text-ink-800">today</strong> and continue forward.
                </p>

                {/* Duration picker — starts from today */}
                <div className="bg-white border border-ink-900/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-sage" />
                    <span className="font-body text-xs font-semibold text-ink-700 uppercase tracking-wide">How far ahead to plan</span>
                    <span className="font-body text-xs text-ink-400">(starts from today)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DURATION_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setAi(f => ({ ...f, maxDays: opt.value }))}
                        className={`text-left px-3 py-2.5 rounded-lg border transition-all ${ai.maxDays === opt.value ? 'border-sage bg-sage/8 ring-1 ring-sage/30' : 'border-ink-900/10 bg-ink-50/40 hover:border-ink-900/20'}`}>
                        <div className="font-body text-sm font-medium text-ink-800">{opt.label}</div>
                        <div className={`font-body text-[11px] mt-0.5 ${opt.warn && ai.maxDays === opt.value ? 'text-amber-600' : 'text-ink-400'}`}>{opt.detail}</div>
                      </button>
                    ))}
                  </div>
                  <p className="font-body text-[11px] text-ink-400">You can always extend the calendar later using the AI sidebar.</p>
                </div>

                {/* Document fields */}
                {DOC_FIELDS.map(({ key, fileKey, label, placeholder }) => {
                  const hasFile = !!(ai[fileKey] as File | null)
                  const hasText = !!(ai[key] as string).trim()
                  return (
                    <div key={key} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-ink-400" />
                        <span className="font-body text-sm font-medium text-ink-700">{label}</span>
                        <HelpTooltip fieldKey={key} />
                        {(hasFile || hasText) && <span className="font-body text-[10px] bg-sage/15 text-sage-700 px-2 py-0.5 rounded-full">&#x2713; Added</span>}
                      </div>
                      <textarea rows={2} placeholder={placeholder} value={ai[key] as string}
                        onChange={e => setAi(f => ({ ...f, [key]: e.target.value }))}
                        className="input-field resize-none text-xs w-full" />
                      <label className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed border-ink-900/20 rounded-lg cursor-pointer hover:border-sage/60 group w-full">
                        <Upload className="w-3.5 h-3.5 text-ink-400 group-hover:text-sage flex-shrink-0" />
                        <span className="font-body text-xs text-ink-400 group-hover:text-ink-600 truncate">
                          {hasFile ? `✓ ${(ai[fileKey] as File).name}` : 'Upload PDF, PNG, or JPG'}
                        </span>
                        <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                          onChange={e => setAi(f => ({ ...f, [fileKey]: e.target.files?.[0] ?? null }))} />
                      </label>
                    </div>
                  )
                })}

                {/* Instructions */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-sage" />
                    <span className="font-body text-sm font-medium text-ink-700">Instructions</span>
                    <HelpTooltip fieldKey="additionalInfo" />
                  </div>
                  <textarea rows={3}
                    placeholder="e.g. No homework on Fridays. No tests the week before break. Space tests at least 2 weeks apart. Include review days before each major exam."
                    value={ai.additionalInfo} onChange={e => setAi(f => ({ ...f, additionalInfo: e.target.value }))}
                    className="input-field resize-none text-xs w-full" />
                </div>

                {/* Buttons */}
                <div className="pt-2 flex items-center justify-between gap-3">
                  <button onClick={() => setStep(1)} className="btn-secondary">&larr; Back</button>
                  <div className="flex gap-3">
                    <button onClick={handleCreateEmpty} className="btn-secondary px-5 text-sm">Create Empty</button>
                    <button onClick={handleCreateWithAI} disabled={!hasAnyContent}
                      className={`btn-sage px-7 gap-2 ${!hasAnyContent ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <Sparkles className="w-4 h-4" />Create with AI &#x2736;
                    </button>
                  </div>
                </div>
                {!hasAnyContent && (
                  <p className="font-body text-xs text-ink-400 text-center -mt-2">
                    Add at least one document or description to enable AI generation.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Clone Calendar Modal ──────────────────────────────────
function CloneModal({ source, onClose, onCloned, takenPeriods }: {
  source: Course
  onClose: () => void
  onCloned: (cal: Course) => void
  takenPeriods: string[]
}) {
  const [name, setName]                     = useState(`${source.name} (Copy)`)
  const [period, setPeriod]                 = useState('')
  const [profilePeriods, setProfilePeriods] = useState<PeriodConfig[]>([])
  const [periodsLoaded, setPeriodsLoaded]   = useState(false)
  const [cloning, setCloning]               = useState(false)
  const [error, setError]                   = useState('')

  useEffect(() => {
    api.profile.get()
      .then(p => {
        const periods = p.periods ?? []
        setProfilePeriods(periods)
        // Default to first available period (not taken by any calendar, including source)
        const firstAvailable = periods.find(p => !takenPeriods.includes(p.label))
        if (firstAvailable) setPeriod(firstAvailable.label)
      })
      .catch(() => {})
      .finally(() => setPeriodsLoaded(true))
  }, [source.period])

  const handleClone = async () => {
    if (!name.trim() || !period.trim()) return
    setCloning(true)
    setError('')
    try {
      // Create the new calendar
      const newCal = await api.calendars.create({ name: name.trim(), period, color: source.color })
      // Copy all lessons from source
      const lessons = await api.lessons.getAll(source.id)
      for (const [date, lesson] of Object.entries(lessons)) {
        try { await api.lessons.save(newCal.id, date, lesson) } catch {}
      }
      onCloned(newCal)
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to clone calendar.')
    } finally {
      setCloning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
      <div className="bg-cream-100 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-ink-900/8">
          <div className="flex items-center gap-2">
            <Copy className="w-4 h-4 text-ink-400" />
            <h2 className="font-display text-xl text-ink-900">Clone Calendar</h2>
          </div>
          <button onClick={onClose} disabled={cloning} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-ink-900/6 disabled:opacity-40">
            <X className="w-4 h-4 text-ink-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="font-body text-sm text-ink-500">
            Creates a copy of <strong className="text-ink-800">{source.name}</strong> including all lessons.
          </p>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-body text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="label">New Calendar Name <span className="text-red-400">*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="input-field" autoFocus />
          </div>
          <div>
            <label className="label">Period <span className="text-red-400">*</span></label>
            {(() => {
              const availablePeriods = profilePeriods.filter(p => !takenPeriods.includes(p.label))
              if (!periodsLoaded) return (
                <div className="input-field flex items-center gap-2 text-ink-400 text-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading periods…
                </div>
              )
              if (profilePeriods.length === 0) return (
                <input type="text" value={period} onChange={e => setPeriod(e.target.value)} className="input-field" />
              )
              if (availablePeriods.length === 0) return (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body text-sm text-amber-700">All periods already have a calendar. Delete an existing calendar to free up a period for the clone.</p>
                </div>
              )
              return (
                <select value={period} onChange={e => setPeriod(e.target.value)} className="input-field">
                  {availablePeriods.map(p => (
                    <option key={p.id} value={p.label}>
                      {p.label}{p.startTime ? ` (${fmt12(p.startTime)}–${fmt12(p.endTime)})` : ''}
                    </option>
                  ))}
                </select>
              )
            })()}
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button onClick={onClose} disabled={cloning} className="btn-secondary">Cancel</button>
            <button onClick={handleClone} disabled={cloning || !name.trim() || !period.trim() || profilePeriods.filter(p => !takenPeriods.includes(p.label)).length === 0}
              className={`btn-sage gap-2 ${cloning || !name.trim() || !period.trim() || profilePeriods.filter(p => !takenPeriods.includes(p.label)).length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              {cloning ? 'Cloning…' : 'Clone Calendar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Calendar Card ──────────────────────────────────────────
function CalendarCard({ cal, onDelete, onClone }: {
  cal: Course
  onDelete: (id: string) => void
  onClone: (cal: Course) => void
}) {
  return (
    <div className="group flex items-center justify-between px-5 py-4 bg-white border border-ink-900/8 rounded-xl hover:border-ink-900/20 hover:shadow-sm transition-all duration-150">
      <Link href={`/app/calendar/${cal.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotMap[cal.color] || 'bg-sage'}`} />
        <div className="min-w-0">
          <span className="font-body font-medium text-sm text-ink-900">{cal.name}</span>
          <span className="font-body text-xs text-ink-400 ml-2">{cal.period}</span>
        </div>
      </Link>
      <div className="flex items-center gap-1">
        <button onClick={() => onClone(cal)}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-sage/10 transition-all" title="Clone calendar">
          <Copy className="w-3.5 h-3.5 text-sage" />
        </button>
        <button onClick={() => onDelete(cal.id)}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-all" title="Delete calendar">
          <X className="w-3.5 h-3.5 text-red-400" />
        </button>
        <Link href={`/app/calendar/${cal.id}`}>
          <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-ink-600 group-hover:translate-x-0.5 transition-all" />
        </Link>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────
export default function AppLandingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth(true)
  const [calendars, setCalendars]     = useState<Course[]>([])
  const [calsLoading, setCalsLoading] = useState(true)
  const [showCreate, setShowCreate]   = useState(false)
  const [cloneSource, setCloneSource] = useState<Course | null>(null)

  useEffect(() => {
    if (!user) return
    if (user.id.startsWith('demo-')) {
      const demoSession = localStorage.getItem('cal_ai_session')
      if (demoSession) {
        try {
          const session = JSON.parse(demoSession)
          if (session.calendars) {
            setCalendars(session.calendars.map((name: string, i: number) => ({
              id: String(i + 1), name, period: `Period ${i + 1}`,
              color: COLOR_CYCLE[i % COLOR_CYCLE.length],
            })))
          }
        } catch {}
      }
      setCalsLoading(false)
      return
    }
    api.calendars.list()
      .then(data => setCalendars(data))
      .catch(err => console.error('Failed to load calendars:', err))
      .finally(() => setCalsLoading(false))
  }, [user])

  const handleSignOut = async () => {
    try { await api.auth.logout() } catch {}
    clearSession()
    router.replace('/login')
  }

  const handleCreated = (cal: Course) => {
    setCalendars(prev => [...prev, cal])
    // Navigate to today on the calendar (no ?from= needed since generation starts today)
    router.push(`/app/calendar/${cal.id}`)
  }

  const handleCloned = (cal: Course) => {
    setCalendars(prev => [...prev, cal])
    router.push(`/app/calendar/${cal.id}`)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this calendar? All lessons will be lost.')) return
    setCalendars(prev => prev.filter(c => c.id !== id))
    if (!user?.id.startsWith('demo-')) {
      try { await api.calendars.delete(id) } catch {}
    }
  }

  const sortedCalendars = [...calendars].sort((a, b) => periodNum(a.period) - periodNum(b.period))

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sage animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <nav className="bg-cream-100/90 border-b border-ink-900/8 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-cream-100" />
            </div>
            <span className="font-display text-lg text-ink-900">Calendar AI</span>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 page-enter space-y-6">
        <div>
          <h1 className="font-display text-5xl text-ink-900 mb-1">{user?.fullName || 'My Dashboard'}</h1>
          <p className="font-body text-base text-ink-400">{user?.schoolName || ''}</p>
        </div>

        <ManageScheduleSection />

        <Link href="/app/schedule"
          className="group block card overflow-hidden hover:shadow-md transition-all duration-200 hover:border-ink-900/15">
          <div className="flex items-center justify-between px-6 py-5 border-b border-ink-900/8">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-ink-400" />
              <h2 className="font-body font-semibold text-sm text-ink-900">My Schedule</h2>
              <span className="font-body text-xs text-ink-400 bg-ink-900/6 px-2 py-0.5 rounded-full">Full Calendar</span>
            </div>
            <ArrowRight className="w-4 h-4 text-ink-300 group-hover:text-ink-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div className="px-6 py-4">
            <p className="font-body text-sm text-ink-500 mb-3">All your classes, meetings, and events in one place.</p>
            <div className="grid grid-cols-5 gap-1.5">
              {['Mon','Tue','Wed','Thu','Fri'].map((day, i) => {
                const todayIdx = new Date().getDay() - 1
                return (
                  <div key={day} className={`rounded-lg p-2 text-center ${i === todayIdx ? 'bg-sage/12' : 'bg-ink-900/3'}`}>
                    <div className="font-body text-[10px] text-ink-400 mb-1">{day}</div>
                    {sortedCalendars[0] && i < 4 && (
                      <div className="text-[9px] font-body text-sage-700 bg-sage/15 rounded px-1 truncate">{sortedCalendars[0].name.split(' ')[0]}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Link>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-ink-900/8">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-ink-400" />
              <h2 className="font-body font-semibold text-sm text-ink-900">My Calendars</h2>
              <span className="font-mono text-xs text-ink-400 bg-ink-900/6 px-1.5 py-0.5 rounded">{calendars.length}</span>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-sage py-2 px-3.5 text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" />Create Calendar
            </button>
          </div>
          {calsLoading ? (
            <div className="py-16 flex items-center justify-center"><Loader2 className="w-5 h-5 text-sage animate-spin" /></div>
          ) : sortedCalendars.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 bg-sage/10 rounded-2xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-sage" />
              </div>
              <p className="font-body text-base font-medium text-ink-700 mb-1">No calendars yet.</p>
              <p className="font-body text-sm text-ink-400 mb-6">Create your first course calendar to get started.</p>
              <button onClick={() => setShowCreate(true)} className="btn-sage gap-1.5">
                <Plus className="w-4 h-4" />Create your first calendar
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {sortedCalendars.map(cal => <CalendarCard key={cal.id} cal={cal} onDelete={handleDelete} onClone={setCloneSource} />)}
            </div>
          )}
        </div>
      </main>

      {showCreate && <CreateCalendarModal onClose={() => setShowCreate(false)} onCreated={handleCreated} takenPeriods={calendars.map(c => c.period)} />}
      {cloneSource && <CloneModal source={cloneSource} onClose={() => setCloneSource(null)} onCloned={handleCloned} takenPeriods={calendars.map(c => c.period)} />}
    </div>
  )
}