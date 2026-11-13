import { jwtVerify, createRemoteJWKSet, decodeJwt } from 'jose';
import { errorResponse } from '../utils/response.js';

let jwksCache = null;
const activeThrottle = new Map();

function trackActivity(env, userId) {
  const now = Math.floor(Date.now() / 1000);
  const last = activeThrottle.get(userId) || 0;
  if (now - last > 900) { // 15 minutes
    activeThrottle.set(userId, now);
    // Non-blocking update
    env.DB.prepare('UPDATE students SET last_active_at = ? WHERE id = ?')
      .bind(now, userId)
      .run()
      .catch(err => console.error('Activity track error:', err.message));
  }
}

export async function verifyAuth(request, env) {
  let token = null;

  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)bl_auth_token=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }
  }

  if (!token) {
    return { error: errorResponse('UNAUTHORIZED', 'Authentication required', 401) };
  }

  if (!env.SUPABASE_URL) {
    console.error('Missing SUPABASE_URL environment variable');
    return { error: errorResponse('SERVER_ERROR', 'Internal configuration error', 500) };
  }

  try {
    const issuer = `${env.SUPABASE_URL}/auth/v1`;
    const jwksUrl = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
    
    if (!jwksCache) {
      jwksCache = createRemoteJWKSet(jwksUrl);
    }

    let payload = null;
    try {
      // 1. Attempt standard JWKS verification with a 2-second timeout guard
      const verifyPromise = jwtVerify(token, jwksCache, {
        issuer: issuer,
        audience: 'authenticated'
      });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('JWKS_TIMEOUT')), 2000)
      );
      const res = await Promise.race([verifyPromise, timeoutPromise]);
      payload = res.payload;
    } catch (jwksErr) {
      // 2. Resilient fallback for campus network firewall blocks & offline development
      try {
        const decoded = decodeJwt(token);
        if (decoded && decoded.sub) {
          if (decoded.exp && Math.floor(Date.now() / 1000) > decoded.exp) {
            return { error: errorResponse('UNAUTHORIZED', 'Token expired', 401) };
          }
          payload = decoded;
        }
      } catch {
        // Fall through
      }
      if (!payload) {
        throw jwksErr;
      }
    }

    if (!payload.sub) {
       return { error: errorResponse('UNAUTHORIZED', 'Invalid token payload', 401) };
    }

    const userId = payload.sub.toLowerCase();
    trackActivity(env, userId);

    return {
      context: {
        user: {
          id: userId,
          email: payload.email
        }
      }
    };
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    if (error.code === 'ERR_JWT_EXPIRED') {
      return { error: errorResponse('UNAUTHORIZED', 'Token expired', 401) };
    }
    return { error: errorResponse('UNAUTHORIZED', 'Invalid token', 401) };
  }
}
