-- Phase 1: Representative Role Migration
-- Run this to set up the admin_user_scopes table and seed the representative role/permissions

-- 1. Create admin_user_scopes table
CREATE TABLE IF NOT EXISTS admin_user_scopes (
    id TEXT PRIMARY KEY,
    admin_id TEXT NOT NULL,
    study_year_id TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    section TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (study_year_id) REFERENCES academic_years(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    UNIQUE (admin_id, study_year_id, branch_id, section)
);
