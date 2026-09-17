import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
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
}

import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function run() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS order_items_new (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      manual_id TEXT,
      document_id TEXT,
      copies INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      print_type TEXT NOT NULL,
      color_mode INTEGER NOT NULL,
      binding_type TEXT NOT NULL,
      base_price REAL NOT NULL,
      printing_cost REAL NOT NULL,
      binding_cost REAL NOT NULL,
      item_total REAL NOT NULL,
      created_at INTEGER NOT NULL, pricing_mode TEXT, paper_size TEXT, printing_rate REAL, binding_rate REAL, custom_file_id TEXT, binding_rule_id TEXT, customer_unit_price REAL, customer_total REAL, vendor_unit_price REAL, vendor_total REAL, blintzy_unit_earning REAL, blintzy_total_earning REAL, pricing_rule_id TEXT, pricing_rule_snapshot TEXT, calculation_details TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(internal_id),
      FOREIGN KEY (manual_id) REFERENCES manuals(id),
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )`,
    `CREATE TABLE IF NOT EXISTS payments_new (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_order_id TEXT UNIQUE NOT NULL,
      provider_payment_id TEXT UNIQUE,
      provider_signature TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      paid_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(internal_id)
    )`,
    `CREATE TABLE IF NOT EXISTS notifications_new (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_order_id TEXT,
      related_refund_id TEXT,
      dedupe_key TEXT UNIQUE,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      read_at INTEGER, category TEXT, icon TEXT, action_label TEXT, action_url TEXT, audience_type TEXT, audience_filter_snapshot TEXT, created_by TEXT, status TEXT, sent_at INTEGER, updated_at INTEGER,
      FOREIGN KEY (student_id) REFERENCES students(id)
    )`,
    `CREATE TABLE IF NOT EXISTS notification_recipients_new (
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
    )`
  ];

  for (const stmt of stmts) {
    await db.prepare(stmt).run();
  }

  const tablesToSwap = ['order_items', 'payments', 'notifications', 'notification_recipients'];
  for (const table of tablesToSwap) {
    await db.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    await db.prepare(`ALTER TABLE ${table}_new RENAME TO ${table}`).run();
    console.log(`Recreated ${table}`);
  }
}
run();
