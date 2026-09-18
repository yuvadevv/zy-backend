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
  try {
    console.log("Adding role column...");
    await db.prepare(`ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'sub_admin'`).run();
  } catch (e) {
    console.log("role column might already exist", e.message);
  }

  try {
    console.log("Adding permissions column...");
    await db.prepare(`ALTER TABLE admin_users ADD COLUMN permissions TEXT DEFAULT '[]'`).run();
  } catch (e) {
    console.log("permissions column might already exist", e.message);
  }

  try {
    console.log("Updating super admin role...");
    await db.prepare(`UPDATE admin_users SET role = 'super_admin' WHERE email = 'theblintzy@gmail.com'`).run();
  } catch (e) {
    console.error("Failed to update super admin", e.message);
  }

  console.log("Done!");
}
run();
