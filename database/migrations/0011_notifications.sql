-- zy-backend/database/migrations/0011_notifications.sql

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL,
    icon TEXT NOT NULL,
    action_label TEXT,
    action_url TEXT,
    audience_type TEXT NOT NULL,
    audience_filter_snapshot TEXT,
    created_by TEXT NOT NULL,
    status TEXT NOT NULL,
    scheduled_at INTEGER,
    sent_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_recipients (
    id TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    delivered_at INTEGER,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_recipients_notification_id ON notification_recipients(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_user_id ON notification_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_read_at ON notification_recipients(read_at);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_created_at ON notification_recipients(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_recipients_delivery_status ON notification_recipients(delivery_status);
