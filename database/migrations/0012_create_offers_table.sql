-- Migration: 0012_create_offers_table.sql
-- Description: Create offers table for Blintzy Campus Fest and future campaigns, preserving legacy coupons table.

CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
    discount_value REAL NOT NULL,
    max_discount_amount REAL,
    min_order_amount REAL DEFAULT 0,
    eligible_services TEXT NOT NULL DEFAULT '["all"]', -- JSON array e.g. ["hall_ticket", "custom", "manual"] or ["all"]
    eligible_components TEXT NOT NULL DEFAULT '["printing"]', -- Explicit discount scope e.g. ["printing"]
    badge_text TEXT,
    terms_text TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    start_time INTEGER,
    end_time INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offers_code ON offers(code);
CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active);
