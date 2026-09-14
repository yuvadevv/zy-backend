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
    console.log("Starting binding_pricing_rules migration...");

    // Create table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS binding_pricing_rules (
        id TEXT PRIMARY KEY,
        min_pages INTEGER NOT NULL,
        max_pages INTEGER NOT NULL,
        price REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER,
        updated_at INTEGER,
        created_by TEXT
      )
    `).run();
    console.log("Success: CREATE TABLE binding_pricing_rules");

    // Check if table is empty
    const countRes = await db.prepare('SELECT count(*) as cnt FROM binding_pricing_rules').first();
    if (countRes && countRes.cnt === 0) {
      console.log("Table is empty, seeding default pricing rules...");
      const now = Date.now();
      
      const insertRule = db.prepare(`
        INSERT INTO binding_pricing_rules (id, min_pages, max_pages, price, is_active, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const rules = [
        ['rule-1', 1, 50, 30, 1, now, now, 'system'],
        ['rule-2', 51, 90, 40, 1, now, now, 'system'],
        ['rule-3', 91, 150, 50, 1, now, now, 'system'],
        ['rule-4', 151, 250, 70, 1, now, now, 'system'],
        ['rule-5', 251, 400, 100, 1, now, now, 'system']
      ];

      for (const rule of rules) {
        await insertRule.bind(...rule).run();
        console.log(`Success: Seeded rule ${rule[0]}`);
      }
    } else {
       console.log(`Table already contains ${countRes.cnt} rules, skipping seed.`);
    }

    console.log("Migrations complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

run();
