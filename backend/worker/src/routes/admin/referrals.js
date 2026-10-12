import { successResponse, errorResponse } from '../../utils/response.js';

export async function handleAdminGetReferrals(request, env) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

    let query = `
      SELECT 
        r.id,
        r.referral_code,
        r.status,
        r.qualifying_order_id,
        r.qualified_at,
        r.created_at,
        r.updated_at,
        s_referrer.name as referrer_name,
        s_referrer.roll_number as referrer_roll,
        s_referred.name as referred_name,
        s_referred.roll_number as referred_roll
      FROM referrals r
      LEFT JOIN students s_referrer ON r.referrer_id = s_referrer.id
      LEFT JOIN students s_referred ON r.referred_id = s_referred.id
    `;
    const params = [];

    if (status) {
      query += ` WHERE r.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await env.DB.prepare(query).bind(...params).all();

    const countQuery = status 
      ? `SELECT COUNT(*) as total FROM referrals WHERE status = ?`
      : `SELECT COUNT(*) as total FROM referrals`;
    const countRes = await env.DB.prepare(countQuery).bind(...(status ? [status] : [])).first();

    return successResponse({
      referrals: rows.results || [],
      total: countRes?.total || 0,
      limit,
      offset
    }, 200);
  } catch (err) {
    console.error('Failed to get admin referrals:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve referral records', 500);
  }
}

export async function handleAdminGetReferralStats(request, env) {
  try {
    const stats = await env.DB.prepare(`
      SELECT 
        COUNT(id) as total_referrals,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
        SUM(CASE WHEN status = 'reversed' THEN 1 ELSE 0 END) as reversed_count,
        COUNT(DISTINCT referrer_id) as active_referrers_count
      FROM referrals
    `).first();

    return successResponse({
      stats: {
        total_referrals: stats?.total_referrals || 0,
        pending_count: stats?.pending_count || 0,
        qualified_count: stats?.qualified_count || 0,
        reversed_count: stats?.reversed_count || 0,
        active_referrers_count: stats?.active_referrers_count || 0
      }
    }, 200);
  } catch (err) {
    console.error('Failed to get admin referral stats:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve referral statistics', 500);
  }
}
