import { Router } from '../core/Router.js';
import { verifyAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

export const notificationsRouter = new Router();

notificationsRouter.use(async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
});

// GET /api/notifications
notificationsRouter.get('/', async (request, env, context) => {
  try {
    const results = await env.DB.prepare(`
      SELECT * FROM notifications
      WHERE student_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(context.userId).all();
    return successResponse(results.results);
  } catch (err) {
    console.error('Get Notifications Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch notifications', 500);
  }
});

// POST /api/notifications/:id/read
notificationsRouter.post('/:id/read', async (request, env, context) => {
  try {
    const url = new URL(request.url);
    const id = url.pathname.split('/')[3]; // /api/notifications/:id/read

    await env.DB.prepare(`
      UPDATE notifications SET is_read = 1, read_at = ?
      WHERE id = ? AND student_id = ?
    `).bind(Date.now(), id, context.userId).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Mark Notification Read Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to mark notification read', 500);
  }
});
