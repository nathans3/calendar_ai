'use client'

import Link from 'next/link'
import { Check, Calendar } from 'lucide-react'

function Nav() {
  return (
    <nav className="border-b border-ink-900/8 bg-cream-100/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center group-hover:bg-sage transition-colors">
            <Calendar className="w-4 h-4 text-cream-100" />
          </div>
          <span className="font-display text-lg text-ink-900">Calendar AI</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="/pricing" className="nav-link font-medium text-ink-900">Pricing</Link>
          <Link href="/schedule-demo" className="nav-link">Request Demo</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary py-2 px-4 text-sm">Log in</Link>
          <Link href="/signup" className="btn-primary py-2 px-4 text-sm">Sign up</Link>
        </div>
      </div>
    </nav>
  )
}

const freeFeatures = [
  'Unlimited course calendars',
  'Monthly & weekly calendar views',
  'Manual lesson plan editing (rich text)',
  'Homework, assessments, milestones',
  'Full Calendar (schedule view)',
  'Event creation & management',
  'Import school year events',
]

const proFeatures = [
  'Everything in Smart Calendar Basic, plus…',
  'AI calendar generation from syllabus',
  'Syllabus & school calendar upload (PDF, PNG, JPG)',
  'RAG-powered AI understands your materials',
  'AI sidebar chat — replan, move, adjust',
  'Accept / decline AI suggestions per change',
  'Smart constraint awareness (no units before break)',
  'AI daily lesson plan assistant',
  'Change history & diff view',
  'Clone calendars for new school year',
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Nav />

      <main className="max-w-5xl mx-auto px-6 py-20 page-enter">
        <div className="text-center mb-16">
          <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-3">Pricing</p>
          <h1 className="font-display text-5xl text-ink-900 mb-4">Pricing that fits how schools buy.</h1>
          <p className="font-body text-lg text-ink-500 max-w-xl mx-auto">
            Individual teachers get the core calendar for free. AI features are available through your school or district.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free */}
          <div className="card p-8 flex flex-col">
            <div className="mb-6">
              <p className="font-body text-xs font-medium text-ink-400 uppercase tracking-widest mb-2">Individual</p>
              <h2 className="font-display text-3xl text-ink-900 mb-1">Smart Calendar <span className="italic">Basic</span></h2>
              <div className="flex items-baseline gap-1 mt-3 mb-4">
                <span className="font-display text-4xl text-ink-900">Free</span>
                <span className="font-body text-sm text-ink-400">forever</span>
              </div>
              <p className="font-body text-sm text-ink-500 leading-relaxed">
                A powerful calendar and lesson planner — without AI. Perfect for teachers who want structure without the subscription.
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {freeFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-sage flex-shrink-0 mt-0.5" />
                  <span className="font-body text-sm text-ink-700">{f}</span>
                </li>
              ))}
            </ul>

            <Link href="/signup" className="btn-secondary w-full justify-center py-3 text-sm">
              Create a Free Account
            </Link>
          </div>

          {/* Pro / School */}
          <div className="bg-ink-900 rounded-2xl p-8 flex flex-col relative overflow-hidden">
            {/* Top accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-sage/10 rounded-full -translate-y-16 translate-x-16" />

            <div className="mb-6 relative">
              <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-2">Schools & Districts</p>
              <h2 className="font-display text-3xl text-cream-100 mb-1">Smart Calendar <span className="italic text-sage">AI</span></h2>
              <div className="flex items-baseline gap-1 mt-3 mb-4">
                <span className="font-display text-3xl text-cream-100">Custom pricing</span>
              </div>
              <p className="font-body text-sm text-cream-300 leading-relaxed">
                Full AI capabilities for your team. Talk to us about pricing that works for your school or district budget.
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1 relative">
              {proFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${i === 0 ? 'text-amber' : 'text-sage'}`} />
                  <span className={`font-body text-sm ${i === 0 ? 'text-amber font-medium' : 'text-cream-200'}`}>{f}</span>
                </li>
              ))}
            </ul>

            <Link href="/schedule-demo" className="btn-sage w-full justify-center py-3 text-sm relative">
              Schedule a Demo
            </Link>
          </div>
        </div>

        {/* Note */}
        <p className="text-center font-body text-sm text-ink-400 mt-10">
          Not sure what you need? <Link href="/schedule-demo" className="text-sage hover:text-sage-600 transition-colors">Reach out</Link> and we'll find the right fit.
        </p>
      </main>
    </div>
  )
}
