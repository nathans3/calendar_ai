import { Pool } from 'pg'

// Singleton pool — reused across all requests
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }
    : false,
  max: 10,                // max connections in pool
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

// Verify connection on startup and run pending migrations
db.connect((err, client, release) => {
  if (err) {
    console.error('✗ Database connection failed:', err.message)
    console.error('  Check your DATABASE_URL in .env')
    return
  }
  console.log('✓ Connected to PostgreSQL')

  // Run safe "ADD COLUMN IF NOT EXISTS" migrations so the live DB stays in sync
  // without needing to manually re-run schema.sql in Supabase.
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS school_day_start TEXT NOT NULL DEFAULT '08:00'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS school_day_end   TEXT NOT NULL DEFAULT '15:00'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS periods          JSONB NOT NULL DEFAULT '[]'`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data    BYTEA`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type    TEXT`,
  ]

  ;(async () => {
    for (const sql of migrations) {
      try {
        await client.query(sql)
      } catch (migErr: any) {
        console.warn('Migration warning (non-fatal):', migErr.message)
      }
    }
    console.log('✓ DB migrations up to date')
  })().finally(() => release())
})

export default db
