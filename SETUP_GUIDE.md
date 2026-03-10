# Calendar AI — Complete Setup Guide
# All Phases 2–5: Database, Auth, RAG, AI Agent, Apply Changes

---

## OVERVIEW

This guide takes you from a downloaded zip file to a fully working AI-powered
calendar application. Follow every step exactly in order. Nothing can be skipped.

You will need:
- A computer with Node.js 18+ installed
- A free Supabase account (postgres database)
- A free OpenAI account with API access
- Two terminal windows open simultaneously
- About 20 minutes

---

## PART 1 — SUPABASE (YOUR DATABASE)

### 1.1 Create your project

1. Go to https://supabase.com and sign in
2. Click **New project**
3. Name it anything (e.g. "calendar-ai")
4. Set a strong database password — SAVE THIS PASSWORD, you'll need it in a moment
5. Pick the region closest to you
6. Click **Create new project** and wait ~2 minutes for it to provision

### 1.2 Enable pgvector

pgvector is what lets the AI search your uploaded documents by meaning. Supabase
has it built in, you just need to enable it.

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Paste this single line and click **Run**:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. You should see "Success. No rows returned."

### 1.3 Run the full database schema

1. Still in SQL Editor, click **New query** again
2. Open the zip file you downloaded
3. Navigate to: `calendar_ai/backend/src/db/schema.sql`
4. Open it in any text editor (Notepad, TextEdit, VS Code, anything)
5. Select ALL the text (Ctrl+A or Cmd+A) and copy it
6. Paste it into the Supabase SQL Editor
7. Click **Run**

You should see "Success. No rows returned." If you see any red errors, check that
you ran step 1.2 first (the vector extension must exist before the schema).

### 1.4 Get your connection string

1. In Supabase, click **Project Settings** (gear icon at the very bottom of the sidebar)
2. Click **Database** in the settings menu
3. Scroll down to the **Connection string** section
4. Click the **URI** tab
5. You'll see something like:

   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.abcdefghijkl.supabase.co:5432/postgres
   ```

6. Click the copy icon
7. IMPORTANT: The string contains `[YOUR-PASSWORD]` as a placeholder.
   Replace `[YOUR-PASSWORD]` with the actual password you set in step 1.1

   So it should look like:
   ```
   postgresql://postgres:MyActualPassword123@db.abcdefghijkl.supabase.co:5432/postgres
   ```

8. Save this full connection string somewhere — you'll paste it in Part 2

---

## PART 2 — OPENAI API KEY

### 2.1 Get your API key

1. Go to https://platform.openai.com
2. Sign in (or create a free account)
3. Click your profile icon in the top right → **API keys**
4. Click **Create new secret key**
5. Name it "calendar-ai"
6. Copy the key — it starts with `sk-`
7. IMPORTANT: Save this key now. OpenAI will never show it again.

### 2.2 Add credit (required for API calls)

The OpenAI API is pay-as-you-go. For testing, $5 of credit will last a very long time.

1. In the OpenAI dashboard, go to **Billing** → **Add payment method**
2. Add a card and buy $5 of credits

The AI calls used in this app (gpt-4o-mini + text-embedding-3-small) are very cheap.
Roughly: 1000 AI conversations ≈ $0.50

---

## PART 3 — SETTING UP THE PROJECT FILES

### 3.1 Unzip the project

Unzip `calendar_ai.zip` to any folder. You'll see:
```
calendar_ai/
  backend/       ← the Node.js Express API server
  client/        ← the Next.js frontend
  SETUP_GUIDE.md ← this file
```

### 3.2 Install Node.js (if you don't have it)

1. Go to https://nodejs.org
2. Download the **LTS** version (the left green button)
3. Run the installer, clicking through all defaults
4. To verify it worked, open a terminal and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0`

### 3.3 Configure the backend

1. Open a terminal (Terminal on Mac, Command Prompt or PowerShell on Windows)
2. Navigate to the backend folder:
   ```
   cd path/to/calendar_ai/backend
   ```
   For example on Mac: `cd ~/Downloads/calendar_ai/backend`
   On Windows: `cd C:\Users\YourName\Downloads\calendar_ai\backend`

3. Look for the file named `.env.example` in the backend folder
4. Make a copy of it and name the copy exactly `.env` (just dot-env, no .example)

   On Mac/Linux:
   ```
   cp .env.example .env
   ```
   On Windows Command Prompt:
   ```
   copy .env.example .env
   ```

5. Open `.env` in a text editor. It looks like this:
   ```
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
   JWT_SECRET=replace_with_strong_random_secret_at_least_32_chars
   PORT=4000
   NODE_ENV=development
   CLIENT_URL=http://localhost:3000
   OPENAI_API_KEY=sk-...
   ```

6. Replace `DATABASE_URL` with your full connection string from Part 1, step 1.4

7. Replace `OPENAI_API_KEY` with your key from Part 2, step 2.1

8. For `JWT_SECRET`, you need a random string. Generate one by opening a terminal and running:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output (a long string of letters and numbers) and paste it as your JWT_SECRET

9. Save the `.env` file

Your final `.env` should look something like:
```
DATABASE_URL=postgresql://postgres:MyPassword123@db.xyzxyzxyz.supabase.co:5432/postgres
JWT_SECRET=a3f8e9d2c1b4a7f6e5d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
OPENAI_API_KEY=sk-proj-abc123...your-actual-key
```

### 3.4 Configure the frontend

1. Open a second terminal (keep the first one open)
2. Navigate to the client folder:
   ```
   cd path/to/calendar_ai/client
   ```

3. Find the file named `.env.local.example`
4. Make a copy named `.env.local`:
   ```
   cp .env.local.example .env.local
   ```
   (Windows: `copy .env.local.example .env.local`)

5. Open `.env.local` — it contains:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:4000
   ```
   This is already correct. No changes needed for local development.

---

## PART 4 — INSTALLING DEPENDENCIES AND RUNNING

### 4.1 Install and start the backend

In your first terminal (should be in the `backend` folder):
```
npm install
npm run dev
```

You should see output like:
```
✦ Calendar AI backend → http://localhost:4000
✓ Connected to PostgreSQL
```

**If you see `✓ Connected to PostgreSQL` — the database connection works.**

If you see an error like "password authentication failed" — your DATABASE_URL password is wrong.
Go back to Supabase → Project Settings → Database → Reset your database password,
then update your `.env` file with the new password.

If you see "getaddrinfo ENOTFOUND" — check that your DATABASE_URL hostname is correct.
Copy it fresh from Supabase.

**Leave this terminal running.** The backend must stay running while you use the app.

### 4.2 Install and start the frontend

In your second terminal (should be in the `client` folder):
```
npm install
npm run dev
```

You should see:
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
```

**Leave this terminal running too.**

### 4.3 Open the app

Go to http://localhost:3000 in your browser.

---

## PART 5 — USING THE APP

### 5.1 Create an account

1. Click **Sign up** (or go to http://localhost:3000/signup)
2. Enter your name, school, email, and a password
3. Click **Create account**
4. You'll be taken to your dashboard at `/app`

This creates a real account in your Supabase database. You can verify by going to
Supabase → Table Editor → users → you'll see your row there.

### 5.2 Create a calendar

1. Click **Create Calendar**
2. Enter a course name (e.g. "AP Calculus BC") and period (e.g. "Period 1")
3. Pick a color
4. Click **Next** for the AI setup step — this is where you upload documents

### 5.3 Upload documents (enables AI)

After creating a calendar, navigate to it and click **AI** in the top right.
The AI sidebar will open. To give the AI context about your course, upload documents.

Currently you upload documents by calling the API directly. In the next version this
will have a UI. For now, use this curl command (replace the values):

```bash
curl -X POST http://localhost:4000/api/upload/document \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "courseId=YOUR_COURSE_ID" \
  -F "docType=syllabus" \
  -F "file=@/path/to/your/syllabus.pdf"
```

To get your JWT token: after logging in, open your browser's DevTools (F12),
go to Application → Local Storage → http://localhost:3000 → look for `cal_ai_token`.

docType options: `syllabus`, `school_calendar`, `requirements`, `meeting_schedule`

### 5.4 Chat with the AI

1. Open any course calendar
2. Click the **AI** button in the top right (only available if you're on pro plan or demo)
3. Type a message like "Add a quiz on the last Friday of this month"
4. The AI will respond with proposed changes shown as amber cards
5. Click **✓ Accept** on any change to apply it directly to your calendar
6. Click **✓ Accept All** to apply everything at once
7. Accepted changes are immediately written to the database

### 5.5 What the AI can do

- "Schedule a test on March 15th covering chapters 4 and 5"
- "Move the quiz from Monday to Friday"
- "Add homework for every Tuesday this month"
- "What lessons do I have next week?"
- "Clear Wednesday March 20th"
- "Suggest when to start Unit 3 given my current schedule"

---

## PART 6 — TROUBLESHOOTING

### "Cannot connect to database"
- Make sure your DATABASE_URL in `.env` is correct
- The password must replace `[YOUR-PASSWORD]` exactly — no brackets
- Try resetting your Supabase database password and updating `.env`

### "AI is not responding"
- Check that your OPENAI_API_KEY in `.env` is correct
- Make sure you have credit in your OpenAI account (https://platform.openai.com/usage)
- Look at the backend terminal for error messages

### "relation does not exist" (database error)
- The schema wasn't fully applied
- Go to Supabase SQL Editor → run the schema.sql file again
- Also make sure you ran `CREATE EXTENSION IF NOT EXISTS vector;` first

### "Vector search error" in backend logs
- pgvector isn't enabled — run `CREATE EXTENSION IF NOT EXISTS vector;` in Supabase SQL Editor

### Port already in use
- Something else is using port 4000 or 3000
- Change PORT in `.env` to 4001, and update `.env.local` to `NEXT_PUBLIC_API_URL=http://localhost:4001`

### Changes I make don't appear after refresh
- Make sure the backend is running (check first terminal)
- Open browser DevTools → Network → look for failed API calls
- Check that your `cal_ai_token` exists in localStorage

### "Unauthorized" errors in the browser
- Your session expired — log out and log back in
- Or your JWT_SECRET changed — log out, clear localStorage, log back in

---

## PART 7 — STOPPING AND RESTARTING

To stop the app: press **Ctrl+C** in both terminal windows.

To restart later:
- Terminal 1: `cd calendar_ai/backend && npm run dev`
- Terminal 2: `cd calendar_ai/client && npm run dev`

You don't need to run `npm install` again unless you see "module not found" errors.

---

## PART 8 — DEMO ACCOUNTS (TESTING WITHOUT SIGNUP)

The demo login at `/demo-login` still works and doesn't require a real account.
Demo users get mock calendars. Their lesson edits are NOT saved to the database.
Demo users see the AI sidebar but their changes aren't persisted.

---

## WHAT EACH PHASE DOES (TECHNICAL SUMMARY)

**Phase 2 — Database + Auth**
Every user account, course calendar, lesson, and event is stored in PostgreSQL.
Passwords are hashed with bcrypt. Sessions use JWT tokens stored in localStorage
and sent as Bearer headers. The `/api/auth/me` endpoint validates tokens on every
page load.

**Phase 3 — File Processing + RAG**
When you upload a PDF or image, the backend extracts text (pdf-parse for PDFs,
GPT-4o vision for images), splits it into ~700-token chunks, calls
`text-embedding-3-small` to get a 1536-dimensional vector for each chunk, and
stores those vectors in the `documents` table's `embedding` column (pgvector).
When the AI receives a message, it first embeds the message and runs a cosine
similarity search to find the most relevant chunks, which are injected into the
system prompt as context.

**Phase 4 — Real AI Agent**
The AI call uses `gpt-4o-mini` with function calling. Four tools are defined:
`createLesson`, `moveLesson`, `insertAssessment`, `clearDay`. The model decides
which tools to call and with what arguments. The backend parses the tool call
responses into "diff" objects (showing before/after for each field) and returns
them to the frontend. Conversation history is maintained client-side and passed
back on each turn.

**Phase 5 — Apply Changes**
When a teacher clicks Accept, the frontend calls `POST /api/ai/apply-changes`
with the accepted diff objects. The backend writes each change to the `lessons`
table using PostgreSQL upserts. `createLesson` and `insertAssessment` use
`ON CONFLICT(course_id, date) DO UPDATE SET` to safely merge changes.
`moveLesson` reads the source row, copies selected fields to the destination,
then clears them from the source. Every applied change is logged in
`ai_change_logs` for auditing.

