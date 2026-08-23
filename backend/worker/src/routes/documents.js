import { PDFDocument } from 'pdf-lib';
import { errorResponse, successResponse } from '../utils/response.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function handlePostDocument(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) {
      return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const documentType = formData.get('documentType');

    if (!file || !(file instanceof File)) {
      return errorResponse('BAD_REQUEST', 'Missing or invalid file', 400);
    }

    if (documentType !== 'hall_ticket' && documentType !== 'custom') {
      return errorResponse('BAD_REQUEST', 'Invalid document type', 400);
    }

    let maxFileSize = 10 * 1024 * 1024; // Default 10MB
    try {
      const setting = await env.DB.prepare('SELECT setting_value FROM platform_settings WHERE setting_key = ?').bind('document_upload_limit').first();
      if (setting && setting.setting_value) {
        const parsed = JSON.parse(setting.setting_value);
        if (parsed.max_file_size_mb) {
          maxFileSize = parsed.max_file_size_mb * 1024 * 1024;
        }
      }
    } catch (e) {
      console.warn('Failed to read upload limit from settings, using default', e);
    }

    if (file.size > maxFileSize) {
      return errorResponse('BAD_REQUEST', `File exceeds ${maxFileSize / (1024 * 1024)}MB limit`, 400);
    }

    if (file.type !== 'application/pdf') {
      return errorResponse('BAD_REQUEST', 'Only PDF files are allowed', 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Check %PDF- signature
    if (uint8Array.length < 5 || 
        uint8Array[0] !== 0x25 || // %
        uint8Array[1] !== 0x50 || // P
        uint8Array[2] !== 0x44 || // D
        uint8Array[3] !== 0x46 || // F
        uint8Array[4] !== 0x2D) { // -
      return errorResponse('BAD_REQUEST', 'Invalid PDF signature', 400);
    }

    let pageCount = parseInt(formData.get('pageCount'));
    if (isNaN(pageCount) || pageCount <= 0) {
      return errorResponse('BAD_REQUEST', 'Missing or invalid page count', 400);
    }

    const documentId = crypto.randomUUID();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const objectKey = `documents/${studentId}/${documentId}/${safeFilename}`;

    const now = Date.now();
    // 3 days
    const expiresAt = now + (3 * 24 * 60 * 60 * 1000);

    // Upload to R2
    try {
      await env.DOCUMENTS.put(objectKey, arrayBuffer, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { studentId, documentId }
      });
    } catch (e) {
      console.error('R2 upload failed', e);
      return errorResponse('SERVER_ERROR', 'Failed to upload document', 500);
    }

    // Insert into D1
    try {
      await env.DB.prepare(`
        INSERT INTO documents (
          id, student_id, document_type, original_filename, file_type,
          file_size, page_count, r2_object_key, scan_status, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        documentId,
        studentId,
        documentType,
        file.name,
        'application/pdf',
        file.size,
        pageCount,
        objectKey,
        'completed',
        now,
        expiresAt
      ).run();
    } catch (e) {
      console.error('D1 insert failed, rolling back R2', e);
      // Attempt R2 rollback
      try {
        await env.DOCUMENTS.delete(objectKey);
      } catch (r2e) {
        console.error(`Orphaned object in R2: ${objectKey}`, r2e);
      }
      return errorResponse('SERVER_ERROR', 'Failed to save document metadata', 500);
    }

    return successResponse({
      id: documentId,
      filename: file.name,
      pageCount: pageCount,
      documentType: documentType
    });

  } catch (err) {
    console.error('Unhandled error in handlePostDocument', err);
    return errorResponse('SERVER_ERROR', 'Internal server error', 500);
  }
}

export async function handleGetDocument(request, env, context) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);

  const documentId = match[1];
  const studentId = context.user.id;

  try {
    const now = Date.now();
    const doc = await env.DB.prepare(`
      SELECT * FROM documents WHERE id = ? AND student_id = ? AND deleted_at IS NULL AND expires_at > ?
    `).bind(documentId, studentId, now).first();

    if (!doc) {
      return errorResponse('NOT_FOUND', 'Document not found', 404);
    }

    return successResponse({
      id: doc.id,
      filename: doc.original_filename,
      pageCount: doc.page_count,
      documentType: doc.document_type,
      fileSize: doc.file_size,
      status: doc.scan_status,
      createdAt: doc.created_at,
      expiresAt: doc.expires_at
    });
  } catch (e) {
    return errorResponse('SERVER_ERROR', 'Failed to retrieve document', 500);
  }
}

export async function handleDeleteDocument(request, env, context) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);

  const documentId = match[1];
  const studentId = context.user.id;

  try {
    const now = Date.now();
    const doc = await env.DB.prepare(`
      SELECT r2_object_key FROM documents WHERE id = ? AND student_id = ? AND deleted_at IS NULL AND expires_at > ?
    `).bind(documentId, studentId, now).first();

    if (!doc) {
      return errorResponse('NOT_FOUND', 'Document not found', 404);
    }

    // Delete from R2 first
    try {
      await env.DOCUMENTS.delete(doc.r2_object_key);
    } catch (e) {
      console.error('Failed to delete from R2', e);
      return errorResponse('SERVER_ERROR', 'Failed to delete document', 500);
    }

    // Mark as deleted in D1
    await env.DB.prepare(`
      UPDATE documents SET deleted_at = ? WHERE id = ?
    `).bind(Date.now(), documentId).run();

    return successResponse({ success: true });
  } catch (e) {
    return errorResponse('SERVER_ERROR', 'Internal server error', 500);
  }
}
