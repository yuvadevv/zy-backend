import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const content = fs.readFileSync(envPath, 'utf8');
for (const line of content.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function run() {
  try {
    console.log("Starting 0012 offers migration...");

    // 1. Create offers table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS offers (
          id TEXT PRIMARY KEY,
          code TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
          discount_value REAL NOT NULL,
          max_discount_amount REAL,
          min_order_amount REAL DEFAULT 0,
          eligible_services TEXT NOT NULL DEFAULT '["all"]',
          eligible_components TEXT NOT NULL DEFAULT '["printing"]',
          badge_text TEXT,
          terms_text TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          start_time INTEGER,
          end_time INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
      )
    `).run();
    console.log("Success: CREATE TABLE offers");

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_offers_code ON offers(code)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active)`).run();
    console.log("Success: CREATE INDEX on offers");

    // 2. Alter orders table to record offer_id and offer_code
    try {
      await db.prepare(`ALTER TABLE orders ADD COLUMN offer_id TEXT`).run();
      console.log("Success: ALTER TABLE orders ADD COLUMN offer_id");
    } catch (e) {
      console.log("orders.offer_id exists or error:", e.message);
    }

    try {
      await db.prepare(`ALTER TABLE orders ADD COLUMN offer_code TEXT`).run();
      console.log("Success: ALTER TABLE orders ADD COLUMN offer_code");
    } catch (e) {
      console.log("orders.offer_code exists or error:", e.message);
    }

    // 3. Seed Campus Fest 30% offer if not exists
    const existing = await db.prepare(`SELECT * FROM offers WHERE code = 'CAMPUSFEST30'`).first();
    const now = Date.now();
    if (!existing) {
      await db.prepare(`
        INSERT INTO offers (
          id, code, title, description, discount_type, discount_value,
          max_discount_amount, min_order_amount, eligible_services, eligible_components,
          badge_text, terms_text, is_active, start_time, end_time, created_at, updated_at
        ) VALUES (
          'offer_campus_fest_30',
          'CAMPUSFEST30',
          'Campus Fest Special',
          'Get 30% OFF on all student printing services during Blintzy Campus Fest!',
          'percentage',
          30,
          100.0,
          0,
          '["all"]',
          '["printing"]',
          'Campus Fest — 30% OFF',
          'Discount applies to printing charges only. Excludes binding, delivery, and platform fees. Cannot be combined with other coupons.',
          1,
          ${now - 86400000},
          ${now + 30 * 86400000},
          ${now},
          ${now}
        )
      `).run();
      console.log("Success: Seeded default CAMPUSFEST30 offer");
    } else {
      console.log("CAMPUSFEST30 offer already exists");
    }

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run();
