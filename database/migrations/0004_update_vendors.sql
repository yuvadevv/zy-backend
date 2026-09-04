-- 0004_update_vendors.sql
-- Create a new temporary table with the correct schema
CREATE TABLE vendors_new (
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

-- Copy data (none exists anyway, but good practice)
INSERT INTO vendors_new (id, email, name, phone, status, created_at, updated_at, username)
SELECT id, email, name, phone, status, created_at, updated_at, email as username
FROM vendors;

-- Drop old table
DROP TABLE vendors;

-- Rename new table
ALTER TABLE vendors_new RENAME TO vendors;

-- Recreate index for orders vendor_id if necessary (was created via a separate migration, so we should make sure it still exists)
-- The index idx_orders_vendor_id on orders(vendor_id) isn't affected by dropping vendors table.
