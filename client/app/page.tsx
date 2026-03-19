'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles, Calendar, BookOpen, Zap, ChevronLeft, ChevronRight, Star, Upload, Wand2, CheckCircle2 } from 'lucide-react'

// ─── Nav ─────────────────────────────────────────────
function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-cream-100/90 backdrop-blur-md border-b border-ink-900/8 shadow-sm' : ''
    }`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center group-hover:bg-sage transition-colors duration-200">
            <Calendar className="w-4 h-4 text-cream-100" />
          </div>
          <span className="font-display text-lg text-ink-900 leading-none">Calendar AI</span>
        </Link>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-8">
          <Link href="/pricing" className="nav-link">Pricing</Link>
          <Link href="/contact" className="nav-link">Contact</Link>
          <Link href="/schedule-demo" className="nav-link">Request Demo</Link>
        </div>

        {/* Auth buttons */}
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary py-2 px-4 text-sm">Log in</Link>
          <Link href="/signup" className="btn-primary py-2 px-4 text-sm">Sign up</Link>
        </div>
      </div>
    </nav>
  )
}

// ─── Hero Demo Visual ────────────────────────────────
function HeroDemo() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const lessons = [
    { day: 0, type: 'lesson', text: 'Intro to Quadratics', color: 'sage' },
    { day: 0, type: 'hw', text: 'HW: p.34 #1–12' },
    { day: 1, type: 'lesson', text: 'Factoring Methods', color: 'sage' },
    { day: 1, type: 'milestone', text: 'Unit 4 Begins' },
    { day: 2, type: 'lesson', text: 'Completing the Square', color: 'sage' },
    { day: 2, type: 'hw', text: 'HW: Worksheet A' },
    { day: 3, type: 'assessment', text: 'Quiz: Ch. 4.1–4.3' },
    { day: 4, type: 'lesson', text: 'Quadratic Formula', color: 'sage' },
    { day: 4, type: 'hw', text: 'HW: p.58 #1–20' },
  ]

  return (
    <div className="relative bg-white rounded-2xl border border-ink-900/10 shadow-2xl overflow-hidden">
      {/* Mini topbar */}
      <div className="bg-ink-900 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-light/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-sage/60" />
        </div>
        <span className="font-mono text-xs text-cream-300">Algebra 2 — Week of Feb 17</span>
        <div className="w-16 h-4 rounded-full bg-sage/30 flex items-center justify-center">
          <span className="font-body text-[9px] text-sage-300 font-medium">AI • ON</span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-5 border-b border-ink-900/8">
        {days.map(d => (
          <div key={d} className="py-2 text-center border-r border-ink-900/8 last:border-r-0">
            <span className="font-body text-xs font-medium text-ink-400">{d}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 min-h-[140px]">
        {[0, 1, 2, 3, 4].map(dayIdx => (
          <div key={dayIdx} className={`p-2 border-r border-ink-900/6 last:border-r-0 space-y-1 ${dayIdx === 3 ? 'bg-cream-50' : ''}`}>
            <span className="font-mono text-[10px] text-ink-300">{17 + dayIdx}</span>
            {lessons
              .filter(l => l.day === dayIdx)
              .map((l, i) => (
                <div
                  key={i}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-body truncate font-medium leading-tight
                    ${l.type === 'lesson' ? 'bg-sage/15 text-sage-700' : ''}
                    ${l.type === 'hw' ? 'bg-blue-50 text-blue-600' : ''}
                    ${l.type === 'assessment' ? 'bg-red-50 text-red-600' : ''}
                    ${l.type === 'milestone' ? 'bg-purple-50 text-purple-600' : ''}
                  `}
                >
                  {l.type === 'hw' ? l.text : l.text}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* AI sidebar strip */}
      <div className="bg-ink-900 px-3 py-2.5 flex items-center gap-3">
        <Sparkles className="w-3.5 h-3.5 text-sage flex-shrink-0" />
        <p className="font-body text-[10px] text-cream-300 leading-snug">
          <span className="text-sage font-medium">AI generated</span> this week's plan from your syllabus. 
          3 lessons, 1 quiz, 2 HW sets placed based on your schedule.
        </p>
        <div className="flex gap-1.5 ml-auto flex-shrink-0">
          <button className="text-[9px] px-2 py-1 bg-sage rounded-full text-white font-medium">Accept</button>
          <button className="text-[9px] px-2 py-1 bg-white/10 rounded-full text-cream-300 font-medium">Edit</button>
        </div>
      </div>
    </div>
  )
}

// ─── Testimonials ────────────────────────────────────
const testimonials = [
  {
    name: 'Sarah C.',
    role: 'AP Physics Teacher',
    stars: 5,
    text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.',
  },
  {
    name: 'Marcus W.',
    role: 'English Department Head',
    stars: 5,
    text: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident sunt in culpa.',
  },
  {
    name: 'Priya S.',
    role: 'Calculus Teacher',
    stars: 5,
    text: 'Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.',
  },
  {
    name: 'Tom O.',
    role: 'History Teacher',
    stars: 5,
    text: 'Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet consectetur adipisci velit. Sed quia non numquam eius modi tempora incidunt labore et dolore magnam.',
  },
];

function Testimonials() {
  const [idx, setIdx] = useState(0)
  const prev = () => setIdx((i) => (i - 1 + testimonials.length) % testimonials.length)
  const next = () => setIdx((i) => (i + 1) % testimonials.length)

  return (
    <div className="relative max-w-2xl mx-auto">
      <div className="card p-8 text-center">
        <div className="flex justify-center gap-0.5 mb-5">
          {Array.from({ length: testimonials[idx].stars }).map((_, i) => (
            <Star key={i} className="w-4 h-4 fill-amber text-amber" />
          ))}
        </div>
        <p className="font-display text-xl text-ink-900 leading-relaxed mb-6 italic">
          "{testimonials[idx].text}"
        </p>
        <div>
          <p className="font-body font-semibold text-sm text-ink-900">{testimonials[idx].name}</p>
          <p className="font-body text-xs text-ink-400 mt-0.5">{testimonials[idx].role}</p>
        </div>
      </div>

      <div className="flex justify-center items-center gap-4 mt-6">
        <button onClick={prev} className="w-9 h-9 rounded-full border border-ink-900/15 flex items-center justify-center hover:border-ink-900/40 transition-colors">
          <ChevronLeft className="w-4 h-4 text-ink-600" />
        </button>
        <div className="flex gap-1.5">
          {testimonials.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${i === idx ? 'w-5 bg-ink-900' : 'w-1.5 bg-ink-900/20'}`}
            />
          ))}
        </div>
        <button onClick={next} className="w-9 h-9 rounded-full border border-ink-900/15 flex items-center justify-center hover:border-ink-900/40 transition-colors">
          <ChevronRight className="w-4 h-4 text-ink-600" />
        </button>
      </div>
    </div>
  )
}

// ─── How it works ────────────────────────────────────
const steps = [
  {
    icon: Upload,
    number: '01',
    title: 'Upload your syllabus',
    desc: 'Drop in your syllabus PDF or paste your course requirements. Calendar AI reads it all.',
  },
  {
    icon: Wand2,
    number: '02',
    title: 'AI builds your plan',
    desc: 'The AI maps lessons, assessments, and homework across the semester — respecting school breaks and your preferences.',
  },
  {
    icon: CheckCircle2,
    number: '03',
    title: 'Accept, edit, reflow',
    desc: 'Review every AI suggestion. Accept what you like, tweak what you don\'t. Drag and reorder any day.',
  },
]

// ─── Page ────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <MarketingNav />

      {/* ── Hero ─────────────────────────────── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <div className="page-enter">
              {/* Eyebrow */}
              <div className="inline-flex items-center gap-2 bg-sage/12 border border-sage/25 text-sage-600 text-xs font-body font-medium px-3 py-1.5 rounded-full mb-8">
                <Sparkles className="w-3 h-3" />
                AI-powered lesson planning
              </div>

              <h1 className="font-display text-5xl xl:text-6xl text-ink-900 mb-6 leading-tight">
                The lesson-planning calendar that{' '}
                <span className="italic text-sage">writes your plan</span>{' '}
                for you.
              </h1>

              <p className="font-body text-lg text-ink-500 mb-10 max-w-lg leading-relaxed">
                Upload your syllabus and school calendar. Calendar AI generates a week-by-week lesson plan you can edit, drag, and reflow — in seconds.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup" className="btn-sage px-7 py-3 text-base gap-2.5">
                  Create free account
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link href="/schedule-demo" className="btn-secondary px-7 py-3 text-base">
                  Schedule a demo
                </Link>
              </div>

              <p className="font-body text-xs text-ink-400 mt-4">
                Free forever for individual teachers. No credit card required.
              </p>
            </div>

            {/* Right: demo */}
            <div className="delay-200 page-enter opacity-0">
              <HeroDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature strip ────────────────────── */}
      <section className="py-5 bg-ink-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-nowrap items-center justify-center gap-x-5 overflow-x-auto scrollbar-none">
            {[
              'AI lesson planning',
              'Drag & reflow days',
              'Syllabus upload',
              'Monthly & weekly views',
              'Smart constraint awareness',
              'Accept / decline changes',
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-cream-300 flex-shrink-0">
                {i > 0 && <div className="w-px h-3 bg-white/15 mr-1 flex-shrink-0" />}
                <div className="w-1 h-1 rounded-full bg-sage flex-shrink-0" />
                <span className="font-body text-sm whitespace-nowrap">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo Video ───────────────────────── */}
      <section className="py-16 px-6 bg-ink-900">
        <div className="max-w-4xl mx-auto">

          {/* Video frame */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10">
            <div className="bg-ink-800 px-4 py-2.5 flex items-center gap-2 border-b border-white/8">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400/50" />
                <div className="w-3 h-3 rounded-full bg-amber/50" />
                <div className="w-3 h-3 rounded-full bg-sage/50" />
              </div>
              <span className="font-mono text-xs text-cream-300/50 ml-2">Calendar AI — Demo</span>
            </div>
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/WzcL3T-m5CE?rel=0&modestbranding=1&color=white"
                title="Calendar AI Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

          <div className="flex justify-center mt-8">
            <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-ink-900 px-7 py-3 rounded-full font-body font-semibold text-base hover:shadow-lg hover:-translate-y-0.5 transition-all gap-2.5">
              Try it yourself
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-3">How it works</p>
            <h2 className="font-display text-4xl text-ink-900">From syllabus to semester in minutes</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className={`card p-8 delay-${(i + 1) * 100} page-enter`}>
                <div className="flex items-start justify-between mb-6">
                  <div className="w-11 h-11 bg-sage/12 rounded-xl flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-sage" />
                  </div>
                  <span className="font-display text-4xl text-ink-900/8">{step.number}</span>
                </div>
                <h3 className="font-display text-xl text-ink-900 mb-3">{step.title}</h3>
                <p className="font-body text-sm text-ink-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features deep dive ───────────────── */}
      <section className="py-24 px-6 bg-ink-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-3">Features</p>
            <h2 className="font-display text-4xl text-cream-100">Built for how teachers actually work</h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Sparkles, title: 'AI that understands context', desc: "Knows not to start a new unit before winter break. Respects your test-day preferences. Thinks like a teacher." },
              { icon: Calendar, title: 'Monthly & weekly views', desc: "See the big picture or zoom into the details. Seamlessly switch between views with all content staying in sync." },
              { icon: Zap, title: 'Accept or decline every change', desc: "AI never changes anything without your review. Every suggestion is explicit — one click to accept or decline." },
              { icon: BookOpen, title: 'Rich lesson plans', desc: "Full rich-text editor per day. Lesson topic, HW, assessments, milestones — all structured and searchable." },
              { icon: Upload, title: 'Syllabus & school calendar upload', desc: "PDF, PNG, JPG — paste or upload. AI reads your materials and maps them into structured lesson objects." },
              { icon: Wand2, title: 'One calendar per course', desc: "Algebra 2, AP Lit, World History — each gets its own calendar. Clone a calendar to jump-start next year." },
            ].map((f, i) => (
              <div key={i} className="bg-white/5 border border-white/8 rounded-2xl p-6 hover:bg-white/8 transition-colors">
                <div className="w-10 h-10 bg-sage/20 rounded-xl flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-sage" />
                </div>
                <h3 className="font-display text-lg text-cream-100 mb-2">{f.title}</h3>
                <p className="font-body text-sm text-cream-300 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-3">Testimonials</p>
            <h2 className="font-display text-4xl text-ink-900">Loved by teachers</h2>
          </div>
          <Testimonials />
        </div>
      </section>

      {/* ── CTA ──────────────────────────────── */}
      <section className="py-20 px-6 bg-sage">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-4xl text-white mb-4">Start planning smarter today</h2>
          <p className="font-body text-sage-100 mb-8">Free for individual teachers. No credit card needed.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-sage px-8 py-3.5 rounded-full font-body font-semibold text-base hover:shadow-lg hover:-translate-y-0.5 transition-all">
            Create free account
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────── */}
      <footer className="py-10 px-6 border-t border-ink-900/8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-ink-900 rounded-lg flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 text-cream-100" />
            </div>
            <span className="font-display text-base text-ink-900">Calendar AI</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="font-body text-xs text-ink-400 hover:text-ink-900 transition-colors">Pricing</Link>
            <Link href="/contact" className="font-body text-xs text-ink-400 hover:text-ink-900 transition-colors">Contact</Link>
            <Link href="/schedule-demo" className="font-body text-xs text-ink-400 hover:text-ink-900 transition-colors">Demo</Link>
            <span className="font-body text-xs text-ink-300">© 2025 Calendar AI</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
