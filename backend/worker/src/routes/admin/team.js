import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

export async function handleGetTeam(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'admins.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results } = await env.DB.prepare(`
      SELECT au.id, au.email, au.name, au.status, au.created_at, r.name as role
      FROM admin_users au
      LEFT JOIN admin_user_roles aur ON au.id = aur.admin_id
      LEFT JOIN roles r ON aur.role_id = r.id
      ORDER BY au.created_at DESC
    `).all();

    return successResponse(results);
  } catch (err) {
    console.error('Get team error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch team members', 500);
  }
}

export async function handlePostTeamMember(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'admins.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { id, email, name, role_id } = body;

    if (!id || !email || !role_id) {
      return errorResponse('BAD_REQUEST', 'Missing required fields', 400);
    }

    const now = Date.now();

    // Insert user
    await env.DB.prepare(`
      INSERT INTO admin_users (id, email, name, status, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?)
    `).bind(id, email, name || null, now, now).run();

    // Assign role
    await env.DB.prepare(`
      INSERT INTO admin_user_roles (admin_id, role_id)
      VALUES (?, ?)
    `).bind(id, role_id).run();

    // Audit log
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'admin_user', ?, ?, ?)
    `).bind(
      context.admin.id, 
      context.admin.role, 
      id, 
      JSON.stringify({ email, name, role_id }), 
      now
    ).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Create team member error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to add team member', 500);
  }
}
