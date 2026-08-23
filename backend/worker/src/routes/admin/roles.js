import { errorResponse, successResponse } from '../../utils/response.js';

// Helper to check permissions
export async function hasPermission(db, adminId, action) {
  // If the user's role is SUPER_ADMIN, they have all permissions
  const roleRecord = await db.prepare(`
    SELECT r.name 
    FROM admin_user_roles aur
    JOIN roles r ON aur.role_id = r.id
    WHERE aur.admin_id = ?
  `).bind(adminId).first();

  if (roleRecord && roleRecord.name === 'SUPER_ADMIN') {
    return true;
  }

  // Otherwise check specific permission
  const permRecord = await db.prepare(`
    SELECT 1
    FROM admin_user_roles aur
    JOIN role_permissions rp ON aur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE aur.admin_id = ? AND p.action = ?
  `).bind(adminId, action).first();

  return !!permRecord;
}

export async function handleGetRoles(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'roles.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results: roles } = await env.DB.prepare(`
      SELECT id, name, description, created_at 
      FROM roles 
      ORDER BY name ASC
    `).all();

    const { results: permissions } = await env.DB.prepare(`
      SELECT rp.role_id, p.id, p.action, p.description 
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
    `).all();

    // Group permissions by role
    const rolesWithPerms = roles.map(role => ({
      ...role,
      permissions: permissions.filter(p => p.role_id === role.id)
    }));

    return successResponse(rolesWithPerms);
  } catch (err) {
    console.error('Get roles error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch roles', 500);
  }
}

export async function handleGetPermissions(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'roles.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results } = await env.DB.prepare(`
      SELECT id, action, description 
      FROM permissions 
      ORDER BY action ASC
    `).all();

    return successResponse(results);
  } catch (err) {
    console.error('Get permissions error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch permissions', 500);
  }
}
