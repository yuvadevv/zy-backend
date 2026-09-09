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

    // Check if user is Admin
    const isAdmin = await env.DB.prepare('SELECT 1 FROM admin_users WHERE id = ? AND status = ?').bind(user.id, 'active').first();
    if (isAdmin) {
      isAuthorized = true;
    } 
    // Check if user is Vendor
    else if (doc.order_id) {
      const isVendor = await env.DB.prepare(`
        SELECT 1 FROM vendor_orders 
        WHERE order_id = ? AND vendor_id = ?
      `).bind(doc.order_id, user.id).first();
      
      if (isVendor) {
        isAuthorized = true;
      }
    }

    // Student can access their own
    if (!isAuthorized && doc.student_id === user.id) {
      isAuthorized = true;
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
