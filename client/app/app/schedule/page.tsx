'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Calendar, ChevronLeft, ChevronRight, Home, Plus, X,
  Clock, MapPin, AlignLeft, Repeat, ArrowLeft, ArrowRight, Loader2,
  Sparkles, CalendarDays, CheckCheck, RotateCcw,
  PanelRightClose, PanelRightOpen, Check
} from 'lucide-react'
import {
  format, startOfWeek, addDays, isToday, addWeeks, subWeeks,
  startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth,
  addMonths, subMonths, endOfWeek
} from 'date-fns'
import { api, apiExtended, CalEvent, LessonData, ApiError } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'

type CalView = 'month' | 'week'

interface LocalEvent {
  id: string; title: string; date: string
  startTime?: string; endTime?: string
  allDay: boolean; schoolWide: boolean; color: string
  location?: string; description?: string
  isClosedDay?: boolean // synthetic closed-day event from lesson notes
  repeatRule?: string
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6)

const buildMockEvents = (): LocalEvent[] => {
  const today    = format(new Date(), 'yyyy-MM-dd')
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const dayAfter = format(addDays(new Date(), 2), 'yyyy-MM-dd')
  return [
    { id: '1', title: 'No School — Presidents Day', date: today,    allDay: true,  schoolWide: true,  color: 'amber' },
    { id: '2', title: 'Dept Meeting',                    date: tomorrow, allDay: false, schoolWide: false, color: 'blue',   startTime: '14:00', endTime: '15:00', location: 'Room 204' },
    { id: '3', title: 'Algebra 2 — Period 3',       date: today,    allDay: false, schoolWide: false, color: 'sage',   startTime: '09:00', endTime: '10:00' },
    { id: '4', title: 'AP Calculus BC — Period 1',  date: today,    allDay: false, schoolWide: false, color: 'sage',   startTime: '07:30', endTime: '08:30' },
    { id: '5', title: 'Parent Conference',               date: dayAfter, allDay: false, schoolWide: false, color: 'purple', startTime: '15:30', endTime: '16:00' },
  ]
}

// ─── Create/Edit Event Modal ──────────────────────────────
function EventModal({
  defaultDate, defaultHour, editEvent, onClose, onSave, onDelete,
}: {
  defaultDate: string; defaultHour: number
  editEvent?: LocalEvent | null
  onClose: () => void
  onSave: (event: Omit<LocalEvent, 'id'>, id?: string) => void
  onDelete?: (id: string) => void
}) {
  const isEdit = !!editEvent
  const [title,       setTitle]       = useState(editEvent?.title       || '')
  const [allDay,      setAllDay]      = useState(editEvent?.allDay      || false)
  const [schoolWide,  setSchoolWide]  = useState(editEvent?.schoolWide  || false)
  const [startTime,   setStartTime]   = useState(editEvent?.startTime   || `${String(defaultHour).padStart(2,'0')}:00`)
  const [endTime,     setEndTime]     = useState(editEvent?.endTime     || `${String(defaultHour + 1).padStart(2,'0')}:00`)
  const [repeat,      setRepeat]      = useState(editEvent?.repeatRule  || 'none')
  const [date,        setDate]        = useState(editEvent?.date        || defaultDate)
  const [location,    setLocation]    = useState(editEvent?.location    || '')
  const [description, setDescription] = useState(editEvent?.description || '')

  const handleSave = () => {
    if (!title.trim()) return
    const color = schoolWide ? 'amber' : (editEvent?.color || 'blue')
    onSave({
      title: title.trim(), date, allDay, schoolWide,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      color, location, description,
      repeatRule: repeat,
    }, editEvent?.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-ink-900/8">
          <div className="flex items-start justify-between gap-3">
            <input autoFocus type="text" placeholder="Add title" value={title} onChange={e => setTitle(e.target.value)}
              className="flex-1 font-display text-2xl text-ink-900 placeholder:text-ink-200 bg-transparent border-b-2 border-ink-900/15 focus:border-sage pb-1 focus:outline-none transition-colors" />
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-ink-900/6 mt-1"><X className="w-4 h-4 text-ink-500" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-ink-400 mt-2.5" />
            <div className="flex-1 space-y-2">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-field text-sm py-2" />
              {!allDay && (
                <div className="flex items-center gap-2">
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input-field text-sm py-2 flex-1" />
                  <span className="font-body text-xs text-ink-400">to</span>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="input-field text-sm py-2 flex-1" />
                </div>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-4 h-4 accent-sage rounded" />
                  <span className="font-body text-xs text-ink-600">All day</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={schoolWide} onChange={e => setSchoolWide(e.target.checked)} className="w-4 h-4 accent-amber rounded" />
                  <span className="font-body text-xs text-ink-600">School-wide</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Repeat className="w-4 h-4 text-ink-400" />
            <select value={repeat} onChange={e => setRepeat(e.target.value)} className="input-field text-sm py-2">
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly (every week)</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-ink-400" />
            <input type="text" placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} className="input-field text-sm py-2 flex-1" />
          </div>
          <div className="flex items-start gap-3">
            <AlignLeft className="w-4 h-4 text-ink-400 mt-2.5" />
            <textarea placeholder="Description (optional)" rows={2} value={description} onChange={e => setDescription(e.target.value)} className="input-field text-sm py-2 flex-1 resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-between">
          <div>
            {isEdit && onDelete && !editEvent?.isClosedDay && (
              <button onClick={() => { onDelete(editEvent!.id); onClose() }} className="font-body text-xs text-red-500 hover:text-red-700 transition-colors">Delete event</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button onClick={handleSave} disabled={!title.trim()} className={`btn-sage text-sm py-2 px-5 ${!title.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isEdit ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Converts "22:00" → "10:00 PM", "09:30" → "9:30 AM"
function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${mStr} ${ampm}`
}

// Strip markdown from AI text so **bold**, ##headers etc never appear in chat
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}


function ViewEventModal({ event, onClose, onEdit, onDelete }: {
  event: LocalEvent; onClose: () => void; onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-4 border-b border-ink-900/8 ${event.color === 'amber' ? 'bg-amber/8' : event.color === 'sage' ? 'bg-sage/8' : 'bg-blue-50/60'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-body text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-1">
                {event.isClosedDay ? 'No School' : event.schoolWide ? 'School-wide' : 'Event'}
              </p>
              <h3 className="font-display text-xl text-ink-900">{event.title}</h3>
            </div>
            <div className="flex items-center gap-1">
              {!event.isClosedDay && (
                <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/8 transition-colors">
                  <svg className="w-3.5 h-3.5 text-ink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
              )}
              {!event.isClosedDay && (
                <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors">
                  <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/8 transition-colors"><X className="w-3.5 h-3.5 text-ink-500" /></button>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-ink-600">
            <Clock className="w-4 h-4 text-ink-400" />
            <span className="font-body text-sm">{event.allDay ? 'All day' : `${formatTime(event.startTime!)} – ${formatTime(event.endTime!)}`} · {format(new Date(event.date + 'T12:00'), 'MMM d, yyyy')}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-ink-600"><MapPin className="w-4 h-4 text-ink-400" /><span className="font-body text-sm">{event.location}</span></div>
          )}
          {event.description && (
            <div className="flex items-start gap-2 text-ink-600"><AlignLeft className="w-4 h-4 text-ink-400 mt-0.5" /><span className="font-body text-sm">{event.description}</span></div>
          )}
          {event.repeatRule && event.repeatRule !== 'none' && (
            <div className="flex items-center gap-2 text-ink-600"><Repeat className="w-4 h-4 text-ink-400" /><span className="font-body text-sm capitalize">Repeats {event.repeatRule}</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Simple Schedule AI Sidebar ───────────────────────────
function ScheduleAISidebar({ onClose, onEventCreated, onEventDeleted, onEventMoved, onMarkDay, events }: {
  onClose: () => void
  onEventCreated: (event: LocalEvent) => void
  onEventDeleted: (id: string) => void
  onEventMoved: (event: LocalEvent) => void
  onMarkDay: (date: string, label: string) => void
  events: LocalEvent[]
}) {
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string; createdEvent?: LocalEvent; deletedTitle?: string; movedEvent?: LocalEvent; markedDay?: { date: string; label: string } }[]>([{
    id: '0', role: 'assistant',
    content: "Hi! I can add, delete, and reschedule events on your calendar.\n\nTry: \"Mark March 10 as a snow day\" or \"Delete my 3pm meeting today\" or \"Move my teacher meeting to Friday at 2pm\" or \"Add a parent conference Thursday at 4pm\".",
  }])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<any[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { id: Date.now().toString(), role: 'user' as const, content: input.trim() }
    setMessages(p => [...p, userMsg])
    setInput('')
    setLoading(true)
    try {
      // Build a simple calendar context from current events so AI knows what exists
      const eventsContext = events.reduce((acc, ev) => {
        if (!acc[ev.date]) acc[ev.date] = {}
        const entry = acc[ev.date] as any
        if (ev.isClosedDay) entry.notes = ev.title
        else entry.events = [...(entry.events || []), ev.title]
        return acc
      }, {} as Record<string, any>)

      const res = await apiExtended.ai.chat({
        message: userMsg.content,
        courseId: '',
        selectedDate: format(new Date(), 'yyyy-MM-dd'),
        calendarContext: eventsContext,
        conversationHistory,
      })
      setConversationHistory(res.updatedHistory || [])

      const newEvents: LocalEvent[]                    = (res as any).createdEvents || []
      const delEvents: { id: string; title: string }[] = (res as any).deletedEvents || []
      const mvEvents: LocalEvent[]                     = (res as any).movedEvents   || []
      // Handle markDay / snow day changes — apply immediately (no accept/decline flow on schedule)
      const changes: any[]                             = (res as any).changes || []
      const markedDays: { date: string; label: string }[] = []
      for (const ch of changes) {
        if (ch.tool === 'markDay' && ch.after) {
          onMarkDay(ch.date, ch.after)
          markedDays.push({ date: ch.date, label: ch.after })
        }
      }

      for (const ev of newEvents) onEventCreated(ev)
      for (const ev of delEvents) onEventDeleted(ev.id)
      for (const ev of mvEvents)  onEventMoved(ev)

      const replyContent = stripMarkdown(res.content ||
        (newEvents.length > 0   ? `Added "${newEvents.map((e: LocalEvent) => e.title).join(', ')}" to your schedule.` :
         delEvents.length > 0   ? `Deleted ${delEvents.map(e => `"${e.title}"`).join(', ')}.` :
         mvEvents.length  > 0   ? `Rescheduled ${mvEvents.map((e: LocalEvent) => `"${e.title}"`).join(', ')}.` :
         markedDays.length > 0  ? `Marked ${markedDays.map(d => `${d.date} as ${d.label}`).join(', ')}.` : 'Done!'))

      setMessages(p => [...p, {
        id: (Date.now()+1).toString(),
        role: 'assistant' as const,
        content: replyContent,
        createdEvent: newEvents[0],
        deletedTitle: delEvents[0]?.title,
        movedEvent:   mvEvents[0],
        markedDay:    markedDays[0],
      }])
    } catch (err: any) {
      setMessages(p => [...p, { id: (Date.now()+1).toString(), role: 'assistant' as const, content: `Sorry, something went wrong: ${err.message || 'AI error'}. Please try again.` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-80 flex flex-col bg-white border-l border-ink-900/10 h-full">
      <div className="px-4 pt-4 pb-3 border-b border-ink-900/8 bg-cream-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-sage/15 rounded-lg flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-sage" /></div>
          <span className="font-display text-base text-ink-900">AI Assistant</span>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-ink-900/6"><X className="w-3.5 h-3.5 text-ink-500" /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-cream-50/30">
        {messages.map(msg => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="bg-sage text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[88%] shadow-sm">
                  <p className="font-body text-xs leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="bg-white border border-ink-900/8 rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm">
                  <p className="font-body text-xs text-ink-800 leading-relaxed whitespace-pre-line">{msg.content}</p>
                </div>
                {msg.createdEvent && (
                  <div className="flex items-center gap-2 bg-sage/10 border border-sage/20 rounded-xl px-3 py-2">
                    <Check className="w-3.5 h-3.5 text-sage flex-shrink-0" />
                    <div>
                      <p className="font-body text-[11px] font-semibold text-sage-700">{msg.createdEvent.title}</p>
                      <p className="font-body text-[10px] text-ink-500">
                        {format(new Date(msg.createdEvent.date + 'T12:00'), 'MMM d, yyyy')}
                        {msg.createdEvent.startTime ? ` · ${formatTime(msg.createdEvent.startTime)}` : ''}
                        {msg.createdEvent.endTime   ? ` – ${formatTime(msg.createdEvent.endTime)}` : ''}
                      </p>
                    </div>
                  </div>
                )}
                {msg.deletedTitle && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    <p className="font-body text-[11px] font-semibold text-red-700">Deleted: {msg.deletedTitle}</p>
                  </div>
                )}
                {msg.movedEvent && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <div>
                      <p className="font-body text-[11px] font-semibold text-blue-700">Rescheduled: {msg.movedEvent.title}</p>
                      <p className="font-body text-[10px] text-ink-500">
                        {format(new Date(msg.movedEvent.date + 'T12:00'), 'MMM d, yyyy')}
                        {msg.movedEvent.startTime ? ` · ${formatTime(msg.movedEvent.startTime)}` : ''}
                        {msg.movedEvent.endTime   ? ` – ${formatTime(msg.movedEvent.endTime)}` : ''}
                      </p>
                    </div>
                  </div>
                )}
                {msg.markedDay && (
                  <div className="flex items-center gap-2 bg-amber/10 border border-amber/30 rounded-xl px-3 py-2">
                    <CalendarDays className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <p className="font-body text-[11px] font-semibold text-amber-700">
                      {format(new Date(msg.markedDay.date + 'T12:00'), 'MMM d')}: {msg.markedDay.label}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-1.5 py-2 pl-1">
            {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-sage/40 animate-pulse" style={{ animationDelay: `${i*150}ms` }} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 border-t border-ink-900/8 bg-white">
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask about your schedule…" rows={2}
            className="flex-1 bg-cream-50 border border-ink-900/12 rounded-xl px-3 py-2 font-body text-xs text-ink-900 placeholder:text-ink-400 resize-none focus:outline-none focus:border-sage/50 focus:ring-2 focus:ring-sage/10 transition-all" />
          <button onClick={send} disabled={!input.trim() || loading}
            className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${input.trim() && !loading ? 'bg-sage hover:bg-sage-600 text-white' : 'bg-ink-900/6 text-ink-400 cursor-not-allowed'}`}>
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="font-body text-[10px] text-ink-400 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

// ─── Nav ─────────────────────────────────────────────────
function Nav({ calView, currentDate, onViewChange, onToday, onPrev, onNext, onNewEvent, aiOpen, onAiToggle }: {
  calView: CalView; currentDate: Date
  onViewChange: (v: CalView) => void; onToday: () => void
  onPrev: () => void; onNext: () => void; onNewEvent: () => void
  aiOpen: boolean; onAiToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-ink-900/8">
      <div className="flex items-center gap-3">
        <Link href="/app" className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /><span>My Calendars</span>
        </Link>
        <div className="w-px h-4 bg-ink-900/15" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-ink-900/6 rounded-lg flex items-center justify-center"><Calendar className="w-3.5 h-3.5 text-ink-600" /></div>
          <span className="font-display text-base text-ink-900">My Schedule</span>
          <span className="font-body text-xs text-ink-400 bg-ink-900/6 px-2 py-0.5 rounded-full">Full Calendar</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onToday} className="font-body text-xs font-medium text-ink-700 px-3 py-1.5 rounded-lg border border-ink-900/12 hover:border-ink-900/30 transition-all">Today</button>
        <div className="flex">
          <button onClick={onPrev} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/5"><ChevronLeft className="w-4 h-4 text-ink-600" /></button>
          <button onClick={onNext} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-ink-900/5"><ChevronRight className="w-4 h-4 text-ink-600" /></button>
        </div>
        <span className="font-body text-sm font-medium text-ink-900 px-2">{format(currentDate, 'MMM yyyy')}</span>
        <button onClick={() => onViewChange(calView === 'month' ? 'week' : 'month')}
          className="font-body text-xs font-medium text-ink-700 px-3 py-1.5 rounded-lg border border-ink-900/12 hover:border-ink-900/30 transition-all min-w-[60px] text-center">
          {calView === 'month' ? 'Month' : 'Week'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onNewEvent} className="btn-sage py-2 px-3.5 text-xs gap-1.5"><Plus className="w-3.5 h-3.5" />New Event</button>
        <button onClick={onAiToggle} title={aiOpen ? 'Close AI' : 'Open AI'}
          className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${aiOpen ? 'bg-sage border-sage text-white shadow-md' : 'bg-white border-ink-900/20 text-ink-600 hover:border-sage/60'}`}>
          {aiOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

// ─── Monthly View ─────────────────────────────────────────
function FullMonthView({ currentDate, events, onDayClick, onEventClick, onDragMove, closedDates }: {
  currentDate: Date; events: LocalEvent[]
  onDayClick: (date: Date) => void; onEventClick: (ev: LocalEvent) => void
  onDragMove: (eventId: string, toDate: string, toHour?: number) => void
  closedDates: Set<string>
}) {
  const [draggingId, setDraggingId]   = useState<string | null>(null)
  const [dragOverDs, setDragOverDs]   = useState<string | null>(null)

  const allDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
  })

  const onEvDragStart = (e: React.DragEvent, ev: LocalEvent) => {
    e.stopPropagation()
    setDraggingId(ev.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ev.id)
  }
  const onCellDragOver = (e: React.DragEvent, ds: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDs(ds)
  }
  const onCellDrop = (e: React.DragEvent, ds: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) { setDraggingId(null); setDragOverDs(null); return }
    onDragMove(id, ds)
    setDraggingId(null)
    setDragOverDs(null)
  }
  const onDragEnd = () => { setDraggingId(null); setDragOverDs(null) }

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-ink-900/8 bg-white sticky top-0 z-10">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="py-2.5 text-center"><span className="font-body text-xs font-medium text-ink-400 uppercase tracking-wide">{d}</span></div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {allDays.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const isClosed    = closedDates.has(ds)
          const dayEvents   = events.filter(e => e.date === ds)
          const inMonth     = isSameMonth(day, currentDate)
          const todayDay    = isToday(day)
          const isDragOver  = dragOverDs === ds
          const closedEvent = dayEvents.find(e => e.isClosedDay)
          // On closed days, hide period/class events (weekly sage repeating) but keep user events
          const isPeriodEvent = (e: LocalEvent) => e.color === 'sage' && e.repeatRule === 'weekly'
          const allDayEvs   = dayEvents.filter(e => e.allDay && !e.isClosedDay)
          const timedEvs    = dayEvents.filter(e => !e.allDay && !e.isClosedDay && !(isClosed && isPeriodEvent(e)))
          const displayEvs  = [...(closedEvent ? [closedEvent] : []), ...allDayEvs, ...timedEvs]
          return (
            <div key={ds}
              onDragOver={e => onCellDragOver(e, ds)}
              onDrop={e => onCellDrop(e, ds)}
              onDragLeave={() => setDragOverDs(null)}
              onClick={() => onDayClick(day)}
              className={`min-h-[100px] border-r border-b border-ink-900/6 p-2 cursor-pointer transition-all
                ${isClosed ? 'bg-blue-50/40' : inMonth ? 'bg-white hover:bg-cream-50' : 'bg-ink-50/40'}
                ${todayDay && !isClosed ? '!bg-sage/5' : ''}
                ${isDragOver ? 'ring-2 ring-inset ring-sage/50 !bg-sage/8' : ''}`}>
              {isClosed && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-400 rounded-r pointer-events-none" />}
              <div className="flex justify-center mb-1.5">
                <span className={`font-mono text-xs w-6 h-6 flex items-center justify-center rounded-full ${todayDay ? 'bg-sage text-white font-bold' : inMonth ? 'text-ink-600' : 'text-ink-300'}`}>{format(day, 'd')}</span>
              </div>
              <div className="space-y-0.5">
                {displayEvs.slice(0, 3).map(ev => (
                  <div key={ev.id}
                    draggable={!ev.isClosedDay}
                    onDragStart={ev_ => { if (!ev.isClosedDay) onEvDragStart(ev_, ev) }}
                    onDragEnd={onDragEnd}
                    onClick={e => { e.stopPropagation(); onEventClick(ev) }}
                    className={`text-[10px] px-1.5 py-0.5 rounded truncate font-body font-medium transition-opacity
                      ${ev.isClosedDay ? 'bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer' : ''}
                      ${!ev.isClosedDay && draggingId === ev.id ? 'opacity-40' : ''}
                      ${!ev.isClosedDay ? 'cursor-grab active:cursor-grabbing hover:opacity-80' : ''}
                      ${ev.color === 'amber'  && !ev.isClosedDay ? 'bg-amber/15 text-amber-dark'  : ''}
                      ${ev.color === 'sage'   && !ev.isClosedDay ? 'bg-sage/15 text-sage-700'     : ''}
                      ${ev.color === 'blue'   && !ev.isClosedDay ? 'bg-blue-50 text-blue-700'     : ''}
                      ${ev.color === 'purple' && !ev.isClosedDay ? 'bg-purple-50 text-purple-700' : ''}`}>
                    {ev.isClosedDay ? `🚫 ${ev.title}` : ev.title}
                  </div>
                ))}
                {displayEvs.length > 3 && <p className="font-body text-[10px] text-ink-400">+{displayEvs.length - 3} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Weekly Time Grid ─────────────────────────────────────
function FullWeekView({ currentDate, events, onCellClick, onEventClick, onDragMove, closedDates }: {
  currentDate: Date; events: LocalEvent[]
  onCellClick: (date: string, hour: number) => void
  onEventClick: (ev: LocalEvent) => void
  onDragMove: (eventId: string, toDate: string, toHour?: number) => void
  closedDates: Set<string>
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const currentHour = new Date().getHours()
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (currentHour - 6) * 60 - 100)
  }, [])

  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dragOverDs,  setDragOverDs]  = useState<string | null>(null)
  const [dragOverH,   setDragOverH]   = useState<number | null>(null)

  const timeToTop = (t: string) => { const [h, m] = t.split(':').map(Number); return ((h - 6) * 60 + m) / 60 * 60 }
  const dur = (s: string, e: string) => { const [sh,sm] = s.split(':').map(Number); const [eh,em] = e.split(':').map(Number); return ((eh*60+em)-(sh*60+sm))/60*60 }

  const onEvDragStart = (e: React.DragEvent, ev: LocalEvent) => {
    e.stopPropagation()
    setDraggingId(ev.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ev.id)
  }
  const onCellDragOver = (e: React.DragEvent, ds: string, h: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDs(ds); setDragOverH(h)
  }
  const onColumnDragOver = (e: React.DragEvent, ds: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDs(ds)
  }
  const onCellDrop = (e: React.DragEvent, ds: string, h?: number) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) { setDraggingId(null); setDragOverDs(null); setDragOverH(null); return }
    onDragMove(id, ds, h)
    setDraggingId(null); setDragOverDs(null); setDragOverH(null)
  }
  const onDragEnd = () => { setDraggingId(null); setDragOverDs(null); setDragOverH(null) }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* All-day row */}
      <div className="grid grid-cols-8 border-b border-ink-900/8 bg-white flex-shrink-0">
        <div className="py-2 px-2 border-r border-ink-900/6 flex items-end pb-1"><span className="font-mono text-[10px] text-ink-300">All day</span></div>
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const isClosed    = closedDates.has(ds)
          const allDayEvs   = events.filter(e => e.date === ds && (e.allDay || e.isClosedDay))
          const closedEvent = allDayEvs.find(e => e.isClosedDay)
          return (
            <div key={ds}
              onDragOver={e => onColumnDragOver(e, ds)}
              onDrop={e => onCellDrop(e, ds)}
              onDragLeave={() => { setDragOverDs(null) }}
              className={`p-1.5 border-r border-ink-900/6 last:border-r-0 min-h-[48px] transition-all
                ${isClosed ? 'bg-blue-50/40' : ''}
                ${dragOverDs === ds ? 'bg-sage/8 ring-1 ring-inset ring-sage/40' : ''}`}>
              <div className="flex items-center gap-1 mb-1">
                <span className={`font-body text-[10px] font-medium ${isToday(day) ? 'text-sage' : 'text-ink-400'}`}>{format(day, 'EEE')}</span>
                <span className={`font-mono text-xs w-5 h-5 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-sage text-white' : 'text-ink-600'}`}>{format(day, 'd')}</span>
              </div>
              {isClosed && closedEvent && (
                <div className="text-[10px] px-1 py-0.5 rounded truncate font-body font-semibold mb-0.5 bg-blue-100 text-blue-800 border border-blue-200">
                  🚫 {closedEvent.title}
                </div>
              )}
              {allDayEvs.filter(e => !e.isClosedDay).map(ev => (
                <div key={ev.id}
                  draggable
                  onDragStart={e_ => onEvDragStart(e_, ev)}
                  onDragEnd={onDragEnd}
                  onClick={() => onEventClick(ev)}
                  className={`text-[10px] px-1 py-0.5 rounded truncate font-body mb-0.5 cursor-grab active:cursor-grabbing transition-colors
                    ${draggingId === ev.id ? 'opacity-40' : 'hover:opacity-80'}
                    bg-amber/15 text-amber-dark hover:bg-amber/25`}>
                  {ev.title}
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {/* Timed grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div className="grid grid-cols-8">
          <div className="border-r border-ink-900/6">
            {HOURS.map(h => (
              <div key={h} className="h-[60px] flex items-start px-2 pt-1 border-b border-ink-900/4">
                <span className="font-mono text-[10px] text-ink-300">{h === 12 ? '12pm' : h > 12 ? `${h-12}pm` : `${h}am`}</span>
              </div>
            ))}
          </div>
          {days.map(day => {
            const ds = format(day, 'yyyy-MM-dd')
            const isClosed    = closedDates.has(ds)
            // On closed days, hide only period/class events (weekly sage repeating) — keep user events
            const isPeriodEvent = (e: LocalEvent) => e.color === 'sage' && e.repeatRule === 'weekly'
            const timedEvents   = events.filter(e => e.date === ds && !e.allDay && !e.isClosedDay && !(isClosed && isPeriodEvent(e)))
            return (
              <div key={ds}
                onDragOver={e => { e.preventDefault(); setDragOverDs(ds) }}
                onDrop={e => onCellDrop(e, ds)}
                onDragLeave={() => setDragOverDs(null)}
                className={`relative border-r border-ink-900/4 last:border-r-0 transition-all
                  ${isClosed ? 'bg-blue-50/30' : ''}`}>
                {HOURS.map(h => (
                  <div key={h}
                    className={`h-[60px] border-b border-ink-900/4 transition-colors relative
                      ${dragOverDs === ds && dragOverH === h ? 'bg-sage/12' : ''}
                      ${isToday(day) ? 'hover:bg-sage/5 cursor-pointer' : 'hover:bg-ink-900/2 cursor-pointer'}`}
                    onDragOver={e => { e.stopPropagation(); onCellDragOver(e, ds, h) }}
                    onDrop={e => { e.stopPropagation(); onCellDrop(e, ds, h) }}
                    onClick={() => onCellClick(ds, h)} />
                ))}
                {isToday(day) && currentHour >= 6 && currentHour <= 22 && (
                  <div className="absolute left-0 right-0 flex items-center pointer-events-none z-10" style={{ top: `${(currentHour - 6) * 60}px` }}>
                    <div className="w-2.5 h-2.5 rounded-full bg-sage -ml-1 flex-shrink-0" />
                    <div className="flex-1 h-px bg-sage" />
                  </div>
                )}
                {timedEvents.map(ev => {
                  if (!ev.startTime || !ev.endTime) return null
                  const top    = timeToTop(ev.startTime)
                  const height = Math.max(dur(ev.startTime, ev.endTime), 25)
                  const isDragging = draggingId === ev.id
                  return (
                    <div key={ev.id}
                      draggable
                      onDragStart={e => onEvDragStart(e, ev)}
                      onDragEnd={onDragEnd}
                      onClick={() => onEventClick(ev)}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 overflow-hidden cursor-grab active:cursor-grabbing hover:brightness-95 z-10 transition-opacity
                        ${isDragging ? 'opacity-30' : ''}
                        ${ev.color === 'sage'   ? 'bg-sage/20 border-l-2 border-sage'         : ''}
                        ${ev.color === 'blue'   ? 'bg-blue-50 border-l-2 border-blue-400'     : ''}
                        ${ev.color === 'purple' ? 'bg-purple-50 border-l-2 border-purple-400' : ''}
                        ${ev.color === 'amber'  ? 'bg-amber/15 border-l-2 border-amber'        : ''}`}
                      style={{ top: `${top}px`, height: `${height}px` }}>
                      <p className="font-body text-[10px] font-semibold text-ink-900 truncate">{ev.title}</p>
                      {height > 35 && <p className="font-mono text-[9px] text-ink-500">{ev.startTime} – {ev.endTime}</p>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────
export default function SchedulePage() {
  const { user }  = useAuth(true)
  const isDemo    = user?.id?.startsWith('demo-')

  const [calView, setCalView]         = useState<CalView>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents]           = useState<LocalEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [createModal, setCreateModal] = useState<{ date: string; hour: number } | null>(null)
  const [viewEvent, setViewEvent]     = useState<LocalEvent | null>(null)
  const [editEvent, setEditEvent]     = useState<LocalEvent | null>(null)
  const [aiOpen, setAiOpen]           = useState(false)
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Derived set of closed/no-school dates for fast lookup
  const closedDates = useMemo<Set<string>>(() => {
    const s = new Set<string>()
    events.forEach(e => { if (e.isClosedDay) s.add(e.date) })
    return s
  }, [events])

  useEffect(() => {
    if (!user) return
    if (isDemo) { setEvents(buildMockEvents()); setEventsLoading(false); return }
    const month = format(currentDate, 'yyyy-MM')

    const eventsPromise = api.events.list(month)
      .then(data => data as unknown as LocalEvent[])
      .catch(() => [] as LocalEvent[])

    const closedPromise = api.calendars.list()
      .then(async cals => {
        const closedDays: LocalEvent[] = []
        for (const cal of cals) {
          try {
            const lessons = await api.lessons.getByMonth(cal.id, month)
            for (const [date, lesson] of Object.entries(lessons)) {
              if (lesson.notes && !lesson.lessonPlan && !lesson.hw && !lesson.assessments) {
                closedDays.push({
                  id: `closed__${cal.id}__${date}`,
                  title: lesson.notes,
                  date,
                  allDay: true,
                  schoolWide: true,
                  color: 'amber',
                  isClosedDay: true,
                })
              }
            }
          } catch {}
        }
        return closedDays
      })
      .catch(() => [] as LocalEvent[])

    Promise.all([eventsPromise, closedPromise])
      .then(([evs, closed]) => {
        setEvents([...evs, ...closed])
        setEventsLoading(false)
      })
  }, [user, currentDate, isDemo])

  useEffect(() => {
    if (saveStatus !== 'saved') return
    const t = setTimeout(() => setSaveStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [saveStatus])

  const handleSaveEvent = async (eventData: Omit<LocalEvent, 'id'>, id?: string) => {
    if (isDemo) {
      if (id) setEvents(prev => prev.map(e => e.id === id ? { ...eventData, id } : e))
      else    setEvents(prev => [...prev, { ...eventData, id: Date.now().toString() }])
      return
    }
    try {
      if (id) {
        if (id.startsWith('closed__')) return
        const baseId = id.includes('__') ? id.split('__')[0] : id
        const updated = await api.events.update(baseId, eventData as any)
        setEvents(prev => prev.map(e => e.id === id ? (updated as unknown as LocalEvent) : e))
      } else {
        const created = await api.events.create(eventData as any)
        setEvents(prev => [...prev, created as unknown as LocalEvent])
      }
    } catch (err) { console.error('Save event failed:', err) }
  }

  const handleDeleteEvent = async (id: string) => {
    if (id.startsWith('closed__')) return
    setEvents(prev => prev.filter(e => e.id !== id))
    if (!isDemo) {
      const baseId = id.includes('__') ? id.split('__')[0] : id
      try { await api.events.delete(baseId) } catch {}
    }
  }

  // Drag-and-drop move: update event date (and optionally hour) optimistically, then persist
  const handleDragMove = useCallback(async (eventId: string, toDate: string, toHour?: number) => {
    if (eventId.startsWith('closed__') || eventId.startsWith('ai-marked__')) return
    const ev = events.find(e => e.id === eventId)
    if (!ev) return

    // Build updated event — preserve start/end time offsets if toHour given
    let newStart = ev.startTime
    let newEnd   = ev.endTime
    if (toHour !== undefined && ev.startTime && ev.endTime) {
      const [sh, sm] = ev.startTime.split(':').map(Number)
      const [eh, em] = ev.endTime.split(':').map(Number)
      const durMins = (eh * 60 + em) - (sh * 60 + sm)
      const newStartMins = toHour * 60
      const newEndMins   = newStartMins + durMins
      newStart = `${String(toHour).padStart(2,'0')}:00`
      newEnd   = `${String(Math.floor(newEndMins / 60) % 24).padStart(2,'0')}:${String(newEndMins % 60).padStart(2,'0')}`
    }

    const updated: LocalEvent = { ...ev, date: toDate, startTime: newStart, endTime: newEnd }

    // Optimistic update
    setEvents(prev => prev.map(e => e.id === eventId ? updated : e))

    if (isDemo) return
    setSaveStatus('saving')
    try {
      const baseId = eventId.includes('__') ? eventId.split('__')[0] : eventId
      await api.events.update(baseId, { ...updated } as any)
      setSaveStatus('saved')
    } catch {
      // Revert on failure
      setEvents(prev => prev.map(e => e.id === eventId ? ev : e))
      setSaveStatus('error')
    }
  }, [events, isDemo])

  if (eventsLoading) {
    return <div className="h-screen flex items-center justify-center bg-cream-100"><Loader2 className="w-6 h-6 text-sage animate-spin" /></div>
  }

  return (
    <div className="h-screen flex flex-col bg-cream-100 overflow-hidden">
      <Nav calView={calView} currentDate={currentDate}
        onViewChange={setCalView}
        onToday={() => setCurrentDate(new Date())}
        onPrev={() => setCurrentDate(calView === 'month' ? subMonths(currentDate, 1) : subWeeks(currentDate, 1))}
        onNext={() => setCurrentDate(calView === 'month' ? addMonths(currentDate, 1) : addWeeks(currentDate, 1))}
        onNewEvent={() => setCreateModal({ date: format(new Date(), 'yyyy-MM-dd'), hour: new Date().getHours() })}
        aiOpen={aiOpen} onAiToggle={() => setAiOpen(v => !v)} />

      {/* Save status strip */}
      {saveStatus !== 'idle' && (
        <div className={`flex items-center justify-center gap-1.5 py-1 text-[11px] font-body
          ${saveStatus === 'saving' ? 'bg-ink-900/4 text-ink-400' : ''}
          ${saveStatus === 'saved'  ? 'bg-sage/8 text-sage-700'  : ''}
          ${saveStatus === 'error'  ? 'bg-red-50 text-red-600'   : ''}`}>
          {saveStatus === 'saving' && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
          {saveStatus === 'saved'  && <><Check className="w-3 h-3" /> Saved</>}
          {saveStatus === 'error'  && <>Save failed — check connection</>}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {calView === 'month' ? (
          <FullMonthView currentDate={currentDate} events={events}
            closedDates={closedDates}
            onDayClick={d => { setCurrentDate(d); setCalView('week') }}
            onEventClick={setViewEvent}
            onDragMove={handleDragMove} />
        ) : (
          <FullWeekView currentDate={currentDate} events={events}
            closedDates={closedDates}
            onCellClick={(date, hour) => setCreateModal({ date, hour })}
            onEventClick={setViewEvent}
            onDragMove={handleDragMove} />
        )}
        {aiOpen && <ScheduleAISidebar
          onClose={() => setAiOpen(false)}
          events={events}
          onEventCreated={ev => setEvents(prev => [...prev, ev])}
          onEventDeleted={id => setEvents(prev => prev.filter(e => e.id !== id))}
          onEventMoved={ev => setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, ...ev } : e))}
          onMarkDay={(date, label) => {
            const syntheticId = `ai-marked__${date}`
            setEvents(prev => [
              ...prev.filter(e => e.id !== syntheticId),
              { id: syntheticId, title: label, date, allDay: true, schoolWide: true, color: 'amber', isClosedDay: true },
            ])
          }}
        />}
      </div>

      {createModal && (
        <EventModal defaultDate={createModal.date} defaultHour={createModal.hour}
          onClose={() => { setCreateModal(null); setEditEvent(null) }}
          onSave={handleSaveEvent} />
      )}
      {editEvent && (
        <EventModal defaultDate={editEvent.date} defaultHour={8} editEvent={editEvent}
          onClose={() => setEditEvent(null)}
          onSave={handleSaveEvent} onDelete={handleDeleteEvent} />
      )}
      {viewEvent && (
        <ViewEventModal event={viewEvent}
          onClose={() => setViewEvent(null)}
          onEdit={() => { setEditEvent(viewEvent); setViewEvent(null) }}
          onDelete={() => { handleDeleteEvent(viewEvent.id); setViewEvent(null) }} />
      )}
    </div>
  )
}
