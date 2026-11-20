import { successResponse, errorResponse } from '../utils/response.js';
import { broadcastToSubscriptions, sendFcmNotification } from '../services/fcmService.js';

let pushTablesInitPromise = null;

export async function ensurePushTables(db) {
  if (pushTablesInitPromise) return pushTablesInitPromise;

  pushTablesInitPromise = (async () => {
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          fcm_token TEXT NOT NULL,
          platform TEXT DEFAULT 'web',
          device_info TEXT,
          preferences_json TEXT,
          is_active INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_delivered_at INTEGER,
          UNIQUE(student_id, fcm_token)
        )
      `).run();

      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_sub_student ON push_subscriptions(student_id)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_sub_active ON push_subscriptions(is_active)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_sub_token ON push_subscriptions(fcm_token)`).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS push_campaigns (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          image_url TEXT,
          action_url TEXT,
          action_label TEXT,
          category TEXT DEFAULT 'general',
          audience_filter_json TEXT,
          status TEXT NOT NULL CHECK(status IN ('draft', 'scheduled', 'queued', 'sending', 'completed', 'partially_failed', 'failed', 'cancelled')) DEFAULT 'queued',
          target_count INTEGER DEFAULT 0,
          sent_count INTEGER DEFAULT 0,
          failed_count INTEGER DEFAULT 0,
          retry_count INTEGER DEFAULT 0,
          created_by TEXT,
          scheduled_at INTEGER,
          started_at INTEGER,
          completed_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `).run();

      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_camp_status ON push_campaigns(status)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_camp_created ON push_campaigns(created_at DESC)`).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS push_delivery_logs (
          id TEXT PRIMARY KEY,
          campaign_id TEXT,
          subscription_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('sent', 'failed', 'invalid_token')),
          error_code TEXT,
          error_message TEXT,
          delivered_at INTEGER NOT NULL
        )
      `).run();

      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_logs_campaign ON push_delivery_logs(campaign_id)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_push_logs_student ON push_delivery_logs(student_id)`).run();
    } catch (e) {
      console.error('[Push Tables Init Error]:', e);
      pushTablesInitPromise = null;
    }
  })();

  return pushTablesInitPromise;
}

/**
 * 1. Subscribe Student FCM Token
 * POST /api/notifications/push/subscribe
 */
export async function handlePushSubscribe(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const studentId = context.userId || context.user?.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Student authentication required', 401);

    const body = await request.json().catch(() => ({}));
    const { fcmToken, platform = 'web', deviceInfo = '', preferences } = body;

    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim().length < 10) {
      return errorResponse('BAD_REQUEST', 'A valid FCM registration token is required', 400);
    }

    const trimmedToken = fcmToken.trim();
    const now = Date.now();
    const defaultPreferences = JSON.stringify(preferences || {
      order_updates: true,
      food_announcements: true,
      promotions: true,
      campus_announcements: true
    });

    // Check if subscription already exists for this (student_id, fcm_token)
    const existing = await env.DB.prepare(
      `SELECT id, is_active FROM push_subscriptions WHERE student_id = ? AND fcm_token = ?`
    ).bind(studentId, trimmedToken).first();

    let subscriptionId;
    if (existing) {
      subscriptionId = existing.id;
      await env.DB.prepare(`
        UPDATE push_subscriptions 
        SET is_active = 1, platform = ?, device_info = ?, updated_at = ?
        WHERE id = ?
      `).bind(platform, deviceInfo || null, now, subscriptionId).run();
    } else {
      subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      await env.DB.prepare(`
        INSERT INTO push_subscriptions (
          id, student_id, fcm_token, platform, device_info, preferences_json, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(
        subscriptionId,
        studentId,
        trimmedToken,
        platform,
        deviceInfo || null,
        defaultPreferences,
        now,
        now
      ).run();
    }

    return successResponse({
      success: true,
      subscriptionId,
      message: 'Push notification subscription registered successfully'
    });
  } catch (err) {
    console.error('Push Subscribe Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to register push subscription', 500);
  }
}

/**
 * 2. Unsubscribe Student FCM Token
 * POST /api/notifications/push/unsubscribe
 */
export async function handlePushUnsubscribe(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const studentId = context.userId || context.user?.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Student authentication required', 401);

    const body = await request.json().catch(() => ({}));
    const { fcmToken } = body;
    const now = Date.now();

    if (fcmToken) {
      await env.DB.prepare(`
        UPDATE push_subscriptions SET is_active = 0, updated_at = ? 
        WHERE student_id = ? AND fcm_token = ?
      `).bind(now, studentId, fcmToken.trim()).run();
    } else {
      // Unsubscribe all devices for this student
      await env.DB.prepare(`
        UPDATE push_subscriptions SET is_active = 0, updated_at = ? 
        WHERE student_id = ?
      `).bind(now, studentId).run();
    }

    return successResponse({ success: true, message: 'Unsubscribed from push notifications' });
  } catch (err) {
    console.error('Push Unsubscribe Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to unsubscribe', 500);
  }
}

/**
 * 3. Get Student Push Preferences
 * GET /api/notifications/push/preferences
 */
export async function handleGetPushPreferences(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const studentId = context.userId || context.user?.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Student authentication required', 401);

    const sub = await env.DB.prepare(
      `SELECT preferences_json, is_active FROM push_subscriptions WHERE student_id = ? AND is_active = 1 LIMIT 1`
    ).bind(studentId).first();

    let preferences = {
      order_updates: true,
      food_announcements: true,
      promotions: true,
      campus_announcements: true
    };

    if (sub && sub.preferences_json) {
      try {
        preferences = { ...preferences, ...JSON.parse(sub.preferences_json) };
      } catch {}
    }

    return successResponse({
      isSubscribed: !!sub,
      preferences
    });
  } catch (err) {
    console.error('Get Push Preferences Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve notification preferences', 500);
  }
}

/**
 * 4. Update Student Push Preferences
 * PUT /api/notifications/push/preferences
 */
export async function handleUpdatePushPreferences(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const studentId = context.userId || context.user?.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Student authentication required', 401);

    const body = await request.json().catch(() => ({}));
    const { preferences } = body;
    if (!preferences || typeof preferences !== 'object') {
      return errorResponse('BAD_REQUEST', 'Preferences object required', 400);
    }

    const now = Date.now();
    const prefJson = JSON.stringify(preferences);

    await env.DB.prepare(`
      UPDATE push_subscriptions SET preferences_json = ?, updated_at = ?
      WHERE student_id = ?
    `).bind(prefJson, now, studentId).run();

    return successResponse({ success: true, preferences });
  } catch (err) {
    console.error('Update Push Preferences Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update notification preferences', 500);
  }
}

/**
 * Helper to build SQL filter for audience
 */
function buildAudienceQuery(filter = {}) {
  let whereClauses = ['ps.is_active = 1'];
  let params = [];

  if (filter.branchId && filter.branchId !== 'all') {
    whereClauses.push('s.branch_id = ?');
    params.push(filter.branchId);
  }

  if (filter.studyYearId && filter.studyYearId !== 'all') {
    whereClauses.push('s.study_year_id = ?');
    params.push(filter.studyYearId);
  }

  if (filter.section && filter.section !== 'all') {
    whereClauses.push('s.section = ?');
    params.push(filter.section);
  }

  if (filter.service === 'food') {
    whereClauses.push(`EXISTS (SELECT 1 FROM food_orders fo WHERE fo.student_id = ps.student_id)`);
  } else if (filter.service === 'printing') {
    whereClauses.push(`EXISTS (SELECT 1 FROM orders o WHERE o.student_id = ps.student_id)`);
  }

  return { whereClauses, params };
}

/**
 * 5. Calculate Real Eligible Active Recipient Count
 * GET /api/notifications/admin/audience-count
 */
export async function handleGetAudienceCount(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const url = new URL(request.url);
    const filter = {
      branchId: url.searchParams.get('branchId') || 'all',
      studyYearId: url.searchParams.get('studyYearId') || 'all',
      section: url.searchParams.get('section') || 'all',
      service: url.searchParams.get('service') || 'all'
    };

    const { whereClauses, params } = buildAudienceQuery(filter);

    const countSql = `
      SELECT COUNT(DISTINCT ps.fcm_token) as active_devices,
             COUNT(DISTINCT ps.student_id) as active_students
      FROM push_subscriptions ps
      LEFT JOIN students s ON ps.student_id = s.id
      WHERE ${whereClauses.join(' AND ')}
    `;

    const res = await env.DB.prepare(countSql).bind(...params).first();

    return successResponse({
      eligibleDevices: res?.active_devices || 0,
      eligibleStudents: res?.active_students || 0,
      filter
    });
  } catch (err) {
    console.error('Get Audience Count Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to calculate eligible recipient count', 500);
  }
}

/**
 * 6. Admin Broadcast Dispatcher
 * POST /api/notifications/admin/broadcast
 */
export async function handleAdminBroadcast(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const {
      title,
      message,
      imageUrl,
      actionUrl = '/app',
      actionLabel,
      category = 'general',
      audienceFilter = {},
      scheduledAt
    } = body;

    if (!title || !title.trim() || !message || !message.trim()) {
      return errorResponse('BAD_REQUEST', 'Notification title and message are required', 400);
    }

    if (title.trim().length > 100) {
      return errorResponse('BAD_REQUEST', 'Title must be 100 characters or fewer', 400);
    }
    if (message.trim().length > 500) {
      return errorResponse('BAD_REQUEST', 'Message must be 500 characters or fewer', 400);
    }

    // URL validation: must be relative internal URL (/app/...) or valid https://
    if (actionUrl && !actionUrl.startsWith('/') && !actionUrl.startsWith('https://')) {
      return errorResponse('BAD_REQUEST', 'Action URL must be a valid internal path or HTTPS URL', 400);
    }

    const now = Date.now();
    const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Build recipient list
    const { whereClauses, params } = buildAudienceQuery(audienceFilter);

    // If promotional category, filter out users who opted out of promotions
    if (category === 'promotion' || category === 'promotions') {
      whereClauses.push(`(ps.preferences_json IS NULL OR ps.preferences_json NOT LIKE '%"promotions":false%')`);
    } else if (category === 'food') {
      whereClauses.push(`(ps.preferences_json IS NULL OR ps.preferences_json NOT LIKE '%"food_announcements":false%')`);
    }

    const selectSql = `
      SELECT ps.id, ps.student_id, ps.fcm_token
      FROM push_subscriptions ps
      LEFT JOIN students s ON ps.student_id = s.id
      WHERE ${whereClauses.join(' AND ')}
    `;

    const subRows = await env.DB.prepare(selectSql).bind(...params).all();
    const subscriptions = subRows.results || [];

    // Create campaign record
    const status = scheduledAt && scheduledAt > now ? 'scheduled' : 'sending';
    await env.DB.prepare(`
      INSERT INTO push_campaigns (
        id, title, message, image_url, action_url, action_label, category, audience_filter_json,
        status, target_count, sent_count, failed_count, created_by, scheduled_at, started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)
    `).bind(
      campaignId,
      title.trim(),
      message.trim(),
      imageUrl || null,
      actionUrl,
      actionLabel || null,
      category,
      JSON.stringify(audienceFilter),
      status,
      subscriptions.length,
      context.admin?.id || 'admin',
      scheduledAt || null,
      status === 'sending' ? now : null,
      now,
      now
    ).run();

    if (status === 'scheduled') {
      return successResponse({
        success: true,
        campaignId,
        status: 'scheduled',
        targetCount: subscriptions.length,
        scheduledAt,
        message: 'Notification campaign scheduled successfully'
      });
    }

    // Execute immediate broadcast in background / batch
    const dispatchResult = await broadcastToSubscriptions(env, {
      campaignId,
      subscriptions,
      title: title.trim(),
      message: message.trim(),
      imageUrl,
      actionUrl,
      data: {
        campaignId,
        category,
        url: actionUrl
      }
    });

    return successResponse({
      success: true,
      campaignId,
      status: dispatchResult.failedCount === 0 ? 'completed' : 'partially_failed',
      targetCount: dispatchResult.targetCount,
      sentCount: dispatchResult.sentCount,
      failedCount: dispatchResult.failedCount,
      deactivatedTokens: dispatchResult.deactivatedTokens
    });
  } catch (err) {
    console.error('Admin Broadcast Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to dispatch broadcast campaign', 500);
  }
}

/**
 * 7. List Admin Broadcast Campaigns
 * GET /api/notifications/admin/campaigns
 */
export async function handleAdminGetCampaigns(request, env, context) {
  try {
    await ensurePushTables(env.DB);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;

    const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM push_campaigns`).first();
    const total = countRes?.total || 0;

    const results = await env.DB.prepare(`
      SELECT * FROM push_campaigns
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, (page - 1) * limit).all();

    return successResponse({
      campaigns: results.results || [],
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Get Campaigns Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve notification campaigns', 500);
  }
}

/**
 * 8. Get Single Campaign Detail with Delivery Breakdown
 * GET /api/notifications/admin/campaigns/:id
 */
export async function handleAdminGetCampaignById(request, env, context, id) {
  try {
    await ensurePushTables(env.DB);
    const campaign = await env.DB.prepare(`SELECT * FROM push_campaigns WHERE id = ?`).bind(id).first();
    if (!campaign) return errorResponse('NOT_FOUND', 'Campaign not found', 404);

    const logs = await env.DB.prepare(`
      SELECT status, COUNT(*) as count 
      FROM push_delivery_logs 
      WHERE campaign_id = ? 
      GROUP BY status
    `).bind(id).all();

    return successResponse({
      campaign,
      breakdown: logs.results || []
    });
  } catch (err) {
    console.error('Get Campaign Detail Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve campaign details', 500);
  }
}

/**
 * 9. Send Transactional Notification to a Specific Student
 * Used internally by Food & Printing order lifecycles
 */
export async function sendTransactionalPushToStudent(env, {
  studentId,
  title,
  body,
  imageUrl,
  actionUrl,
  category = 'order_updates',
  data = {}
}) {
  if (!studentId) return { sent: 0, failed: 0 };
  try {
    await ensurePushTables(env.DB);

    const subRows = await env.DB.prepare(`
      SELECT id, student_id, fcm_token, preferences_json 
      FROM push_subscriptions 
      WHERE student_id = ? AND is_active = 1
    `).bind(studentId).all();

    const activeSubs = (subRows.results || []).filter((sub) => {
      if (!sub.preferences_json) return true;
      try {
        const prefs = JSON.parse(sub.preferences_json);
        if (category === 'order_updates' && prefs.order_updates === false) return false;
        if (category === 'food' && prefs.food_announcements === false) return false;
        if (category === 'promotions' && prefs.promotions === false) return false;
      } catch {}
      return true;
    });

    if (activeSubs.length === 0) return { sent: 0, failed: 0 };

    return await broadcastToSubscriptions(env, {
      campaignId: null,
      subscriptions: activeSubs,
      title,
      message: body,
      imageUrl,
      actionUrl,
      data: {
        category,
        studentId,
        ...data
      }
    });
  } catch (err) {
    console.error('[Transactional Push Error]:', err);
    return { sent: 0, failed: 0 };
  }
}
