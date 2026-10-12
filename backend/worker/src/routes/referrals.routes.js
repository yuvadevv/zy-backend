import { Router } from '../core/Router.js';
import { verifyAuth } from '../middleware/auth.js';
import { 
  getStudentReferralDetails, 
  attributeReferral, 
  getReferralLeaderboard 
} from '../services/referralService.js';
import { successResponse, errorResponse } from '../utils/response.js';

export const referralsRouter = new Router();

/**
 * GET /api/referrals/me
 * Returns authenticated student's unique referral code, share link, and real-time stats
 */
referralsRouter.get('/me', async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;

  const studentId = authRes.context.userId || authRes.context.user?.id;
  if (!studentId) {
    return errorResponse('UNAUTHORIZED', 'Student authentication required', 401);
  }

  try {
    const origin = request.headers.get('Origin') || 'https://blintzy.in';
    const details = await getStudentReferralDetails(env.DB, studentId, origin);
    return successResponse(details, 200);
  } catch (err) {
    console.error('Failed to get student referral details:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve referral data', 500);
  }
});

/**
 * POST /api/referrals/attribute
 * Attributes the authenticated student to a referrer via valid referral code
 */
referralsRouter.post('/attribute', async (request, env, context) => {
  const authRes = await verifyAuth(request, env);
  if (authRes.error) return authRes.error;

  const studentId = authRes.context.userId || authRes.context.user?.id;
  if (!studentId) {
    return errorResponse('UNAUTHORIZED', 'Student authentication required', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const referralCode = body.referral_code || body.code;

    if (!referralCode) {
      return errorResponse('BAD_REQUEST', 'Referral code is required', 400);
    }

    const referral = await attributeReferral(env.DB, studentId, referralCode);
    return successResponse({ referral }, 201);
  } catch (err) {
    if (err?.code) {
      return errorResponse(err.code, err.message, err.status || 400);
    }
    console.error('Failed to attribute referral:', err);
    return errorResponse('SERVER_ERROR', 'Failed to process referral attribution', 500);
  }
});

/**
 * GET /api/referrals/leaderboard
 * Returns public deterministic leaderboard rankings:
 * - ?type=connectors (Campus Connectors - ranked by registrations)
 * - ?type=qualified (Qualified Referrers - ranked by qualifying orders >= ₹1)
 */
referralsRouter.get('/leaderboard', async (request, env) => {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'connectors';
    const limit = url.searchParams.get('limit') || '50';

    const leaderboard = await getReferralLeaderboard(env.DB, type, limit);
    return successResponse({ type, leaderboard }, 200);
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    return errorResponse('SERVER_ERROR', 'Failed to load leaderboard', 500);
  }
});

/**
 * GET /api/referrals/validate/:code
 * Public validation of a referral code before/during signup
 */
referralsRouter.get('/validate/:code', async (request, env) => {
  try {
    const url = new URL(request.url);
    const code = url.pathname.split('/').pop()?.toUpperCase()?.trim();

    if (!code) {
      return errorResponse('BAD_REQUEST', 'Referral code is required', 400);
    }

    const check = await env.DB.prepare(
      'SELECT referral_code FROM student_referral_codes WHERE UPPER(referral_code) = ?'
    ).bind(code).first();

    return successResponse({
      valid: !!check,
      referral_code: check?.referral_code || code
    }, 200);
  } catch (err) {
    console.error('Failed to validate referral code:', err);
    return errorResponse('SERVER_ERROR', 'Validation check failed', 500);
  }
});

/**
 * GET /api/referrals/ambassador-status
 * Returns authoritative Campus Ambassador Programme status, rules, and top-3 selection outcome
 */
referralsRouter.get('/ambassador-status', async (request, env) => {
  try {
    // 1. Fetch settings from platform_settings
    const settingRow = await env.DB.prepare(
      "SELECT setting_value FROM platform_settings WHERE setting_key = 'campus_ambassador_settings'"
    ).first();

    let settings = {
      is_active: false, // Default: Applications Opening Soon / Coming Soon
      selection_period_start: null,
      selection_period_end: null,
      governing_leaderboard: 'qualified',
      min_qualified_referrals: 3,
      programme_term: 'Upcoming Academic Term 2026',
      status: 'coming_soon' // 'coming_soon' | 'active' | 'closed'
    };

    if (settingRow?.setting_value) {
      try {
        const parsed = JSON.parse(settingRow.setting_value);
        settings = { ...settings, ...parsed };
      } catch (e) {}
    }

    // 2. Fetch authoritative leaderboard results for top 3 (strictly Qualified Referrers)
    const governingType = 'qualified';
    const topCandidates = await getReferralLeaderboard(env.DB, governingType, 3);

    const now = Date.now();
    const isPeriodClosed = settings.selection_period_end ? (now >= Number(settings.selection_period_end)) : false;

    return successResponse({
      settings: {
        ...settings,
        governing_leaderboard: 'qualified'
      },
      governing_leaderboard: 'qualified',
      selection_basis: 'Verified Qualified Referrals (classmates who completed an eligible paid print order of at least ₹1.00)',
      is_closed: isPeriodClosed,
      top_candidates: topCandidates,
      top_three_selected: isPeriodClosed && settings.status === 'closed' ? topCandidates : null
    }, 200);
  } catch (err) {
    console.error('Failed to load ambassador status:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve ambassador status', 500);
  }
});

/**
 * POST /api/referrals/ambassador-notify
 * Records student notification preference for Campus Ambassador program opening
 */
referralsRouter.post('/ambassador-notify', async (request, env) => {
  try {
    // Ensure subscribers table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS ambassador_notification_subscribers (
        id TEXT PRIMARY KEY,
        student_id TEXT,
        email TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();

    let studentId = null;
    let email = null;

    // Check optional authentication
    try {
      const authRes = await verifyAuth(request, env);
      if (!authRes.error && authRes.context) {
        studentId = authRes.context.userId || authRes.context.user?.id || null;
        email = authRes.context.user?.email || null;
      }
    } catch (_) {}

    // Parse body if supplied
    const body = await request.json().catch(() => ({}));
    if (body.email && typeof body.email === 'string') {
      email = body.email.trim().toLowerCase();
    }
    if (body.student_id && typeof body.student_id === 'string') {
      studentId = studentId || body.student_id.trim();
    }

    if (!studentId && !email) {
      return errorResponse('BAD_REQUEST', 'Student identity or email address is required to register for notifications.', 400);
    }

    // Check for existing duplicate subscription
    let existing = null;
    if (studentId) {
      existing = await env.DB.prepare(
        'SELECT id FROM ambassador_notification_subscribers WHERE student_id = ?'
      ).bind(studentId).first();
    }
    if (!existing && email) {
      existing = await env.DB.prepare(
        'SELECT id FROM ambassador_notification_subscribers WHERE email = ?'
      ).bind(email).first();
    }

    if (existing) {
      return successResponse({
        subscribed: true,
        already_subscribed: true,
        message: "You're already on the notification list! We'll alert you as soon as the selection window opens."
      }, 200);
    }

    const id = 'amb_sub_' + crypto.randomUUID();
    const now = Date.now();

    await env.DB.prepare(
      'INSERT INTO ambassador_notification_subscribers (id, student_id, email, created_at) VALUES (?, ?, ?, ?)'
    ).bind(id, studentId, email, now).run();

    return successResponse({
      subscribed: true,
      already_subscribed: false,
      message: "You're subscribed! We'll notify you as soon as the selection period opens."
    }, 201);
  } catch (err) {
    console.error('Failed to register ambassador notification preference:', err);
    return errorResponse('SERVER_ERROR', 'Failed to register notification preference', 500);
  }
});

