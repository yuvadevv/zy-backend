import { Router } from '../core/Router.js';
import { handlePostOrder, handleGetOrders, handleGetOrder } from './orders.js';
import { handleCalculatePricing } from './pricing.js';
import { verifyAuth } from '../middleware/auth.js';

export const ordersRouter = new Router();

// Middleware to enforce student authentication
ordersRouter.use(async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
});

ordersRouter.post('/', handlePostOrder);
ordersRouter.get('/', handleGetOrders);
ordersRouter.post('/calculate-pricing', handleCalculatePricing);
ordersRouter.get('/:id', (req, env, ctx) => handleGetOrder(req, env, ctx, ctx.params.id));
