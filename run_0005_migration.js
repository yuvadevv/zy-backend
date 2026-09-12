import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';

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

const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'database', 'migrations', '0005_refunds_and_webhooks.sql'), 'utf8');
  const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const stmt of statements) {
    console.log(`Executing: ${stmt.slice(0, 50)}...`);
    try {
      await db.prepare(stmt).run();
      console.log('Success');
    } catch (e) {
      console.error('Error:', e);
    }
  }
  
  console.log("Migration Complete");
}

run();
