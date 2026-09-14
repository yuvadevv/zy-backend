const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const { createRemoteD1 } = await import('./src/adapters/remoteD1.js');
  
  const DB = createRemoteD1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
  });

  const sql = fs.readFileSync(path.join(__dirname, 'setup_faqs.sql'), 'utf-8');
  
  try {
    const result = await DB.prepare(sql).run();
    console.log('Migration successful:', result);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

run();
