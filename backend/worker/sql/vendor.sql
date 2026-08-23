-- backend/worker/sql/vendor.sql

CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'vendor',
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Note: No fake vendor seeding is done here as per instructions.
-- A real Supabase UUID must be manually inserted when a vendor is onboarded.
