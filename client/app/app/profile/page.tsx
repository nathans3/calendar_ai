'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar, ArrowLeft, Loader2, Plus, Trash2, Clock,
  Check, School, User, LogOut, AlertCircle, Upload, ChevronRight, X
} from 'lucide-react'
import { api, clearSession, PeriodConfig, UserProfile } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'

function fmt12(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── Reusable Period Editor ────────────────────────────────
function PeriodEditor({
  periods, setPeriods, defaultStart = '08:00',
}: {
  periods: PeriodConfig[]
  setPeriods: (p: PeriodConfig[]) => void
  defaultStart?: string
}) {
  const toHHMM = (mins: number) => {
    const hh = Math.floor(mins / 60) % 24
    const mm = mins % 60
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  const addPeriod = () => {
    const id = `p${Date.now()}`
    const lastEnd = periods.length > 0 ? periods[periods.length - 1].endTime : defaultStart
    const [h, m] = lastEnd.split(':').map(Number)
    const startMins = h * 60 + m
    const endMins   = startMins + 45
    setPeriods([...periods, { id, label: `Period ${periods.length + 1}`, durationMinutes: 45, startTime: toHHMM(startMins), endTime: toHHMM(endMins) }])
  }

  const updatePeriod = (id: string, field: keyof PeriodConfig, value: string | number) => {
    setPeriods(periods.map(p => {
      if (p.id !== id) return p
      const updated = { ...p, [field]: value }
      if (field === 'startTime' || field === 'durationMinutes') {
        const [h, m] = (field === 'startTime' ? String(value) : updated.startTime).split(':').map(Number)
        const dur = field === 'durationMinutes' ? Number(value) : updated.durationMinutes
        updated.endTime = toHHMM(h * 60 + m + dur)
      }
      return updated
    }))
  }

  const removePeriod = (id: string) => setPeriods(periods.filter(p => p.id !== id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide">Periods</p>
        <button onClick={addPeriod} className="flex items-center gap-1.5 font-body text-xs text-sage hover:text-sage-700 transition-colors">
          <Plus className="w-3.5 h-3.5" />Add period
        </button>
      </div>
      {periods.length === 0 ? (
        <div className="text-center py-5 border-2 border-dashed border-ink-900/10 rounded-xl">
          <p className="font-body text-sm text-ink-400 mb-1">No periods yet</p>
          <button onClick={addPeriod} className="mt-1 font-body text-xs text-sage hover:underline">+ Add first period</button>
        </div>
      ) : (
        <div className="space-y-2">
          {periods.map((p, idx) => (
            <div key={p.id} className="bg-ink-50/60 border border-ink-900/8 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-body text-[10px] text-ink-400 font-semibold w-4">{idx + 1}</span>
                <input type="text" value={p.label} onChange={e => updatePeriod(p.id, 'label', e.target.value)}
                  placeholder="e.g. Period 3" className="flex-1 input-field text-sm py-1.5 font-medium" />
                <button onClick={() => removePeriod(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
              <div className="flex items-center gap-2 pl-6">
                <div className="flex items-center gap-1.5 flex-1">
                  <Clock className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                  <input type="time" value={p.startTime} onChange={e => updatePeriod(p.id, 'startTime', e.target.value)} className="input-field text-xs py-1.5 flex-1 min-w-0" />
                  <span className="font-body text-xs text-ink-400">–</span>
                  <input type="time" value={p.endTime} onChange={e => updatePeriod(p.id, 'endTime', e.target.value)} className="input-field text-xs py-1.5 flex-1 min-w-0" />
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
      {periods.length > 0 && (
        <div className="bg-sage/5 border border-sage/15 rounded-xl px-4 py-3">
          <p className="font-body text-xs font-semibold text-sage-700 mb-1.5">Preview</p>
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
    </div>
  )
}

// ─── Collapsible section ───────────────────────────────────
function CollapsibleSection({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-ink-900/8 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-ink-50/50 transition-colors text-left">
        <div>
          <span className="font-body text-sm font-semibold text-ink-800">{title}</span>
          {subtitle && <span className="font-body text-xs text-ink-400 ml-2">{subtitle}</span>}
        </div>
        <ChevronRight className={`w-4 h-4 text-ink-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-4 py-4 bg-white border-t border-ink-900/6">{children}</div>}
    </div>
  )
}

interface SpecialDaySchedule {
  id: string; name: string; dayStart: string; dayEnd: string; periods: PeriodConfig[]
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth(true)

  const [profile,        setProfile]        = useState<UserProfile | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [error,          setError]          = useState('')
  const [isDirty,        setIsDirty]        = useState(false)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const pendingNavRef = useRef<string | null>(null)

  // Account
  const [fullName,       setFullName]       = useState('')
  const [schoolName,     setSchoolName]     = useState('')
  const [timezone,       setTimezone]       = useState('America/New_York')

  // Regular schedule
  const [schoolDayStart, setSchoolDayStart] = useState('08:00')
  const [schoolDayEnd,   setSchoolDayEnd]   = useState('15:00')
  const [periods,        setPeriods]        = useState<PeriodConfig[]>([])

  // Special day schedules
  const [specialDays, setSpecialDays] = useState<SpecialDaySchedule[]>([])

  // Upload
  const [uploading, setUploading]     = useState(false)
  const [uploadMsg, setUploadMsg]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) return
    api.profile.get()
      .then(p => {
        setProfile(p)
        setFullName(p.fullName || '')
        setSchoolName(p.schoolName || '')
        setSchoolDayStart(p.schoolDayStart || '08:00')
        setSchoolDayEnd(p.schoolDayEnd || '15:00')
        setPeriods(p.periods || [])
        setTimezone((p as any).timezone || 'America/New_York')
        const ext = (p as any).specialDays
        if (ext && Array.isArray(ext)) setSpecialDays(ext)
        setIsDirty(false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const addSpecialDay = (preset?: Partial<SpecialDaySchedule>) => {
    setSpecialDays(prev => [...prev, {
      id: `sd${Date.now()}`,
      name: preset?.name || 'Special Day',
      dayStart: preset?.dayStart || schoolDayStart,
      dayEnd:   preset?.dayEnd   || schoolDayEnd,
      periods:  preset?.periods  || [],
    }])
    setIsDirty(true)
  }

  // Parse a plain text schedule file into PeriodConfig[]
  const handleFileUpload = async (file: File) => {
    setUploading(true)
    setUploadMsg('')
    try {
      const text = await file.text()
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const parsed: PeriodConfig[] = []
      const timeRe  = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/
      const labelRe = /(?:period|class|block|hr|homeroom)[^\d]*\d+[\w/]*|[A-Z][^0-9\n:]{2,20}/i
      for (const line of lines) {
        const timeMatch = timeRe.exec(line)
        if (!timeMatch) continue
        const labelMatch = labelRe.exec(line)
        const startTime = timeMatch[1].length === 4 ? `0${timeMatch[1]}` : timeMatch[1]
        const endTime   = timeMatch[2].length === 4 ? `0${timeMatch[2]}` : timeMatch[2]
        const [sh, sm] = startTime.split(':').map(Number)
        const [eh, em] = endTime.split(':').map(Number)
        const durationMinutes = (eh * 60 + em) - (sh * 60 + sm)
        const label = labelMatch ? labelMatch[0].trim() : `Period ${parsed.length + 1}`
        parsed.push({ id: `pu${Date.now()}-${parsed.length}`, label, startTime, endTime, durationMinutes })
      }
      if (parsed.length === 0) {
        setUploadMsg('Could not detect periods. Expected format: "Period 1  8:00 – 8:45"')
      } else {
        setPeriods(parsed)
        setUploadMsg(`✓ Loaded ${parsed.length} period${parsed.length !== 1 ? 's' : ''} from file`)
      }
    } catch { setUploadMsg('Error reading file') }
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.profile.update({
        fullName, schoolName, schoolDayStart, schoolDayEnd, periods, timezone,
        ...(specialDays.length > 0 ? { specialDays } as any : {}),
      })
      setSaved(true)
      setIsDirty(false)
      setTimeout(() => setSaved(false), 2500)
    } catch (e: any) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try { await api.auth.logout() } catch {}
    clearSession()
    router.replace('/login')
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sage animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100">
      {/* ── Unsaved Changes Modal ── */}
      {showNavWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl text-ink-900">Unsaved changes</h3>
                <p className="font-body text-sm text-ink-500 mt-1">Do you want to save your changes before leaving?</p>
              </div>
              <button onClick={() => setShowNavWarning(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-ink-900/6">
                <X className="w-3.5 h-3.5 text-ink-500" />
              </button>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => {
                  setShowNavWarning(false)
                  if (pendingNavRef.current) router.push(pendingNavRef.current)
                }}
                className="btn-secondary flex-1 justify-center text-sm"
              >
                Discard
              </button>
              <button
                onClick={async () => {
                  setShowNavWarning(false)
                  await handleSave()
                  if (pendingNavRef.current) router.push(pendingNavRef.current)
                }}
                className="btn-sage flex-1 justify-center text-sm gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />Save &amp; leave
              </button>
            </div>
          </div>
        </div>
      )}
      <nav className="bg-cream-100/90 border-b border-ink-900/8 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => {
              if (isDirty) {
                pendingNavRef.current = '/app'
                setShowNavWarning(true)
              } else {
                router.push('/app')
              }
            }}
            className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />Dashboard
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-ink-900 rounded-lg flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-cream-100" />
            </div>
            <span className="font-display text-base text-ink-900">Calendar AI</span>
          </div>
          <button onClick={handleSignOut} className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors">
            <LogOut className="w-4 h-4" />Sign out
          </button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-6 page-enter">
        <div>
          <h1 className="font-display text-4xl text-ink-900 mb-1">Profile</h1>
          <p className="font-body text-sm text-ink-400">Manage your account and school schedules</p>
        </div>

        {/* ── Account Info ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-ink-900/8">
            <User className="w-4 h-4 text-ink-400" />
            <h2 className="font-body font-semibold text-sm text-ink-900">Account</h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="font-body text-xs text-ink-500 mb-1.5 block font-semibold uppercase tracking-wide">Full Name</label>
              <input type="text" value={fullName} onChange={e => { setFullName(e.target.value); setIsDirty(true) }}
                placeholder="Your name" className="input-field w-full" />
            </div>
            <div>
              <label className="font-body text-xs text-ink-500 mb-1.5 block font-semibold uppercase tracking-wide">School Name</label>
              <input type="text" value={schoolName} onChange={e => { setSchoolName(e.target.value); setIsDirty(true) }}
                placeholder="e.g. Lincoln High School" className="input-field w-full" />
            </div>
            <div>
              <label className="font-body text-xs text-ink-500 mb-1.5 block font-semibold uppercase tracking-wide">Email</label>
              <input type="email" value={profile?.email || ''} disabled
                className="input-field w-full opacity-50 cursor-not-allowed" />
            </div>
            <div>
              <label className="font-body text-xs text-ink-500 mb-1.5 block font-semibold uppercase tracking-wide">Time Zone</label>
              <select value={timezone} onChange={e => { setTimezone(e.target.value); setIsDirty(true) }} className="input-field w-full">
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Phoenix">Arizona – no DST (MST)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
                <option value="America/Anchorage">Alaska (AKT)</option>
                <option value="Pacific/Honolulu">Hawaii (HT)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Regular Bell Schedule ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-900/8">
            <div className="flex items-center gap-2">
              <School className="w-4 h-4 text-ink-400" />
              <h2 className="font-body font-semibold text-sm text-ink-900">Regular Bell Schedule</h2>
              {periods.length > 0 && (
                <span className="font-body text-xs text-ink-400 bg-ink-900/6 px-2 py-0.5 rounded-full">
                  {periods.length} period{periods.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); e.target.value = '' }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-1.5 font-body text-xs text-ink-500 hover:text-sage border border-ink-900/12 hover:border-sage/40 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Upload a .txt or .csv schedule file">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Upload
              </button>
            </div>
          </div>

          {uploadMsg && (
            <div className={`mx-6 mt-3 px-3 py-2 rounded-lg text-xs font-body ${uploadMsg.startsWith('✓') ? 'bg-sage/8 text-sage-700' : 'bg-red-50 text-red-600'}`}>
              {uploadMsg}
            </div>
          )}

          <div className="px-6 py-5 space-y-5">
            <div>
              <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">School Day Hours</p>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="font-body text-xs text-ink-500 mb-1 block">Starts</label>
                  <input type="time" value={schoolDayStart} onChange={e => { setSchoolDayStart(e.target.value); setIsDirty(true) }} className="input-field text-sm py-2 w-full" />
                </div>
                <div className="flex-1">
                  <label className="font-body text-xs text-ink-500 mb-1 block">Ends</label>
                  <input type="time" value={schoolDayEnd} onChange={e => { setSchoolDayEnd(e.target.value); setIsDirty(true) }} className="input-field text-sm py-2 w-full" />
                </div>
              </div>
            </div>
            <PeriodEditor periods={periods} setPeriods={(p) => { setPeriods(p); setIsDirty(true) }} defaultStart={schoolDayStart} />
          </div>
        </div>

        {/* ── Special Day Schedules ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ink-900/8">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-ink-400" />
              <h2 className="font-body font-semibold text-sm text-ink-900">Special Day Schedules</h2>
            </div>
          </div>
          <div className="px-6 py-5 space-y-4">
            <p className="font-body text-xs text-ink-400">
              Define alternate schedules for special days. When you tell the AI "today is a single session day", it will use the matching schedule here to adjust period times and lesson planning.
            </p>

            {/* Quick-add preset buttons */}
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'Single Session', dayStart: schoolDayStart, dayEnd: '12:00' },
                { name: 'Half Day (AM)',  dayStart: schoolDayStart, dayEnd: '12:00' },
                { name: 'Half Day (PM)',  dayStart: '12:00',        dayEnd: schoolDayEnd },
                { name: 'Late Arrival',  dayStart: '10:00',        dayEnd: schoolDayEnd },
                { name: 'Early Dismissal', dayStart: schoolDayStart, dayEnd: '13:00' },
              ]
                .filter(p => !specialDays.find(s => s.name === p.name))
                .map(preset => (
                  <button key={preset.name} onClick={() => addSpecialDay(preset)}
                    className="flex items-center gap-1.5 font-body text-xs text-sage border border-sage/30 hover:bg-sage/5 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Plus className="w-3 h-3" />{preset.name}
                  </button>
                ))}
              <button onClick={() => addSpecialDay()}
                className="flex items-center gap-1.5 font-body text-xs text-ink-500 border border-ink-900/12 hover:border-ink-900/30 px-2.5 py-1.5 rounded-lg transition-colors">
                <Plus className="w-3 h-3" />Custom
              </button>
            </div>

            {specialDays.length > 0 && (
              <div className="space-y-2">
                {specialDays.map(sd => (
                  <CollapsibleSection key={sd.id} title={sd.name} subtitle={`${fmt12(sd.dayStart)} – ${fmt12(sd.dayEnd)}`}>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="font-body text-xs text-ink-500 mb-1 block">Name</label>
                          <input type="text" value={sd.name}
                            onChange={e => setSpecialDays(prev => prev.map(s => s.id === sd.id ? { ...s, name: e.target.value } : s))}
                            className="input-field text-sm py-1.5 w-full" />
                        </div>
                        <button onClick={() => setSpecialDays(prev => prev.filter(s => s.id !== sd.id))}
                          className="mt-5 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="font-body text-xs text-ink-500 mb-1 block">Day starts</label>
                          <input type="time" value={sd.dayStart}
                            onChange={e => setSpecialDays(prev => prev.map(s => s.id === sd.id ? { ...s, dayStart: e.target.value } : s))}
                            className="input-field text-sm py-1.5 w-full" />
                        </div>
                        <div className="flex-1">
                          <label className="font-body text-xs text-ink-500 mb-1 block">Day ends</label>
                          <input type="time" value={sd.dayEnd}
                            onChange={e => setSpecialDays(prev => prev.map(s => s.id === sd.id ? { ...s, dayEnd: e.target.value } : s))}
                            className="input-field text-sm py-1.5 w-full" />
                        </div>
                      </div>
                      <div>
                        <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Periods for this day type</p>
                        <PeriodEditor
                          periods={sd.periods}
                          setPeriods={p => setSpecialDays(prev => prev.map(s => s.id === sd.id ? { ...s, periods: p } : s))}
                          defaultStart={sd.dayStart}
                        />
                      </div>
                    </div>
                  </CollapsibleSection>
                ))}
              </div>
            )}

            {specialDays.length === 0 && (
              <p className="font-body text-xs text-ink-300 text-center py-2">No special day schedules yet. Add one above.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="font-body text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end pb-10">
          <button onClick={handleSave} disabled={saving} className="btn-sage gap-2 min-w-[120px] justify-center">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" />Saved!</> : 'Save changes'}
          </button>
        </div>
      </main>
    </div>
  )
}
