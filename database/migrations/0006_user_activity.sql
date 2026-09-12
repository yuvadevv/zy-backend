-- 0006_user_activity.sql
-- Add last_login_at and last_active_at to students table to track activity securely

ALTER TABLE students ADD COLUMN last_login_at INTEGER;
ALTER TABLE students ADD COLUMN last_active_at INTEGER;
