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
  console.log("Starting Academic Setup migration...");
  
  try {
    // 1. Add status columns to existing tables
    const tablesToAlter = ['colleges', 'branches', 'academic_years', 'semesters', 'subjects'];
    for (const table of tablesToAlter) {
      try {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN status TEXT DEFAULT 'active'`).run();
        console.log(`Added status column to ${table}`);
      } catch (e) {
        if (e.message.includes('duplicate column name')) {
          console.log(`status column already exists on ${table}`);
        } else {
          console.error(`Failed to alter ${table}:`, e);
        }
      }
    }

    // 2. Create new tables
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS sections (
            id TEXT PRIMARY KEY,
            semester_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (semester_id) REFERENCES semesters(id)
        )
      `).run();
      console.log('Created sections table');
    } catch(e) { console.error('Error creating sections:', e); }

    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            college_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (college_id) REFERENCES colleges(id)
        )
      `).run();
      console.log('Created blocks table');
    } catch(e) { console.error('Error creating blocks:', e); }

    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS classrooms (
            id TEXT PRIMARY KEY,
            block_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (block_id) REFERENCES blocks(id)
        )
      `).run();
      console.log('Created classrooms table');
    } catch(e) { console.error('Error creating classrooms:', e); }

    // 3. Add new columns to students
    try {
      await db.prepare(`ALTER TABLE students ADD COLUMN block_id TEXT`).run();
      console.log('Added block_id to students');
    } catch (e) {
      if (e.message.includes('duplicate column name')) console.log('block_id already exists on students');
      else console.error('Error adding block_id to students:', e);
    }

    try {
      await db.prepare(`ALTER TABLE students ADD COLUMN classroom_id TEXT`).run();
      console.log('Added classroom_id to students');
    } catch (e) {
      if (e.message.includes('duplicate column name')) console.log('classroom_id already exists on students');
      else console.error('Error adding classroom_id to students:', e);
    }

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}
run();
