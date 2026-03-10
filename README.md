# Calendar AI 🗓✦

> The lesson-planning calendar that writes your plan for you.

---

## Project Structure

```
calendar_ai/
├── client/          # Next.js 14 frontend (App Router)
└── backend/         # Express + TypeScript API
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+
- PostgreSQL (or a free [Supabase](https://supabase.com) project)
- An OpenAI API key (for AI features — optional for basic UI)

---

### 1. Clone & install

```bash
# Root of project
cd calendar_ai

# Install frontend deps
cd client
npm install

# Install backend deps
cd ../backend
npm install
```

---

### 2. Set up environment variables

**Backend:**
```bash
cd backend
cp .env.example .env
# Edit .env and fill in:
#   DATABASE_URL=postgresql://...
#   JWT_SECRET=some_long_random_string
#   OPENAI_API_KEY=sk-...  (optional for now)
```

**Frontend** (create `client/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

### 3. Set up the database

If using **Supabase** (recommended for easy setup):
1. Go to [supabase.com](https://supabase.com) and create a free project
2. Copy the connection string to `DATABASE_URL` in your `.env`
3. Open the SQL Editor in Supabase and paste/run `backend/src/db/schema.sql`

If using **local PostgreSQL**:
```bash
createdb calendar_ai
psql calendar_ai < backend/src/db/schema.sql
```

---

### 4. Run the dev servers

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Running on http://localhost:4000
```

**Terminal 2 — Frontend:**
```bash
cd client
npm run dev
# Running on http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## Pages

| Route | Page |
|---|---|
| `/` | Marketing homepage |
| `/pricing` | Pricing page |
| `/schedule-demo` | Request demo form |
| `/signup` | Create account |
| `/login` | Log in |
| `/forgot-password` | Password reset request |
| `/app` | My Calendars (post-login landing) |
| `/app/calendar/:id` | Course calendar (monthly + weekly + AI sidebar) |
| `/app/schedule` | Full Schedule (Google Calendar-style) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Rich Text Editor | TipTap |
| Backend API | Express.js, TypeScript |
| Database | PostgreSQL (Supabase or local) |
| Auth | JWT (bcrypt passwords) |
| AI Models | GPT-4o-mini (primary), GPT-4o (heavy tasks) |
| Embeddings | text-embedding-3-small |
| Vector Search | pgvector (in PostgreSQL) |
| Hosting | Vercel (frontend) + Railway/Render (backend) |

---

## AI Architecture

The AI system is **tool-based** — the LLM never rewrites the full calendar. It only calls structured functions:

```
createLesson(date, content)
moveLesson(fromDate, toDate)
insertAssessment(date, title, type)
getAvailableDays(startDate, endDate)
```

This keeps costs extremely low (~$0.002 per AI interaction with GPT-4o-mini).

### RAG Flow
1. Teacher uploads syllabus → text extracted
2. Text split into 700-token chunks
3. Embeddings generated via `text-embedding-3-small`
4. Stored in pgvector (inside PostgreSQL)
5. On AI request → relevant chunks retrieved → injected into context

---

## Development Roadmap

### Phase 1 — Frontend UI ✅ (current)
- [x] Marketing pages (home, pricing, demo)
- [x] Auth pages (signup, login, forgot password)
- [x] My Calendars landing
- [x] Course Calendar — monthly view
- [x] Course Calendar — weekly view with focus day
- [x] AI sidebar UI with accept/decline
- [x] Full Schedule (Google Calendar style)
- [x] Create Calendar modal (2-step with AI fields)

### Phase 2 — Backend + Database
- [ ] Wire up auth (JWT, bcrypt, PostgreSQL)
- [ ] CRUD for courses/calendars
- [ ] Lesson data persistence (autosave)
- [ ] Event CRUD for full calendar
- [ ] File upload + text extraction

### Phase 3 — AI Integration
- [ ] OpenAI GPT-4o-mini integration
- [ ] RAG pipeline (pgvector embeddings)
- [ ] Tool-based calendar generation
- [ ] AI sidebar real chat
- [ ] Accept/decline applying changes to DB

### Phase 4 — Polish
- [ ] Autosave with debounce
- [ ] Loading states throughout
- [ ] Better date picker
- [ ] Clone calendar feature
- [ ] TipTap rich text editor integration

---

## Cost Estimate (AI)

| Usage | Cost |
|---|---|
| 1 calendar generation | ~$0.002 |
| 5 AI interactions/teacher/week | ~$0.01/teacher/week |
| 1,000 teachers | ~$40/month LLM cost |

Using GPT-4o-mini keeps costs 10–30x lower than GPT-4o for all routine tasks.

---

## Contributing

This is a solo/small team project. Keep the code clean, TypeScript strict, and Tailwind consistent with the design system in `globals.css`.

Design tokens:
- `--color-sage` — primary accent (green)
- `--color-ink` — text/dark
- `--color-cream` — backgrounds
- `--color-amber` — warnings/highlights
- Font: DM Serif Display (headings) + DM Sans (body)
