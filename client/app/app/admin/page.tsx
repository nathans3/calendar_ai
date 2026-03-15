'use client'

import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface UserRow {
  id: string
  email: string
  full_name: string
  school_name: string
  plan: string
  created_at: string
  last_login: string | null
}

interface Stats {
  total: string
  signups_7d: string
  signups_30d: string
  logins_7d: string
  logins_30d: string
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function timeAgo(iso: string | null) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function AdminPage() {
  const [key, setKey] = useState('')
  const [inputKey, setInputKey] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const fetchData = async (adminKey: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/auth/admin/users`, {
        headers: { 'x-admin-key': adminKey },
      })
      if (res.status === 403) {
        setError('Invalid admin key.')
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error('Server error')
      const data = await res.json()
      setUsers(data.users)
      setStats(data.stats)
      setKey(adminKey)
    } catch (e) {
      setError('Failed to load data. Check the API URL.')
    }
    setLoading(false)
  }

  // Auto-load if key was previously saved in sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key')
    if (saved) {
      setInputKey(saved)
      fetchData(saved)
    }
  }, [])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    sessionStorage.setItem('admin_key', inputKey)
    fetchData(inputKey)
  }

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.school_name.toLowerCase().includes(search.toLowerCase())
  )

  if (!key) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm space-y-4"
        >
          <h1 className="text-xl font-bold text-white text-center">Admin Access</h1>
          <input
            type="password"
            placeholder="Admin secret key"
            value={inputKey}
            onChange={e => setInputKey(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading || !inputKey}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition"
          >
            {loading ? 'Loading…' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-gray-400 text-sm mt-0.5">User analytics &amp; account overview</p>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem('admin_key'); setKey(''); setUsers([]); setStats(null) }}
            className="text-gray-500 hover:text-gray-300 text-sm transition"
          >
            Sign out
          </button>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total Users',      value: stats.total },
              { label: 'Signups (7d)',     value: stats.signups_7d },
              { label: 'Signups (30d)',    value: stats.signups_30d },
              { label: 'Logins (7d)',      value: stats.logins_7d },
              { label: 'Logins (30d)',     value: stats.logins_30d },
            ].map(c => (
              <div key={c.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-indigo-400">{c.value}</p>
                <p className="text-gray-400 text-xs mt-1">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search + table */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center gap-3">
            <input
              type="text"
              placeholder="Search by email, name, or school…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-gray-500 text-sm whitespace-nowrap">
              {filtered.length} / {users.length} users
            </span>
            <button
              onClick={() => fetchData(key)}
              className="text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-gray-800 transition"
            >
              ↻ Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-800">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">School</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Signed Up</th>
                  <th className="px-4 py-3 font-medium">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                      {users.length === 0 ? 'No users yet.' : 'No results match your search.'}
                    </td>
                  </tr>
                )}
                {filtered.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition ${i % 2 === 0 ? '' : 'bg-gray-900/50'}`}
                  >
                    <td className="px-4 py-3 text-white font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-gray-300">{u.full_name || <span className="text-gray-600">—</span>}</td>
                    <td className="px-4 py-3 text-gray-400 max-w-[200px] truncate">{u.school_name || <span className="text-gray-600">—</span>}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.plan === 'pro' ? 'bg-indigo-900/60 text-indigo-300' : 'bg-gray-800 text-gray-400'}`}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      <span title={fmt(u.created_at)}>{timeAgo(u.created_at)}</span>
                      <span className="block text-gray-600">{fmt(u.created_at).split(' ').slice(0, 3).join(' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      <span title={fmt(u.last_login)}>{timeAgo(u.last_login)}</span>
                      {u.last_login && (
                        <span className="block text-gray-600">{fmt(u.last_login).split(' ').slice(0, 3).join(' ')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
