'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Sparkles, BookOpen, ArrowRight, Check, User } from 'lucide-react'

// ─── Demo accounts ─────────────────────────────────────
const DEMO_ACCOUNTS = [
  {
    id: 'free',
    label: 'Free Plan',
    name: 'Alex Rivera',
    school: 'Lincoln High School',
    email: 'alex@lincolnhs.edu',
    password: 'demo1234',
    plan: 'free',
    description: 'Basic calendar — no AI features. Explore the manual lesson planning, monthly/weekly views, and full schedule.',
    color: 'ink',
    icon: BookOpen,
    features: [
      'My Calendars dashboard',
      'Monthly & weekly course views',
      'Manual lesson plan editing',
      'Full Schedule (time grid)',
      'AI features locked (upgrade prompt)',
    ],
    calendars: ['Algebra 2', 'Geometry', 'Pre-Calculus'],
  },
  {
    id: 'pro',
    label: 'AI Plan',
    name: 'Rebecca Martinez',
    school: 'Jefferson Preparatory School',
    email: 'rebecca@jeffersonprep.edu',
    password: 'demo1234',
    plan: 'pro',
    description: 'Full AI access — see the complete product. AI sidebar, calendar generation, accept/decline suggestions.',
    color: 'sage',
    icon: Sparkles,
    features: [
      'Everything in Free, plus…',
      'AI sidebar chat (fully active)',
      'AI calendar generation from syllabus',
      'Accept / decline change suggestions',
      'Smart constraint awareness',
    ],
    calendars: ['AP Calculus BC', 'Algebra 2', 'Precalculus'],
  },
]

// ─── Mock auth — stores session in localStorage ────────
function loginAsDemo(account: typeof DEMO_ACCOUNTS[0], router: ReturnType<typeof useRouter>) {
  // Store mock session
  if (typeof window !== 'undefined') {
    localStorage.setItem('cal_ai_session', JSON.stringify({
      userId: `demo-${account.id}`,
      name: account.name,
      school: account.school,
      email: account.email,
      plan: account.plan,
      calendars: account.calendars,
    }))
  }
  router.push('/app')
}

// ─── Account Card ──────────────────────────────────────
function AccountCard({ account, loading, onSelect }: {
  account: typeof DEMO_ACCOUNTS[0]
  loading: boolean
  onSelect: () => void
}) {
  const Icon = account.icon
  const isPro = account.plan === 'pro'

  return (
    <div
      className={`relative rounded-2xl border-2 transition-all duration-200 overflow-hidden cursor-pointer group
        ${isPro
          ? 'bg-ink-900 border-sage/40 hover:border-sage shadow-xl'
          : 'bg-white border-ink-900/15 hover:border-ink-900/40 hover:shadow-md'
        }
      `}
      onClick={onSelect}
    >
      {isPro && (
        <div className="absolute top-0 right-0 bg-sage text-white text-[10px] font-body font-semibold px-3 py-1 rounded-bl-xl">
          AI ENABLED
        </div>
      )}

      <div className="p-7">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
            ${isPro ? 'bg-sage/20' : 'bg-ink-900/6'}
          `}>
            <Icon className={`w-5 h-5 ${isPro ? 'text-sage' : 'text-ink-700'}`} />
          </div>
          <div>
            <div className={`font-body text-xs font-semibold uppercase tracking-widest mb-0.5 ${isPro ? 'text-sage' : 'text-ink-400'}`}>
              {account.label}
            </div>
            <div className={`font-display text-xl ${isPro ? 'text-cream-100' : 'text-ink-900'}`}>
              {account.name}
            </div>
            <div className={`font-body text-xs mt-0.5 ${isPro ? 'text-cream-400' : 'text-ink-400'}`}>
              {account.school}
            </div>
          </div>
        </div>

        {/* Description */}
        <p className={`font-body text-sm leading-relaxed mb-5 ${isPro ? 'text-cream-300' : 'text-ink-500'}`}>
          {account.description}
        </p>

        {/* Features */}
        <ul className="space-y-2 mb-6">
          {account.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isPro ? (i === 0 ? 'text-sage' : 'text-sage/70') : 'text-ink-400'}`} />
              <span className={`font-body text-xs ${isPro ? (i === 0 ? 'text-sage font-medium' : 'text-cream-400') : 'text-ink-600'}`}>
                {f}
              </span>
            </li>
          ))}
        </ul>

        {/* Calendars preview */}
        <div className={`rounded-xl p-3 mb-6 ${isPro ? 'bg-white/6' : 'bg-ink-900/3'}`}>
          <p className={`font-body text-[10px] font-semibold uppercase tracking-wider mb-2 ${isPro ? 'text-cream-500' : 'text-ink-400'}`}>
            Pre-loaded calendars
          </p>
          <div className="space-y-1">
            {account.calendars.map((cal, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isPro ? 'bg-sage/60' : 'bg-ink-900/30'}`} />
                <span className={`font-body text-xs ${isPro ? 'text-cream-300' : 'text-ink-600'}`}>{cal}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Credentials */}
        <div className={`rounded-xl p-3 mb-6 border ${isPro ? 'bg-white/4 border-white/8' : 'bg-ink-900/3 border-ink-900/8'}`}>
          <p className={`font-body text-[10px] font-semibold uppercase tracking-wider mb-2 ${isPro ? 'text-cream-500' : 'text-ink-400'}`}>
            Login credentials
          </p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[10px] w-14 ${isPro ? 'text-cream-500' : 'text-ink-400'}`}>email</span>
              <span className={`font-mono text-xs ${isPro ? 'text-cream-200' : 'text-ink-700'}`}>{account.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[10px] w-14 ${isPro ? 'text-cream-500' : 'text-ink-400'}`}>password</span>
              <span className={`font-mono text-xs ${isPro ? 'text-cream-200' : 'text-ink-700'}`}>{account.password}</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-body font-semibold text-sm transition-all
            ${isPro
              ? 'bg-sage text-white hover:bg-sage-600 group-hover:shadow-lg'
              : 'bg-ink-900 text-white hover:bg-ink-800 group-hover:shadow-md'
            }
            ${loading ? 'opacity-60 cursor-not-allowed' : ''}
          `}
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Signing in…
            </>
          ) : (
            <>
              Enter as {account.name.split(' ')[0]}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────
export default function DemoLoginPage() {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const handleSelect = (account: typeof DEMO_ACCOUNTS[0]) => {
    if (loadingId) return
    setLoadingId(account.id)
    // Small delay for visual feedback
    setTimeout(() => loginAsDemo(account, router), 600)
  }

  return (
    <div className="min-h-screen bg-cream-100">
      {/* Nav */}
      <div className="border-b border-ink-900/8 bg-cream-100/90 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center group-hover:bg-sage transition-colors">
              <Calendar className="w-4 h-4 text-cream-100" />
            </div>
            <span className="font-display text-lg text-ink-900">Calendar AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary py-2 px-4 text-sm">Real login</Link>
            <Link href="/signup" className="btn-primary py-2 px-4 text-sm">Sign up</Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-16 page-enter">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-amber/12 border border-amber/25 text-amber-dark text-xs font-body font-medium px-3 py-1.5 rounded-full mb-6">
            <User className="w-3 h-3" />
            Test accounts — no signup needed
          </div>
          <h1 className="font-display text-4xl text-ink-900 mb-3">Choose a test account</h1>
          <p className="font-body text-base text-ink-500 max-w-md mx-auto">
            Jump straight into the app as either a free-plan or AI-plan user. Everything is pre-loaded with sample calendars.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {DEMO_ACCOUNTS.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              loading={loadingId === account.id}
              onSelect={() => handleSelect(account)}
            />
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center font-body text-xs text-ink-400 mt-8">
          These are demo accounts for testing only. No real data is stored.{' '}
          <Link href="/signup" className="text-ink-600 hover:text-ink-900 underline underline-offset-2 transition-colors">
            Create a real account
          </Link>
          {' '}to save your work.
        </p>
      </main>
    </div>
  )
}
