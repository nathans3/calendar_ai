'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, Mail, Phone, CheckCircle2, ArrowLeft, MessageSquare } from 'lucide-react'

function Nav() {
  return (
    <nav className="border-b border-ink-900/8 bg-cream-100/90 backdrop-blur-md sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center group-hover:bg-sage transition-colors">
            <Calendar className="w-4 h-4 text-cream-100" />
          </div>
          <span className="font-display text-lg text-ink-900">Calendar AI</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          <Link href="/pricing" className="nav-link">Pricing</Link>
          <Link href="/contact" className="nav-link font-medium text-ink-900">Contact</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary py-2 px-4 text-sm">Log in</Link>
          <Link href="/signup" className="btn-primary py-2 px-4 text-sm">Sign up</Link>
        </div>
      </div>
    </nav>
  )
}

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // Simulate send — wire to backend /api/contact later
    await new Promise(r => setTimeout(r, 800))
    setLoading(false)
    setSubmitted(true)
  }

  const canSubmit = form.name.trim() && form.email.trim() && form.message.trim()

  return (
    <div className="min-h-screen bg-cream-100">
      <Nav />

      <main className="max-w-5xl mx-auto px-6 py-16 page-enter">
        <div className="mb-12">
          <Link href="/" className="inline-flex items-center gap-1.5 font-body text-sm text-ink-500 hover:text-ink-900 transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <p className="font-body text-xs font-medium text-sage uppercase tracking-widest mb-3">Contact</p>
          <h1 className="font-display text-5xl text-ink-900 mb-3">Get in touch</h1>
          <p className="font-body text-lg text-ink-500 max-w-lg">
            Questions, feedback, or want to explore Calendar AI for your school? We'd love to hear from you.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-10">
          {/* Contact info */}
          <div className="md:col-span-2 space-y-6">
            <div className="card p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-sage/12 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-sage" />
                </div>
                <div>
                  <p className="font-body text-xs font-semibold text-ink-400 uppercase tracking-wider mb-1">Email</p>
                  <a href="mailto:nathan.t.sekar@gmail.com"
                    className="font-body text-sm font-medium text-ink-900 hover:text-sage transition-colors break-all">
                    nathan.t.sekar@gmail.com
                  </a>
                </div>
              </div>

              <div className="h-px bg-ink-900/6" />

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-sage/12 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-sage" />
                </div>
                <div>
                  <p className="font-body text-xs font-semibold text-ink-400 uppercase tracking-wider mb-1">Phone</p>
                  <a href="tel:+16109553751"
                    className="font-body text-sm font-medium text-ink-900 hover:text-sage transition-colors">
                    (610) 955-3751
                  </a>
                </div>
              </div>

              <div className="h-px bg-ink-900/6" />

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-sage/12 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-sage" />
                </div>
                <div>
                  <p className="font-body text-xs font-semibold text-ink-400 uppercase tracking-wider mb-1">Response time</p>
                  <p className="font-body text-sm text-ink-600">We typically respond within 24–48 hours.</p>
                </div>
              </div>
            </div>

            {/* Demo CTA */}
            <div className="bg-ink-900 rounded-2xl p-6">
              <p className="font-body text-xs font-semibold text-sage uppercase tracking-wider mb-2">Schools & Districts</p>
              <p className="font-display text-xl text-cream-100 mb-3">Want a live demo?</p>
              <p className="font-body text-sm text-cream-300 mb-5 leading-relaxed">
                See Calendar AI in action with your team. We'll walk through the AI features and answer all your questions.
              </p>
              <Link href="/schedule-demo" className="btn-sage w-full justify-center text-sm py-2.5">
                Schedule a Demo
              </Link>
            </div>
          </div>

          {/* Contact form */}
          <div className="md:col-span-3">
            {!submitted ? (
              <div className="card p-8">
                <h2 className="font-display text-2xl text-ink-900 mb-6">Send us a message</h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Name</label>
                      <input type="text" placeholder="Your name" value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        className="input-field" />
                    </div>
                    <div>
                      <label className="label">Email</label>
                      <input type="email" placeholder="you@school.edu" value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        className="input-field" />
                    </div>
                  </div>

                  <div>
                    <label className="label">Subject</label>
                    <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                      className="input-field">
                      <option value="">Select a topic…</option>
                      <option value="general">General question</option>
                      <option value="demo">School / district demo</option>
                      <option value="pricing">Pricing inquiry</option>
                      <option value="support">Technical support</option>
                      <option value="feedback">Product feedback</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Message</label>
                    <textarea placeholder="Tell us what's on your mind…" rows={6} value={form.message}
                      onChange={e => setForm({ ...form, message: e.target.value })}
                      className="input-field resize-none" />
                  </div>

                  <button type="submit" disabled={!canSubmit || loading}
                    className={`btn-sage w-full justify-center py-3 ${!canSubmit || loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending…
                      </span>
                    ) : 'Send Message'}
                  </button>
                </form>
              </div>
            ) : (
              <div className="card p-12 text-center page-enter">
                <div className="w-16 h-16 bg-sage/12 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-8 h-8 text-sage" />
                </div>
                <h2 className="font-display text-3xl text-ink-900 mb-3">Message sent!</h2>
                <p className="font-body text-base text-ink-500 mb-8 max-w-sm mx-auto">
                  Thanks for reaching out. We'll get back to you at <strong>{form.email}</strong> within 24–48 hours.
                </p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { setSubmitted(false); setForm({ name: '', email: '', subject: '', message: '' }) }}
                    className="btn-secondary">
                    Send another
                  </button>
                  <Link href="/" className="btn-primary">Back to home</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-ink-900/8 mt-16">
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
