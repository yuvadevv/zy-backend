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
import crypto from 'node:crypto';

const db = createRemoteD1({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const email = 'theblintzy@gmail.com';
  const password = 'Sai@2046';

  console.log(`Creating user ${email} in Supabase...`);
  
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'admin' }
    })
  });

  const responseText = await createRes.text();
  if (!createRes.ok) {
    if (!responseText.includes('email_exists')) {
      console.error('Failed to create user in Supabase:', responseText);
      return;
    }
  }

  let user = null;
  if (createRes.ok) {
    user = JSON.parse(responseText);
  } else {
    // Fetch the user to get the ID if already registered
    const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers });
    const listData = await listRes.json();
    user = listData.users.find(u => u.email === email);
    
    // Update password if it already existed just to be sure
    if (user) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password })
      });
    }
  }

  if (!user) {
    console.error('Could not find or create user.');
    return;
  }

  const userId = user.id;
  console.log(`Supabase User ID: ${userId}`);

  // Fetch super_admin or admin role
  const roles = await db.prepare('SELECT id, name FROM roles').all();
  console.log('Available roles:', roles.results);
  let adminRole = roles.results.find(r => r.name.toLowerCase() === 'super_admin') || roles.results.find(r => r.name.toLowerCase() === 'admin');
  
  if (!adminRole) {
    console.error('No admin role found in D1!');
    return;
  }
  console.log(`Using Role ID: ${adminRole.id} (${adminRole.name})`);

  const now = Date.now();
  
  // Clean up any old admin record with this email
  try {
    await db.prepare('DELETE FROM admin_users WHERE email = ?').bind(email).run();
    console.log('Cleared old admin record if any.');
  } catch(e) {
    console.error('Failed to clear old admin record:', e.message);
  }

  // Insert into admin_users
  try {
    await db.prepare('INSERT INTO admin_users (id, name, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(userId, 'Admin', email, 'active', now, now).run();
    console.log('Inserted into admin_users');
  } catch(e) {
    console.error('Failed to insert admin_user:', e.message);
  }

  // Insert into admin_user_roles
  try {
    // Check if role exists
    const hasRole = await db.prepare('SELECT admin_id FROM admin_user_roles WHERE admin_id = ?').bind(userId).first();
    if (!hasRole) {
      await db.prepare('INSERT INTO admin_user_roles (admin_id, role_id) VALUES (?, ?)')
        .bind(userId, adminRole.id).run();
      console.log('Inserted into admin_user_roles');
    } else {
      console.log('User already has a role assigned.');
    }
  } catch(e) {
    console.error('Failed to insert admin_user_roles:', e.message);
  }

  console.log('SUCCESS! Admin account created.');
}

run();
