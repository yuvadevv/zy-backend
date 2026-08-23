import { jwtVerify, createRemoteJWKSet } from 'jose';
import { errorResponse } from '../utils/response.js';

let jwksCache = null;

async function verifyJWT(token, env) {
  if (!env.SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL');
  }
  const issuer = `${env.SUPABASE_URL}/auth/v1`;
  const jwksUrl = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(jwksUrl);
  }
  const { payload } = await jwtVerify(token, jwksCache, {
    issuer,
    audience: 'authenticated'
  });
  if (!payload.sub) throw new Error('Invalid token payload');
  return payload;
}

export async function verifyAdminAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401) };
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = await verifyJWT(token, env);
  } catch (err) {
    console.error('adminAuth: JWT verification failed:', err?.message || err);
    if (err?.code === 'ERR_JWT_EXPIRED') {
      return { error: errorResponse('UNAUTHORIZED', 'Token expired. Please log in again.', 401) };
    }
    return { error: errorResponse('UNAUTHORIZED', 'Invalid token', 401) };
  }

  const userId = payload.sub;

  // Check if user exists in admin_users with active status and load permissions
  let result;
  try {
    result = await env.DB.prepare(`
      SELECT r.name as role, p.action as permission
      FROM admin_users au
      JOIN admin_user_roles aur ON au.id = aur.admin_id
      JOIN roles r ON aur.role_id = r.id
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE au.id = ? AND au.status = 'active'
    `).bind(userId).all();
  } catch (dbErr) {
    console.error('adminAuth: DB lookup failed:', dbErr?.message || dbErr);
    return { error: errorResponse('INTERNAL_ERROR', 'Database error during auth', 500) };
  }

  if (!result || !result.success || result.results.length === 0) {
    return { error: errorResponse('FORBIDDEN', 'Access denied. Admin privileges required.', 403) };
  }

  const role = result.results[0].role;
  const permissions = result.results.map(row => row.permission).filter(Boolean);

  return { context: { admin: { id: userId, email: payload.email, role, permissions } } };
}

export function requirePermission(permission) {
  return async (request, env, context) => {
    if (!context || !context.admin) {
      const authResult = await verifyAdminAuth(request, env);
      if (authResult.error) return authResult.error;
      context = { ...context, ...authResult.context };
    }

    if (!context.admin.permissions.includes(permission)) {
      return errorResponse('FORBIDDEN', `Missing required permission: ${permission}`, 403);
    }
    return { context };
  };
}
