'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, AlertCircle, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    setError('')
    setLoading(true)
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
    } catch {}
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col">
      <div className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center group-hover:bg-sage transition-colors">
            <Calendar className="w-4 h-4 text-cream-100" />
          </div>
          <span className="font-display text-lg text-ink-900">Calendar AI</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm page-enter">
          {!submitted ? (
            <>
              <div className="text-center mb-8">
                <h1 className="font-display text-4xl text-ink-900 mb-2">Reset your password</h1>
                <p className="font-body text-sm text-ink-400">We'll send you a link to create a new password.</p>
              </div>

              <div className="card p-7">
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="input-field"
                    autoComplete="email"
                  />

                  {error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span className="font-body text-xs">{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!email.trim() || loading}
                    className={`btn-sage w-full justify-center py-3 ${!email.trim() || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Sending…
                      </span>
                    ) : 'Send reset link'}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="card p-10 text-center page-enter">
              <div className="w-12 h-12 bg-sage/12 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-6 h-6 text-sage" />
              </div>
              <h2 className="font-display text-2xl text-ink-900 mb-2">Check your inbox</h2>
              <p className="font-body text-sm text-ink-500">
                If that email is in our system, we'll send a password reset link.
              </p>
            </div>
          )}

          <div className="text-center mt-5">
            <Link href="/login" className="font-body text-sm text-ink-500 hover:text-ink-900 transition-colors">
              ← Back to log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
