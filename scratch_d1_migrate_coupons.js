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
    console.log("Starting migrations...");

    // 1. Create coupons table
    try {
        await db.prepare(`
        CREATE TABLE IF NOT EXISTS coupons (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            discount_amount REAL NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        `).run();
        console.log("Success: CREATE TABLE coupons");
        
        await db.prepare(`CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code)`).run();
        console.log("Success: CREATE INDEX idx_coupons_code");
    } catch (e) {
        console.log("Ignored or Error creating coupons:", e.message);
    }

    // 2. Alter orders table
    const orderAlters = [
      "ALTER TABLE orders ADD COLUMN coupon_code TEXT"
    ];
    for (const q of orderAlters) {
      try {
        await db.prepare(q).run();
        console.log("Success:", q);
      } catch (e) {
        console.log("Ignored or Error:", q, e.message);
      }
    }
    
    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run();
