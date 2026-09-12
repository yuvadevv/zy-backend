import { Router } from '../core/Router.js';
import { verifyAuth } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

export const refundsRouter = new Router();

// Middleware to enforce student authentication
refundsRouter.use(async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
});

// GET /api/refunds - Get refunds for logged in student
refundsRouter.get('/', async (request, env, context) => {
  try {
    const query = `
      SELECT r.*, o.public_id as order_public_id
      FROM refunds r
      JOIN orders o ON r.order_id = o.internal_id
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC
    `;
    const results = await env.DB.prepare(query).bind(context.userId).all();
    return successResponse(results.results);
  } catch (err) {
    console.error('Get Refunds Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch refunds', 500);
  }
});
