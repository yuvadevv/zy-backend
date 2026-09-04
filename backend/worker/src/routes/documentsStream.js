import { errorResponse } from '../utils/response.js';

export async function handleGetDocumentStream(request, env, context) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/documents\/stream\/([^/]+)$/);
  if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);

  const documentId = match[1];
  const user = context.user;
  
  // Need to verify if the user is allowed to access this document
  try {
    const doc = await env.DB.prepare(`
      SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL
    `).bind(documentId).first();

    if (!doc) {
      return errorResponse('NOT_FOUND', 'Document not found', 404);
    }

    let isAuthorized = false;

    if (user.role === 'admin') {
      isAuthorized = true;
    } else if (user.role === 'vendor') {
      // Vendor can access if order is assigned to them
      if (doc.order_id) {
        const order = await env.DB.prepare(`
          SELECT * FROM vendor_orders WHERE order_id = ? AND vendor_id = ?
        `).bind(doc.order_id, user.id).first();
        if (order) isAuthorized = true;
      }
    } else {
      // Student can access their own
      if (doc.student_id === user.id) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return errorResponse('FORBIDDEN', 'Forbidden', 403);
    }

    const object = await env.DOCUMENTS.get(doc.r2_object_key, {
      range: request.headers.get('Range') || undefined
    });

    if (object === null) {
      return errorResponse('NOT_FOUND', 'File not found in storage', 404);
    }

    const headers = new Headers();
    if (object.httpMetadata?.contentType) {
      headers.set('Content-Type', object.httpMetadata.contentType);
    } else {
      headers.set('Content-Type', 'application/pdf');
    }
    if (object.httpEtag) {
      headers.set('etag', object.httpEtag);
    }
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Disposition', `inline; filename="${doc.original_filename}"`);
    
    if (object.range) {
      headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    }

    return new Response(object.body, {
      status: object.range ? 206 : 200,
      headers
    });
  } catch (err) {
    console.error('Stream error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to stream document', 500);
  }
}
