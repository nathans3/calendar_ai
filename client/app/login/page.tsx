'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { api, saveSession, ApiError } from '../../lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { token, user } = await api.auth.login({
        email: form.email,
        password: form.password,
      })
      saveSession(token, user)
      router.replace('/app')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col">
      <nav className="border-b border-ink-900/8 bg-cream-100/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-ink-900 rounded-lg flex items-center justify-center group-hover:bg-sage transition-colors">
              <Calendar className="w-4 h-4 text-cream-100" />
            </div>
            <span className="font-display text-lg text-ink-900">Calendar AI</span>
          </Link>
          <Link href="/signup" className="btn-primary py-2 px-4 text-sm">Sign up</Link>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md page-enter">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl text-ink-900 mb-2">Welcome back</h1>
            <p className="font-body text-sm text-ink-500">Log in to your Calendar AI account.</p>
          </div>

          <div className="card p-8">
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-5">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="font-body text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Email</label>
                <input type="email" required placeholder="you@school.edu" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="input-field" autoFocus />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} required placeholder="Your password"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                    className="input-field pr-10" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading || !form.email || !form.password}
                className={`btn-sage w-full justify-center py-3 mt-2 ${loading || !form.email || !form.password ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Logging in…
                  </span>
                ) : 'Log in'}
              </button>
            </form>

            <div className="text-center space-y-2 mt-5">
              <Link href="/forgot-password" className="block font-body text-sm text-ink-500 hover:text-ink-900 transition-colors">
                Forgot password?
              </Link>
              <p className="font-body text-sm text-ink-500">
                No account?{' '}
                <Link href="/signup" className="text-ink-900 font-medium hover:text-sage transition-colors underline underline-offset-2">
                  Sign up
                </Link>
              </p>
            </div>

            {/* Demo accounts shortcut */}
            <div className="mt-8 pt-6 border-t border-ink-900/10 text-center">
              <p className="font-body text-xs text-ink-400 mb-3">Just want to explore the app?</p>
              <Link href="/demo-login"
                className="inline-flex items-center gap-2 font-body text-sm font-medium text-sage hover:text-sage-600 transition-colors">
                Use a test account →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
