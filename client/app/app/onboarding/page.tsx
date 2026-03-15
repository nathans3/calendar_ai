'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar, ArrowRight, ArrowLeft, Check, Loader2,
  Plus, Trash2, Clock, School, Sparkles
} from 'lucide-react'
import { api, clearSession, PeriodConfig } from '../../../lib/api'
import { useAuth } from '../../../lib/useAuth'

function fmt12(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

const STEPS = ['Welcome', 'Your School', 'Bell Schedule', 'All Set']

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth(true)

  const [step,           setStep]           = useState(0)
  const [saving,         setSaving]         = useState(false)

  // Step 2 fields
  const [schoolName,     setSchoolName]     = useState('')
  const [schoolDayStart, setSchoolDayStart] = useState('08:00')
  const [schoolDayEnd,   setSchoolDayEnd]   = useState('15:00')

  // Step 3 fields
  const [periods, setPeriods] = useState<PeriodConfig[]>([])

  useEffect(() => {
    if (user?.schoolName) setSchoolName(user.schoolName)
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

  const handleFinish = async () => {
    setSaving(true)
    try {
      await api.profile.update({ schoolName, schoolDayStart, schoolDayEnd, periods })
    } catch {}
    setSaving(false)
    setStep(3)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sage animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col">
      {/* Header */}
      <div className="border-b border-ink-900/8 bg-cream-100/90 backdrop-blur-md">
        <div className="max-w-xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center">
              <Calendar className="w-4 h-4 text-cream-100" />
            </div>
            <span className="font-display text-lg text-ink-900">Calendar AI</span>
          </div>
          {step < 3 && (
            <div className="flex items-center gap-1.5">
              {STEPS.slice(0, 3).map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
                  i < step ? 'w-6 bg-sage' : i === step ? 'w-8 bg-sage' : 'w-4 bg-ink-900/15'
                }`} />
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md page-enter">

          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-sage/10 rounded-2xl flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-sage" />
              </div>
              <div>
                <h1 className="font-display text-4xl text-ink-900 mb-2">
                  Welcome{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}!
                </h1>
                <p className="font-body text-base text-ink-500">
                  Let's get your Calendar AI set up in just a couple of steps.
                </p>
              </div>
              <div className="space-y-3 text-left bg-white border border-ink-900/8 rounded-2xl p-5">
                {[
                  { icon: School, text: 'Set your school name and hours' },
                  { icon: Clock, text: 'Configure your bell schedule' },
                  { icon: Calendar, text: 'Create your first course calendar' },
                ].map(({ icon: Icon, text }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-sage/10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-3.5 h-3.5 text-sage" />
                    </div>
                    <span className="font-body text-sm text-ink-700">{text}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="btn-sage w-full gap-2 justify-center py-3">
                Get started <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Step 1: School Info ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-3xl text-ink-900 mb-1">Your school</h1>
                <p className="font-body text-sm text-ink-400">Tell us about where you teach</p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5 block">
                    School name
                  </label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="e.g. Lincoln High School"
                    className="input-field w-full"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide mb-1.5 block">
                    School day hours
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="font-body text-xs text-ink-400 mb-1 block">Starts</label>
                      <input
                        type="time"
                        value={schoolDayStart}
                        onChange={e => setSchoolDayStart(e.target.value)}
                        className="input-field w-full text-sm py-2"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="font-body text-xs text-ink-400 mb-1 block">Ends</label>
                      <input
                        type="time"
                        value={schoolDayEnd}
                        onChange={e => setSchoolDayEnd(e.target.value)}
                        className="input-field w-full text-sm py-2"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="btn-secondary flex-1 gap-1.5 justify-center">
                  <ArrowLeft className="w-4 h-4" />Back
                </button>
                <button onClick={() => setStep(2)} className="btn-sage flex-1 gap-1.5 justify-center">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Bell Schedule ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-3xl text-ink-900 mb-1">Bell schedule</h1>
                <p className="font-body text-sm text-ink-400">Add your class periods (you can always edit these later)</p>
              </div>

              <div className="flex items-center justify-between">
                <p className="font-body text-xs font-semibold text-ink-500 uppercase tracking-wide">Periods</p>
                <button onClick={addPeriod} className="flex items-center gap-1.5 font-body text-xs text-sage hover:text-sage-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" />Add period
                </button>
              </div>

              {periods.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-ink-900/10 rounded-xl">
                  <p className="font-body text-sm text-ink-400 mb-1">No periods yet</p>
                  <p className="font-body text-xs text-ink-300 mb-3">Add your class periods here, or skip and add later</p>
                  <button onClick={addPeriod} className="btn-sage py-1.5 px-4 text-xs gap-1.5">
                    <Plus className="w-3 h-3" />Add first period
                  </button>
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {periods.map((p, idx) => (
                    <div key={p.id} className="bg-white border border-ink-900/8 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-body text-[10px] text-ink-400 font-semibold w-4">{idx + 1}</span>
                        <input
                          type="text"
                          value={p.label}
                          onChange={e => updatePeriod(p.id, 'label', e.target.value)}
                          placeholder="e.g. Period 3"
                          className="flex-1 input-field text-sm py-1.5 font-medium"
                        />
                        <button onClick={() => removePeriod(p.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pl-6">
                        <Clock className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                        <input
                          type="time"
                          value={p.startTime}
                          onChange={e => updatePeriod(p.id, 'startTime', e.target.value)}
                          className="input-field text-xs py-1.5 flex-1"
                        />
                        <span className="font-body text-xs text-ink-400">–</span>
                        <input
                          type="time"
                          value={p.endTime}
                          onChange={e => updatePeriod(p.id, 'endTime', e.target.value)}
                          className="input-field text-xs py-1.5 flex-1"
                        />
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={p.durationMinutes}
                          onChange={e => updatePeriod(p.id, 'durationMinutes', parseInt(e.target.value) || 45)}
                          className="input-field text-xs py-1.5 w-14 text-center"
                        />
                        <span className="font-body text-[10px] text-ink-400 flex-shrink-0">min</span>
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
                      <div key={p.id} className="flex justify-between">
                        <span className="font-body text-xs text-ink-700">{p.label}</span>
                        <span className="font-mono text-xs text-ink-400">{fmt12(p.startTime)} – {fmt12(p.endTime)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="btn-secondary flex-1 gap-1.5 justify-center">
                  <ArrowLeft className="w-4 h-4" />Back
                </button>
                <button
                  onClick={handleFinish}
                  disabled={saving}
                  className="btn-sage flex-1 gap-1.5 justify-center"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{periods.length === 0 ? 'Skip' : 'Save'} <ArrowRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 3 && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-sage/10 rounded-2xl flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-sage" />
              </div>
              <div>
                <h1 className="font-display text-4xl text-ink-900 mb-2">You're all set!</h1>
                <p className="font-body text-base text-ink-500">
                  Time to create your first course calendar and start planning.
                </p>
              </div>
              <button
                onClick={() => router.replace('/app')}
                className="btn-sage w-full gap-2 justify-center py-3"
              >
                Go to dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
