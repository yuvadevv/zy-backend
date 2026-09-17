import { errorResponse, successResponse } from '../utils/response.js';

/**
 * Helper to call Supabase Auth API from the backend using SERVICE_ROLE_KEY
 */
async function callSupabaseAuth(env, path, body) {
  const url = `${env.SUPABASE_URL}${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const rawIdentifier = (body.email || body.username || '').trim();
    const password = body.password;

    if (!password || !rawIdentifier) {
      return errorResponse('BAD_REQUEST', 'Email/username and password are required', 400);
    }

    let email = rawIdentifier;

    if (rawIdentifier.includes('@')) {
      // It's an email, strictly search by email to avoid username collisions
      const vendor = await env.DB.prepare('SELECT email FROM vendors WHERE email = ?').bind(rawIdentifier).first();
      if (vendor && vendor.email) {
        email = vendor.email;
      } else {
        const admin = await env.DB.prepare('SELECT email FROM admin_users WHERE email = ?').bind(rawIdentifier).first();
        if (admin && admin.email) {
          email = admin.email;
        }
      }
    } else {
      // It's a username, strictly search by username
      const vendor = await env.DB.prepare('SELECT email FROM vendors WHERE username = ?').bind(rawIdentifier).first();
      if (vendor && vendor.email) {
        email = vendor.email;
      } else {
        // Fallback for students using roll number as username, which gets mapped to a dummy email
        email = `${rawIdentifier}@vendor.blintzy.local`;
      }
    }

    const { ok, status, data } = await callSupabaseAuth(env, '/auth/v1/token?grant_type=password', {
      email,
      password
    });

    if (!ok || !data || data.error) {
      const msg = data?.error_description || data?.message || data?.msg || 'Invalid login credentials';
      return errorResponse('INVALID_CREDENTIALS', msg, status || 401);
    }

    return successResponse({
      user: data.user,
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        user: data.user
      }
    });
  } catch (err) {
    console.error('Backend handleLogin error:', err);
    return errorResponse('SERVER_ERROR', 'Internal authentication error', 500);
  }
}

export async function handleSignup(request, env) {
  try {
    const body = await request.json();
    const { email, password, data } = body;

    if (!email || !password) {
      return errorResponse('BAD_REQUEST', 'Email and password are required', 400);
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check local D1 database for duplicates
    const existingStudent = await env.DB.prepare('SELECT id FROM students WHERE LOWER(email) = ?').bind(normalizedEmail).first();
    const existingAdmin = await env.DB.prepare('SELECT id FROM admin_users WHERE LOWER(email) = ?').bind(normalizedEmail).first();
    const existingVendor = await env.DB.prepare('SELECT id FROM vendors WHERE LOWER(email) = ?').bind(normalizedEmail).first();
    
    if (existingStudent || existingAdmin || existingVendor) {
      return errorResponse('CONFLICT', 'This email is already registered. Please log in or use "Forgot Password" if you cannot access your account.', 409);
    }

    const { ok, status, data: resData } = await callSupabaseAuth(env, '/auth/v1/signup', {
      email: normalizedEmail,
      password,
      data: data || {}
    });

    if (!ok || !resData || resData.error) {
      console.error('Supabase signup raw error:', JSON.stringify(resData));
      let msg = resData?.error_description || resData?.message || resData?.msg || 'Failed to sign up';
      
      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('already registered') || lowerMsg.includes('user_already_exists') || lowerMsg.includes('already exists')) {
        msg = 'This email is already registered. Please log in or use "Forgot Password" if you cannot access your account.';
        return errorResponse('CONFLICT', msg, 409);
      }

      return errorResponse('SIGNUP_FAILED', msg, status || 400);
    }

    const hasSession = resData.session || resData.access_token;
    return successResponse({
      user: resData.user,
      session: hasSession ? (resData.session || {
        access_token: resData.access_token,
        refresh_token: resData.refresh_token,
        user: resData.user
      }) : null
    });
  } catch (err) {
    console.error('Backend handleSignup error:', err);
    return errorResponse('SERVER_ERROR', 'Internal authentication error', 500);
  }
}

export async function handleLogout() {
  return successResponse({ message: 'Logged out successfully' });
}

export async function handleGetAuthMe(request, env, context) {
  const user = context.user || context.admin || context.vendor;
  if (!user) {
    return errorResponse('UNAUTHORIZED', 'Not authenticated', 401);
  }
  return successResponse({ user });
}

export async function handleOAuthGoogle(request, env) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get('redirect_to') || 'http://localhost:3001/auth/confirm';
  const next = searchParams.get('next') || '/admin';

  const fullRedirect = `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}next=${encodeURIComponent(next)}`;
  const authUrl = `${env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(fullRedirect)}&response_type=token`;

  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('application/json')) {
    return successResponse({ url: authUrl });
  }

  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl
    }
  });
}

export async function handleOAuthExchange(request, env) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return errorResponse('BAD_REQUEST', 'Authorization code is required', 400);
    }

    const url = `${env.SUPABASE_URL}/auth/v1/token?grant_type=authorization_code`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_code: code,
        code
      })
    });

    let data = await response.json().catch(() => null);

    if (!response.ok || !data || data.error) {
      const pkceRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auth_code: code
        })
      });
      const pkceData = await pkceRes.json().catch(() => null);
      if (pkceRes.ok && pkceData && !pkceData.error) {
        data = pkceData;
      } else {
        const msg = data?.error_description || data?.message || pkceData?.error_description || 'Failed to exchange authorization code';
        return errorResponse('OAUTH_EXCHANGE_FAILED', msg, response.status || 400);
      }
    }

    return successResponse({
      user: data.user,
      session: {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        token_type: data.token_type,
        user: data.user
      }
    });
  } catch (err) {
    console.error('Backend handleOAuthExchange error:', err);
    return errorResponse('SERVER_ERROR', 'Internal OAuth exchange error', 500);
  }
}

export async function handleResetPassword(request, env) {
  try {
    const body = await request.json();
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return errorResponse('BAD_REQUEST', 'Email is required', 400);
    }

    const ip = request.headers.get('cf-connecting-ip');
    const now = Date.now();
    const cooldownPeriod = 60000; // 60 seconds

    // Rate limit check using audit_logs table
    let recentRequest;
    if (ip) {
      recentRequest = await env.DB.prepare(`
        SELECT created_at FROM audit_logs 
        WHERE action = 'password_reset_request' 
        AND (actor_id = ? OR ip_address = ?)
        AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).bind(email, ip, now - cooldownPeriod).first();
    } else {
      recentRequest = await env.DB.prepare(`
        SELECT created_at FROM audit_logs 
        WHERE action = 'password_reset_request' 
        AND actor_id = ?
        AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).bind(email, now - cooldownPeriod).first();
    }

    if (recentRequest) {
      return errorResponse('TOO_MANY_REQUESTS', 'Please wait 60 seconds before requesting another reset link.', 429);
    }

    // Log the request
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), email, 'system', 'password_reset_request', 'auth', 'recovery', null, null, ip || 'unknown', now
    ).run();

    const origin = request.headers.get('origin') || 'http://localhost:3001';
    const redirectTo = body.redirectTo || `${origin}/update-password`;

    // Trigger Supabase recovery
    await callSupabaseAuth(env, `/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email });

    // Always return generic success
    return successResponse({ 
      message: 'If an account exists with this email address, a password-reset link has been sent. Please check your inbox and spam folder.'
    });
  } catch (err) {
    console.error('Backend handleResetPassword error:', err);
    return errorResponse('SERVER_ERROR', 'Internal error while processing reset request', 500);
  }
}

export async function handleUpdatePassword(request, env) {
  try {
    const body = await request.json();
    const { password, access_token } = body;

    if (!password || !access_token) {
      return errorResponse('BAD_REQUEST', 'Password and access token are required', 400);
    }

    const url = `${env.SUPABASE_URL}/auth/v1/user`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.error) {
      return errorResponse('UPDATE_FAILED', 'This password-reset link is invalid or has expired. Please request a new link.', response.status || 400);
    }

    return successResponse({ message: 'Your password has been updated successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('Backend handleUpdatePassword error:', err);
    return errorResponse('SERVER_ERROR', 'Internal error while updating password', 500);
  }
}
