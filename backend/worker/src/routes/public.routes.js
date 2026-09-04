import { Router } from '../core/Router.js';
import { handleHealth } from './health.js';
import { handleGetContent, handleGetPlatformStatus, handleGetAcademicOptions, handleGetPublicPricingSettings } from './public.js';
import { handleTestPdf } from './test-pdf.js';
import { errorResponse } from '../utils/response.js';

export const publicRouter = new Router();

publicRouter.get('/health', () => handleHealth());
publicRouter.get('/platform/status', handleGetPlatformStatus);
publicRouter.get('/content', handleGetContent);
publicRouter.get('/public/academic-options', handleGetAcademicOptions);
publicRouter.get('/public/settings/pricing', handleGetPublicPricingSettings);
publicRouter.post('/test-pdf', handleTestPdf);

// Public Media Storage Streaming from R2
publicRouter.get('/public/media/*', async (request, env) => {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace('/api/public/', ''));
  const object = await env.PUBLIC_MEDIA.get(key);
  if (!object) return errorResponse('NOT_FOUND', 'Media not found', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  return new Response(object.body, { headers });
});
