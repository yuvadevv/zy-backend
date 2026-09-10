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

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN;

async function listDatabases() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await res.json();
  if (data.success) {
    console.log("Databases found:");
    data.result.forEach(db => {
      console.log(`- Name: ${db.name}, ID: ${db.uuid}, Created: ${db.created_at}`);
    });
  } else {
    console.log("Failed to list databases:", data.errors);
  }
}

listDatabases();
