import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
import fs from 'node:fs';

const content = fs.readFileSync('.env', 'utf8');
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

const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function check() {
  try {
    console.log("Checking recent users (admin_users)...");
    const users = await db.prepare("SELECT * FROM admin_users ORDER BY created_at DESC LIMIT 5").all();
    console.log(users.results);
  } catch (e) {
    console.log("no admin_users");
  }

  try {
    console.log("Checking recent manuals...");
    const manuals = await db.prepare("SELECT * FROM manuals ORDER BY created_at DESC LIMIT 5").all();
    console.log(manuals.results);
  } catch (e) {
    console.log("no manuals");
  }
}
check();
