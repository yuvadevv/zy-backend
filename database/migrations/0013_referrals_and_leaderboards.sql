-- Migration: 0013_referrals_and_leaderboards.sql
-- Description: Create student referral codes and referrals tracking tables for BLINTZY Campus Fest

-- 1. Student unique referral codes
CREATE TABLE IF NOT EXISTS student_referral_codes (
    student_id TEXT PRIMARY KEY,
    referral_code TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_ref_code ON student_referral_codes(referral_code);

-- 2. Durable Referrals Attribution & Qualification
CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referred_id TEXT UNIQUE NOT NULL,
    referral_code TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'qualified', 'reversed')) DEFAULT 'pending',
    qualifying_order_id TEXT,
    qualified_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (referrer_id) REFERENCES students(id),
    FOREIGN KEY (referred_id) REFERENCES students(id),
    FOREIGN KEY (qualifying_order_id) REFERENCES orders(internal_id),
    CHECK(referrer_id != referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status ON referrals(referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_qualifying_order ON referrals(qualifying_order_id);
