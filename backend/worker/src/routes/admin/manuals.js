import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

export async function handleGetManuals(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'manuals.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 25;
    
    let query = `
      SELECT m.*, s.name as subject_name, s.code as subject_code
      FROM manuals m
      JOIN subjects s ON m.subject_id = s.id
      ORDER BY m.title ASC
      LIMIT ? OFFSET ?
    `;

    const { results } = await env.DB.prepare(query).bind(limit, (page - 1) * limit).all();

    const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM manuals`).first();

    return successResponse({
      manuals: results,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit)
    });
  } catch (err) {
    console.error('Get manuals error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch manuals', 500);
  }
}

export async function handlePostManual(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'manuals.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const formData = await request.formData();
    const title = formData.get('title');
    const subject_id = formData.get('subject_id');
    const description = formData.get('description') || '';
    const pages = parseInt(formData.get('pages')) || 0;
    const base_price = parseFloat(formData.get('base_price')) || 0.0;
    const availability_status = formData.get('availability_status') || 'available';
    const file = formData.get('file');

    if (!title || !subject_id || !pages || !base_price || !file) {
      return errorResponse('BAD_REQUEST', 'Missing required fields', 400);
    }

    const id = crypto.randomUUID();
    const objectKey = `manuals/${id}.pdf`;

    // Upload to R2
    await env.DOCUMENTS.put(objectKey, file.stream(), {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: {
        type: 'manual',
        title,
        uploadedBy: context.admin.id
      }
    });

    let previewObjectKey = null;
    const previewFile = formData.get('previewFile');
    if (previewFile && previewFile.size > 0 && previewFile.type === 'application/pdf') {
      const previewId = crypto.randomUUID();
      previewObjectKey = `manual-previews/${id}/${previewId}.pdf`;
      await env.DOCUMENTS.put(previewObjectKey, previewFile.stream(), {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: {
          type: 'manual_preview',
          title: `Preview: ${title}`,
          uploadedBy: context.admin.id
        }
      });
    }

    await env.DB.prepare(`
      INSERT INTO manuals (id, subject_id, title, description, pages, base_price, availability_status, r2_object_key, preview_object_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, subject_id, title, description, pages, base_price, availability_status, objectKey, previewObjectKey).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'manual', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify({ title, subject_id }), Date.now()).run();

    return successResponse({ success: true, id });
  } catch (err) {
    console.error('Create manual error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create manual', 500);
  }
}

export async function handlePatchManual(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'manuals.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { title, description, pages, base_price, availability_status } = body;

    const result = await env.DB.prepare(`
      UPDATE manuals
      SET title = coalesce(?, title),
          description = coalesce(?, description),
          pages = coalesce(?, pages),
          base_price = coalesce(?, base_price),
          availability_status = coalesce(?, availability_status)
      WHERE id = ?
    `).bind(title ?? null, description ?? null, pages ?? null, base_price ?? null, availability_status ?? null, id).run();

    if (result.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'Manual not found', 404);
    }

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'manual', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify(body), Date.now()).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Update manual error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update manual', 500);
  }
}

export async function handleDeleteManual(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'manuals.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    // Get the object key
    const manual = await env.DB.prepare(`SELECT r2_object_key FROM manuals WHERE id = ?`).bind(id).first();
    if (!manual) {
      return errorResponse('NOT_FOUND', 'Manual not found', 404);
    }

    // Delete from R2
    if (manual.r2_object_key) {
      await env.DOCUMENTS.delete(manual.r2_object_key);
    }

    // Delete from DB
    await env.DB.prepare(`DELETE FROM manuals WHERE id = ?`).bind(id).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'DELETE', 'manual', ?, '{}', ?)
    `).bind(context.admin.id, context.admin.role, id, Date.now()).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Delete manual error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to delete manual', 500);
  }
}

export async function handlePostManualPreview(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'manuals.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const manual = await env.DB.prepare(`SELECT * FROM manuals WHERE id = ?`).bind(id).first();
    if (!manual) return errorResponse('NOT_FOUND', 'Manual not found', 404);

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || file.size === 0) {
      return errorResponse('BAD_REQUEST', 'Missing file', 400);
    }
    
    if (file.type !== 'application/pdf') {
      return errorResponse('BAD_REQUEST', 'Preview must be a PDF file', 400);
    }

    const previewId = crypto.randomUUID();
    const previewObjectKey = `manual-previews/${id}/${previewId}.pdf`;

    await env.DOCUMENTS.put(previewObjectKey, file.stream(), {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: {
        type: 'manual_preview',
        title: `Preview: ${manual.title}`,
        uploadedBy: context.admin.id
      }
    });

    await env.DB.prepare(`
      UPDATE manuals SET preview_object_key = ? WHERE id = ?
    `).bind(previewObjectKey, id).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'manual', ?, '{"preview_updated": true}', ?)
    `).bind(context.admin.id, context.admin.role, id, Date.now()).run();

    return successResponse({ success: true, previewObjectKey });
  } catch (err) {
    console.error('Upload manual preview error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to upload preview', 500);
  }
}
