import { Router } from '../core/Router.js';
import { handleLogin, handleSignup, handleLogout, handleGetAuthMe, handleOAuthGoogle, handleOAuthExchange } from './auth.js';
import { verifyAuth } from '../middleware/auth.js';

export const authRouter = new Router();

authRouter.post('/login', handleLogin);
authRouter.post('/signup', handleSignup);
authRouter.post('/logout', handleLogout);

// OAuth Endpoints
authRouter.get('/oauth/google', handleOAuthGoogle);
authRouter.post('/oauth/exchange', handleOAuthExchange);

// Protected Auth Me endpoint
authRouter.get('/me', async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  return handleGetAuthMe(request, env, authRes.context);
});

