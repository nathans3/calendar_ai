'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar, ArrowLeft, Loader2, Plus, Trash2, Clock,
  Check, School, User, LogOut, ChevronDown, AlertCircle
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

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth(true)

  const [profile,        setProfile]        = useState<UserProfile | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [saved,          setSaved]          = useState(false)
  const [error,          setError]          = useState('')

  // Editable fields
  const [fullName,       setFullName]       = useState('')
  const [schoolName,     setSchoolName]     = useState('')
  const [schoolDayStart, setSchoolDayStart] = useState('08:00')
  const [schoolDayEnd,   setSchoolDayEnd]   = useState('15:00')
  const [periods,        setPeriods]        = useState<PeriodConfig[]>([])

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
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user])

  const addPeriod = () => {
    const id = `p${Date.now()}`
    const lastEnd = periods.length > 0 ? periods[periods.length - 1].endTime : schoolDayStart
    const [h, m] = lastEnd.split(':').map(Number)
    const startMins = h * 60 + m
    const endMins   = startMins + 45
    const toHHMM = (mins: number) => {
      const hh = Math.floor(mins / 60) % 24
      const mm = mins % 60
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
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
      if (field === 'startTime' || field === 'durationMinutes') {
        const [h, m] = (field === 'startTime' ? String(value) : updated.startTime).split(':').map(Number)
        const dur = field === 'durationMinutes' ? Number(value) : updated.durationMinutes
        const endMins = h * 60 + m + dur
        updated.endTime = `${String(Math.floor(endMins / 60) % 24).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`
      }
      return updated
    }))
  }

  const removePeriod = (id: string) => setPeriods(prev => prev.filter(p => p.id !== id))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.profile.update({ fullName, schoolName, schoolDayStart, schoolDayEnd, periods })
      setSaved(true)
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
      {/* Nav */}
      <nav className="bg-cream-100/90 border-b border-ink-900/8 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/app" className="flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />Dashboard
            </Link>
          </div>
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
          <p className="font-body text-sm text-ink-400">Manage your account and school schedule</p>
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
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Your name"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="font-body text-xs text-ink-500 mb-1.5 block font-semibold uppercase tracking-wide">School Name</label>
              <input
                type="text"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                placeholder="e.g. Lincoln High School"
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="font-body text-xs text-ink-500 mb-1.5 block font-semibold uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input-field w-full opacity-50 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* ── Bell Schedule ── */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-ink-900/8">
            <School className="w-4 h-4 text-ink-400" />
            <h2 className="font-body font-semibold text-sm text-ink-900">Bell Schedule</h2>
            {periods.length > 0 && (
              <span className="font-body text-xs text-ink-400 bg-ink-900/6 px-2 py-0.5 rounded-full">
                {periods.length} period{periods.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* School day hours */}
            <div>
              <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide mb-3">School Day Hours</p>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="font-body text-xs text-ink-500 mb-1 block">Starts</label>
                  <input
                    type="time"
                    value={schoolDayStart}
                    onChange={e => setSchoolDayStart(e.target.value)}
                    className="input-field text-sm py-2 w-full"
                  />
                </div>
                <div className="flex-1">
                  <label className="font-body text-xs text-ink-500 mb-1 block">Ends</label>
                  <input
                    type="time"
                    value={schoolDayEnd}
                    onChange={e => setSchoolDayEnd(e.target.value)}
                    className="input-field text-sm py-2 w-full"
                  />
                </div>
              </div>
            </div>

            {/* Periods */}
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
                  <p className="font-body text-xs text-ink-300">Add periods like "Period 7/8" with their start times</p>
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
                        <button
                          onClick={() => removePeriod(p.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <div className="flex items-center gap-1.5 flex-1">
                          <Clock className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                          <input
                            type="time"
                            value={p.startTime}
                            onChange={e => updatePeriod(p.id, 'startTime', e.target.value)}
                            className="input-field text-xs py-1.5 flex-1 min-w-0"
                          />
                          <span className="font-body text-xs text-ink-400">–</span>
                          <input
                            type="time"
                            value={p.endTime}
                            onChange={e => updatePeriod(p.id, 'endTime', e.target.value)}
                            className="input-field text-xs py-1.5 flex-1 min-w-0"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={240}
                            value={p.durationMinutes}
                            onChange={e => updatePeriod(p.id, 'durationMinutes', parseInt(e.target.value) || 45)}
                            className="input-field text-xs py-1.5 w-16 text-center"
                          />
                          <span className="font-body text-[10px] text-ink-400">min</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Schedule preview */}
            {periods.length > 0 && (
              <div className="bg-sage/5 border border-sage/15 rounded-xl px-4 py-3">
                <p className="font-body text-xs font-semibold text-sage-700 mb-2">Preview</p>
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
        </div>

        {/* Save */}
        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="font-body text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end pb-10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-sage gap-2 min-w-[120px] justify-center"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <><Check className="w-4 h-4" />Saved!</>
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
