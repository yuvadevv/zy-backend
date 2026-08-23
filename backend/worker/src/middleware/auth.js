import { jwtVerify, createRemoteJWKSet } from 'jose';
import { errorResponse } from '../utils/response.js';

let jwksCache = null;

export async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: errorResponse('UNAUTHORIZED', 'Authentication required', 401) };
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return { error: errorResponse('UNAUTHORIZED', 'Malformed token', 401) };
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

    const { payload } = await jwtVerify(token, jwksCache, {
      issuer: issuer,
      audience: 'authenticated'
    });

    if (!payload.sub) {
       return { error: errorResponse('UNAUTHORIZED', 'Invalid token payload', 401) };
    }

    return {
      context: {
        user: {
          id: payload.sub,
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
