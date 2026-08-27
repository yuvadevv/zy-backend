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
  console.log("Starting migration...");
  
  // Create table without foreign keys
  const createSql = `
  CREATE TABLE students_new (
      id TEXT PRIMARY KEY,
      roll_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      college_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      study_year_id TEXT NOT NULL,
      semester_id TEXT NOT NULL,
      section TEXT,
      account_status TEXT NOT NULL,
      password_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
  )`;

  try {
    await db.prepare(createSql).run();
    console.log("Created students_new");
    
    await db.prepare("INSERT INTO students_new SELECT * FROM students").run();
    console.log("Copied data");
    
    await db.prepare("DROP TABLE students").run();
    console.log("Dropped old table");
    
    await db.prepare("ALTER TABLE students_new RENAME TO students").run();
    console.log("Renamed new table to students");
    
    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}
run();
