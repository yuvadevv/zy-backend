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
  console.log('Starting dummy orders cleanup...');

  try {
    // 1. Delete from dependent tables first
    await db.prepare('DELETE FROM refunds').run();
    console.log('Cleared refunds');

    await db.prepare('DELETE FROM custom_files').run();
    console.log('Cleared custom_files');
    
    await db.prepare('DELETE FROM oversized_file_requests').run();
    console.log('Cleared oversized_file_requests');

    await db.prepare('DELETE FROM order_items').run();
    console.log('Cleared order_items');

    await db.prepare('DELETE FROM payments').run();
    console.log('Cleared payments');

    // 2. Delete main orders table
    await db.prepare('DELETE FROM orders').run();
    console.log('Cleared orders');

    // 3. Reset order sequence
    await db.prepare('UPDATE sequences SET last_sequence = 0 WHERE prefix_key = ?').bind('ZY').run();
    console.log('Reset ZY sequence');

    console.log('Cleanup completed successfully.');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

run();
