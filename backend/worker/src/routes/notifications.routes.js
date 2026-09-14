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
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 25;
    const filter = url.searchParams.get('filter') || 'all'; // all, unread
    const category = url.searchParams.get('category') || 'all';

    let query = `
      SELECT n.*, nr.read_at, nr.created_at as received_at
      FROM notification_recipients nr
      JOIN notifications n ON nr.notification_id = n.id
      WHERE nr.user_id = ?
    `;
    const params = [context.userId];

    if (filter === 'unread') {
      query += ` AND nr.read_at IS NULL`;
    }
    if (category !== 'all') {
      query += ` AND n.category = ?`;
      params.push(category);
    }

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const totalRes = await env.DB.prepare(countQuery).bind(...params).first();
    const total = totalRes ? totalRes.total : 0;

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const results = await env.DB.prepare(query).bind(...params).all();

    return successResponse({
      notifications: results.results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Get Notifications Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch notifications', 500);
  }
});

// GET /api/notifications/unread-count
notificationsRouter.get('/unread-count', async (request, env, context) => {
  try {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count 
      FROM notification_recipients 
      WHERE user_id = ? AND read_at IS NULL
    `).bind(context.userId).first();
    return successResponse({ unreadCount: result.count });
  } catch (err) {
    console.error('Get Unread Count Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch unread count', 500);
  }
});

// PATCH /api/notifications/:id/read
notificationsRouter.patch('/:id/read', async (request, env, context) => {
  try {
    const url = new URL(request.url);
    const id = url.pathname.split('/')[3]; 

    await env.DB.prepare(`
      UPDATE notification_recipients SET read_at = ?
      WHERE notification_id = ? AND user_id = ? AND read_at IS NULL
    `).bind(Date.now(), id, context.userId).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Mark Notification Read Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to mark notification read', 500);
  }
});

// PATCH /api/notifications/read-all
notificationsRouter.patch('/read-all', async (request, env, context) => {
  try {
    await env.DB.prepare(`
      UPDATE notification_recipients SET read_at = ?
      WHERE user_id = ? AND read_at IS NULL
    `).bind(Date.now(), context.userId).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Mark All Read Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to mark all read', 500);
  }
});
