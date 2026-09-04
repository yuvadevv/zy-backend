import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('='))
);

const db = createRemoteD1({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: env.CLOUDFLARE_DATABASE_ID,
  apiToken: env.CLOUDFLARE_D1_API_TOKEN
});

db.prepare("SELECT id, title, metadata FROM website_content").all().then(r => console.log(JSON.stringify(r.results, null, 2))).catch(console.error);
db.prepare("SELECT * FROM platform_settings").all().then(r => console.log(JSON.stringify(r.results, null, 2))).catch(console.error);
