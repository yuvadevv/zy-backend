import { Router } from './core/Router.js';
import { handleSwaggerHtml, handleOpenApiJson } from './docs/swagger.js';
import { authRouter } from './routes/auth.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { studentsRouter } from './routes/students.routes.js';
import { ordersRouter } from './routes/orders.routes.js';
import { documentsRouter } from './routes/documents.routes.js';
import { manualsRouter } from './routes/manuals.routes.js';
import { paymentsRouter } from './routes/payments.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { vendorRouter } from './routes/vendor.routes.js';
import { refundsRouter } from './routes/refunds.routes.js';
import { notificationsRouter } from './routes/notifications.routes.js';
import { errorResponse } from './utils/response.js';

// Initialize Root Application Router
const app = new Router();

// Documentation (OpenAPI 3.0 & Swagger UI)
app.get('/', (req) => Response.redirect(new URL('/docs', req.url).toString(), 302));
app.get('/docs', handleSwaggerHtml);
app.get('/api/docs', handleSwaggerHtml);
app.get('/api/docs/openapi.json', handleOpenApiJson);

// Sub-router mount points
app.use('/api/auth', authRouter);
app.use('/api', publicRouter);
app.use('/api/students', studentsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/manuals', manualsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/vendor', vendorRouter);
app.use('/api/refunds', refundsRouter);
app.use('/api/notifications', notificationsRouter);

let isInitialized = false;
let initPromise = null;

const ensureDefaultBanners = async (env) => {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const check = await env.DB.prepare("SELECT setting_value FROM platform_settings WHERE setting_key = 'default_banners_created'").first();
        if (!check) {
          const now = Date.now();
          const banners = [
            { id: 'default_banner_1', title: 'Hall Tickets Released', msg: 'Download & Print Today.', cta: 'Get Tickets', url: '/app/services/hall-tickets', icon: 'ticket', theme: 'purple', p: 1 },
            { id: 'default_banner_2', title: 'Semester Manuals Updated', msg: 'All branches available.', cta: 'Browse Manuals', url: '/app/services/manuals', icon: 'book', theme: 'green', p: 2 },
            { id: 'default_banner_3', title: 'Assignments Ready', msg: 'Upload in seconds.', cta: 'Upload Now', url: '/app/services/upload', icon: 'document', theme: 'blue', p: 3 },
            { id: 'default_banner_4', title: 'Print Before 8 PM', msg: 'Get tomorrow classroom delivery.', cta: 'Print Now', url: '/app/services/upload', icon: 'clock', theme: 'orange', p: 4 }
          ];

          const statements = banners.map(b => {
            const meta = JSON.stringify({ message: b.msg, cta_label: b.cta, theme: b.theme, icon: b.icon, cta_url: b.url, image_url: '' });
            return env.DB.prepare("INSERT OR IGNORE INTO website_content (id, content_type, title, metadata, priority, status, created_at, updated_at) VALUES (?, 'banner', ?, ?, ?, 'active', ?, ?)")
              .bind(b.id, b.title, meta, b.p, now, now);
          });
          
          statements.push(env.DB.prepare("INSERT OR IGNORE INTO platform_settings (setting_key, setting_value, updated_at) VALUES ('default_banners_created', 'true', ?)").bind(now));

          await env.DB.batch(statements);
        }
        isInitialized = true;
      } catch (e) {
        console.error("Failed to initialize default banners:", e);
        initPromise = null;
      }
    })();
  }
  await initPromise;
};

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 2. Ensure initial defaults
    await ensureDefaultBanners(env);

    // 3. Route dispatch
    let response;
    try {
      response = await app.handle(request, env, ctx);
      if (!response) {
        response = errorResponse('NOT_FOUND', `Route not found: ${request.method} ${new URL(request.url).pathname}`, 404);
      }
    } catch (err) {
      console.error('Unhandled Worker Error:', err);
      response = errorResponse('INTERNAL_ERROR', err.message || 'Internal server error', 500);
    }

    // 4. Inject CORS headers on final response
    const corsHeaders = new Headers(response.headers);
    corsHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
    corsHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    corsHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  },

  async scheduled(event, env, ctx) {
    console.log('Cron trigger executed at', new Date().toISOString());
    const now = Date.now();

    try {
      const { results } = await env.DB.prepare(
        `SELECT id, r2_object_key FROM documents 
         WHERE expires_at <= ? AND deleted_at IS NULL
         LIMIT 100`
      )
        .bind(now)
        .all();

      console.log(`Found ${results?.length || 0} expired documents to clean up.`);

      for (const doc of results || []) {
        try {
          await env.DOCUMENTS.delete(doc.r2_object_key);
          await env.DB.prepare(`UPDATE documents SET deleted_at = ? WHERE id = ?`)
            .bind(now, doc.id)
            .run();
          console.log(`Successfully cleaned up document ${doc.id}`);
        } catch (e) {
          console.error(`Failed to clean up document ${doc.id}`, e);
        }
      }
    } catch (e) {
      console.error('Failed to query expired documents:', e);
    }
  }
};
