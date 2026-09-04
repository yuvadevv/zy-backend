-- backend/worker/sql/vendor.sql

CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY,
    supabase_user_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    business_name TEXT,
    contact_person TEXT,
    username TEXT UNIQUE NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    description TEXT,
    role TEXT NOT NULL DEFAULT 'vendor',
    status TEXT NOT NULL DEFAULT 'active',
    password_change_required INTEGER NOT NULL DEFAULT 1,
    last_login INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Note: No fake vendor seeding is done here as per instructions.
-- A real Supabase UUID must be manually inserted when a vendor is onboarded.
