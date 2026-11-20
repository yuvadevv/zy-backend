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
    const branch = url.searchParams.get('branch') || url.searchParams.get('branch_id') || '';
    const year = url.searchParams.get('year') || url.searchParams.get('study_year_id') || '';
    const section = url.searchParams.get('section') || url.searchParams.get('section_id') || '';
    const completion = url.searchParams.get('completion') || url.searchParams.get('profile_status') || 'all';

    let query = `
      SELECT s.id, s.email, s.name, s.roll_number, s.phone, s.avatar_url,
             s.college_id, s.branch_id, s.study_year_id, s.study_year_id as year_of_study,
             s.semester_id, s.section, s.block_id, s.classroom_id,
             s.academic_profile_completed, s.account_status, s.created_at, s.updated_at as last_login_at,
             c.name as college_name, b.name as branch_name,
             ay.label as year_label, sec.name as section_name,
             bl.name as block_name, cl.name as classroom_name
      FROM students s
      LEFT JOIN colleges c ON s.college_id = c.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      LEFT JOIN sections sec ON s.section = sec.id
      LEFT JOIN blocks bl ON s.block_id = bl.id
      LEFT JOIN classrooms cl ON s.classroom_id = cl.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (s.email LIKE ? OR s.name LIKE ? OR s.roll_number LIKE ? OR s.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status !== 'all') {
      query += ` AND s.account_status = ?`;
      params.push(status);
    }

    if (branch && branch !== 'all') {
      query += ` AND (s.branch_id = ? OR b.code = ?)`;
      params.push(branch, branch);
    }

    if (year && year !== 'all') {
      query += ` AND (s.study_year_id = ? OR ay.label LIKE ?)`;
      params.push(year, `%${year}%`);
    }

    if (section && section !== 'all') {
      query += ` AND (s.section = ? OR sec.name = ?)`;
      params.push(section, section);
    }

    if (completion === 'completed') {
      query += ` AND s.academic_profile_completed = 1`;
    } else if (completion === 'incomplete') {
      query += ` AND (s.academic_profile_completed = 0 OR s.academic_profile_completed IS NULL)`;
    }

    query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Count query with same filters
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      LEFT JOIN sections sec ON s.section = sec.id
      WHERE 1=1
    `;
    const countParams = [];

    if (search) {
      countQuery += ` AND (s.email LIKE ? OR s.name LIKE ? OR s.roll_number LIKE ? OR s.phone LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status !== 'all') {
      countQuery += ` AND s.account_status = ?`;
      countParams.push(status);
    }
    if (branch && branch !== 'all') {
      countQuery += ` AND (s.branch_id = ? OR b.code = ?)`;
      countParams.push(branch, branch);
    }
    if (year && year !== 'all') {
      countQuery += ` AND (s.study_year_id = ? OR ay.label LIKE ?)`;
      countParams.push(year, `%${year}%`);
    }
    if (section && section !== 'all') {
      countQuery += ` AND (s.section = ? OR sec.name = ?)`;
      countParams.push(section, section);
    }
    if (completion === 'completed') {
      countQuery += ` AND s.academic_profile_completed = 1`;
    } else if (completion === 'incomplete') {
      countQuery += ` AND (s.academic_profile_completed = 0 OR s.academic_profile_completed IS NULL)`;
    }

    const countResult = await env.DB.prepare(countQuery).bind(...countParams).first();

    const formattedUsers = (results || []).map(u => ({
      ...u,
      academic_profile_completed: Boolean(
        u.academic_profile_completed &&
        u.roll_number &&
        u.college_id &&
        u.branch_id &&
        u.study_year_id &&
        u.section &&
        u.block_id &&
        (u.classroom_id || u.classroom_name)
      )
    }));

    return successResponse({
      users: formattedUsers,
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
      SELECT s.id, s.name, s.roll_number, s.phone, s.email, s.avatar_url, s.academic_profile_completed,
             s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section,
             s.block_id, s.classroom_id,
             s.account_status, s.created_at, s.updated_at,
             c.name as college_name, b.name as branch_name,
             ay.label as year_label, sem.label as semester_label, sec.name as section_name,
             bl.name as block_name, cl.name as classroom_name
      FROM students s
      LEFT JOIN colleges c ON s.college_id = c.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      LEFT JOIN sections sec ON s.section = sec.id
      LEFT JOIN blocks bl ON s.block_id = bl.id
      LEFT JOIN classrooms cl ON s.classroom_id = cl.id
      WHERE s.id = ?
    `;

    const user = await env.DB.prepare(query).bind(userId).first();
    if (!user) return errorResponse('NOT_FOUND', 'User not found', 404);

    user.academic_profile_completed = Boolean(
      user.academic_profile_completed &&
      user.roll_number &&
      user.college_id &&
      user.branch_id &&
      user.year &&
      user.section &&
      user.block_id &&
      (user.classroom_id || user.classroom_name)
    );

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
    const updatePayload = {};
    if (email) updatePayload.email = email;
    if (password) updatePayload.password = password;

    const supabaseAdminUrl = `${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`;
    const sbRes = await fetch(supabaseAdminUrl, {
      method: 'PUT',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!sbRes.ok) {
      const sbData = await sbRes.json().catch(() => ({}));
      return errorResponse('BAD_REQUEST', sbData.msg || sbData.message || 'Failed to update credentials in auth provider', 400);
    }

    // Update D1 database email if modified
    if (email) {
      await env.DB.prepare(`UPDATE students SET email = ?, updated_at = ? WHERE id = ?`)
        .bind(email, Date.now(), userId).run();
    }

    return successResponse({ success: true, message: 'Credentials updated successfully' });
  } catch (err) {
    console.error('Update credentials error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update credentials', 500);
  }
}
