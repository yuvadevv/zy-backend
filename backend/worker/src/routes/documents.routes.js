import { Router } from '../core/Router.js';
import { handlePostDocument, handleGetDocument, handleDeleteDocument } from './documents.js';
import { handleGetDocumentStream } from './documentsStream.js';
import { verifyAuth } from '../middleware/auth.js';

export const documentsRouter = new Router();

// Middleware to enforce student authentication
documentsRouter.use(async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
});

documentsRouter.post('/', handlePostDocument);
documentsRouter.get('/stream/:id', (req, env, ctx) => handleGetDocumentStream(req, env, ctx, ctx.params.id));
documentsRouter.get('/:id', (req, env, ctx) => handleGetDocument(req, env, ctx, ctx.params.id));
documentsRouter.delete('/:id', (req, env, ctx) => handleDeleteDocument(req, env, ctx, ctx.params.id));
