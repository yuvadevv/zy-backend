import { errorResponse, successResponse } from '../utils/response.js';

export async function handleGetAdminUsers(request, env, context) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, email, name, role, permissions, status, created_at
      FROM admin_users
      ORDER BY created_at DESC
    `).all();

    // Safely parse permissions
    const admins = results.map(admin => {
      let perms = [];
      try {
        if (admin.permissions) {
          perms = JSON.parse(admin.permissions);
        }
      } catch (e) {}
      return { ...admin, permissions: perms };
    });

    return successResponse(admins);
  } catch (err) {
    console.error('Get admin users error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch admin users', 500);
  }
}

export async function handlePostAdminUser(request, env, context) {
  try {
    const body = await request.json();
    const { email, name, password, permissions } = body;

    if (!email || !password || !permissions) {
      return errorResponse('BAD_REQUEST', 'Missing email, password, or permissions', 400);
    }

    // Call Supabase Admin API to create user
    const supabaseUrl = `${env.SUPABASE_URL}/auth/v1/admin/users`;
    const response = await fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { name }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return errorResponse('BAD_REQUEST', data.message || data.error?.message || 'Failed to create user in Supabase', response.status);
    }

    const userId = data.id;
    const now = Date.now();
    const permsJson = JSON.stringify(permissions);

    // Insert into DB
    await env.DB.prepare(`
      INSERT INTO admin_users (id, email, name, role, permissions, status, created_at, updated_at)
      VALUES (?, ?, ?, 'sub_admin', ?, 'active', ?, ?)
    `).bind(userId, email, name || '', permsJson, now, now).run();

    return successResponse({ id: userId, email, name, permissions });
  } catch (err) {
    console.error('Create admin user error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create admin user', 500);
  }
}

export async function handlePatchAdminUser(request, env, context, id) {
  try {
    const body = await request.json();
    const { permissions, status, password } = body;

    if (permissions !== undefined) {
      const permsJson = JSON.stringify(permissions);
      await env.DB.prepare(`UPDATE admin_users SET permissions = ?, updated_at = ? WHERE id = ?`)
        .bind(permsJson, Date.now(), id).run();
    }
    
    if (status !== undefined) {
      await env.DB.prepare(`UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?`)
        .bind(status, Date.now(), id).run();
    }

    // Update password in Supabase if provided
    if (password) {
      const supabaseUrl = `${env.SUPABASE_URL}/auth/v1/admin/users/${id}`;
      await fetch(supabaseUrl, {
        method: 'PUT',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password })
      });
    }

    return successResponse({ success: true });
  } catch (err) {
    console.error('Patch admin user error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update admin user', 500);
  }
}
