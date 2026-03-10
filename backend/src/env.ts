// ─── Environment bootstrap ────────────────────────────────
// This file MUST be the first import in index.ts.
// We use require() here (not import) so it executes synchronously
// and immediately — before TypeScript's import hoisting can
// cause any other module to read process.env while it's still empty.
//
// Why this matters: auth.ts reads JWT_SECRET at module load time
// to create its signToken function. If dotenv hasn't run yet,
// JWT_SECRET is undefined and falls back to 'dev_secret_change_in_production'.
// The middleware then reads the REAL JWT_SECRET from .env after dotenv loads,
// so tokens signed with the fallback secret fail verification → 401 Unauthorized.

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config()

// Validate required env vars and warn clearly if any are missing
const required = ['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY']
const missing = required.filter(k => !process.env[k])
if (missing.length > 0) {
  console.warn(`⚠  Missing environment variables: ${missing.join(', ')}`)
  console.warn('   Check your .env file — some features may not work.')
}
