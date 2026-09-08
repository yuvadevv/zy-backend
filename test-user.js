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

async function main() {
  try {
    const userId = "1EEAE608-FC19-4EFB-AE62-89A1BEF668DE".toLowerCase();
    const info = await db.prepare("SELECT * FROM students WHERE LOWER(id) = ?").bind(userId).all();
    console.log("Student in DB:", info);
    
    // check how many students there are total
    const count = await db.prepare("SELECT COUNT(*) as count FROM students").first();
    console.log("Total students in DB:", count);
  } catch (e) {
    console.error(e);
  }
}
main();
