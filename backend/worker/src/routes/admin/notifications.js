import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

export async function handlePostNotification(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'notifications.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { title, message, category, icon, action_label, action_url, audience_type, audience_filter } = body;

    if (!title || !message || !category || !icon || !audience_type) {
      return errorResponse('BAD_REQUEST', 'Missing required fields', 400);
    }

    const notificationId = crypto.randomUUID();
    const now = Date.now();

    // Determine target users
    let targetUsers = [];

    if (audience_type === 'all') {
      const { results } = await env.DB.prepare(`SELECT id FROM students WHERE account_status = 'active'`).all();
      targetUsers = results.map(r => r.id);
    } else if (audience_type === 'individual') {
      const selectedIds = audience_filter.selected_users || [];
      if (selectedIds.length === 0) return errorResponse('BAD_REQUEST', 'No users selected', 400);
      
      const placeholders = selectedIds.map(() => '?').join(',');
      const { results } = await env.DB.prepare(`SELECT id FROM students WHERE id IN (${placeholders})`).bind(...selectedIds).all();
      targetUsers = results.map(r => r.id);
    } else if (audience_type === 'filtered') {
      let query = `SELECT id FROM students WHERE account_status = 'active'`;
      const params = [];
      
      const branches = audience_filter.branches || [];
      const sections = audience_filter.sections || [];
      const years = audience_filter.years || [];

      if (branches.length > 0) {
        query += ` AND branch_id IN (${branches.map(() => '?').join(',')})`;
        params.push(...branches);
      }
      if (sections.length > 0) {
        query += ` AND section IN (${sections.map(() => '?').join(',')})`;
        params.push(...sections);
      }
      if (years.length > 0) {
        query += ` AND study_year_id IN (${years.map(() => '?').join(',')})`;
        params.push(...years);
      }

      const { results } = await env.DB.prepare(query).bind(...params).all();
      targetUsers = results.map(r => r.id);
    } else {
      return errorResponse('BAD_REQUEST', 'Invalid audience type', 400);
    }

    if (targetUsers.length === 0) {
      return errorResponse('BAD_REQUEST', 'No eligible users found for this audience', 400);
    }

    // Insert Notification
    await env.DB.prepare(`
      INSERT INTO notifications (
        id, student_id, type, title, message, category, icon, action_label, action_url,
        audience_type, audience_filter_snapshot, created_by, status, sent_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      notificationId, 'BROADCAST', 'broadcast', title, message, category, icon, action_label || null, action_url || null,
      audience_type, JSON.stringify(audience_filter || {}), context.admin.id, 'sent', now, now, now
    ).run();

    // Insert Recipients (Chunked to avoid SQLite parameter limits)
    const chunkSize = 100;
    for (let i = 0; i < targetUsers.length; i += chunkSize) {
      const chunk = targetUsers.slice(i, i + chunkSize);
      let insertQuery = `INSERT INTO notification_recipients (id, notification_id, user_id, delivery_status, delivered_at, created_at, updated_at) VALUES `;
      const insertParams = [];
      
      chunk.forEach((userId, idx) => {
        insertQuery += `(?, ?, ?, ?, ?, ?, ?)`;
        if (idx < chunk.length - 1) insertQuery += `, `;
        insertParams.push(crypto.randomUUID(), notificationId, userId, 'delivered', now, now, now);
      });
      
      await env.DB.prepare(insertQuery).bind(...insertParams).run();
    }

    // Audit Log
    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'notification', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, notificationId, JSON.stringify({ recipient_count: targetUsers.length }), now).run();

    return successResponse({ success: true, id: notificationId, recipient_count: targetUsers.length });
  } catch (err) {
    console.error('Post Notification Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to send notification', 500);
  }
}

export async function handleGetNotifications(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'notifications.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 25;
    
    // Get total count
    const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM notifications`).first();
    const total = countRes ? countRes.total : 0;

    const results = await env.DB.prepare(`
      SELECT n.*, 
        (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id) as recipient_count,
        (SELECT COUNT(*) FROM notification_recipients nr WHERE nr.notification_id = n.id AND nr.read_at IS NOT NULL) as read_count
      FROM notifications n
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, (page - 1) * limit).all();

    return successResponse({
      notifications: results.results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Get Notifications Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch notifications', 500);
  }
}

export async function handleGetNotificationStats(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'notifications.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_recipients,
        SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) as failed_count
      FROM notification_recipients
      WHERE notification_id = ?
    `).bind(id).first();

    return successResponse(stats || { total_recipients: 0, read_count: 0, failed_count: 0 });
  } catch (err) {
    console.error('Get Notification Stats Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch notification stats', 500);
  }
}

export async function handleGetNotificationUsers(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'notifications.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const branch = url.searchParams.get('branch') || '';
    const section = url.searchParams.get('section') || '';
    const year = url.searchParams.get('year') || '';
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 25;

    let query = `
      SELECT s.id, s.name, s.email, s.roll_number as studentId, s.section, 
             b.name as branch, ay.label as year, s.account_status as role
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN academic_years ay ON s.study_year_id = ay.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (s.name LIKE ? OR s.email LIKE ? OR s.roll_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (branch && branch !== 'all') {
      query += ` AND s.branch_id = ?`;
      params.push(branch);
    }
    if (section && section !== 'all') {
      query += ` AND s.section = ?`;
      params.push(section);
    }
    if (year && year !== 'all') {
      query += ` AND s.study_year_id = ?`;
      params.push(year);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query})`;
    const countRes = await env.DB.prepare(countQuery).bind(...params).first();
    const total = countRes ? countRes.total : 0;

    query += ` ORDER BY s.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, (page - 1) * limit);

    const { results } = await env.DB.prepare(query).bind(...params).all();

    return successResponse({
      users: results,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Get Notification Users Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch users', 500);
  }
}

export async function handlePatchNotification(request, env, context, id) {
  // Can be used for archiving/status updates in future
  return successResponse({ success: true });
}

export async function handleDeleteNotification(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'notifications.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    await env.DB.prepare(`DELETE FROM notifications WHERE id = ?`).bind(id).run();
    return successResponse({ success: true });
  } catch (err) {
    console.error('Delete Notification Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to delete notification', 500);
  }
}
