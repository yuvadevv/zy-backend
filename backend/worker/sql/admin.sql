-- backend/worker/sql/admin.sql

CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- For local development testing, we will map a known test user to an admin.
-- We will use the same ID as the test student we created earlier, so we can test the admin auth.
-- Test User UUID: cdf57262-fd64-49eb-a94d-5ad47c05c843
INSERT INTO admins (id, email, name, role)
VALUES ('cdf57262-fd64-49eb-a94d-5ad47c05c843', 'test@blintzy.com', 'Test Admin', 'superadmin')
ON CONFLICT(id) DO NOTHING;
