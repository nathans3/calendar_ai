'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar, Plus, LogOut, X, ArrowRight, ChevronRight, ChevronDown,
  Upload, BookOpen, CalendarDays, Loader2, Sparkles,
  CheckCircle, AlertCircle, FileText, Clock, Settings, School,
  Trash2, GripVertical, Check, Copy, HelpCircle, User
} from 'lucide-react'
import { api, apiExtended, Course, ApiError, clearSession, PeriodConfig, UserProfile, CalEvent } from '../../lib/api'
import { useAuth } from '../../lib/useAuth'
import { format, isToday, parseISO, isBefore } from 'date-fns'

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
  { value: 90,  label: '1 Semester',      detail: '~90 school days — takes 1–3 min', warn: true },
  { value: 180, label: 'Full Year',       detail: '~180 school days — full school year', warn: true },
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
  startDateMode: 'today' | 'pick' | 'ai'
  startDate: string
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
    startDateMode: 'today',
    startDate: format(new Date(), 'yyyy-MM-dd'),
  })

  // Load saved periods for the period dropdown
  useEffect(() => {
    api.profile.get()
      .then(p => {
        const periods = p.periods ?? []
        setProfilePeriods(periods)
        const firstAvailable = periods.find((per: PeriodConfig) => !takenPeriods.includes(per.label))
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
  const canGenerate = hasAnyContent
  const schoolCalProvided = !!(ai.schoolCalText.trim() || ai.schoolCalFile)
  const letAiDecideBlocked = ai.startDateMode === 'ai' && !schoolCalProvided

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
    if (!canGenerate || isRunning) return

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

    // Step 3 — generate
    setGenStatus({ phase: 'generating' })
    let result: { applied: number; months: number }
    try {
      result = await apiExtended.ai.generateCalendar({
        courseId: cal.id,
        contextText,
        maxDays: ai.maxDays,
        startDate: ai.startDateMode === 'today' ? undefined : ai.startDateMode === 'pick' ? ai.startDate : 'ai',
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

                {/* Start date selector */}
                <div className="bg-white border border-ink-900/10 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-3.5 h-3.5 text-sage" />
                    <span className="font-body text-xs font-semibold text-ink-700 uppercase tracking-wide">When to start planning</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { mode: 'today', label: 'Start today',      detail: 'Begin planning from ' + format(new Date(), 'MMM d') },
                      { mode: 'pick',  label: 'Pick a date',       detail: 'Choose a specific start date' },
                      { mode: 'ai',    label: 'Let AI decide',     detail: 'AI picks based on your documents' },
                    ] as const).map(opt => (
                      <button key={opt.mode} type="button"
                        onClick={() => setAi(f => ({ ...f, startDateMode: opt.mode }))}
                        className={`text-left px-3 py-2.5 rounded-lg border transition-all ${ai.startDateMode === opt.mode ? 'border-sage bg-sage/8 ring-1 ring-sage/30' : 'border-ink-900/10 bg-ink-50/40 hover:border-ink-900/20'}`}>
                        <div className="font-body text-sm font-medium text-ink-800">{opt.label}</div>
                        <div className="font-body text-[11px] text-ink-400 mt-0.5">{opt.detail}</div>
                      </button>
                    ))}
                  </div>
                  {ai.startDateMode === 'pick' && (
                    <input type="date" value={ai.startDate}
                      onChange={e => setAi(f => ({ ...f, startDate: e.target.value }))}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="input-field text-sm py-2 w-full" />
                  )}
                  {ai.startDateMode === 'ai' && (
                    <p className="font-body text-[11px] text-ink-500 bg-sage/5 border border-sage/15 rounded-lg px-3 py-2">
                      The AI will look at your school calendar, syllabbus, and context to pick the best start date automatically.
                    </p>
                  )}
                </div>

                {/* Document fields */}
                {letAiDecideBlocked && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body text-xs text-amber-700">
                      <strong>School calendar required.</strong> Paste or upload your school calendar below so the AI can pick the best start date.
                    </p>
                  </div>
                )}
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
                      <label className="flex items-center gap-2 px-3 py-2 bg-white border border-dashed rounded-lg cursor-pointer group w-full border-ink-900/20 hover:border-sage/60">
                        <Upload className="w-3.5 h-3.5 flex-shrink-0 text-ink-400 group-hover:text-sage" />
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
                    <button onClick={handleCreateWithAI} disabled={!canGenerate || letAiDecideBlocked}
                      className={`btn-sage px-7 gap-2 ${!canGenerate || letAiDecideBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
  const [todayEvents, setTodayEvents] = useState<CalEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

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
      setEventsLoading(false)
      return
    }
    api.calendars.list()
      .then(data => setCalendars(data))
      .catch(err => console.error('Failed to load calendars:', err))
      .finally(() => setCalsLoading(false))
  }, [user])

  // Load today's events
  useEffect(() => {
    if (!user || user.id.startsWith('demo-')) return
    const month = format(new Date(), 'yyyy-MM')
    const todayStr = format(new Date(), 'yyyy-MM-dd')

    Promise.all([api.events.list(month), api.calendars.list().catch(() => [] as any[])])
      .then(([events, cals]) => {
        // Build period label → calendar id for enrichment/filtering
        const periodToCalId: Record<string, string> = {}
        ;(cals as any[]).forEach((cal: any) => {
          if (cal.period) periodToCalId[cal.period.trim()] = cal.id
        })

        // Deduplicate by startTime+endTime+title — keep base event over repeat instances
        const seen = new Set<string>()
        const upcoming = events
          .filter(e => e.date === todayStr)
          // Filter out stale period events (weekly sage events whose calendar was deleted)
          .filter(e => {
            if (e.color === 'sage' && (e as any).repeatRule === 'weekly') {
              const matchingPeriod = Object.keys(periodToCalId).find(label =>
                e.title === label || e.title.startsWith(label + ' (')
              )
              return !!matchingPeriod
            }
            return true
          })
          .sort((a, b) => {
            const aIsRepeat = String(a.id).includes('__')
            const bIsRepeat = String(b.id).includes('__')
            if (aIsRepeat && !bIsRepeat) return 1
            if (!aIsRepeat && bIsRepeat) return -1
            if (a.allDay && !b.allDay) return -1
            if (!a.allDay && b.allDay) return 1
            return (a.startTime || '00:00').localeCompare(b.startTime || '00:00')
          })
          .filter(e => {
            const key = `${e.startTime || 'allday'}__${e.endTime || ''}__${e.title}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
        setTodayEvents(upcoming)
      })
      .catch(() => {})
      .finally(() => setEventsLoading(false))
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
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-cream-100" />
            </div>
            <span className="font-display text-lg text-ink-900">Calendar AI</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/profile" className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-ink-900/5">
              <User className="w-4 h-4" />Profile
            </Link>
            <button onClick={handleSignOut} className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors px-3 py-1.5 rounded-lg hover:bg-ink-900/5">
              <LogOut className="w-4 h-4" />Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10 page-enter">
        <div className="mb-8">
          <h1 className="font-display text-5xl text-ink-900 mb-1">{user?.fullName || 'My Dashboard'}</h1>
          <p className="font-body text-base text-ink-400">{user?.schoolName || ''}</p>
        </div>

        {/* Side-by-side panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── My Schedule (today's events) ── */}
          <div className="card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-900/8">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-ink-400" />
                <h2 className="font-body font-semibold text-sm text-ink-900">My Schedule</h2>
                <span className="font-body text-xs text-ink-400 bg-ink-900/6 px-2 py-0.5 rounded-full">Today</span>
              </div>
              <Link href="/app/schedule" className="btn-sage py-1.5 px-3 text-xs gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />Full Calendar
              </Link>
            </div>
            <div className="flex-1 px-6 py-4">
              {eventsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 text-sage animate-spin" />
                </div>
              ) : todayEvents.length === 0 ? (
                <div className="text-center py-8">
                  <p className="font-body text-sm text-ink-400 mb-1">No events today</p>
                  <Link href="/app/schedule" className="font-body text-xs text-sage hover:underline">
                    View full schedule →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayEvents.map(ev => {
                    // Enrich period events with calendarId for the "Open →" link
                    const isPeriod = ev.color === 'sage' && (ev as any).repeatRule === 'weekly'
                    const periodCalId = isPeriod ? (() => {
                      const cals = calendars
                      const match = cals.find(cal => cal.period && (ev.title === cal.period || ev.title.startsWith(cal.period + ' (')))
                      return match?.id
                    })() : undefined
                    return (
                      <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-ink-900/5 last:border-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPeriod ? 'bg-sage' : ev.color === 'amber' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm text-ink-900 truncate">{ev.title}</p>
                          {ev.allDay ? (
                            <p className="font-body text-xs text-ink-400">All day</p>
                          ) : ev.startTime ? (
                            <p className="font-body text-xs text-ink-400">
                              {fmt12(ev.startTime)}{ev.endTime ? ` – ${fmt12(ev.endTime)}` : ''}
                            </p>
                          ) : null}
                        </div>
                        {isPeriod && periodCalId && (
                          <Link href={`/app/calendar/${periodCalId}`}
                            className="font-body text-[11px] text-sage hover:text-sage-700 transition-colors whitespace-nowrap">
                            Open →
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── My Calendars ── */}
          <div className="card overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-900/8">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-ink-400" />
                <h2 className="font-body font-semibold text-sm text-ink-900">My Calendars</h2>
                <span className="font-mono text-xs text-ink-400 bg-ink-900/6 px-1.5 py-0.5 rounded">{calendars.length}</span>
              </div>
              <button onClick={() => setShowCreate(true)} className="btn-sage py-1.5 px-3 text-xs gap-1.5">
                <Plus className="w-3.5 h-3.5" />Create
              </button>
            </div>
            {calsLoading ? (
              <div className="py-16 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-sage animate-spin" />
              </div>
            ) : sortedCalendars.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 bg-sage/10 rounded-2xl flex items-center justify-center mb-3">
                  <Calendar className="w-5 h-5 text-sage" />
                </div>
                <p className="font-body text-sm font-medium text-ink-700 mb-1">No calendars yet.</p>
                <p className="font-body text-xs text-ink-400 mb-4">Create your first course calendar.</p>
                <button onClick={() => setShowCreate(true)} className="btn-sage gap-1.5 text-sm py-2">
                  <Plus className="w-3.5 h-3.5" />Create calendar
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {sortedCalendars.map(cal => (
                  <CalendarCard key={cal.id} cal={cal} onDelete={handleDelete} onClone={setCloneSource} />
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      {showCreate && <CreateCalendarModal onClose={() => setShowCreate(false)} onCreated={handleCreated} takenPeriods={calendars.map(c => c.period)} />}
      {cloneSource && <CloneModal source={cloneSource} onClose={() => setCloneSource(null)} onCloned={handleCloned} takenPeriods={calendars.map(c => c.period)} />}
    </div>
  )
}