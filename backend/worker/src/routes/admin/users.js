import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';
import { getStudentFullDetails } from '../../services/adminService.js';

export async function handleGetUsers(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'users.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 25;
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || 'all';

    let query = `
      SELECT id, email, name, roll_number, phone, branch_id, study_year_id as year_of_study, 
             account_status, created_at, updated_at as last_login_at
      FROM students 
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (email LIKE ? OR name LIKE ? OR roll_number LIKE ? OR phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== 'all') {
      query += ` AND account_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM students WHERE 1=1`;
    const countParams = [];

    if (search) {
      countQuery += ` AND (email LIKE ? OR name LIKE ? OR roll_number LIKE ? OR phone LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status !== 'all') {
      countQuery += ` AND account_status = ?`;
      countParams.push(status);
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    return successResponse({
      users: results,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit)
    });
  } catch (err) {
    console.error('Get users error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch users', 500);
  }
}

export async function handlePatchUserStatus(request, env, context, userId) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'users.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { status } = body;

    if (!['active', 'blocked'].includes(status)) {
      return errorResponse('BAD_REQUEST', 'Invalid status', 400);
    }

    const result = await env.DB.prepare(`
      UPDATE students 
      SET account_status = ?, updated_at = ?
      WHERE id = ?
    `).bind(status, Date.now(), userId).run();

    if (result.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }

    // Log the audit event
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'student_status', ?, ?, ?)
    `).bind(
      context.admin.id,
      context.admin.role,
      userId,
      JSON.stringify({ status }),
      Date.now()
    ).run();

    return successResponse({ success: true, status });
  } catch (err) {
    console.error('Update user status error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update user status', 500);
  }
}

export async function handleGetUserById(request, env, context, userId) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'users.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const query = `
      SELECT s.id, s.name, s.roll_number, s.phone, s.email,
             s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section,
             s.account_status, s.created_at,
             c.name as college_name, b.name as branch_name,
             ay.label as year_label, sem.label as semester_label, sec.name as section_name
      FROM students s
      LEFT JOIN colleges c ON s.college_id = c.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      LEFT JOIN sections sec ON s.section = sec.id
      WHERE s.id = ?
    `;

    const user = await env.DB.prepare(query).bind(userId).first();
    if (!user) return errorResponse('NOT_FOUND', 'User not found', 404);

    return successResponse(user);
  } catch (err) {
    console.error('Get user by id error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch user details', 500);
  }
}

export async function handleGetUserDetails(request, env, context, userId) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'users.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const details = await getStudentFullDetails(env.DB, userId);
    if (!details) return errorResponse('NOT_FOUND', 'Student not found', 404);

    return successResponse(details);
  } catch (err) {
    console.error('Get user details error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch full student details', 500);
  }
}

export async function handleUpdateUserCredentials(request, env, context, userId) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'users.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json().catch(() => ({}));
    let { email, password } = body;

    email = email && typeof email === 'string' ? email.trim().toLowerCase() : null;
    password = password && typeof password === 'string' ? password : null;

    if (!email && !password) {
      return errorResponse('BAD_REQUEST', 'Email or password is required', 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse('BAD_REQUEST', 'Invalid email format', 400);
    }
    if (password && password.length < 6) {
      return errorResponse('BAD_REQUEST', 'Password must be at least 6 characters', 400);
    }

    // Target validation
    const student = await env.DB.prepare(`SELECT id, email FROM students WHERE id = ?`).bind(userId).first();
    if (!student) {
      return errorResponse('NOT_FOUND', 'Student not found', 404);
    }

    // Call Supabase Admin API
    const adminUrl = `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`;
    const payload = {};
    if (email) payload.email = email;
    if (password) payload.password = password;
    
    // We send email_confirm: true to force immediate email change, avoiding pending state confusion 
    // unless Supabase project strictly disables it.
    payload.email_confirm = true;

    const supabaseRes = await fetch(adminUrl, {
      method: 'PUT',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!supabaseRes.ok) {
      console.error('Supabase admin update error', supabaseRes.status);
      return errorResponse('SERVER_ERROR', 'Failed to update credentials in authentication provider', 500);
    }

    const sbData = await supabaseRes.json();
    const isPending = !!sbData.new_email;
    let emailActuallyChanged = false;

    // D1 Sync if email was updated and not pending
    if (email && !isPending && sbData.email === email) {
      const result = await env.DB.prepare(`UPDATE students SET email = ?, updated_at = ? WHERE id = ?`)
        .bind(email, Date.now(), userId).run();
      if (result.meta.changes > 0) {
        emailActuallyChanged = true;
      }
    } else if (email && isPending) {
       console.warn('Email change is pending confirmation in Supabase.');
    }

    // Audit Log - NEVER log password
    const auditData = { emailChanged: !!email, passwordChanged: !!password, pendingConfirmation: isPending };
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'USER_CREDENTIALS_UPDATED', 'student', ?, ?, ?)
    `).bind(
      context.admin.id,
      context.admin.role,
      userId,
      JSON.stringify(auditData),
      Date.now()
    ).run();

    return successResponse({
      success: true,
      emailUpdated: emailActuallyChanged,
      passwordUpdated: !!password,
      pendingConfirmation: isPending
    });

  } catch (err) {
    console.error('handleUpdateUserCredentials error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update user credentials', 500);
  }
}
