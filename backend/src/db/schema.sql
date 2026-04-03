-- Calendar AI — Complete Database Schema (Phases 2–5)
-- Run this entire file in Supabase SQL Editor to initialize

-- ─── Enable pgvector for RAG embeddings ─────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT UNIQUE NOT NULL,
  password_hash         TEXT NOT NULL DEFAULT '',
  full_name             TEXT NOT NULL DEFAULT '',
  school_name           TEXT NOT NULL DEFAULT '',
  plan                  TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro'
  school_day_start      TEXT NOT NULL DEFAULT '08:00',  -- HH:MM
  school_day_end        TEXT NOT NULL DEFAULT '15:00',  -- HH:MM
  periods               JSONB NOT NULL DEFAULT '[]',    -- Array of PeriodConfig objects
  email_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token    TEXT,
  verification_expires  TIMESTAMPTZ,
  provider              TEXT NOT NULL DEFAULT 'local',  -- 'local' | 'google'
  provider_id           TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add columns if they don't exist yet (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_day_start      TEXT NOT NULL DEFAULT '08:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_day_end        TEXT NOT NULL DEFAULT '15:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS periods               JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login            TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires  TIMESTAMPTZ;
-- OAuth: provider = 'local' | 'google'
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider             TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id          TEXT;

-- ─── Courses (Calendars) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  period      TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'sage',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Lessons (Day data per course) ──────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  lesson_plan     TEXT DEFAULT '',
  deadlines       TEXT DEFAULT '',
  milestones      TEXT DEFAULT '',
  assessments     TEXT DEFAULT '',
  hw              TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, date)
);

-- ─── Full Calendar Events ────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  date          DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  all_day       BOOLEAN DEFAULT FALSE,
  school_wide   BOOLEAN DEFAULT FALSE,
  repeat_rule   TEXT DEFAULT 'none',
  location      TEXT DEFAULT '',
  description   TEXT DEFAULT '',
  color         TEXT DEFAULT 'blue',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Documents (uploaded syllabi for RAG) ───────────────────
-- embedding column uses pgvector (1536 dims = text-embedding-3-small)
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,   -- 'syllabus' | 'school_calendar' | 'requirements' | 'meeting_schedule'
  filename    TEXT,
  raw_text    TEXT,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text  TEXT NOT NULL,
  embedding   vector(1536),   -- pgvector column for similarity search
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AI Change Logs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_change_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt      TEXT NOT NULL,
  changes     JSONB NOT NULL DEFAULT '[]',
  status      TEXT DEFAULT 'pending',   -- 'pending' | 'accepted' | 'declined' | 'partial'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courses_user_id     ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_date ON lessons(course_id, date);
CREATE INDEX IF NOT EXISTS idx_events_user_date    ON events(user_id, date);
CREATE INDEX IF NOT EXISTS idx_documents_course    ON documents(course_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_course      ON ai_change_logs(course_id);

-- Vector similarity index (IVFFlat — fast approximate nearest neighbor)
-- Only create if there are documents already; otherwise create after first upload
-- CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── Row Level Security ──────────────────────────────────────
-- Run this block in the Supabase SQL Editor.
-- This prevents anyone using the Supabase dashboard (anon/authenticated role)
-- from reading other users' data. Your backend uses the service_role key which
-- bypasses RLS intentionally — this only locks down direct DB access.

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_change_logs ENABLE ROW LEVEL SECURITY;

-- Block all access via anon/authenticated roles (your backend uses service_role, unaffected)
CREATE POLICY "no_direct_access" ON users          FOR ALL USING (false);
CREATE POLICY "no_direct_access" ON courses        FOR ALL USING (false);
CREATE POLICY "no_direct_access" ON lessons        FOR ALL USING (false);
CREATE POLICY "no_direct_access" ON events         FOR ALL USING (false);
CREATE POLICY "no_direct_access" ON documents      FOR ALL USING (false);
CREATE POLICY "no_direct_access" ON ai_change_logs FOR ALL USING (false);
