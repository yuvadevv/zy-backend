import { Router } from '../core/Router.js';
import { handleGetMe, handlePutMe } from './students.js';
import { verifyAuth } from '../middleware/auth.js';

export const studentsRouter = new Router();

// Middleware to enforce student authentication
studentsRouter.use(async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
});

studentsRouter.get('/me', handleGetMe);
studentsRouter.put('/me', handlePutMe);
