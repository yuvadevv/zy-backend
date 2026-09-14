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
  console.log('Starting schema migration...');
  
  try {
    // 1. Create payment_attempts table
    console.log('Creating payment_attempts table...');
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        checkout_payload TEXT NOT NULL,
        calculated_amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT NOT NULL,
        razorpay_order_id TEXT UNIQUE,
        razorpay_payment_id TEXT UNIQUE,
        razorpay_signature TEXT,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        paid_at INTEGER
      )
    `).run();
    console.log('Created payment_attempts.');

    // 2. Create vendor_blintzy_pricing table
    console.log('Creating vendor_blintzy_pricing table...');
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS vendor_blintzy_pricing (
        id TEXT PRIMARY KEY,
        service_type TEXT NOT NULL,
        pricing_method TEXT NOT NULL,
        min_pages INTEGER,
        max_pages INTEGER,
        customer_unit_price REAL NOT NULL,
        vendor_unit_price REAL NOT NULL,
        blintzy_unit_earning REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        effective_from INTEGER,
        effective_to INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by TEXT,
        notes TEXT
      )
    `).run();
    console.log('Created vendor_blintzy_pricing.');

    // 3. Alter orders table
    console.log('Altering orders table...');
    const alterOrders = [
      'ALTER TABLE orders ADD COLUMN payment_attempt_id TEXT',
      'ALTER TABLE orders ADD COLUMN razorpay_order_id TEXT',
      'ALTER TABLE orders ADD COLUMN razorpay_payment_id TEXT',
      'ALTER TABLE orders ADD COLUMN payment_status TEXT',
      'ALTER TABLE orders ADD COLUMN payment_verified_at INTEGER',
      'ALTER TABLE orders ADD COLUMN vendor_payable_total REAL',
      'ALTER TABLE orders ADD COLUMN blintzy_gross_earning REAL',
      'ALTER TABLE orders ADD COLUMN payment_gateway_fee REAL',
      'ALTER TABLE orders ADD COLUMN refunds_total REAL',
      'ALTER TABLE orders ADD COLUMN adjustments_total REAL',
      'ALTER TABLE orders ADD COLUMN blintzy_net_earning REAL',
      'ALTER TABLE orders ADD COLUMN revenue_status TEXT'
    ];
    for (const sql of alterOrders) {
      try {
        await db.prepare(sql).run();
      } catch (e) {
        if (!e.message.includes('duplicate column')) {
          throw e;
        }
      }
    }
    console.log('Altered orders table.');

    // 4. Alter order_items table
    console.log('Altering order_items table...');
    const alterOrderItems = [
      'ALTER TABLE order_items ADD COLUMN customer_unit_price REAL',
      'ALTER TABLE order_items ADD COLUMN customer_total REAL',
      'ALTER TABLE order_items ADD COLUMN vendor_unit_price REAL',
      'ALTER TABLE order_items ADD COLUMN vendor_total REAL',
      'ALTER TABLE order_items ADD COLUMN blintzy_unit_earning REAL',
      'ALTER TABLE order_items ADD COLUMN blintzy_total_earning REAL',
      'ALTER TABLE order_items ADD COLUMN pricing_rule_id TEXT',
      'ALTER TABLE order_items ADD COLUMN pricing_rule_snapshot TEXT',
      'ALTER TABLE order_items ADD COLUMN calculation_details TEXT'
    ];
    for (const sql of alterOrderItems) {
      try {
        await db.prepare(sql).run();
      } catch (e) {
        if (!e.message.includes('duplicate column')) {
          throw e;
        }
      }
    }
    console.log('Altered order_items table.');

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

run();
