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
    const sem = await db.prepare("SELECT * FROM semesters LIMIT 1").all();
    console.log("Semesters Table:", sem);
    const sec = await db.prepare("SELECT * FROM sections LIMIT 1").all();
    console.log("Sections Table:", sec);
    const col = await db.prepare("SELECT * FROM colleges LIMIT 1").all();
    console.log("Colleges Table:", col);
    const br = await db.prepare("SELECT * FROM branches LIMIT 1").all();
    console.log("Branches Table:", br);
  } catch (e) {
    console.error(e);
  }
}
main();
