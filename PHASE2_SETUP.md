# Phase 2 Setup Guide — Database + Auth

## What changed in Phase 2

- ✅ Real PostgreSQL database (via Supabase)
- ✅ Real auth: signup, login, JWT in httpOnly cookie
- ✅ Lesson autosave (debounced 500ms, shows "Saving…" / "Saved" indicator)
- ✅ Calendar CRUD persists to DB
- ✅ Events persist to DB
- ✅ /api/auth/me validates tokens on page load
- ✅ Demo accounts at /demo-login still work unchanged

---

## Step 1 — Set up Supabase (5 min)

1. Go to **supabase.com** → New project
2. Name it "calendar-ai", pick a region, set a database password
3. Wait ~2 min for it to spin up
4. Go to **Project Settings → Database → Connection string → URI**
5. Copy the connection string — looks like:
   `postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres`

### Run the schema

1. In Supabase dashboard → **SQL Editor**
2. Paste the entire contents of `backend/src/db/schema.sql`
3. Click **Run**

---

## Step 2 — Configure the backend

```bash
cd calendar_ai/backend
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-REF].supabase.co:5432/postgres
JWT_SECRET=generate_with_node_command_below
PORT=4000
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output as your `JWT_SECRET`.

---

## Step 3 — Configure the frontend

```bash
cd calendar_ai/client
cp .env.local.example .env.local
```

`.env.local` already has the right value for local dev:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Step 4 — Install and run

**Backend (new terminal):**
```bash
cd calendar_ai/backend
npm install
npm run dev
```

You should see:
```
✦ Calendar AI backend → http://localhost:4000
✓ Connected to PostgreSQL
```

**Frontend (another terminal):**
```bash
cd calendar_ai/client
npm install
npm run dev
```

Open **http://localhost:3000**

---

## How the auth flow works now

1. Go to `/signup` → fills in name, email, password → real account created in DB
2. Go to `/login` → verifies password against DB, issues JWT
3. JWT stored in `localStorage` as `cal_ai_token` + sent as Bearer header
4. Every protected page calls `GET /api/auth/me` on load to validate the token
5. If token is expired → redirected to `/login`
6. Sign out calls `POST /api/auth/logout` + clears localStorage

## Demo accounts still work

`/demo-login` still works exactly as before for testing without signup.
Demo users get mock calendars and their lesson edits are NOT sent to the DB.

---

## Verify it's working

After signing up:
1. Create a calendar → refresh → still there ✓
2. Open a calendar, type in a lesson field → wait 1 second → see "Saved" ✓  
3. Navigate away → come back → text is still there ✓
4. Create an event in My Schedule → refresh → still there ✓
5. Close the browser → reopen → still logged in ✓

