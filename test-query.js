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
    const userId = "1eeae608-fc19-4efb-ae62-89a1bef668de";
    
    console.log("Running Query 1:");
    const stmt1 = db.prepare(`
      SELECT s.id, s.name, s.roll_number, s.phone, s.email,
             s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section,
             c.name as college_name, b.name as branch_name,
             ay.label as year_label, sem.label as semester_label, sec.name as section_name
      FROM students s
      LEFT JOIN colleges c ON s.college_id = c.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      LEFT JOIN sections sec ON s.section = sec.id
      WHERE s.id = ?
    `).bind(userId);
    
    const result1 = await stmt1.first();
    console.log("Result 1:", result1);

  } catch (e) {
    console.error("Query 1 Failed:", e.message);
    
    console.log("\nRunning Fallback Query:");
    const userId = "1eeae608-fc19-4efb-ae62-89a1bef668de";
    try {
      const stmt2 = db.prepare(`
        SELECT s.id, s.name, s.roll_number, s.phone, s.email, s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section, sec.name as section_name
        FROM students s
        LEFT JOIN sections sec ON s.section = sec.id
        WHERE s.id = ?
      `).bind(userId);
      const result2 = await stmt2.first();
      console.log("Result 2:", result2);
    } catch(e2) {
      console.error("Fallback Failed:", e2.message);
    }
  }
}
main();
