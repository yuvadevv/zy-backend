import { Router } from '../core/Router.js';
import { 
  handleUploadCustomFile, 
  handleGetDownloadUrl, 
  handleDeleteCustomFile,
  handleGetFileStatus,
  handleCreateOversizedRequest,
  handleGetOversizedRequests
} from './custom_files.js';
import { verifyAuth } from '../middleware/auth.js';

export const customFilesRouter = new Router();

customFilesRouter.use(async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;
  context.user = authRes.context.user;
  context.userId = authRes.context.userId;
});

customFilesRouter.post('/upload', handleUploadCustomFile);
customFilesRouter.get('/:id/download', handleGetDownloadUrl);
customFilesRouter.get('/:id/status', handleGetFileStatus);
customFilesRouter.delete('/:id', handleDeleteCustomFile);
customFilesRouter.post('/oversized-requests', handleCreateOversizedRequest);
customFilesRouter.get('/oversized-requests/me', handleGetOversizedRequests);
