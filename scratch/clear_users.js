import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
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

import { createRemoteD1 } from '../backend/worker/src/adapters/remoteD1.js';

const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  console.log('--- STARTING FRESH START DB WIPE ---');

  // 1. Delete all Supabase Auth Users
  console.log('Fetching Supabase users...');
  let hasMore = true;
  let deletedCount = 0;
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  while (hasMore) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers });
    if (!res.ok) {
      console.error('Error fetching Supabase users:', await res.text());
      break;
    }
    
    const data = await res.json();
    const users = data.users || [];
    
    if (users.length === 0) {
      hasMore = false;
    } else {
      for (const user of users) {
        const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
          method: 'DELETE',
          headers
        });
        
        if (!delRes.ok) {
          console.error(`Failed to delete Supabase user ${user.id}:`, await delRes.text());
        } else {
          deletedCount++;
        }
      }
      if (users.length < 1000) hasMore = false;
    }
  }
  console.log(`Successfully deleted ${deletedCount} users from Supabase Auth.`);

  // 2. Clear D1 Tables associated with users
  console.log('Clearing D1 user tables...');
  const tablesToClear = [
    'order_items',
    'orders',
    'transactions',
    'notification_recipients',
    'audit_logs',
    'students'
  ];

  for (const table of tablesToClear) {
    try {
      await db.prepare(`DELETE FROM ${table}`).run();
      console.log(`Cleared D1 table: ${table}`);
    } catch (err) {
      console.error(`Failed to clear table ${table}:`, err.message);
    }
  }
  
  console.log('--- ALL DATA CLEARED SUCCESSFULLY ---');
}

run();
