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

    // 1. Alter manuals table
    const manualAlters = [
      "ALTER TABLE manuals ADD COLUMN pricing_mode TEXT DEFAULT 'settings'",
      "ALTER TABLE manuals ADD COLUMN price_override REAL",
      "ALTER TABLE manuals ADD COLUMN pdf_source TEXT DEFAULT 'r2'",
      "ALTER TABLE manuals ADD COLUMN public_url TEXT",
      "ALTER TABLE manuals ADD COLUMN vendor_id TEXT"
    ];
    for (const q of manualAlters) {
      try {
        await db.prepare(q).run();
        console.log("Success:", q);
      } catch (e) {
        console.log("Ignored or Error:", q, e.message);
      }
    }

    // 2. Alter order_items table
    const orderItemAlters = [
      "ALTER TABLE order_items ADD COLUMN pricing_mode TEXT",
      "ALTER TABLE order_items ADD COLUMN paper_size TEXT",
      "ALTER TABLE order_items ADD COLUMN printing_rate REAL",
      "ALTER TABLE order_items ADD COLUMN binding_rate REAL"
    ];
    for (const q of orderItemAlters) {
      try {
        await db.prepare(q).run();
        console.log("Success:", q);
      } catch (e) {
        console.log("Ignored or Error:", q, e.message);
      }
    }

    // 3. Platform settings table creation (if not exists)
    try {
        await db.prepare(`
        CREATE TABLE IF NOT EXISTS platform_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
        `).run();
        console.log("Success: CREATE TABLE platform_settings");
    } catch (e) {
        console.log("Ignored or Error:", e.message);
    }
    
    // 4. Alter documents table
    const docAlters = [
      "ALTER TABLE documents ADD COLUMN order_id TEXT"
    ];
    for (const q of docAlters) {
      try {
        await db.prepare(q).run();
        console.log("Success:", q);
      } catch (e) {
        console.log("Ignored or Error:", q, e.message);
      }
    }
    
    // 5. Alter orders table
    const orderAlters = [
      "ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'manual'"
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
