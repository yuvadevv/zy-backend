-- migration_master_admin_v1.sql

-- 1. RBAC & ADMIN USERS
CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL, -- e.g., 'SUPER_ADMIN', 'CONTENT_MANAGER'
    description TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    action TEXT UNIQUE NOT NULL, -- e.g., 'users.view', 'orders.edit'
    description TEXT
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
    id TEXT PRIMARY KEY, -- Maps to Supabase Auth UUID
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
    admin_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (admin_id, role_id),
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 2. AUDIT LOGGING
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    before_value TEXT, -- JSON snapshot
    after_value TEXT, -- JSON snapshot
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- 3. PLATFORM SETTINGS
CREATE TABLE IF NOT EXISTS platform_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL, -- JSON formatted data
    updated_by TEXT,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (updated_by) REFERENCES admin_users(id)
);

-- 4. WEBSITE CONTENT
CREATE TABLE IF NOT EXISTS website_content (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL, -- 'banner', 'announcement'
    title TEXT,
    metadata TEXT NOT NULL, -- JSON data (subtitle, URL, CTA, image R2 key)
    priority INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'inactive', -- 'active', 'inactive', 'scheduled'
    start_time INTEGER,
    end_time INTEGER,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (created_by) REFERENCES admin_users(id)
);
CREATE INDEX IF NOT EXISTS idx_content_type_status ON website_content(content_type, status);

-- 5. VENDORS (using IF NOT EXISTS in case it was already created manually)
CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY, -- Maps to Supabase Auth UUID
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
