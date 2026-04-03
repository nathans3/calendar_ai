'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Calendar, CheckCircle2, XCircle, Loader2, Mail } from 'lucide-react'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const status = searchParams.get('status')
  const error  = searchParams.get('error')

  type State = 'loading' | 'success' | 'already' | 'invalid' | 'expired' | 'missing' | 'server'
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    if (status === 'success') setState('success')
    else if (status === 'already') setState('already')
    else if (error === 'expired') setState('expired')
    else if (error === 'invalid' || error === 'missing') setState('invalid')
    else if (error === 'server') setState('server')
    else if (!status && !error) setState('loading')
    else setState('invalid')
  }, [status, error])

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
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center page-enter">
          {state === 'loading' && (
            <div className="card p-10">
              <Loader2 className="w-10 h-10 text-sage animate-spin mx-auto mb-4" />
              <p className="font-body text-sm text-ink-500">Verifying your email…</p>
            </div>
          )}

          {(state === 'success' || state === 'already') && (
            <div className="card p-10">
              <div className="w-14 h-14 bg-sage/12 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-sage" />
              </div>
              <h1 className="font-display text-3xl text-ink-900 mb-2">
                {state === 'already' ? 'Already verified' : 'Email verified!'}
              </h1>
              <p className="font-body text-sm text-ink-500 mb-6">
                {state === 'already'
                  ? 'Your email was already verified. You can log in below.'
                  : 'Your account is now active. Log in to get started.'}
              </p>
              <Link href="/login" className="btn-sage inline-flex items-center justify-center py-3 px-8">
                Go to login
              </Link>
            </div>
          )}

          {state === 'expired' && (
            <div className="card p-10">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-7 h-7 text-amber-500" />
              </div>
              <h1 className="font-display text-3xl text-ink-900 mb-2">Link expired</h1>
              <p className="font-body text-sm text-ink-500 mb-6">
                Your verification link has expired (links are valid for 24 hours).<br />
                Sign in to request a new one.
              </p>
              <Link href="/login" className="btn-sage inline-flex items-center justify-center py-3 px-8">
                Back to login
              </Link>
            </div>
          )}

          {(state === 'invalid' || state === 'missing' || state === 'server') && (
            <div className="card p-10">
              <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-7 h-7 text-red-400" />
              </div>
              <h1 className="font-display text-3xl text-ink-900 mb-2">Verification failed</h1>
              <p className="font-body text-sm text-ink-500 mb-6">
                {state === 'server'
                  ? 'Something went wrong on our end. Please try again later.'
                  : 'This verification link is invalid or has already been used.'}
              </p>
              <Link href="/login" className="btn-sage inline-flex items-center justify-center py-3 px-8">
                Back to login
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream-100" />}>
      <VerifyEmailContent />
    </Suspense>
  )
}
