import { errorResponse, successResponse } from '../utils/response.js';

export async function handleUploadCustomFile(request, env, context) {
  try {
    const studentId = context.user?.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const formData = await request.formData();
    const file = formData.get('file');
    const orderId = formData.get('orderId');

    if (!file || !(file instanceof File)) {
      return errorResponse('BAD_REQUEST', 'Missing or invalid file', 400);
    }

    // Fetch dynamic limits
    const settingsRow = await env.DB.prepare(`SELECT setting_value FROM platform_settings WHERE setting_key = 'code_tantra_settings'`).first();
    let hardMaximum = 500 * 1024 * 1024; // fallback 500MB if not configured
    if (settingsRow && settingsRow.setting_value) {
      try {
        const parsed = JSON.parse(settingsRow.setting_value);
        if (parsed.hardMaximum) {
           hardMaximum = parsed.hardMaximum;
        }
      } catch (e) {}
    }

    if (file.size > hardMaximum) {
      return errorResponse('BAD_REQUEST', `File exceeds maximum technical limit of ${Math.round(hardMaximum/1024/1024)}MB`, 400);
    }

    const fileId = crypto.randomUUID();
    const oId = orderId || `temp_${Date.now()}`;
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const objectKey = `orders/${oId}/${fileId}_${safeFilename}`;
    const bucket = env.R2_BUCKET_NAME_CUSTOM_UPLOADS || 'custom-uploads';

    const arrayBuffer = await file.arrayBuffer();

    try {
      await env.CUSTOM_UPLOADS.put(objectKey, arrayBuffer, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: { studentId, fileId }
      });
    } catch (e) {
      console.error('R2 upload failed', e);
      return errorResponse('SERVER_ERROR', 'Failed to upload document', 500);
    }

    const pageCountStr = formData.get('pageCount');
    const pageCount = pageCountStr ? parseInt(pageCountStr, 10) : 0;

    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO custom_files (
        id, order_id, service_type, original_filename, stored_filename,
        mime_type, file_size, page_count, storage_provider, r2_bucket, r2_object_key,
        upload_status, is_temporary, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      fileId, orderId || null, 'code_tantra_files', file.name, safeFilename,
      file.type || 'application/octet-stream', file.size, pageCount, 'r2', bucket, objectKey,
      'UPLOADED', 1, 0, now, now
    ).run();

    return successResponse({
      fileId,
      status: 'UPLOADED',
      objectKey,
      originalFileName: file.name
    });
  } catch (err) {
    console.error('Error uploading file:', err);
    return errorResponse('SERVER_ERROR', 'Failed to upload file', 500);
  }
}

export async function handleCreateOversizedRequest(request, env, context) {
  try {
    const studentId = context.user.id;
    const body = await request.json();
    const { 
      fileName, 
      fileSize, 
      mimeType, 
      pdfCount, 
      totalPages, 
      printingOptions 
    } = body;
    
    if (!fileName || !fileSize) {
      return errorResponse('BAD_REQUEST', 'Missing file name or size', 400);
    }
    
    const id = `ofr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowMs = Date.now();
    
    await env.DB.prepare(`
      INSERT INTO oversized_file_requests 
      (id, student_id, file_name, file_size, mime_type, pdf_count, total_pages, printing_options, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, studentId, fileName, fileSize, mimeType || null, 
      pdfCount || 0, totalPages || 0, 
      printingOptions ? (typeof printingOptions === 'string' ? printingOptions : JSON.stringify(printingOptions)) : null,
      'PENDING_REVIEW', nowMs, nowMs
    ).run();
    
    return successResponse({ id, status: 'PENDING_REVIEW' });
  } catch (err) {
    return errorResponse('SERVER_ERROR', err.message, 500);
  }
}

export async function handleGetOversizedRequests(request, env, context) {
  try {
    const studentId = context.user.id;
    const { results } = await env.DB.prepare(`
      SELECT * FROM oversized_file_requests 
      WHERE student_id = ? 
      ORDER BY created_at DESC
    `).bind(studentId).all();
    
    return successResponse(results);
  } catch (err) {
    return errorResponse('SERVER_ERROR', err.message, 500);
  }
}

export async function handleGetDownloadUrl(request, env, context) {
  try {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/custom-files\/([^/]+)\/download$/);
    if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);
    
    const fileId = match[1];
    
    const file = await env.DB.prepare(`SELECT * FROM custom_files WHERE id = ? AND is_deleted = 0`).bind(fileId).first();
    if (!file) return errorResponse('NOT_FOUND', 'File not found or deleted', 404);

    const user = context.user;
    if (!user) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    let allowed = false;
    if (user.role === 'admin') {
      allowed = true;
    } else if (user.role === 'vendor') {
      const order = await env.DB.prepare(`SELECT * FROM orders WHERE internal_id = ?`).bind(file.order_id).first();
      if (order) allowed = true;
    } else {
      const order = await env.DB.prepare(`SELECT * FROM orders WHERE internal_id = ? AND student_id = ?`).bind(file.order_id, user.id).first();
      if (order) allowed = true;
    }

    if (!allowed) {
      return errorResponse('FORBIDDEN', 'You do not have access to this file', 403);
    }

    const object = await env.CUSTOM_UPLOADS.get(file.r2_object_key);
    if (!object) {
      return errorResponse('NOT_FOUND', 'File is missing in storage', 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Disposition', `attachment; filename="${file.stored_filename}"`);
    
    return new Response(object.body, { headers });
  } catch (err) {
    console.error('Error generating download URL:', err);
    return errorResponse('SERVER_ERROR', 'Internal server error', 500);
  }
}

export async function handleDeleteCustomFile(request, env, context) {
  try {
    const user = context.user;
    if (!user || user.role !== 'admin') {
      return errorResponse('FORBIDDEN', 'Only admins can delete files', 403);
    }

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/custom-files\/([^/]+)$/);
    if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);
    
    const fileId = match[1];

    const file = await env.DB.prepare(`SELECT * FROM custom_files WHERE id = ? AND is_deleted = 0`).bind(fileId).first();
    if (!file) return errorResponse('NOT_FOUND', 'File not found', 404);

    try {
      await env.CUSTOM_UPLOADS.delete(file.r2_object_key);
    } catch (e) {
      console.error('Failed to delete object from R2', e);
      return errorResponse('SERVER_ERROR', 'Failed to delete file from storage', 500);
    }

    await env.DB.prepare(`UPDATE custom_files SET is_deleted = 1, upload_status = 'DELETED', deleted_at = ? WHERE id = ?`)
      .bind(Date.now(), fileId).run();

    return successResponse({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    console.error('Error deleting file:', err);
    return errorResponse('SERVER_ERROR', 'Internal server error', 500);
  }
}

export async function handleGetFileStatus(request, env, context) {
  try {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/custom-files\/([^/]+)\/status$/);
    if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);
    
    const fileId = match[1];
    const file = await env.DB.prepare(`SELECT id, order_id, upload_status, is_deleted FROM custom_files WHERE id = ?`).bind(fileId).first();
    
    if (!file) return errorResponse('NOT_FOUND', 'File not found', 404);
    
    return successResponse({
      fileId: file.id,
      status: file.upload_status,
      isDeleted: file.is_deleted === 1
    });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Internal server error', 500);
  }
}
