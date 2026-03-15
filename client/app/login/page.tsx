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

              <div className="flex items-center gap-3 my-1">
                <div className="flex-1 h-px bg-ink-900/10" />
                <span className="font-body text-xs text-ink-400">or</span>
                <div className="flex-1 h-px bg-ink-900/10" />
              </div>

              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-ink-900/15 bg-white hover:bg-ink-50 transition-colors opacity-50 cursor-not-allowed"
                title="Google login coming soon"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="font-body text-sm text-ink-600">Continue with Google</span>
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
