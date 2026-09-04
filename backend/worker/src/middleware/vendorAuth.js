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

export async function verifyVendorAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: errorResponse('UNAUTHORIZED', 'Missing or invalid token', 401) };
  }

  const token = authHeader.split(' ')[1];

  let payload;
  try {
    payload = await verifyJWT(token, env);
  } catch (err) {
    console.error('vendorAuth: JWT verification failed:', err?.message || err);
    if (err?.code === 'ERR_JWT_EXPIRED') {
      return { error: errorResponse('UNAUTHORIZED', 'Token expired. Please log in again.', 401) };
    }
    return { error: errorResponse('UNAUTHORIZED', 'Invalid token', 401) };
  }

  const supabaseUserId = payload.sub;

  // Check if user exists in the vendors table using supabase_user_id
  let vendorRecord;
  try {
    vendorRecord = await env.DB.prepare(`
      SELECT id, status 
      FROM vendors 
      WHERE supabase_user_id = ? OR email = ? -- fallback just in case email was used during early dev
    `).bind(supabaseUserId, payload.email).first();
  } catch (dbErr) {
    console.error('vendorAuth: DB lookup failed:', dbErr?.message || dbErr);
    return { error: errorResponse('INTERNAL_ERROR', 'Database error during auth', 500) };
  }

  if (!vendorRecord || vendorRecord.status !== 'active') {
    return { error: errorResponse('FORBIDDEN', 'Access denied. Active Vendor privileges required.', 403) };
  }

  return { context: { vendor: { id: vendorRecord.id, supabase_user_id: supabaseUserId, email: payload.email } } };
}
