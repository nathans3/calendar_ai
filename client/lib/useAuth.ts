'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api, User, getStoredUser, getStoredToken, saveSession, clearSession } from './api'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

// useAuth — validates the stored token against /api/auth/me on mount.
// If invalid → clears session and redirects to /login.
// Returns the current user and loading state.
export function useAuth(redirectOnFail = true): AuthState & { refresh: () => void } {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({
    user: getStoredUser(), // optimistic: show stored user immediately
    loading: true,
    error: null,
  })

  const verify = useCallback(async () => {
    const token = getStoredToken()

    // No token at all — check if they're using a demo session
    if (!token) {
      const demoSession = localStorage.getItem('cal_ai_session')
      if (demoSession) {
        try {
          const session = JSON.parse(demoSession)
          // Map demo session to User shape
          setState({
            user: {
              id: session.userId || 'demo-user',
              email: session.email || 'demo@example.com',
              fullName: session.name || 'Demo User',
              schoolName: session.school || '',
              plan: session.plan === 'pro' ? 'pro' : 'free',
            },
            loading: false,
            error: null,
          })
          return
        } catch {}
      }

      setState({ user: null, loading: false, error: null })
      if (redirectOnFail) router.replace('/login')
      return
    }

    try {
      const user = await api.auth.me()
      setState({ user, loading: false, error: null })
      // Refresh stored user with latest from server
      saveSession(token, user)
    } catch (err: any) {
      // 401 = expired or invalid token
      if (err.status === 401) {
        clearSession()
        setState({ user: null, loading: false, error: null })
        if (redirectOnFail) router.replace('/login')
      } else {
        // Network error — keep the cached user so the page still works
        setState(prev => ({ ...prev, loading: false, error: err.message }))
      }
    }
  }, [redirectOnFail, router])

  useEffect(() => {
    verify()
  }, [verify])

  return { ...state, refresh: verify }
}
