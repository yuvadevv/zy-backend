import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

const SUPABASE_ADMIN_URL = (env) => `${env.SUPABASE_URL}/auth/v1/admin/users`;

async function supabaseAdminRequest(env, method, path, body) {
  const url = `${env.SUPABASE_URL}/auth/v1/admin${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

// GET /api/admin/representatives
export async function handleGetRepresentatives(request, env, context) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || 'all';

    let query = `
      SELECT 
        au.id, au.email, au.name, au.status, au.created_at,
        r.name as role_name
      FROM admin_users au
      JOIN admin_user_roles aur ON au.id = aur.admin_id
      JOIN roles r ON aur.role_id = r.id
      WHERE r.name = 'representative'
    `;
    const params = [];

    if (search) {
      query += ` AND (au.name LIKE ? OR au.email LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (status !== 'all') {
      query += ` AND au.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY au.created_at DESC`;

    const { results: representatives } = await env.DB.prepare(query).bind(...params).all();

    // Fetch scopes for each representative
    const repsWithScopes = await Promise.all(representatives.map(async (rep) => {
      const { results: scopes } = await env.DB.prepare(`
        SELECT 
          aus.id, aus.study_year_id, aus.branch_id, aus.section_id as section,
          ay.label as year_label,
          b.name as branch_name, b.code as branch_code
        FROM admin_user_scopes aus
        LEFT JOIN academic_years ay ON aus.study_year_id = ay.id
        LEFT JOIN branches b ON aus.branch_id = b.id
        WHERE aus.admin_id = ?
        ORDER BY aus.created_at ASC
      `).bind(rep.id).all();

      return { ...rep, scopes: scopes || [] };
    }));

    return successResponse(repsWithScopes);
  } catch (err) {
    console.error('handleGetRepresentatives error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch representatives', 500);
  }
}

// POST /api/admin/representatives
export async function handlePostRepresentative(request, env, context) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    let { name, email, password, scopes } = body;
    name = name?.trim();
    email = email?.trim().toLowerCase();

    if (!name || !email || !password) {
      return errorResponse('BAD_REQUEST', 'name, email, and password are required', 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('BAD_REQUEST', 'Invalid email format', 400);
    }
    if (password.length < 8) {
      return errorResponse('BAD_REQUEST', 'Password must be at least 8 characters', 400);
    }

    // Check email not already in use
    const existing = await env.DB.prepare(`SELECT id FROM admin_users WHERE email = ?`).bind(email).first();
    if (existing) return errorResponse('CONFLICT', 'A user with this email already exists', 409);

    // Create user in Supabase
    const { ok, data: sbData } = await supabaseAdminRequest(env, 'POST', '/users', {
      email: email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'representative' }
    });

    if (!ok || !sbData || sbData.error) {
      const msg = sbData?.message || sbData?.error_description || 'Failed to create user in auth provider';
      return errorResponse('SERVER_ERROR', msg, 500);
    }

    const supabaseUserId = sbData.id;
    const now = Date.now();

    // Get representative role ID
    const roleRecord = await env.DB.prepare(`SELECT id FROM roles WHERE name = 'representative'`).first();
    if (!roleRecord) return errorResponse('SERVER_ERROR', 'Representative role not found in database. Run migration first.', 500);

    // Insert into admin_users and assign role atomically
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO admin_users (id, email, name, status, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?)
      `).bind(supabaseUserId, email, name, now, now),

      env.DB.prepare(`
        INSERT INTO admin_user_roles (admin_id, role_id)
        VALUES (?, ?)
      `).bind(supabaseUserId, roleRecord.id),
    ]);

    // Insert scopes if provided
    if (scopes && Array.isArray(scopes) && scopes.length > 0) {
      const scopeStmts = scopes.map(scope => {
        const scopeId = `scope_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
        return env.DB.prepare(`
          INSERT OR IGNORE INTO admin_user_scopes (id, admin_id, study_year_id, branch_id, section_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(scopeId, supabaseUserId, scope.study_year_id, scope.branch_id, scope.section, now);
      });
      await env.DB.batch(scopeStmts);
    }

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'representative', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, supabaseUserId, JSON.stringify({ email, name }), now).run();

    return successResponse({ success: true, id: supabaseUserId }, 201);
  } catch (err) {
    console.error('handlePostRepresentative error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create representative', 500);
  }
}

// PATCH /api/admin/representatives/:id
export async function handlePatchRepresentative(request, env, context, id) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const rep = await env.DB.prepare(`SELECT id FROM admin_users WHERE id = ?`).bind(id).first();
    if (!rep) return errorResponse('NOT_FOUND', 'Representative not found', 404);

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return errorResponse('BAD_REQUEST', 'name is required', 400);
    }

    await env.DB.prepare(`UPDATE admin_users SET name = ?, updated_at = ? WHERE id = ?`)
      .bind(name.trim(), Date.now(), id).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('handlePatchRepresentative error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update representative', 500);
  }
}

// PATCH /api/admin/representatives/:id/status
export async function handlePatchRepresentativeStatus(request, env, context, id) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    // Prevent representative from modifying their own status
    if (id === context.admin.id) {
      return errorResponse('FORBIDDEN', 'You cannot modify your own account status', 403);
    }

    const body = await request.json();
    const { status } = body;

    if (!['active', 'suspended'].includes(status)) {
      return errorResponse('BAD_REQUEST', 'status must be "active" or "suspended"', 400);
    }

    const rep = await env.DB.prepare(`SELECT id FROM admin_users WHERE id = ?`).bind(id).first();
    if (!rep) return errorResponse('NOT_FOUND', 'Representative not found', 404);

    // Sync with Supabase (ban/unban)
    await supabaseAdminRequest(env, 'PUT', `/users/${id}`, {
      ban_duration: status === 'suspended' ? '876000h' : 'none'
    });

    await env.DB.prepare(`UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?`)
      .bind(status, Date.now(), id).run();

    return successResponse({ success: true, status });
  } catch (err) {
    console.error('handlePatchRepresentativeStatus error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update representative status', 500);
  }
}

// DELETE /api/admin/representatives/:id
export async function handleDeleteRepresentative(request, env, context, id) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    if (id === context.admin.id) {
      return errorResponse('FORBIDDEN', 'You cannot delete your own account', 403);
    }

    const rep = await env.DB.prepare(`SELECT id, email FROM admin_users WHERE id = ?`).bind(id).first();
    if (!rep) return errorResponse('NOT_FOUND', 'Representative not found', 404);

    // Delete from Supabase Auth
    const { ok } = await supabaseAdminRequest(env, 'DELETE', `/users/${id}`);
    if (!ok) {
      console.warn('Supabase delete failed for', id, '- proceeding with D1 deactivation');
    }

    // Cascade delete handled by FK ON DELETE CASCADE on admin_user_scopes
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM admin_user_roles WHERE admin_id = ?`).bind(id),
      env.DB.prepare(`DELETE FROM admin_users WHERE id = ?`).bind(id),
    ]);

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'DELETE', 'representative', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify({ deleted_email: rep.email }), Date.now()).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('handleDeleteRepresentative error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to delete representative', 500);
  }
}

// POST /api/admin/representatives/:id/reset-password
export async function handleResetRepresentativePassword(request, env, context, id) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json().catch(() => ({}));
    const { password } = body;

    if (!password || password.length < 8) {
      return errorResponse('BAD_REQUEST', 'New password must be at least 8 characters', 400);
    }

    const { ok } = await supabaseAdminRequest(env, 'PUT', `/users/${id}`, { password });
    if (!ok) return errorResponse('SERVER_ERROR', 'Failed to reset password in auth provider', 500);

    return successResponse({ success: true });
  } catch (err) {
    console.error('handleResetRepresentativePassword error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to reset password', 500);
  }
}

// GET /api/admin/representatives/:id/scopes
export async function handleGetRepresentativeScopes(request, env, context, id) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results: scopes } = await env.DB.prepare(`
      SELECT 
        aus.id, aus.study_year_id, aus.branch_id, aus.section_id as section, aus.created_at,
        ay.label as year_label,
        b.name as branch_name, b.code as branch_code
      FROM admin_user_scopes aus
      LEFT JOIN academic_years ay ON aus.study_year_id = ay.id
      LEFT JOIN branches b ON aus.branch_id = b.id
      WHERE aus.admin_id = ?
      ORDER BY aus.created_at ASC
    `).bind(id).all();

    return successResponse(scopes || []);
  } catch (err) {
    console.error('handleGetRepresentativeScopes error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch scopes', 500);
  }
}

// POST /api/admin/representatives/:id/scopes
export async function handlePostRepresentativeScope(request, env, context, id) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { study_year_id, branch_id, section } = body;

    if (!study_year_id || !branch_id || !section) {
      return errorResponse('BAD_REQUEST', 'study_year_id, branch_id, and section are required', 400);
    }

    // Verify representative exists
    const rep = await env.DB.prepare(`SELECT id FROM admin_users WHERE id = ?`).bind(id).first();
    if (!rep) return errorResponse('NOT_FOUND', 'Representative not found', 404);

    const scopeId = `scope_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = Date.now();

    try {
      await env.DB.prepare(`
        INSERT INTO admin_user_scopes (id, admin_id, study_year_id, branch_id, section_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(scopeId, id, study_year_id, branch_id, section.trim(), now).run();
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE constraint')) {
        return errorResponse('CONFLICT', 'This scope is already assigned to this representative', 409);
      }
      throw e;
    }

    return successResponse({ success: true, id: scopeId }, 201);
  } catch (err) {
    console.error('handlePostRepresentativeScope error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to add scope', 500);
  }
}

// DELETE /api/admin/representatives/:id/scopes/:scopeId
export async function handleDeleteRepresentativeScope(request, env, context, id, scopeId) {
  try {
    const canManage = await hasPermission(env.DB, context.admin.id, 'representatives.manage');
    if (!canManage) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const result = await env.DB.prepare(`
      DELETE FROM admin_user_scopes WHERE id = ? AND admin_id = ?
    `).bind(scopeId, id).run();

    if (result.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'Scope not found', 404);
    }

    return successResponse({ success: true });
  } catch (err) {
    console.error('handleDeleteRepresentativeScope error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to remove scope', 500);
  }
}
