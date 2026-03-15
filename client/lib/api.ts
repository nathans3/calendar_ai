// ─── Shared API client ────────────────────────────────────
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('cal_ai_token') : null
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try { const body = await res.json(); message = body.message || message } catch {}
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return {} as T
  return res.json()
}

// ─── Auth ─────────────────────────────────────────────────
export const api = {
  auth: {
    signup: (data: { email: string; password: string; fullName?: string; schoolName?: string }) =>
      request<{ token: string; user: User }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request<User>('/api/auth/me'),
  },

  // ─── User Profile (periods & schedule settings) ────────
  profile: {
    get: () => request<UserProfile>('/api/auth/profile'),
    update: (data: Partial<Pick<UserProfile, 'fullName' | 'schoolName' | 'schoolDayStart' | 'schoolDayEnd' | 'periods' | 'specialDays'>>) =>
      request<UserProfile>('/api/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  },

  // ─── Calendars ─────────────────────────────────────────
  calendars: {
    list: () => request<Course[]>('/api/calendars'),
    get:  (id: string) => request<Course>(`/api/calendars/${id}`),
    create: (data: { name: string; period: string; color?: string }) =>
      request<Course>('/api/calendars', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Course>) =>
      request<Course>(`/api/calendars/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/calendars/${id}`, { method: 'DELETE' }),
  },

  // ─── Lessons ───────────────────────────────────────────
  lessons: {
    getByMonth: (courseId: string, month: string) =>
      request<Record<string, LessonData>>(`/api/lessons/${courseId}?month=${month}`),
    getAll: (courseId: string) =>
      request<Record<string, LessonData>>(`/api/lessons/${courseId}`),
    save: (courseId: string, date: string, data: Partial<LessonData>) =>
      request(`/api/lessons/${courseId}/${date}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (courseId: string, date: string) =>
      request(`/api/lessons/${courseId}/${date}`, { method: 'DELETE' }),
  },

  // ─── Events ────────────────────────────────────────────
  events: {
    list: (month?: string) => request<CalEvent[]>(`/api/events${month ? `?month=${month}` : ''}`),
    create: (data: Partial<CalEvent>) =>
      request<CalEvent>('/api/events', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<CalEvent>) =>
      request<CalEvent>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/api/events/${id}`, { method: 'DELETE' }),
  },
}

export interface User {
  id: string
  email: string
  fullName: string
  schoolName: string
  plan: 'free' | 'pro'
}

export interface PeriodConfig {
  id: string          // uuid-like, e.g. "p1"
  label: string       // e.g. "Period 7/8", "Period 3"
  durationMinutes: number  // e.g. 42
  startTime: string   // HH:MM  e.g. "09:00"
  endTime: string     // HH:MM  e.g. "09:42" (can be derived or set manually)
}

export interface SpecialDaySchedule {
  id: string
  name: string
  dayStart: string
  dayEnd: string
  periods: PeriodConfig[]
}

export interface UserProfile extends User {
  schoolDayStart: string   // HH:MM
  schoolDayEnd: string     // HH:MM
  periods: PeriodConfig[]
  specialDays?: SpecialDaySchedule[]
}

export interface Course {
  id: string
  name: string
  period: string
  color: string
}

export interface LessonData {
  date: string
  lessonPlan: string
  deadlines: string
  milestones: string
  assessments: string
  hw: string
  notes: string
}

export interface CalEvent {
  id: string
  courseId?: string
  date: string
  title: string
  type?: string
  startTime?: string
  endTime?: string
  allDay?: boolean
  schoolWide?: boolean
  color?: string
  location?: string
  description?: string
  repeatRule?: string
}

export function saveSession(token: string, user: User) {
  localStorage.setItem('cal_ai_token', token)
  localStorage.setItem('cal_ai_user', JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem('cal_ai_token')
  localStorage.removeItem('cal_ai_user')
  localStorage.removeItem('cal_ai_session')
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('cal_ai_user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('cal_ai_token')
}

export { ApiError }

// ─── AI and Upload API methods ────────────────────────────

export interface AIDiff {
  id: string
  tool: 'createLesson' | 'insertAssessment' | 'moveLesson' | 'clearDay' | 'deleteLesson' | 'markDay'
  date: string
  field: string
  before: string
  after: string
  status: 'pending' | 'accepted' | 'declined'
  allArgs?: Record<string, any>
  moveRole?: 'source' | 'destination'
}

export const apiExtended = {
  ai: {
    chat: (data: {
      message: string
      courseId: string
      calendarContext?: Record<string, any>
      selectedDate?: string | null
      conversationHistory?: any[]
      attachedDocTypes?: string[]
    }) => request<{ content: string; changes: AIDiff[]; updatedHistory: any[] }>(
      '/api/ai/chat', { method: 'POST', body: JSON.stringify(data) }
    ),

    applyChanges: (courseId: string, changes: AIDiff[]) =>
      request<{ message: string; applied: number; errors: string[] }>(
        '/api/ai/apply-changes', { method: 'POST', body: JSON.stringify({ courseId, changes }) }
      ),

    generateCalendar: (data: {
      courseId: string
      contextText: string   // all extracted text inline — starts from today
      maxDays?: number
    }) => request<{ applied: number; months: number; message: string }>(
      '/api/ai/generate-calendar', { method: 'POST', body: JSON.stringify(data) }
    ),

    // Store context text as RAG-searchable document chunks
    storeContext: (courseId: string, contextText: string, docType?: string) =>
      request<{ chunks: number; message: string }>(
        '/api/ai/store-context', { method: 'POST', body: JSON.stringify({ courseId, contextText, docType }) }
      ),
  },

  upload: {
    // Extract text from a file without storing in DB — used by AI Setup
    extractText: (file: File): Promise<{ text: string; length: number }> => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cal_ai_token') : null
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE}/api/upload/extract-text`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        body: form,
      }).then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new ApiError(body.message || `Extract failed (${r.status})`, r.status)
        }
        return r.json()
      })
    },

    // Full pipeline: extract + embed + store (for AI sidebar document management)
    document: (courseId: string, docType: string, file: File) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('cal_ai_token') : null
      const form = new FormData()
      form.append('courseId', courseId)
      form.append('docType', docType)
      form.append('file', file)
      return fetch(`${BASE}/api/upload/document`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        body: form,
      }).then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new ApiError(body.message || `Upload failed (${r.status})`, r.status)
        }
        return r.json() as Promise<{ message: string; filename: string; chunks: number; docType: string }>
      })
    },

    listDocuments: (courseId: string) =>
      request<{ type: string; filename: string; chunks: number; uploaded_at: string }[]>(
        `/api/upload/documents/${courseId}`
      ),

    getDocumentText: (courseId: string, type: string) =>
      request<{ text: string; filename: string }>(`/api/upload/documents/${courseId}/${type}/text`),

    getDocumentFile: (courseId: string, type: string): string =>
      `${BASE}/api/upload/documents/${courseId}/${type}/file`,

    deleteDocument: (courseId: string, type: string) =>
      request(`/api/upload/documents/${courseId}/${type}`, { method: 'DELETE' }),
  },
}