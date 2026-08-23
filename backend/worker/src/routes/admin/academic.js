import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

// Actual D1 branches schema: id, college_id, name, code
// No duration_years, is_active, created_at, updated_at in this table

export async function handleGetBranches(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results } = await env.DB.prepare(`
      SELECT id, code, name, college_id
      FROM branches
      ORDER BY name ASC
    `).all();

    return successResponse({ branches: results });
  } catch (err) {
    console.error('Get branches error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch branches', 500);
  }
}

export async function handlePostBranch(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { code, name } = body;

    if (!code || !name) {
      return errorResponse('BAD_REQUEST', 'Missing required fields: code, name', 400);
    }

    // branches requires college_id (FK). Use a default or require it from the body.
    const college_id = body.college_id || 'default';

    const id = crypto.randomUUID();
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO branches (id, college_id, code, name)
      VALUES (?, ?, ?, ?)
    `).bind(id, college_id, code, name).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'branch', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify({ code, name }), now).run();

    return successResponse({ success: true, id });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      return errorResponse('CONFLICT', 'A branch with this code already exists', 409);
    }
    console.error('Create branch error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create branch', 500);
  }
}

export async function handlePatchBranch(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { name, code } = body;

    // Only name and code are updatable in the actual schema
    const result = await env.DB.prepare(`
      UPDATE branches
      SET name = coalesce(?, name),
          code = coalesce(?, code)
      WHERE id = ?
    `).bind(name ?? null, code ?? null, id).run();

    if (result.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'Branch not found', 404);
    }

    const now = Date.now();
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'branch', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify(body), now).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Update branch error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update branch', 500);
  }
}

// Actual D1 subjects schema: id, branch_id, semester_id, name, code
// No credits, is_elective, created_at, updated_at

export async function handleGetSubjects(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const url = new URL(request.url);
    const branchId = url.searchParams.get('branch_id');
    const semester = url.searchParams.get('semester');

    let query = `
      SELECT s.id, s.branch_id, b.name as branch_name, s.semester_id, s.code, s.name
      FROM subjects s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) {
      query += ` AND s.branch_id = ?`;
      params.push(branchId);
    }
    if (semester) {
      query += ` AND s.semester_id = ?`;
      params.push(semester);
    }

    query += ` ORDER BY s.semester_id ASC, s.code ASC`;

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return successResponse({ subjects: results });
  } catch (err) {
    console.error('Get subjects error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch subjects', 500);
  }
}

export async function handlePostSubject(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'academic.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    // semester here is the semester_id value from the form
    const { branch_id, semester, code, name } = body;

    if (!branch_id || !semester || !code || !name) {
      return errorResponse('BAD_REQUEST', 'Missing required fields: branch_id, semester, code, name', 400);
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO subjects (id, branch_id, semester_id, code, name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, branch_id, semester, code, name).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'subject', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify({ code, name }), now).run();

    return successResponse({ success: true, id });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      return errorResponse('CONFLICT', 'A subject with this code already exists', 409);
    }
    console.error('Create subject error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create subject', 500);
  }
}
