import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env file automatically
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    } else {
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
  } catch (e) { }
}

import worker from './backend/worker/src/index.js';
import { createRemoteD1 } from './backend/worker/src/adapters/remoteD1.js';
import { createRemoteR2 } from './backend/worker/src/adapters/remoteR2.js';

const PORT = process.env.PORT || 8500;

const env = {
  DB: createRemoteD1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
  }),
  DOCUMENTS: createRemoteR2(process.env.R2_DOCUMENTS_BUCKET || 'blintzy-documents-dev', {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_R2_API_TOKEN
  }),
  PUBLIC_MEDIA: createRemoteR2(process.env.R2_PUBLIC_MEDIA_BUCKET || 'blintzy-public-media-preview', {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_R2_API_TOKEN
  }),
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const fullUrl = `http://${req.headers.host || 'localhost:' + PORT}${req.url}`;

    let bodyBuffer = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        bodyBuffer = Buffer.concat(chunks);
      }
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
    }

    const webRequest = new Request(fullUrl, {
      method: req.method,
      headers,
      body: bodyBuffer,
      duplex: 'half'
    });

    const ctx = {
      waitUntil: (p) => Promise.resolve(p),
      passThroughOnException: () => { }
    };

    const webResponse = await worker.fetch(webRequest, env, ctx);

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const resArrayBuffer = await webResponse.arrayBuffer();
    res.end(Buffer.from(resArrayBuffer));
  } catch (err) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
});

if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`\n🚀 BLINTZY Backend running on http://localhost:${PORT}`);
    console.log(`🔗 Connected directly to Cloudflare D1 (${env.DB ? 'Active' : 'Offline'}) & R2 via .env credentials`);
    console.log(`⚡ Zero Wrangler dependency\n`);
  });
}

export default server;

