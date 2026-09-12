-- 0005_refunds_and_webhooks.sql

-- 1. REFUNDS TABLE
CREATE TABLE IF NOT EXISTS refunds (
    id TEXT PRIMARY KEY,
    public_refund_id TEXT UNIQUE NOT NULL,
    order_id TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL,
    provider_refund_id TEXT UNIQUE,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL, -- initiated, processing, processed, failed, cancelled
    reason TEXT NOT NULL,
    admin_id TEXT NOT NULL,
    admin_note TEXT,
    initiated_at INTEGER NOT NULL,
    processed_at INTEGER,
    failed_at INTEGER,
    failure_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(internal_id),
    FOREIGN KEY (payment_id) REFERENCES payments(id),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (admin_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_student ON refunds(student_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- 2. WEBHOOK EVENTS TABLE
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    processing_status TEXT NOT NULL, -- received, processed, ignored, failed
    received_at INTEGER NOT NULL,
    processed_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event ON webhook_events(provider_event_id);

-- 3. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    type TEXT NOT NULL, -- refund_initiated, refund_processing, refund_processed, refund_failed, payment_success, order_update
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_order_id TEXT,
    related_refund_id TEXT,
    dedupe_key TEXT UNIQUE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    read_at INTEGER,
    FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);
