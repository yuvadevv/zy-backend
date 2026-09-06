import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

export async function handleAdminGetCoupons(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const query = `
      SELECT *
      FROM coupons
      ORDER BY created_at DESC
    `;

    const { results } = await env.DB.prepare(query).all();

    return successResponse({
      coupons: results
    });
  } catch (err) {
    console.error('Get coupons error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch coupons', 500);
  }
}

export async function handleAdminPostCoupon(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.edit');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    let { code, discount_amount, is_active } = body;

    if (!code || typeof code !== 'string') {
        return errorResponse('BAD_REQUEST', 'Code is required', 400);
    }
    code = code.trim().toUpperCase();

    if (discount_amount === undefined || discount_amount === null || isNaN(discount_amount) || discount_amount <= 0) {
      return errorResponse('BAD_REQUEST', 'Invalid discount amount', 400);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    is_active = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    try {
      await env.DB.prepare(`
        INSERT INTO coupons (id, code, discount_amount, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, code, discount_amount, is_active, now, now).run();
    } catch (dbErr) {
        if (dbErr.message.includes('UNIQUE constraint failed')) {
            return errorResponse('CONFLICT', 'Coupon code already exists', 409);
        }
        throw dbErr;
    }

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'coupon', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify({ code, discount_amount, is_active }), now).run();

    const created = await env.DB.prepare('SELECT * FROM coupons WHERE id = ?').bind(id).first();

    return successResponse({ success: true, coupon: created });
  } catch (err) {
    console.error('Create coupon error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create coupon', 500);
  }
}

export async function handleAdminPatchCoupon(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.edit');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    let { code, discount_amount, is_active } = body;
    const now = Date.now();

    const updates = [];
    const values = [];

    if (code !== undefined && typeof code === 'string') {
        code = code.trim().toUpperCase();
        if (code.length > 0) {
            updates.push('code = ?');
            values.push(code);
        }
    }

    if (discount_amount !== undefined) {
        if (isNaN(discount_amount) || discount_amount <= 0) {
             return errorResponse('BAD_REQUEST', 'Invalid discount amount', 400);
        }
        updates.push('discount_amount = ?');
        values.push(discount_amount);
    }

    if (is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
        return errorResponse('BAD_REQUEST', 'No fields to update', 400);
    }

    updates.push('updated_at = ?');
    values.push(now);

    values.push(id);

    try {
        const result = await env.DB.prepare(`
            UPDATE coupons
            SET ${updates.join(', ')}
            WHERE id = ?
        `).bind(...values).run();

        if (result.meta.changes === 0) {
            return errorResponse('NOT_FOUND', 'Coupon not found', 404);
        }
    } catch (dbErr) {
        if (dbErr.message.includes('UNIQUE constraint failed')) {
            return errorResponse('CONFLICT', 'Coupon code already exists', 409);
        }
        throw dbErr;
    }
    
    const updatedCoupon = await env.DB.prepare('SELECT * FROM coupons WHERE id = ?').bind(id).first();

    // Determine the action type based on what was updated (can just use UPDATE or STATUS_CHANGED depending on complexity)
    let action = 'UPDATE';
    if (Object.keys(body).length === 1 && is_active !== undefined) {
        action = 'STATUS_CHANGED';
    }

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'coupon', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, action, id, JSON.stringify(body), now).run();

    return successResponse({ success: true, coupon: updatedCoupon });
  } catch (err) {
    console.error('Update coupon error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update coupon', 500);
  }
}
