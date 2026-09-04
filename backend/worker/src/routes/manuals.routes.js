import { Router } from '../core/Router.js';
import { handleGetFilters, handleGetManuals, handleGetManualById, handleGetManualFile } from './manuals.js';
import { verifyAuth } from '../middleware/auth.js';

export const manualsRouter = new Router();

manualsRouter.get('/filters', handleGetFilters);
manualsRouter.get('/', handleGetManuals);
manualsRouter.get('/:id/file', async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  return handleGetManualFile(request, env, authRes.context, context.params.id);
});
manualsRouter.get('/:id', async (request, env, context) => {
  return handleGetManualById(request, env, context.params.id);
});
