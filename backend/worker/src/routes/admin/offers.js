import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

export async function handleAdminGetOffers(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const query = `
      SELECT *
      FROM offers
      ORDER BY created_at DESC
    `;

    const { results } = await env.DB.prepare(query).all();

    return successResponse({
      offers: results || []
    });
  } catch (err) {
    console.error('Get offers error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch offers', 500);
  }
}

export async function handleAdminPostOffer(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.edit');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    let { 
      code, title, description, discount_type, discount_value, 
      max_discount_amount, min_order_amount, eligible_services, eligible_components,
      badge_text, terms_text, is_active, start_time, end_time 
    } = body;

    if (!code || typeof code !== 'string') {
      return errorResponse('BAD_REQUEST', 'Code is required', 400);
    }
    code = code.trim().toUpperCase();

    if (!title || typeof title !== 'string') {
      return errorResponse('BAD_REQUEST', 'Title is required', 400);
    }

    if (!discount_type || !['percentage', 'fixed'].includes(discount_type)) {
      return errorResponse('BAD_REQUEST', 'discount_type must be percentage or fixed', 400);
    }

    if (discount_value === undefined || discount_value === null || isNaN(discount_value) || discount_value <= 0) {
      return errorResponse('BAD_REQUEST', 'Invalid discount value', 400);
    }

    const id = `offer_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();
    is_active = is_active !== undefined ? (is_active ? 1 : 0) : 1;
    const servicesStr = eligible_services ? (typeof eligible_services === 'string' ? eligible_services : JSON.stringify(eligible_services)) : '["all"]';
    const componentsStr = eligible_components ? (typeof eligible_components === 'string' ? eligible_components : JSON.stringify(eligible_components)) : '["printing"]';

    try {
      await env.DB.prepare(`
        INSERT INTO offers (
          id, code, title, description, discount_type, discount_value,
          max_discount_amount, min_order_amount, eligible_services, eligible_components,
          badge_text, terms_text, is_active, start_time, end_time, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, code, title, description || null, discount_type, discount_value,
        max_discount_amount || null, min_order_amount || 0, servicesStr, componentsStr,
        badge_text || null, terms_text || null, is_active, start_time || null, end_time || null, now, now
      ).run();
    } catch (dbErr) {
      if (dbErr.message && dbErr.message.includes('UNIQUE constraint failed')) {
        return errorResponse('CONFLICT', 'Offer code already exists', 409);
      }
      throw dbErr;
    }

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'CREATE', 'offer', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify({ code, title, discount_value, is_active }), now).run();

    const created = await env.DB.prepare('SELECT * FROM offers WHERE id = ?').bind(id).first();

    return successResponse({ success: true, offer: created });
  } catch (err) {
    console.error('Create offer error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create offer', 500);
  }
}

export async function handleAdminPatchOffer(request, env, context, id) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.edit');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const now = Date.now();

    const existing = await env.DB.prepare('SELECT * FROM offers WHERE id = ?').bind(id).first();
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Offer not found', 404);
    }

    const updates = [];
    const values = [];

    if (body.code !== undefined && typeof body.code === 'string') {
      const code = body.code.trim().toUpperCase();
      if (code.length > 0) {
        updates.push('code = ?');
        values.push(code);
      }
    }

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }

    if (body.discount_type !== undefined && ['percentage', 'fixed'].includes(body.discount_type)) {
      updates.push('discount_type = ?');
      values.push(body.discount_type);
    }

    if (body.discount_value !== undefined && !isNaN(body.discount_value) && body.discount_value > 0) {
      updates.push('discount_value = ?');
      values.push(body.discount_value);
    }

    if (body.max_discount_amount !== undefined) {
      updates.push('max_discount_amount = ?');
      values.push(body.max_discount_amount || null);
    }

    if (body.min_order_amount !== undefined) {
      updates.push('min_order_amount = ?');
      values.push(body.min_order_amount || 0);
    }

    if (body.eligible_services !== undefined) {
      const servicesStr = typeof body.eligible_services === 'string' ? body.eligible_services : JSON.stringify(body.eligible_services);
      updates.push('eligible_services = ?');
      values.push(servicesStr);
    }

    if (body.eligible_components !== undefined) {
      const compStr = typeof body.eligible_components === 'string' ? body.eligible_components : JSON.stringify(body.eligible_components);
      updates.push('eligible_components = ?');
      values.push(compStr);
    }

    if (body.badge_text !== undefined) {
      updates.push('badge_text = ?');
      values.push(body.badge_text);
    }

    if (body.terms_text !== undefined) {
      updates.push('terms_text = ?');
      values.push(body.terms_text);
    }

    if (body.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(body.is_active ? 1 : 0);
    }

    if (body.start_time !== undefined) {
      updates.push('start_time = ?');
      values.push(body.start_time || null);
    }

    if (body.end_time !== undefined) {
      updates.push('end_time = ?');
      values.push(body.end_time || null);
    }

    if (updates.length === 0) {
      return successResponse({ success: true, offer: existing });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await env.DB.prepare(`
      UPDATE offers
      SET ${updates.join(', ')}
      WHERE id = ?
    `).bind(...values).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'offer', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, id, JSON.stringify(body), now).run();

    const updated = await env.DB.prepare('SELECT * FROM offers WHERE id = ?').bind(id).first();

    return successResponse({ success: true, offer: updated });
  } catch (err) {
    console.error('Patch offer error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update offer', 500);
  }
}
