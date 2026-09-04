import { Router } from '../core/Router.js';
import { handleCreatePayment, handleVerifyPayment, handlePaymentWebhook } from './payments.js';
import { verifyAuth } from '../middleware/auth.js';

export const paymentsRouter = new Router();

// Webhook is public (signed by gateway secret)
paymentsRouter.post('/webhook', handlePaymentWebhook);

// Protected payment endpoints
paymentsRouter.post('/create', async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  return handleCreatePayment(request, env, authRes.context);
});

paymentsRouter.post('/verify', async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  return handleVerifyPayment(request, env, authRes.context);
});
