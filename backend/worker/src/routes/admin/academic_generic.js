import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

const ALLOWED_ENTITIES = ['colleges', 'branches', 'academic_years', 'semesters', 'sections', 'blocks', 'classrooms'];

const ALLOWED_COLUMNS = {
  colleges: ['name', 'code', 'status'],
  branches: ['college_id', 'name', 'code', 'status'],
  academic_years: ['label', 'value', 'status'],
  semesters: ['academic_year_id', 'label', 'value', 'status'],
  sections: ['name', 'status'],
  blocks: ['college_id', 'name', 'status'],
  classrooms: ['block_id', 'name', 'status']
};

export async function handleGenericGet(request, env, context, entity) {
  if (!ALLOWED_ENTITIES.includes(entity)) return errorResponse('NOT_FOUND', 'Entity not found', 404);
  const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
  if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

  try {
    const orderColumn = ['academic_years', 'semesters'].includes(entity) ? 'label' : 'name';
    const { results } = await env.DB.prepare(`SELECT * FROM ${entity} ORDER BY ${orderColumn} ASC`).all();
    return successResponse({ [entity]: results });
  } catch (err) {
    console.error(`Error fetching ${entity}:`, err);
    return errorResponse('SERVER_ERROR', `Failed to fetch ${entity}`, 500);
  }
}

export async function handleGenericPost(request, env, context, entity) {
  if (!ALLOWED_ENTITIES.includes(entity)) return errorResponse('NOT_FOUND', 'Entity not found', 404);
  const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
  if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

  try {
    const body = await request.json();
    const id = crypto.randomUUID();
    const now = Date.now();
    
    // Filter payload against whitelist to prevent SQL injection
    const allowed = ALLOWED_COLUMNS[entity] || [];
    const sanitizedBody = {};
    for (const key of Object.keys(body)) {
      if (allowed.includes(key)) {
        sanitizedBody[key] = body[key];
      }
    }

    if (!sanitizedBody.status) {
      sanitizedBody.status = 'active';
    }

    const keys = Object.keys(sanitizedBody);
    const values = Object.values(sanitizedBody);
    
    const columns = ['id', ...keys].join(', ');
    const placeholders = ['?', ...keys.map(() => '?')].join(', ');
    const binds = [id, ...values];

    await env.DB.prepare(`INSERT INTO ${entity} (${columns}) VALUES (${placeholders})`).bind(...binds).run();
    
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', ?, ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, entity, id, JSON.stringify(body), now).run();

    return successResponse({ success: true, id });
  } catch (err) {
    console.error(`Error creating ${entity}:`, err);
    if (err.message?.includes('UNIQUE constraint failed')) {
      return errorResponse('CONFLICT', 'Entity already exists', 409);
    }
    return errorResponse('SERVER_ERROR', `Failed to create ${entity}`, 500);
  }
}

export async function handleGenericPatch(request, env, context, entity, id) {
  if (!ALLOWED_ENTITIES.includes(entity)) return errorResponse('NOT_FOUND', 'Entity not found', 404);
  const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
  if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

  try {
    const body = await request.json();
    
    // Filter payload against whitelist to prevent SQL injection
    const allowed = ALLOWED_COLUMNS[entity] || [];
    const sanitizedBody = {};
    for (const key of Object.keys(body)) {
      if (allowed.includes(key)) {
        sanitizedBody[key] = body[key];
      }
    }

    const keys = Object.keys(sanitizedBody);
    if (keys.length === 0) return errorResponse('BAD_REQUEST', 'No fields to update', 400);

    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = Object.values(sanitizedBody);

    const result = await env.DB.prepare(`UPDATE ${entity} SET ${setClause} WHERE id = ?`)
      .bind(...values, id).run();

    if (result.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'Entity not found', 404);
    }

    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', ?, ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, entity, id, JSON.stringify(body), now).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error(`Error updating ${entity}:`, err);
    return errorResponse('SERVER_ERROR', `Failed to update ${entity}`, 500);
  }
}

export async function handleGenericDelete(request, env, context, entity, id) {
  if (!ALLOWED_ENTITIES.includes(entity)) return errorResponse('NOT_FOUND', 'Entity not found', 404);
  const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
  if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

  try {
    await env.DB.prepare(`DELETE FROM ${entity} WHERE id = ?`).bind(id).run();
    
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'DELETE', ?, ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, entity, id, null, Date.now()).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error(`Error deleting ${entity}:`, err);
    if (err.message?.includes('FOREIGN KEY constraint failed')) {
      return errorResponse('CONFLICT', 'Cannot delete because it is being used by other records', 409);
    }
    return errorResponse('SERVER_ERROR', `Failed to delete ${entity}`, 500);
  }
}
