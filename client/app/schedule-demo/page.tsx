'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, CheckCircle2 } from 'lucide-react'

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
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary py-2 px-4 text-sm">Log in</Link>
          <Link href="/signup" className="btn-primary py-2 px-4 text-sm">Sign up</Link>
        </div>
      </div>
    </nav>
  )
}

export default function ScheduleDemoPage() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: '', email: '', school: '', teachers: '', message: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: connect to backend
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-cream-100">
      <Nav />

      <main className="max-w-xl mx-auto px-6 py-20 page-enter">
        {!submitted ? (
          <>
            <div className="text-center mb-10">
              <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-3">Request Demo</p>
              <h1 className="font-display text-4xl text-ink-900 mb-3">See Calendar AI in action</h1>
              <p className="font-body text-base text-ink-500">
                Tell us about your school and we'll reach out to schedule a personalized walkthrough.
              </p>
            </div>

            <div className="card p-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="label">Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Your name"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="you@school.edu"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label">School / District</label>
                  <input
                    type="text"
                    required
                    placeholder="Jefferson Prep"
                    value={form.school}
                    onChange={e => setForm({ ...form, school: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label"># of teachers (approx)</label>
                  <input
                    type="text"
                    placeholder="e.g. 40"
                    value={form.teachers}
                    onChange={e => setForm({ ...form, teachers: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="label">Message (optional)</label>
                  <textarea
                    placeholder="Anything you'd like us to know..."
                    rows={4}
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    className="input-field resize-none"
                  />
                </div>

                <button type="submit" className="btn-sage w-full justify-center py-3 mt-2">
                  Submit
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="card p-12 text-center page-enter">
            <div className="w-14 h-14 bg-sage/12 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-7 h-7 text-sage" />
            </div>
            <h2 className="font-display text-3xl text-ink-900 mb-3">We'll be in touch!</h2>
            <p className="font-body text-base text-ink-500 mb-8">
              We'll reach out within 24–48 hours.
            </p>
            <Link href="/" className="btn-secondary">
              Back to home
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
