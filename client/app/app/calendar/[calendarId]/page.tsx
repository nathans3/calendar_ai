'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Sparkles, X,
  Home, List, ListOrdered, Palette, CalendarDays,
  Clock, Download, Check, Loader2, WifiOff,
  RotateCcw, CheckCheck, PanelRightClose, PanelRightOpen,
  Upload, FileText, Trash2, ChevronDown, Paperclip, Send
} from 'lucide-react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, addMonths, subMonths,
  addWeeks, subWeeks, parseISO, getMonth, getYear, setMonth, setYear
} from 'date-fns'
import { api, apiExtended, LessonData, AIDiff } from '../../../../lib/api'
import { useAuth } from '../../../../lib/useAuth'

// Strip markdown formatting from AI responses so no **bold**, ##headers, etc. appear
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')           // ## headers
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold**
    .replace(/\*(.+?)\*/g, '$1')         // *italic*
    .replace(/\_\_(.+?)\_\_/g, '$1')  // __bold__
    .replace(/\_(.+?)\_/g, '$1')        // _italic_
    .replace(/~~(.+?)~~/g, '$1')          // ~~strikethrough~~
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))  // `code`
    .replace(/^\s*[-*+]\s+/gm, '• ')    // bullet lists → bullet char
    .replace(/^\s*\d+\.\s+/gm, '')    // numbered lists — remove number
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')  // [links](url) → text only
    .replace(/\n{3,}/g, '\n\n')         // triple+ newlines → double
    .trim()
}


// ─── Types ────────────────────────────────────────────────
type ViewMode = 'month' | 'week'

// Priority tiers for AI context when deciding what to move/keep/delete
type PriorityTier = 1 | 2 | 3 | 4 | 5
const PRIORITY_LABELS: Record<PriorityTier, string> = {
  1: 'Critical',   // Finals, state exams, major projects
  2: 'High',       // Unit tests, essays, major assessments
  3: 'Medium',     // Quizzes, milestones, chapter reviews
  4: 'Standard',   // Regular lessons, classwork
  5: 'Low',        // Homework, notes, warm-ups
}
const PRIORITY_COLORS: Record<PriorityTier, string> = {
  1: 'text-red-700 bg-red-50 border-red-200',
  2: 'text-orange-700 bg-orange-50 border-orange-200',
  3: 'text-amber-700 bg-amber-50 border-amber-200',
  4: 'text-sage-700 bg-sage/10 border-sage/20',
  5: 'text-ink-500 bg-ink-50 border-ink-200',
}
// Default priority by content type
const DEFAULT_PRIORITY: Record<string, PriorityTier> = {
  assessments: 2,
  deadlines: 2,
  milestones: 3,
  lessonPlan: 4,
  hw: 5,
}

interface DayData {
  date: string
  lessonPlan: string
  deadlines: string
  milestones: string
  assessments: string
  hw: string
  notes: string           // special day notes: "❄ Snow Day", "No School", etc.
  priority?: PriorityTier  // overall day priority (highest of any field)
}

interface AIChange {
  id: string
  tool: string
  date: string
  field: string
  before: string
  after: string
  status: 'pending' | 'accepted' | 'declined'
  allArgs?: Record<string, any>
  moveRole?: 'source' | 'destination'  // for moveLesson: which side of the move this diff represents
}

// Message in AI chat — stores pre-change snapshot for revert
interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  changes?: AIChange[]
  snapshotBefore?: Record<string, DayData>
}

const DEMO_CALENDAR_INFO: Record<string, { name: string; period: string }> = {
  '1': { name: 'Algebra 2', period: 'Period 3' },
  '2': { name: 'AP Calculus BC', period: 'Period 1' },
  '3': { name: 'Precalculus', period: 'Period 5' },
}

function buildDemoData(): Record<string, DayData> {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  const off = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d }
  return {
    [fmt(today)]:   { date: fmt(today),   lessonPlan: 'Introduction to Quadratic Functions', deadlines: '', milestones: 'Unit 4 Begins', assessments: '', hw: 'Textbook p.34 #1–12', notes: '' },
    [fmt(off(1))]:  { date: fmt(off(1)),  lessonPlan: 'Factoring Quadratics',                deadlines: '', milestones: '', assessments: '', hw: 'Worksheet 4A', notes: '' },
    [fmt(off(2))]:  { date: fmt(off(2)),  lessonPlan: 'Completing the Square',               deadlines: '', milestones: '', assessments: 'Quiz 4.1', hw: '', notes: '' },
    [fmt(off(4))]:  { date: fmt(off(4)),  lessonPlan: 'The Quadratic Formula',               deadlines: '1984 Essay Due', milestones: '', assessments: '', hw: 'p.58 #1–20', notes: '' },
    [fmt(off(-1))]: { date: fmt(off(-1)), lessonPlan: 'Review: Polynomial Operations',       deadlines: '', milestones: '', assessments: '', hw: 'Study guide', notes: '' },
  }
}

const FIELD_LABELS: Record<string, string> = {
  lessonPlan: 'Lesson Plan', milestones: 'Milestone', assessments: 'Assessment',
  hw: 'Homework', deadlines: 'Deadline',
}

// ─── Date Picker ─────────────────────────────────────────
function DatePickerPopup({ currentDate, onSelect, onClose }: {
  currentDate: Date; onSelect: (d: Date) => void; onClose: () => void
}) {
  const [pm, setPm] = useState(new Date(currentDate))
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const years = Array.from({ length: 10 }, (_, i) => getYear(new Date()) - 2 + i)
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(pm), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(pm), { weekStartsOn: 0 }),
  })
  return (
    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-ink-900/12 rounded-2xl shadow-xl z-50 p-4 w-72">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setPm(subMonths(pm, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/6"><ChevronLeft className="w-3.5 h-3.5 text-ink-600" /></button>
        <div className="flex gap-1">
          <select value={getMonth(pm)} onChange={e => setPm(setMonth(pm, Number(e.target.value)))} className="font-body text-sm font-medium bg-transparent border-none focus:outline-none cursor-pointer">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={getYear(pm)} onChange={e => setPm(setYear(pm, Number(e.target.value)))} className="font-body text-sm font-medium bg-transparent border-none focus:outline-none cursor-pointer">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={() => setPm(addMonths(pm, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/6"><ChevronRight className="w-3.5 h-3.5 text-ink-600" /></button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => <div key={i} className="text-center font-body text-[10px] font-semibold text-ink-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map(day => {
          const sel = format(day, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd')
          return (
            <button key={format(day,'yyyy-MM-dd')} onClick={() => { onSelect(day); onClose() }}
              className={`w-full aspect-square flex items-center justify-center rounded-lg font-mono text-xs transition-all
                ${!isSameMonth(day, pm) ? 'text-ink-300' : 'text-ink-800 hover:bg-sage/15'}
                ${isToday(day) && !sel ? 'text-sage font-bold' : ''}
                ${sel ? 'bg-sage text-white font-bold' : ''}`}>
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-ink-900/8 flex justify-between">
        <button onClick={() => { onSelect(new Date()); onClose() }} className="font-body text-xs text-sage font-medium">Today</button>
        <button onClick={onClose} className="font-body text-xs text-ink-400">Close</button>
      </div>
    </div>
  )
}

// ─── Export Modal ─────────────────────────────────────────
function ExportModal({ calendarName, period, dayData, onClose }: {
  calendarName: string; period: string; dayData: Record<string, DayData>; onClose: () => void
}) {
  const [rangeType, setRangeType] = useState<'week' | 'month' | 'custom'>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd]     = useState('')
  const [done, setDone]               = useState(false)

  const allDates = Object.keys(dayData).filter(d => {
    const d2 = dayData[d]
    return d2.lessonPlan || d2.assessments || d2.hw || d2.milestones || d2.deadlines || d2.notes
  }).sort()

  const getRange = () => {
    const now = new Date()
    if (rangeType === 'week') {
      const mon = startOfWeek(now, { weekStartsOn: 1 })
      const fri = new Date(mon); fri.setDate(fri.getDate() + 4)
      return { start: format(mon, 'yyyy-MM-dd'), end: format(fri, 'yyyy-MM-dd') }
    }
    if (rangeType === 'month') return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') }
    return { start: customStart || allDates[0] || '', end: customEnd || allDates[allDates.length - 1] || '' }
  }

  const handleExport = () => {
    setDone(true)
    const { start, end } = getRange()
    const filtered = allDates.filter(d => d >= start && d <= end)
    const rows = filtered.map(ds => {
      const d = dayData[ds]
      // Closed day — show only the closure reason
      if (d.notes) {
        return `<div class="day closed"><div class="day-header">${format(parseISO(ds), 'EEEE, MMMM d, yyyy')}</div>
          <div class="closed-label">${d.notes}</div>
        </div>`
      }
      return `<div class="day"><div class="day-header">${format(parseISO(ds), 'EEEE, MMMM d, yyyy')}</div>
        ${d.milestones  ? `<div class="lbl">MILESTONE</div><div class="val ms">${d.milestones}</div>` : ''}
        ${d.lessonPlan  ? `<div class="lbl">LESSON</div><div class="val">${d.lessonPlan.replace(/\n/g, '<br>')}</div>` : ''}
        ${d.assessments ? `<div class="lbl">ASSESSMENT</div><div class="val as">${d.assessments}</div>` : ''}
        ${d.hw          ? `<div class="lbl">HOMEWORK</div><div class="val">${d.hw}</div>` : ''}
        ${d.deadlines   ? `<div class="lbl">DEADLINE</div><div class="val dl">${d.deadlines}</div>` : ''}
      </div>`
    }).join('')
    const sd = start || new Date().toISOString().slice(0,10)
    const ed = end   || new Date().toISOString().slice(0,10)
    const rl = `${format(parseISO(sd), 'MMM d')} – ${format(parseISO(ed), 'MMM d, yyyy')}`
    setTimeout(() => {
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(`<!DOCTYPE html><html><head><title>${calendarName}</title>
        <style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#0D0D0D;padding:0 20px}
        h1{font-size:28px;margin-bottom:4px}.sub{color:#707060;font-size:14px}.rl{color:#7A9E7E;font-size:13px;font-weight:600;margin-bottom:32px}
        .day{margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #E8E8E0}.day-header{font-weight:700;font-size:15px;margin-bottom:8px}
        .lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#A0A090;margin-top:10px}
        .val{font-size:13px;margin:3px 0 0;line-height:1.5}.ms{color:#5a7d5e;font-weight:600}.as{color:#b45309;font-weight:600}.dl{color:#dc2626}
        .closed .day-header{color:#6b7280}.closed-label{font-size:13px;font-weight:600;color:#2563eb;margin-top:4px}
        @media print{body{margin:20px}}</style></head><body>
        <h1>${calendarName}</h1><div class="sub">${period}</div><div class="rl">${rl}</div>
        ${rows || '<p style="color:#A0A090">No lessons in this date range.</p>'}
        <p style="color:#A0A090;font-size:11px;margin-top:40px">Generated by Calendar AI</p>
        </body></html>`)
        w.document.close(); w.print()
      }
    }, 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2"><Download className="w-5 h-5 text-sage" /><h2 className="font-display text-xl text-ink-900">Export to Students</h2></div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-ink-900/6"><X className="w-4 h-4 text-ink-500" /></button>
        </div>
        {!done ? (
          <>
            <p className="font-body text-sm text-ink-500 mb-4 leading-relaxed">Export <strong className="text-ink-800">{calendarName}</strong> — lessons, homework, tests, and deadlines.</p>
            <div className="mb-5">
              <label className="font-body text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2 block">Date Range</label>
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {(['week','month','custom'] as const).map(t => (
                  <button key={t} onClick={() => setRangeType(t)}
                    className={`py-2 px-3 rounded-lg border text-xs font-body font-medium capitalize transition-all ${rangeType === t ? 'border-sage bg-sage/8 text-sage-800' : 'border-ink-900/10 text-ink-500 hover:border-ink-900/20'}`}>
                    {t === 'week' ? 'This Week' : t === 'month' ? 'This Month' : 'Custom'}
                  </button>
                ))}
              </div>
              {rangeType === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="font-body text-[10px] text-ink-400 mb-1 block">From</label><input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input-field text-xs py-1.5" /></div>
                  <div><label className="font-body text-[10px] text-ink-400 mb-1 block">To</label><input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input-field text-xs py-1.5" /></div>
                </div>
              )}
            </div>
            <div className="space-y-1.5 mb-6">
              {['Lesson topics','Homework assignments','Assessment dates','Milestones & deadlines'].map(i => (
                <div key={i} className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-sage" /><span className="font-body text-xs text-ink-600">{i}</span></div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1 justify-center text-sm py-2.5">Cancel</button>
              <button onClick={handleExport} className="btn-sage flex-1 justify-center text-sm py-2.5 gap-1.5"><Download className="w-3.5 h-3.5" />Export PDF</button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <div className="w-12 h-12 bg-sage/12 rounded-full flex items-center justify-center mx-auto mb-3"><Check className="w-6 h-6 text-sage" /></div>
            <p className="font-body text-sm text-ink-600 mb-4">PDF ready — check print preview.</p>
            <button onClick={onClose} className="btn-secondary w-full justify-center text-sm py-2.5">Done</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Top Nav ──────────────────────────────────────────────
function TopNav({ calendarName, period, currentDate, view, onViewChange, onToday, onPrev, onNext, aiOpen, onAiToggle, onDateSelect, onExport }: {
  calendarName: string; period: string; currentDate: Date; view: ViewMode
  onViewChange: (v: ViewMode) => void; onToday: () => void; onPrev: () => void; onNext: () => void
  aiOpen: boolean; onAiToggle: () => void; onDateSelect: (d: Date) => void; onExport: () => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-ink-900/8 z-30 relative">
      <div className="flex items-center gap-3">
        <Link href="/app" className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900"><Home className="w-4 h-4" /></Link>
        <div className="w-px h-4 bg-ink-900/15" />
        <div>
          <span className="font-display text-base text-ink-900">{calendarName}</span>
          <span className="font-body text-xs text-ink-400 ml-2 bg-ink-900/6 px-2 py-0.5 rounded-full">{period}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onToday} className="font-body text-xs font-medium text-ink-700 px-3 py-1.5 rounded-lg border border-ink-900/12 hover:border-ink-900/30 transition-all">Today</button>
        <div className="flex">
          <button onClick={onPrev} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/5"><ChevronLeft className="w-4 h-4 text-ink-600" /></button>
          <button onClick={onNext} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/5"><ChevronRight className="w-4 h-4 text-ink-600" /></button>
        </div>
        <div className="relative" ref={pickerRef}>
          <button onClick={() => setShowPicker(v => !v)} className={`font-body text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-ink-900/5 transition-colors ${showPicker ? 'text-sage' : 'text-ink-900'}`}>
            {format(currentDate, 'MMM yyyy')}
          </button>
          {showPicker && <DatePickerPopup currentDate={currentDate} onSelect={d => { onDateSelect(d); setShowPicker(false) }} onClose={() => setShowPicker(false)} />}
        </div>
        <button onClick={() => onViewChange(view === 'month' ? 'week' : 'month')}
          className="font-body text-xs font-medium text-ink-700 px-3 py-1.5 rounded-lg border border-ink-900/12 hover:border-ink-900/30 transition-all min-w-[60px] text-center">
          {view === 'month' ? 'Month' : 'Week'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onExport} className="font-body text-xs font-medium text-ink-700 px-3 py-1.5 rounded-lg border border-ink-900/12 hover:border-ink-900/30 transition-all flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" />Export
        </button>
        <Link href="/app/schedule" className="font-body text-xs font-medium text-ink-700 px-3 py-1.5 rounded-lg border border-ink-900/12 hover:border-ink-900/30 transition-all flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />My Schedule
        </Link>
        <button onClick={onAiToggle} title={aiOpen ? 'Collapse sidebar' : 'Expand AI sidebar'}
          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${aiOpen ? 'bg-sage border-sage text-white shadow-md' : 'bg-white border-ink-900/20 text-ink-600 hover:border-sage/60'}`}>
          {aiOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── AIChangeCard — shown inline on calendar cells ────────
function AIChangeCard({ change, applying, onAccept, onDecline }: {
  change: AIChange; applying: boolean
  onAccept: () => void; onDecline: () => void
}) {
  // Derive a clear label based on tool and move role
  const isMove   = change.tool === 'moveLesson'
  const isDelete = change.tool === 'deleteLesson' || change.tool === 'clearDay'
  const isMark   = change.tool === 'markDay'
  const isSrc    = isMove && change.moveRole === 'source'
  const isDst    = isMove && change.moveRole === 'destination'

  const chipLabel = isSrc    ? `→ ${change.allArgs?.toDate}`
                  : isDst    ? `← ${change.allArgs?.fromDate}`
                  : isDelete ? 'DELETE'
                  : isMark   ? 'MARK DAY'
                  : (FIELD_LABELS[change.field] || change.field).toUpperCase()

  const chipColor = isSrc    ? 'text-orange-700 bg-orange-50 border-orange-200'
                  : isDst    ? 'text-blue-700 bg-blue-50 border-blue-200'
                  : isDelete ? 'text-red-700 bg-red-50 border-red-200'
                  : isMark   ? 'text-blue-700 bg-blue-50 border-blue-200'
                  : 'text-amber-700 bg-amber-50 border-amber-200'

  const cardColor = isSrc    ? 'bg-orange-50 border-orange-300/70'
                  : isDst    ? 'bg-blue-50 border-blue-300/70'
                  : isDelete ? 'bg-red-50 border-red-300/70'
                  : isMark   ? 'bg-blue-50 border-blue-300/70'
                  : 'bg-amber-50 border-amber-300/70'

  // Source cards show existing content struck through (visual deletion)
  // Destination and markDay cards show what will be written
  const previewText = isSrc ? change.before : change.after

  return (
    <div className={`mt-1 border rounded-lg px-2 py-1.5 ${cardColor}`}>
      <div className="flex items-center gap-1 mb-1">
        {isDelete ? <X className="w-2 h-2 text-red-500 flex-shrink-0" /> : <Sparkles className="w-2 h-2 text-amber-500 flex-shrink-0" />}
        <span className={`font-body text-[9px] font-bold uppercase tracking-wide px-1 rounded border ${chipColor}`}>{chipLabel}</span>
      </div>
      {/* Source diffs show existing content with strikethrough to make deletion visual */}
      {isSrc ? (
        <p className="font-body text-[10px] text-ink-400 leading-snug line-clamp-2 mb-1.5 line-through">{previewText}</p>
      ) : (
        <p className="font-body text-[10px] text-ink-800 leading-snug line-clamp-2 mb-1.5">{previewText}</p>
      )}
      <div className="flex gap-1">
        <button
          onClick={e => { e.stopPropagation(); onAccept() }}
          disabled={applying}
          className="flex-1 flex items-center justify-center gap-0.5 text-[9px] py-1 bg-sage/15 hover:bg-sage/25 text-sage-700 rounded font-semibold border border-sage/20 transition-colors">
          {applying ? <Loader2 className="w-2 h-2 animate-spin" /> : <Check className="w-2 h-2" />}Accept
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDecline() }}
          className="flex-1 flex items-center justify-center gap-0.5 text-[9px] py-1 bg-ink-900/4 hover:bg-red-50 text-ink-500 hover:text-red-600 rounded font-semibold border border-ink-900/8 transition-colors">
          <X className="w-2 h-2" />Pass
        </button>
      </div>
    </div>
  )
}

// ─── Monthly View ─────────────────────────────────────────
function MonthlyView({ currentDate, dayData, pendingChanges, applying, onDayClick, onAcceptChange, onDeclineChange, onDragMove }: {
  currentDate: Date; dayData: Record<string, DayData>
  pendingChanges: AIChange[]; applying: string | null
  onDayClick: (d: Date) => void
  onAcceptChange: (id: string) => void; onDeclineChange: (id: string) => void
  onDragMove: (fromDs: string, toDs: string) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd    = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
  const allDays    = eachDayOfInterval({ start: gridStart, end: gridEnd }).filter(d => d.getDay() !== 0 && d.getDay() !== 6)
  const weeks: Date[][] = []
  let week: Date[] = []
  allDays.forEach((d, i) => {
    week.push(d)
    if (week.length === 5 || i === allDays.length - 1) { weeks.push(week); week = [] }
  })

  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, ds: string) => {
    setDragging(ds)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ds)
  }

  const handleDragOver = (e: React.DragEvent, ds: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (ds !== dragging) setDragOver(ds)
  }

  const handleDrop = (e: React.DragEvent, toDs: string) => {
    e.preventDefault()
    const fromDs = e.dataTransfer.getData('text/plain')
    if (fromDs && fromDs !== toDs) onDragMove(fromDs, toDs)
    setDragging(null)
    setDragOver(null)
  }

  const handleDragEnd = () => { setDragging(null); setDragOver(null) }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-5 border-b border-ink-900/8 bg-white sticky top-0 z-10">
        {['Mon','Tue','Wed','Thu','Fri'].map(d => (
          <div key={d} className="py-2.5 text-center"><span className="font-body text-xs font-medium text-ink-400 uppercase tracking-wide">{d}</span></div>
        ))}
      </div>
      {weeks.map((weekDays, wi) => (
        <div key={wi} className="grid grid-cols-5" style={{ minHeight: '130px' }}>
          {weekDays.map(day => {
            const ds = format(day, 'yyyy-MM-dd')
            const data = dayData[ds]
            const inMonth  = isSameMonth(day, currentDate)
            const todayDay = isToday(day)
            const dayPending = pendingChanges.filter(c => c.date === ds && c.status === 'pending')
            const hasPending = dayPending.length > 0
            const isDraggingThis = dragging === ds
            const isDragTarget   = dragOver === ds
            const hasContent = data && (data.lessonPlan || data.assessments || data.milestones || data.hw || data.deadlines || data.notes)
            return (
              <div key={ds}
                draggable={!!hasContent}
                onDragStart={e => handleDragStart(e, ds)}
                onDragOver={e => handleDragOver(e, ds)}
                onDrop={e => handleDrop(e, ds)}
                onDragEnd={handleDragEnd}
                onClick={() => onDayClick(day)}
                className={`border-r border-b border-ink-900/6 last:border-r-0 p-2 cursor-pointer transition-colors relative flex flex-col
                  ${isDraggingThis ? 'opacity-40 ring-2 ring-inset ring-sage/50' : ''}
                  ${isDragTarget ? '!bg-sage/12 ring-2 ring-inset ring-sage/50' : ''}
                  ${!isDraggingThis && !isDragTarget && data?.notes ? '!bg-blue-50/60' : ''}
                  ${!isDraggingThis && !isDragTarget && inMonth && !data?.notes ? 'bg-white hover:bg-cream-50' : ''}
                  ${!isDraggingThis && !isDragTarget && !inMonth ? 'bg-ink-50/40 opacity-60' : ''}
                  ${!isDraggingThis && !isDragTarget && todayDay && !hasPending && !data?.notes ? '!bg-sage/5 hover:!bg-sage/8' : ''}
                  ${!isDraggingThis && !isDragTarget && hasPending && !todayDay ? '!bg-amber-50/40' : ''}
                  ${!isDraggingThis && !isDragTarget && hasPending && todayDay ? '!bg-amber-50/60' : ''}`}>
                {hasPending && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-400 rounded-r" />}
                {data?.notes && !isDragTarget && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-400 rounded-r" />}
                {isDragTarget && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-sage rounded-r" />}
                <div className="flex justify-between items-start mb-1">
                  <span className={`font-mono text-xs w-6 h-6 flex items-center justify-center rounded-full ${todayDay ? 'bg-sage text-white font-bold' : 'text-ink-500'}`}>{format(day, 'd')}</span>
                  <div className="flex items-center gap-1">
                    {hasContent && !hasPending && (
                      <span className="text-[8px] text-ink-300 select-none cursor-grab active:cursor-grabbing" title="Drag to move this day's content">⠿</span>
                    )}
                    {hasPending && (
                      <span className="text-[8px] font-bold text-amber-600 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Sparkles className="w-2 h-2" />{dayPending.length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {data?.notes      && <div className="event-pill truncate bg-blue-100 text-blue-800 border-blue-200">{data.notes}</div>}
                  {!data?.notes && data?.milestones  && <div className="event-pill event-pill-milestone truncate">{data.milestones}</div>}
                  {!data?.notes && data?.assessments && <div className="event-pill event-pill-assessment truncate">{data.assessments}</div>}
                  {!data?.notes && data?.lessonPlan  && <div className="event-pill event-pill-lesson truncate">{data.lessonPlan.split('\n')[0]}</div>}
                  {!data?.notes && data?.hw          && <div className="event-pill event-pill-hw truncate">HW: {data.hw}</div>}
                </div>
                {dayPending.slice(0, 2).map(c => (
                  <AIChangeCard key={c.id} change={c} applying={applying === c.id}
                    onAccept={() => onAcceptChange(c.id)} onDecline={() => onDeclineChange(c.id)} />
                ))}
                {dayPending.length > 2 && (
                  <p className="font-body text-[9px] text-amber-600 mt-1 text-center">+{dayPending.length - 2} more on this day</p>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─── Rich Toolbar ─────────────────────────────────────────
function RichToolbar({ visible }: { visible: boolean }) {
  const [showColors, setShowColors] = useState(false)

  // IMPORTANT: use onMouseDown + e.preventDefault() so the toolbar button click
  // does NOT steal focus away from the contentEditable before execCommand runs.
  const exec = (e: React.MouseEvent, cmd: string, val?: string) => {
    e.preventDefault()
    document.execCommand(cmd, false, val)
  }

  const colors = ['#0D0D0D','#7A9E7E','#D4860A','#3B82F6','#EF4444','#8B5CF6','#EC4899']
  if (!visible) return null
  return (
    <div className="floating-toolbar">
      <button onMouseDown={e => exec(e, 'bold')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 font-bold text-cream-100 text-sm">B</button>
      <button onMouseDown={e => exec(e, 'italic')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 italic text-cream-100 text-sm">I</button>
      <button onMouseDown={e => exec(e, 'underline')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 underline text-cream-100 text-sm">U</button>
      <div className="w-px h-5 bg-white/20" />
      <button onMouseDown={e => exec(e, 'insertUnorderedList')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15"><List className="w-3.5 h-3.5 text-cream-200" /></button>
      <button onMouseDown={e => exec(e, 'insertOrderedList')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15"><ListOrdered className="w-3.5 h-3.5 text-cream-200" /></button>
      <div className="w-px h-5 bg-white/20" />
      <div className="relative">
        <button onMouseDown={e => { e.preventDefault(); setShowColors(v => !v) }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15"><Palette className="w-3.5 h-3.5 text-cream-200" /></button>
        {showColors && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl p-2 flex gap-1.5 border border-ink-900/10 z-50">
            {colors.map(c => <button key={c} onMouseDown={e => { exec(e, 'foreColor', c); setShowColors(false) }} className="w-5 h-5 rounded-full border border-white/80 shadow-sm hover:scale-125 transition-transform" style={{ backgroundColor: c }} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Priority Badge + Picker ──────────────────────────────
function PriorityBadge({ priority, onChange }: {
  priority: PriorityTier
  onChange: (p: PriorityTier) => void
}) {
  const [open, setOpen] = useState(false)
  const label = PRIORITY_LABELS[priority]
  const color = PRIORITY_COLORS[priority]
  return (
    <div className="relative inline-block">
      <button
        onMouseDown={e => { e.preventDefault(); setOpen(v => !v) }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-all ${color}`}
        title="Set priority">
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 flex-shrink-0" />
        {label}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white rounded-xl shadow-xl border border-ink-900/10 py-1 min-w-[120px]">
          {([1,2,3,4,5] as PriorityTier[]).map(t => (
            <button key={t} onMouseDown={e => { e.preventDefault(); onChange(t); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold hover:bg-ink-50 transition-colors ${priority === t ? 'bg-ink-50' : ''}`}>
              <span className={`w-2 h-2 rounded-full border ${PRIORITY_COLORS[t]}`} />
              <span className={priority === t ? 'text-ink-900' : 'text-ink-600'}>{PRIORITY_LABELS[t]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ContentField ─────────────────────────────────────────
// A contentEditable field that sets initial content via ref (not dangerouslySetInnerHTML)
// so React re-renders never reset the cursor position.
function ContentField({ value, placeholder, onChange, onFocus }: {
  value: string
  placeholder: string
  onChange: (v: string) => void
  onFocus: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastExternal = useRef<string>(value)

  // Only push value into the DOM when it changes from OUTSIDE (e.g. AI accept, load).
  // Never overwrite while the user is actively typing in this element.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (value !== lastExternal.current) {
      lastExternal.current = value
      // Only update DOM if the element doesn't currently have focus
      if (document.activeElement !== el) {
        el.innerText = value || ''
      }
    }
  }, [value])

  // Set initial content on mount only
  useEffect(() => {
    if (ref.current) {
      ref.current.innerText = value || ''
      lastExternal.current = value
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onFocus={onFocus}
      onInput={e => {
        const text = (e.target as HTMLDivElement).innerText
        lastExternal.current = text
        onChange(text)
      }}
      className="w-full text-xs font-body text-ink-800 bg-transparent focus:outline-none leading-relaxed min-h-[20px] empty:before:content-[attr(data-placeholder)] empty:before:text-ink-300 empty:before:pointer-events-none"
      style={{ whiteSpace: 'pre-wrap' }}
    />
  )
}
function DayColumn({ day, data, focused, dayPending, applying, onFocus, onClose, onChange, onFieldFocus, onAcceptChange, onDeclineChange, onRescheduleRequest }: {
  day: Date; data: DayData; focused: boolean
  dayPending: AIChange[]; applying: string | null
  onFocus: () => void; onClose: () => void
  onChange: (field: keyof DayData, value: string | PriorityTier) => void
  onFieldFocus: () => void
  onAcceptChange: (id: string) => void; onDeclineChange: (id: string) => void
  onRescheduleRequest?: (dateStr: string, reason: string) => void
}) {
  const fields: { key: keyof DayData; label: string; placeholder: string }[] = [
    { key: 'lessonPlan',  label: 'Lesson Plan',  placeholder: 'What are you teaching today?' },
    { key: 'deadlines',   label: 'Deadlines',    placeholder: '1984 Essay Due' },
    { key: 'milestones',  label: 'Milestones',   placeholder: 'Unit 4 starts' },
    { key: 'assessments', label: 'Assessments',  placeholder: 'Ch 5 Quiz' },
    { key: 'hw',          label: 'HW',           placeholder: 'Quadratics HW' },
    { key: 'notes',       label: 'Day Note',     placeholder: 'e.g. ❄ Snow Day, Field Trip, No School' },
  ]
  const pendingHere = dayPending.filter(c => c.status === 'pending')
  const hasPending  = pendingHere.length > 0
  const isClosed    = !!(data.notes && data.notes.trim())

  // Determine default priority based on what content exists
  const effectivePriority: PriorityTier = data.priority ?? (
    data.assessments ? DEFAULT_PRIORITY.assessments :
    data.deadlines   ? DEFAULT_PRIORITY.deadlines :
    data.milestones  ? DEFAULT_PRIORITY.milestones :
    data.lessonPlan  ? DEFAULT_PRIORITY.lessonPlan : 4
  )

  return (
    <div className={`border-r border-ink-900/8 last:border-r-0 flex flex-col flex-1 relative
      ${hasPending ? 'border-t-2 border-t-amber-400' : ''}
      ${isClosed ? '!bg-blue-50/70' : ''}`}
      onClick={!focused ? onFocus : undefined}>
      <div className={`flex items-center justify-between px-3 py-3 border-b border-ink-900/8 sticky top-0 z-10
        ${isClosed ? 'bg-blue-100/60' : isToday(day) ? 'bg-sage/8' : hasPending ? 'bg-amber-50/60' : 'bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className="font-body text-xs font-medium text-ink-500 uppercase">{format(day, 'EEE')}</span>
          <span className={`font-mono text-sm w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-sage text-white' : 'text-ink-800'}`}>{format(day, 'd')}</span>
          {isClosed && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-200">
              🚫 Closed
            </span>
          )}
          {!isClosed && hasPending && (
            <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5" />{pendingHere.length} AI
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {focused && !isClosed && <PriorityBadge priority={effectivePriority} onChange={p => onChange('priority', p)} />}
          {focused && <button onClick={e => { e.stopPropagation(); onClose() }} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-ink-900/8"><X className="w-3.5 h-3.5 text-ink-500" /></button>}
        </div>
      </div>
      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {/* AI suggestion cards at top of day */}
        {pendingHere.map(c => (
          <AIChangeCard key={c.id} change={c} applying={applying === c.id}
            onAccept={() => onAcceptChange(c.id)} onDecline={() => onDeclineChange(c.id)} />
        ))}

        {/* ── Closed-day banner ── */}
        {isClosed ? (
          <div className="flex flex-col gap-3">
            <div className="bg-blue-100 border border-blue-200 rounded-xl px-3 py-4 text-center">
              <div className="text-2xl mb-1">🚫</div>
              <p className="font-body text-sm font-semibold text-blue-800">{data.notes}</p>
              <p className="font-body text-[10px] text-blue-600 mt-1">No events can be scheduled on this day.</p>
            </div>
            {/* Allow editing the Day Note field to rename/clear the closure */}
            <div onClick={e => e.stopPropagation()}>
              <div className="font-body text-[10px] font-semibold text-ink-400 uppercase tracking-widest mb-1">Day Note (edit to rename or clear)</div>
              <ContentField
                value={data.notes || ''}
                placeholder="e.g. ❄ Snow Day, Field Trip, No School"
                onChange={v => onChange('notes', v)}
                onFocus={() => { onFieldFocus(); if (!focused) onFocus() }}
              />
            </div>
            {/* Reschedule button */}
            {onRescheduleRequest && (
              <button
                onClick={e => { e.stopPropagation(); onRescheduleRequest(format(day, 'yyyy-MM-dd'), data.notes) }}
                className="w-full text-[10px] py-2 bg-sage/15 hover:bg-sage/25 text-sage-700 rounded-lg font-semibold border border-sage/20 transition-colors flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" />Ask AI to reschedule this day's events
              </button>
            )}
          </div>
        ) : (
          /* Editable fields — only shown when day is not closed */
          fields.map(({ key, label, placeholder }) => (
            <div key={key} onClick={e => e.stopPropagation()}>
              <div className="font-body text-[10px] font-semibold text-ink-400 uppercase tracking-widest mb-1">{label}</div>
              <ContentField
                value={data[key as keyof DayData] as string || ''}
                placeholder={placeholder}
                onChange={v => onChange(key, v)}
                onFocus={() => { onFieldFocus(); if (!focused) onFocus() }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Weekly View ──────────────────────────────────────────
function WeeklyView({ currentDate, dayData, pendingChanges, applying, onDayDataChange, onAcceptChange, onDeclineChange, onRescheduleRequest, onDragMove }: {
  currentDate: Date; dayData: Record<string, DayData>
  pendingChanges: AIChange[]; applying: string | null
  onDayDataChange: (dateStr: string, field: keyof DayData, value: string | PriorityTier) => void
  onAcceptChange: (id: string) => void; onDeclineChange: (id: string) => void
  onRescheduleRequest?: (dateStr: string, reason: string) => void
  onDragMove: (fromDs: string, toDs: string) => void
}) {
  const [focusedDate, setFocusedDate] = useState<string | null>(null)
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const days = Array.from({ length: 5 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setFocusedDate(null); setToolbarVisible(false) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  const getOrCreate = (ds: string): DayData =>
    dayData[ds] || { date: ds, lessonPlan: '', deadlines: '', milestones: '', assessments: '', hw: '', notes: '' }

  const handleDragStart = (e: React.DragEvent, ds: string) => {
    setDragging(ds)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ds)
  }
  const handleDragOver = (e: React.DragEvent, ds: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (ds !== dragging) setDragOver(ds)
  }
  const handleDrop = (e: React.DragEvent, toDs: string) => {
    e.preventDefault()
    const fromDs = e.dataTransfer.getData('text/plain')
    if (fromDs && fromDs !== toDs) onDragMove(fromDs, toDs)
    setDragging(null)
    setDragOver(null)
  }
  const handleDragEnd = () => { setDragging(null); setDragOver(null) }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-y-auto">
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const isFocused = focusedDate === ds
          const isDraggingThis = dragging === ds
          const isDragTarget = dragOver === ds
          const data = getOrCreate(ds)
          const hasContent = data.lessonPlan || data.assessments || data.milestones || data.hw || data.deadlines || data.notes
          if (focusedDate && !isFocused) return null
          return (
            <div
              key={ds}
              className={`border-r border-ink-900/8 last:border-r-0 flex-1 flex flex-col relative transition-all
                ${isDraggingThis ? 'opacity-40' : ''}
                ${isDragTarget ? 'ring-2 ring-inset ring-sage/50 bg-sage/5' : ''}`}
              onDragOver={e => handleDragOver(e, ds)}
              onDrop={e => handleDrop(e, ds)}
            >
              {/* Drag handle banner at top of column */}
              {!isFocused && (
                <div
                  draggable={!!hasContent}
                  onDragStart={e => { e.stopPropagation(); handleDragStart(e, ds) }}
                  onDragEnd={e => { e.stopPropagation(); handleDragEnd() }}
                  className={`absolute top-0 right-1 z-20 ${hasContent ? 'cursor-grab active:cursor-grabbing' : 'opacity-0 pointer-events-none'}`}
                  title="Drag to move this day's content to another day"
                >
                  <span className="text-[10px] text-ink-300 hover:text-sage select-none px-1">⠿</span>
                </div>
              )}
              <DayColumn key={ds} day={day} data={data} focused={isFocused}
                dayPending={pendingChanges.filter(c => c.date === ds)}
                applying={applying}
                onFocus={() => setFocusedDate(ds)}
                onClose={() => { setFocusedDate(null); setToolbarVisible(false) }}
                onChange={(field, value) => onDayDataChange(ds, field, value)}
                onFieldFocus={() => setToolbarVisible(true)}
                onAcceptChange={onAcceptChange}
                onDeclineChange={onDeclineChange}
                onRescheduleRequest={onRescheduleRequest} />
            </div>
          )
        })}
      </div>
      <RichToolbar visible={toolbarVisible} />
    </div>
  )
}

// ─── Checkpoint Divider ───────────────────────────────────
function CheckpointDivider({ onRestore }: { onRestore: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="relative flex items-center justify-center py-2 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onRestore}>
      <div className={`absolute inset-x-0 h-px transition-colors duration-150 ${hovered ? 'bg-amber-400' : 'bg-ink-900/10'}`} />
      <div className={`relative flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold transition-all duration-150 select-none z-10
        ${hovered ? 'bg-amber-50 border border-amber-300 text-amber-700 shadow-sm' : 'opacity-0 pointer-events-none'}`}>
        <RotateCcw className="w-2.5 h-2.5" />Restore to here
      </div>
    </div>
  )
}

// ─── AI Sidebar ───────────────────────────────────────────
// All change state lives HERE. Changes are also surfaced on calendar cells via pendingChanges prop.
function AISidebar({
  selectedDate, onClearSelection, courseId, dayData,
  onApplyChange, onSetChanges, onRevert, onRefresh,
}: {
  selectedDate: Date | null
  onClearSelection: () => void
  courseId: string
  dayData: Record<string, DayData>
  onApplyChange: (dateStr: string, field: keyof DayData, value: string | PriorityTier) => void
  onSetChanges: (changes: AIChange[]) => void
  onRevert: (snapshot: Record<string, DayData>) => void
  onRefresh: () => void
}) {
  const [messages, setMessages]             = useState<AIMessage[]>([{
    id: '0', role: 'assistant',
    content: "Hi! I'm your AI assistant. I can help plan lessons, reschedule assessments, and optimize your semester pacing.\n\nSuggestions appear directly on the calendar — accept or decline them from any day cell. Select a date to focus, or just ask me anything.",
  }])
  const [input, setInput]                   = useState('')
  const [loading, setLoading]               = useState(false)
  const [attachedDocs, setAttachedDocs]     = useState<{ type: string; filename: string }[]>([])
  const [showDocPicker, setShowDocPicker]   = useState(false)
  const [applying, setApplying]             = useState<string | null>(null)
  const [expandedMsgs, setExpandedMsgs]     = useState<Record<string, boolean>>({})
  const [docsOpen, setDocsOpen]             = useState(false)
  const [docs, setDocs]                     = useState<{ type: string; filename: string; chunks: number; uploaded_at: string }[]>([])
  const [docUploading, setDocUploading]     = useState(false)
  const fileInputRef                        = useRef<HTMLInputElement>(null)

  // Fetch stored documents on mount
  useEffect(() => {
    apiExtended.upload.listDocuments(courseId).then(setDocs).catch(() => {})
  }, [courseId])

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setDocUploading(true)
    try {
      const docType = file.name.toLowerCase().includes('syllabus') ? 'syllabus'
        : file.name.toLowerCase().includes('calendar') ? 'school_calendar'
        : 'syllabus'
      await apiExtended.upload.document(courseId, docType, file)
      const updated = await apiExtended.upload.listDocuments(courseId)
      setDocs(updated)
    } catch (err: any) {
      alert(err.message || 'Upload failed')
    } finally {
      setDocUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDocDelete = async (type: string) => {
    try {
      await apiExtended.upload.deleteDocument(courseId, type)
      setDocs(prev => prev.filter(d => d.type !== type))
    } catch {}
  }

  const handleDocOpen = async (type: string, filename: string) => {
    // Try to open the original file first (served as correct MIME type)
    const fileUrl = apiExtended.upload.getDocumentFile(courseId, type)
    // We need auth headers — fetch with credentials and create an object URL
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cal_ai_token') : null
      const resp = await fetch(fileUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (resp.ok) {
        const blob = await resp.blob()
        const objUrl = URL.createObjectURL(blob)
        const win = window.open(objUrl, '_blank')
        // Revoke after a delay to allow the browser to load it
        setTimeout(() => URL.revokeObjectURL(objUrl), 60_000)
        if (win) return
      }
    } catch {}
    // Fall back: fetch raw text and render in a clean HTML page
    try {
      const { text } = await apiExtended.upload.getDocumentText(courseId, type)
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(
          `<!DOCTYPE html><html><head><title>${filename}</title>` +
          `<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 28px 60px;line-height:1.7;font-size:14px;color:#1a1a1a}` +
          `h1{font-size:18px;font-weight:600;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid #e5e5e5;color:#111}` +
          `pre{white-space:pre-wrap;word-break:break-word;background:#f7f7f5;padding:20px;border-radius:8px;font-size:13px}</style></head>` +
          `<body><h1>${filename}</h1><pre>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`
        )
        win.document.close()
      }
    } catch { alert('Could not load document.') }
  }
  const [conversationHistory, setConversationHistory] = useState<any[]>([])
  const bottomRef  = useRef<HTMLDivElement>(null)
  const dayDataRef = useRef(dayData)
  useEffect(() => { dayDataRef.current = dayData }, [dayData])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Push all changes (any status) to parent whenever messages change
  useEffect(() => {
    const all: AIChange[] = []
    for (const m of messages) { all.push(...(m.changes || [])) }
    onSetChanges(all)
  }, [messages, onSetChanges])

  // ── Core accept/decline logic ──────────────────────────
  const acceptChange = useCallback(async (changeId: string) => {
    let found: AIChange | undefined
    setMessages(prev => prev.map(m => ({
      ...m,
      changes: m.changes?.map(c => {
        if (c.id !== changeId) return c
        found = { ...c }
        return { ...c, status: 'accepted' as const }
      }),
    })))
    if (!found) return
    const c = found

    // For moveLesson: when accepting either the source or dest diff,
    // we need to find the paired diff and accept it too, then apply the DB op once.
    if (c.tool === 'moveLesson') {
      const pairedRole = c.moveRole === 'source' ? 'destination' : 'source'
      // Also mark paired diff as accepted
      setMessages(prev => prev.map(m => ({
        ...m,
        changes: m.changes?.map(ch => {
          if (ch.tool === 'moveLesson' &&
              ch.allArgs?.fromDate === c.allArgs?.fromDate &&
              ch.allArgs?.toDate === c.allArgs?.toDate &&
              ch.moveRole === pairedRole &&
              ch.status === 'pending') {
            return { ...ch, status: 'accepted' as const }
          }
          return ch
        }),
      })))
    }

    setApplying(changeId)
    try {
      const toolName: AIDiff['tool'] = ['createLesson','insertAssessment','moveLesson','clearDay','deleteLesson','markDay'].includes(c.tool)
        ? (c.tool as AIDiff['tool']) : 'createLesson'

      const isMove    = c.tool === 'moveLesson'
      const isMoveSrc = isMove && c.moveRole === 'source'
      const isMoveDst = isMove && c.moveRole === 'destination'

      // For moveLesson: always fire the DB write, always using 'source' role
      // so applyChangesToDb performs the actual move (not a no-op skip).
      await apiExtended.ai.applyChanges(courseId, [{
        id: c.id,
        tool: toolName,
        date: c.date,
        field: c.field,
        before: c.before,
        after: c.after,
        status: 'accepted',
        allArgs: c.allArgs,
        // Override moveRole to 'source' so the backend move logic always runs
        moveRole: isMove ? 'source' : c.moveRole,
      }])

      if (isMoveSrc || isMoveDst) {
        // Use embedded sourceContent (snapshotted at suggestion time) — reliable regardless
        // of whether source or destination card was clicked first
        const args = c.allArgs || {}
        const sc = (args.sourceContent || {}) as Record<string, string>
        const fields: (keyof DayData)[] = (args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']) as (keyof DayData)[]
        for (const field of fields) {
          const val = sc[field as string]
          if (val) onApplyChange(args.toDate, field, val)
          onApplyChange(args.fromDate, field, '')
        }
        if (args.closureReason) onApplyChange(args.fromDate, 'notes', args.closureReason)
      } else if (c.tool === 'deleteLesson') {
        const args = c.allArgs || {}
        const fields: (keyof DayData)[] = (args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']) as (keyof DayData)[]
        for (const field of fields) {
          onApplyChange(c.date, field, '')
        }
      } else if (c.tool === 'clearDay') {
        for (const field of ['lessonPlan','assessments','hw','deadlines','milestones'] as (keyof DayData)[]) {
          onApplyChange(c.date, field, '')
        }
      } else if (c.tool === 'markDay') {
        onApplyChange(c.date, 'notes', c.after)
        for (const field of ['lessonPlan','assessments','hw','deadlines','milestones'] as (keyof DayData)[]) {
          onApplyChange(c.date, field, '')
        }
        onRefresh()
      } else {
        const field = c.field as keyof DayData
        if (['lessonPlan','deadlines','milestones','assessments','hw','notes'].includes(field)) {
          onApplyChange(c.date, field, c.after)
        }
      }
    } catch {
      setMessages(prev => prev.map(m => ({
        ...m,
        changes: m.changes?.map(c2 => c2.id === changeId ? { ...c2, status: 'pending' as const } : c2),
      })))
    } finally {
      setApplying(null)
    }
  }, [courseId, onApplyChange, onRefresh])

  const declineChange = useCallback((changeId: string) => {
    setMessages(prev => prev.map(m => ({
      ...m,
      changes: m.changes?.map(c => c.id === changeId ? { ...c, status: 'declined' as const } : c),
    })))
  }, [])

  // Accept ALL pending changes in a message at once — marks then applies batch
  const acceptAllInMessage = useCallback(async (msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    const toAccept = (msg?.changes || []).filter(c => c.status === 'pending')
    if (toAccept.length === 0) return

    // Mark all accepted in one synchronous state update
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      return { ...m, changes: m.changes?.map(c => c.status === 'pending' ? { ...c, status: 'accepted' as const } : c) }
    }))

    // Apply all to DB + calendar
    setApplying('bulk')
    for (const c of toAccept) {
      try {
        const toolName: AIDiff['tool'] = ['createLesson','insertAssessment','moveLesson','clearDay','deleteLesson','markDay'].includes(c.tool)
          ? (c.tool as AIDiff['tool']) : 'createLesson'

        // Skip destination diffs for moves — the source diff handles the DB op
        if (c.tool === 'moveLesson' && c.moveRole === 'destination') continue

        await apiExtended.ai.applyChanges(courseId, [{
          id: c.id, tool: toolName, date: c.date, field: c.field,
          before: c.before, after: c.after, status: 'accepted', allArgs: c.allArgs,
        }])

        if (c.tool === 'moveLesson' && c.moveRole === 'source') {
          const args = c.allArgs || {}
          const sc = (args.sourceContent || {}) as Record<string, string>
          const fields: (keyof DayData)[] = (args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']) as (keyof DayData)[]
          for (const field of fields) {
            const val = sc[field as string]
            if (val) onApplyChange(args.toDate, field, val)
            onApplyChange(args.fromDate, field, '')
          }
          if (args.closureReason) onApplyChange(args.fromDate, 'notes', args.closureReason)
        } else if (c.tool === 'deleteLesson') {
          const args = c.allArgs || {}
          const fields: (keyof DayData)[] = (args.fields || ['lessonPlan','assessments','hw','deadlines','milestones']) as (keyof DayData)[]
          for (const field of fields) onApplyChange(c.date, field, '')
        } else if (c.tool === 'clearDay') {
          for (const field of ['lessonPlan','assessments','hw','deadlines','milestones'] as (keyof DayData)[]) {
            onApplyChange(c.date, field, '')
          }
        } else if (c.tool === 'markDay') {
          onApplyChange(c.date, 'notes', c.after)
          for (const field of ['lessonPlan','assessments','hw','deadlines','milestones'] as (keyof DayData)[]) {
            onApplyChange(c.date, field, '')
          }
        } else {
          const field = c.field as keyof DayData
          if (['lessonPlan','deadlines','milestones','assessments','hw','notes'].includes(field)) {
            onApplyChange(c.date, field, c.after)
          }
        }
      } catch (err) {
        console.error('Batch accept failed for change', c.id, err)
      }
    }
    // Refresh from DB to ensure everything is in sync after bulk accept
    onRefresh()
    setApplying(null)
  }, [messages, courseId, onApplyChange, onRefresh])

  // Revert calendar to snapshot AND remove all subsequent messages
  const revertToMessage = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg?.snapshotBefore) return
    onRevert(msg.snapshotBefore)
    // Remove this message and everything after it, also reset conversation history
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId)
      if (idx === -1) return prev
      return prev.slice(0, idx)
    })
    // Reset conversation history to before this message
    setConversationHistory(prev => {
      // Each AI message corresponds to 2 history entries (user + assistant)
      // Find the message index and slice the history accordingly
      const msgIdx = messages.findIndex(m => m.id === msgId)
      if (msgIdx <= 1) return []  // revert to very start
      // Count non-system messages before this one to determine history length
      const historyEntriesBeforeMsg = (msgIdx - 1) * 2  // -1 for the initial greeting
      return prev.slice(0, Math.max(0, historyEntriesBeforeMsg))
    })
  }, [messages, onRevert])

  // triggerReschedule: called by DayColumn's "reschedule this day" button.
  // Sends a message to the AI and shows pending suggestions on the calendar.
  const triggerReschedule = useCallback((dateStr: string, reason: string) => {
    const msg = `Please reschedule all events from ${dateStr} (${reason || 'closed day'}) to the next available open school day.`
    const userMsg: AIMessage = { id: Date.now().toString(), role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    apiExtended.ai.chat({
      message: msg,
      courseId,
      calendarContext: dayDataRef.current,
      selectedDate: dateStr,
      conversationHistory,
    }).then(res => {
      setConversationHistory(res.updatedHistory || [])
      const newChanges: AIChange[] = (res.changes || []).map((c: any) => ({
        ...c, status: 'pending' as const,
      }))
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: stripMarkdown(res.content || ''),
        changes: newChanges,
        snapshotBefore: newChanges.length > 0 ? JSON.parse(JSON.stringify(dayDataRef.current)) : undefined,
      } as AIMessage])
    }).catch(err => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: `Sorry, something went wrong: ${err.message || 'AI error'}. Please try again.`,
      } as AIMessage])
    }).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, conversationHistory])

  // Expose accept/decline/reschedule to parent for calendar cell buttons
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__calAI_accept      = acceptChange;
      (window as any).__calAI_decline     = declineChange;
      (window as any).__calAI_reschedule  = triggerReschedule;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptChange, declineChange, triggerReschedule])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: AIMessage = { id: Date.now().toString(), role: 'user', content: input.trim() }
    // Auto-decline any pending suggestions from previous messages that the user ignored
    setMessages(prev => prev.map(m => ({
      ...m,
      changes: m.changes?.map(c => c.status === 'pending' ? { ...c, status: 'declined' as const } : c),
    })))
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await apiExtended.ai.chat({
        message: userMsg.content,
        courseId,
        calendarContext: dayDataRef.current,
        selectedDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null,
        conversationHistory,
        attachedDocTypes: attachedDocs.length > 0 ? attachedDocs.map(d => d.type) : undefined,
      })
      setAttachedDocs([])
      setConversationHistory(res.updatedHistory || [])

      // All changes come back as 'pending' — the user previews them on the calendar
      // and taps Accept / Decline on each day cell before anything is written to the DB.
      const newChanges: AIChange[] = (res.changes || []).map((c: any) => ({
        ...c,
        status: 'pending',
      } as AIChange))

      const assistantMsg: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: stripMarkdown(res.content || ''),
        changes: newChanges,
        snapshotBefore: newChanges.length > 0 ? JSON.parse(JSON.stringify(dayDataRef.current)) : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, something went wrong: ${err.message || 'AI error'}. Please try again.`,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-80 flex flex-col bg-white border-l border-ink-900/10 h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-ink-900/8 bg-cream-50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-sage/15 rounded-lg flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-sage" /></div>
            <span className="font-display text-base text-ink-900">AI Assistant</span>
          </div>
        </div>
        {selectedDate && (
          <div className="flex items-center gap-1.5 bg-sage/10 border border-sage/20 rounded-full px-2.5 py-1 w-fit">
            <CalendarDays className="w-3 h-3 text-sage-600" />
            <span className="font-body text-xs text-sage-700 font-medium">{format(selectedDate, 'MMM d')}</span>
            <button onClick={onClearSelection} className="ml-1 text-sage/40 hover:text-sage-600"><X className="w-3 h-3" /></button>
          </div>
        )}
      </div>

      {/* Documents / RAG panel */}
      <div className="border-b border-ink-900/8">
        <button
          onClick={() => setDocsOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-cream-50 hover:bg-cream-100 transition-colors"
        >
          <span className="flex items-center gap-1.5 font-body text-xs font-semibold text-ink-700">
            <FileText className="w-3.5 h-3.5 text-ink-400" />
            Course Documents
            {docs.length > 0 && (
              <span className="ml-1 bg-sage/15 text-sage-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">{docs.length}</span>
            )}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${docsOpen ? 'rotate-180' : ''}`} />
        </button>

        {docsOpen && (
          <div className="px-4 pb-3 bg-cream-50 space-y-2">
            <p className="font-body text-[10px] text-ink-400 leading-snug">
              Upload syllabi, pacing guides, or school calendars. Use the 📎 button in the chat to attach one when you want the AI to reference it.
            </p>

            {/* Uploaded docs list */}
            {docs.length > 0 && (
              <div className="space-y-1">
                {docs.map(d => (
                  <div key={d.type} className="flex items-center gap-2 bg-white border border-ink-900/8 rounded-lg px-2.5 py-1.5 hover:border-sage/40 transition-colors">
                    <button
                      onClick={() => handleDocOpen(d.type, d.filename)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      title="Open document in new tab"
                    >
                      <FileText className="w-3 h-3 text-sage flex-shrink-0" />
                      <p className="font-body text-[10px] font-semibold text-ink-800 truncate hover:text-sage transition-colors">{d.filename}</p>
                    </button>
                    <button onClick={() => handleDocDelete(d.type)} className="text-ink-300 hover:text-red-500 transition-colors flex-shrink-0" title="Delete document">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleDocUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={docUploading}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] font-semibold font-body py-1.5 rounded-lg border border-dashed border-ink-900/20 text-ink-500 hover:border-sage hover:text-sage transition-colors disabled:opacity-50"
            >
              {docUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              {docUploading ? 'Processing…' : 'Upload PDF or text file'}
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-cream-50/30">
        {messages.map((msg, idx) => (
          <div key={msg.id}>
            {/* Checkpoint divider — only before assistant messages with snapshots */}
            {idx > 0 && msg.role === 'assistant' && msg.snapshotBefore && (
              <CheckpointDivider onRestore={() => revertToMessage(msg.id)} />
            )}

            <div className={idx > 0 ? 'mb-2' : 'mb-2'}>
              {msg.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="bg-sage text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%] shadow-sm">
                    <p className="font-body text-xs leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {msg.content && (
                    <div className="bg-white border border-ink-900/8 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                      <p className="font-body text-xs text-ink-800 leading-relaxed whitespace-pre-line">{msg.content}</p>
                    </div>
                  )}
                  {/* Change summary card */}
                  {msg.changes && msg.changes.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200/70 rounded-xl px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-body text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          {msg.changes.length} suggestion{msg.changes.length > 1 ? 's' : ''} on calendar
                        </span>
                        <span className="font-body text-[10px] text-amber-600">
                          {msg.changes.filter(c => c.status === 'pending').length} pending
                        </span>
                      </div>
                      {/* Date summary list — 4 visible by default, expandable */}
                      {(() => {
                        const allDates = Array.from(new Set(msg.changes.map(c => c.date))).filter(ds => ds && /^\d{4}-\d{2}-\d{2}$/.test(ds)).sort()
                        const isExpanded = !!expandedMsgs[msg.id]
                        const visible = isExpanded ? allDates : allDates.slice(0, 4)
                        const hidden = allDates.length - 4
                        return (
                          <>
                            {visible.map(ds => {
                              const dcs = msg.changes!.filter(c => c.date === ds)
                              const allAccepted = dcs.every(c => c.status === 'accepted')
                              const allDeclined = dcs.every(c => c.status === 'declined')
                              const dateObj = parseISO(ds)
                              const dateLabel = isNaN(dateObj.getTime()) ? ds : format(dateObj, 'MMM d')
                              return (
                                <div key={ds} className="flex items-center gap-1.5 text-[10px] font-body">
                                  <span className="font-semibold text-ink-800 w-14 flex-shrink-0">{dateLabel}</span>
                                  <span className="text-ink-500 flex-1 truncate">{dcs.map(c => FIELD_LABELS[c.field] || c.field).join(', ')}</span>
                                  {allAccepted && <span className="text-sage font-semibold flex-shrink-0">✓</span>}
                                  {allDeclined && <span className="text-ink-400 flex-shrink-0">✕</span>}
                                </div>
                              )
                            })}
                            {hidden > 0 && (
                              <button
                                onClick={() => setExpandedMsgs(prev => ({ ...prev, [msg.id]: !isExpanded }))}
                                className="text-[10px] font-body text-amber-600 hover:text-amber-700 font-medium text-left"
                              >
                                {isExpanded ? '▲ Show less' : `+${hidden} more date${hidden > 1 ? 's' : ''}`}
                              </button>
                            )}
                          </>
                        )
                      })()}
                      {/* Accept All button */}
                      {msg.changes.filter(c => c.status === 'pending').length > 1 && (
                        <button onClick={() => acceptAllInMessage(msg.id)} disabled={applying === 'bulk'}
                          className="w-full mt-1 text-[10px] py-1.5 bg-sage text-white rounded-lg font-semibold hover:bg-sage-600 flex items-center justify-center gap-1 transition-colors disabled:opacity-60">
                          {applying === 'bulk' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                          Accept All ({msg.changes.filter(c => c.status === 'pending').length})
                        </button>
                      )}
                      <p className="font-body text-[9px] text-amber-600/70 text-center pt-0.5">Tap any day on the calendar to accept / decline</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5 py-2 pl-1">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-sage/40 animate-pulse" style={{ animationDelay: `${i*150}ms` }} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-ink-900/8 bg-white">
        {/* Attached doc tags */}
        {attachedDocs.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {attachedDocs.map(d => (
              <span key={d.type} className="flex items-center gap-1 bg-sage/10 border border-sage/20 text-sage-700 text-[10px] font-body font-medium rounded-full px-2 py-0.5">
                <FileText className="w-2.5 h-2.5" />
                {d.filename}
                <button onClick={() => setAttachedDocs(prev => prev.filter(a => a.type !== d.type))} className="ml-0.5 text-sage/50 hover:text-sage-700">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Doc picker dropdown */}
        {showDocPicker && docs.length > 0 && (
          <div className="mb-2 bg-white border border-ink-900/10 rounded-xl shadow-md overflow-hidden">
            {docs.map(d => {
              const isAttached = attachedDocs.some(a => a.type === d.type)
              return (
                <button
                  key={d.type}
                  onClick={() => {
                    setAttachedDocs(prev =>
                      isAttached ? prev.filter(a => a.type !== d.type) : [...prev, { type: d.type, filename: d.filename }]
                    )
                    setShowDocPicker(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-cream-50 transition-colors text-left"
                >
                  <FileText className={`w-3 h-3 flex-shrink-0 ${isAttached ? 'text-sage' : 'text-ink-400'}`} />
                  <span className="font-body text-xs text-ink-800 truncate flex-1">{d.filename}</span>
                  {isAttached && <Check className="w-3 h-3 text-sage flex-shrink-0" />}
                </button>
              )
            })}
            {docs.length === 0 && (
              <p className="px-3 py-2 font-body text-xs text-ink-400">No documents uploaded yet.</p>
            )}
          </div>
        )}

        <div className="flex gap-1.5 items-center bg-cream-50 border border-ink-900/12 rounded-xl px-2 focus-within:border-sage/50 focus-within:ring-2 focus-within:ring-sage/10 transition-all">
          {/* Attach button */}
          <button
            onClick={() => setShowDocPicker(o => !o)}
            title="Attach a document"
            className={`flex-shrink-0 flex items-center justify-center transition-all ${
              showDocPicker || attachedDocs.length > 0 ? 'text-sage' : 'text-ink-400 hover:text-ink-600'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>

          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask AI about your calendar…" rows={1}
            className="flex-1 bg-transparent py-2.5 font-body text-xs text-ink-900 placeholder:text-ink-400 resize-none focus:outline-none" />

          {/* Send button */}
          <button onClick={send} disabled={!input.trim() || loading}
            className={`flex-shrink-0 flex items-center justify-center transition-all ${input.trim() && !loading ? 'text-sage hover:text-sage-600' : 'text-ink-300 cursor-not-allowed'}`}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="font-body text-[10px] text-ink-400 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ─── Page ─────────────────────────────────────────────────
export default function CalendarPage({ params }: { params: { calendarId: string } }) {
  const { user }     = useAuth(true)
  const isDemo       = user?.id?.startsWith('demo-')
  const searchParams = useSearchParams()

  const fromParam    = searchParams.get('from')
  const initialDate  = fromParam ? new Date(fromParam + 'T12:00:00') : new Date()

  const [view, setView]                 = useState<ViewMode>('month')
  const [currentDate, setCurrentDate]   = useState(initialDate)
  const [aiOpen, setAiOpen]             = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [dayData, setDayData]           = useState<Record<string, DayData>>(isDemo ? buildDemoData() : {})
  const [calendarInfo, setCalendarInfo] = useState<{ name: string; period: string }>(
    DEMO_CALENDAR_INFO[params.calendarId] || { name: 'Course Calendar', period: '' }
  )
  const [showExport, setShowExport]   = useState(false)
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>('idle')
  const [initialLoaded, setInitialLoaded] = useState(false)
  // All AI changes (all statuses) — synced from sidebar, used to render overlays on calendar
  const [allChanges, setAllChanges]   = useState<AIChange[]>([])
  const [applying, setApplying]       = useState<string | null>(null)

  // Derived: only pending changes go to the calendar cells
  const pendingChanges = allChanges.filter(c => c.status === 'pending')

  useEffect(() => {
    if (!user || isDemo) return
    api.calendars.get(params.calendarId)
      .then(cal => setCalendarInfo({ name: cal.name, period: cal.period }))
      .catch(() => {})
  }, [user, params.calendarId, isDemo])

  useEffect(() => {
    if (!user || isDemo || initialLoaded) return
    api.lessons.getAll(params.calendarId)
      .then(data => { setDayData(data); setInitialLoaded(true) })
      .catch(() => { setInitialLoaded(true) })
  }, [user, params.calendarId, isDemo, initialLoaded])

  useEffect(() => {
    if (!user || isDemo || !initialLoaded) return
    const month = format(currentDate, 'yyyy-MM')
    api.lessons.getByMonth(params.calendarId, month)
      .then(data => setDayData(prev => ({ ...prev, ...data })))
      .catch(() => {})
  }, [user, params.calendarId, currentDate, isDemo, initialLoaded])

  // Called by AISidebar after immediately-applied changes (markDay, moveLesson) to refresh all data
  const refreshAllData = useCallback(() => {
    if (isDemo) return
    api.lessons.getAll(params.calendarId)
      .then(data => setDayData(data))
      .catch(() => {})
  }, [params.calendarId, isDemo])

  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const handleDayDataChange = useCallback((dateStr: string, field: keyof DayData, value: string | PriorityTier) => {
    setDayData(p => ({
      ...p,
      [dateStr]: { ...(p[dateStr] || { date: dateStr, lessonPlan: '', deadlines: '', milestones: '', assessments: '', hw: '', notes: '' }), [field]: value },
    }))
    if (isDemo) return
    clearTimeout(saveTimers.current[dateStr])
    setSaveStatus('saving')
    saveTimers.current[dateStr] = setTimeout(() => {
      setDayData(cur => {
        const data = cur[dateStr] || {}
        api.lessons.save(params.calendarId, dateStr, {
          lessonPlan:  (data as any).lessonPlan  || '',
          deadlines:   (data as any).deadlines   || '',
          milestones:  (data as any).milestones  || '',
          assessments: (data as any).assessments || '',
          hw:          (data as any).hw          || '',
          notes:       (data as any).notes       || '',
        })
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus('error'))
        return cur
      })
    }, 600)
  }, [params.calendarId, isDemo])

  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => setSaveStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  const handleRevert = useCallback((snapshot: Record<string, DayData>) => {
    setDayData(snapshot)
    if (isDemo) return
    for (const [ds, data] of Object.entries(snapshot)) {
      api.lessons.save(params.calendarId, ds, {
        lessonPlan:  data.lessonPlan  || '',
        deadlines:   data.deadlines   || '',
        milestones:  data.milestones  || '',
        assessments: data.assessments || '',
        hw:          data.hw          || '',
      }).catch(() => {})
    }
  }, [params.calendarId, isDemo])

  // Calendar cell buttons call window globals set by AISidebar
  const handleAcceptFromCell = useCallback((id: string) => {
    setApplying(id)
    ;(window as any).__calAI_accept?.(id)
    setTimeout(() => setApplying(null), 2000)
  }, [])
  const handleDeclineFromCell = useCallback((id: string) => {
    ;(window as any).__calAI_decline?.(id)
  }, [])

  const handleToday      = () => { const n = new Date(); setCurrentDate(n); setSelectedDate(n); setView('week') }
  const handleDayClick   = (date: Date) => { setSelectedDate(date); setView('week'); setCurrentDate(date) }
  const handleDateSelect = (date: Date) => { setCurrentDate(date); setSelectedDate(date) }

  // Called by DayColumn's "reschedule this day" button — delegates to AISidebar via window global
  const handleRescheduleRequest = useCallback((dateStr: string, reason: string) => {
    if (!aiOpen) setAiOpen(true)
    ;(window as any).__calAI_reschedule?.(dateStr, reason)
  }, [aiOpen])

  // Drag-and-drop: move all lesson data from one day to another
  const handleDragMove = useCallback((fromDs: string, toDs: string) => {
    let movedToData: DayData | undefined
    setDayData(prev => {
      const blank: DayData = { date: toDs, lessonPlan: '', deadlines: '', milestones: '', assessments: '', hw: '', notes: '' }
      const fromData = prev[fromDs] || { ...blank, date: fromDs }
      const toData   = prev[toDs]   || { ...blank, date: toDs }
      // Move from → to, clear from
      const newTo   = { ...toData,   date: toDs,   lessonPlan: fromData.lessonPlan, deadlines: fromData.deadlines, milestones: fromData.milestones, assessments: fromData.assessments, hw: fromData.hw, notes: fromData.notes }
      const newFrom = { ...fromData, date: fromDs, lessonPlan: '', deadlines: '', milestones: '', assessments: '', hw: '', notes: '' }
      movedToData = newTo
      return { ...prev, [fromDs]: newFrom, [toDs]: newTo }
    })
    if (isDemo) return
    // Persist both days after state has been updated
    setSaveStatus('saving')
    setTimeout(() => {
      if (!movedToData) return
      Promise.all([
        api.lessons.save(params.calendarId, toDs,   { lessonPlan: movedToData.lessonPlan || '', deadlines: movedToData.deadlines || '', milestones: movedToData.milestones || '', assessments: movedToData.assessments || '', hw: movedToData.hw || '', notes: movedToData.notes || '' }),
        api.lessons.save(params.calendarId, fromDs, { lessonPlan: '', deadlines: '', milestones: '', assessments: '', hw: '', notes: '' }),
      ]).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error'))
    }, 50)
  }, [params.calendarId, isDemo])

  return (
    <div className="h-screen flex flex-col bg-cream-100 overflow-hidden">
      <TopNav calendarName={calendarInfo.name} period={calendarInfo.period} currentDate={currentDate} view={view}
        onViewChange={setView} onToday={handleToday}
        onPrev={() => view === 'month' ? setCurrentDate(subMonths(currentDate, 1)) : setCurrentDate(subWeeks(currentDate, 1))}
        onNext={() => view === 'month' ? setCurrentDate(addMonths(currentDate, 1)) : setCurrentDate(addWeeks(currentDate, 1))}
        aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)}
        onDateSelect={handleDateSelect} onExport={() => setShowExport(true)} />

      {saveStatus !== 'idle' && !isDemo && (
        <div className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-body
          ${saveStatus === 'saving' ? 'bg-ink-900/4 text-ink-400' : ''}
          ${saveStatus === 'saved'  ? 'bg-sage/8 text-sage-700'  : ''}
          ${saveStatus === 'error'  ? 'bg-red-50 text-red-600'   : ''}`}>
          {saveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
          {saveStatus === 'saved'  && <><Check className="w-3 h-3" /> Saved</>}
          {saveStatus === 'error'  && <><WifiOff className="w-3 h-3" /> Save failed — check connection</>}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          {view === 'month'
            ? <MonthlyView currentDate={currentDate} dayData={dayData}
                pendingChanges={pendingChanges} applying={applying}
                onDayClick={handleDayClick}
                onAcceptChange={handleAcceptFromCell}
                onDeclineChange={handleDeclineFromCell}
                onDragMove={handleDragMove} />
            : <WeeklyView currentDate={currentDate} dayData={dayData}
                pendingChanges={pendingChanges} applying={applying}
                onDayDataChange={handleDayDataChange}
                onAcceptChange={handleAcceptFromCell}
                onDeclineChange={handleDeclineFromCell}
                onRescheduleRequest={handleRescheduleRequest}
                onDragMove={handleDragMove} />}
        </div>
        {aiOpen && (
          <AISidebar
            selectedDate={selectedDate}
            onClearSelection={() => setSelectedDate(null)}
            courseId={params.calendarId}
            dayData={dayData}
            onApplyChange={handleDayDataChange}
            onSetChanges={setAllChanges}
            onRevert={handleRevert} onRefresh={refreshAllData} />
        )}
      </div>

      {showExport && (
        <ExportModal calendarName={calendarInfo.name} period={calendarInfo.period} dayData={dayData} onClose={() => setShowExport(false)} />
      )}
    </div>
  )
}