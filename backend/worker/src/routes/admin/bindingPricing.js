import { errorResponse, successResponse } from '../../utils/response.js';

function validateBindingRule(minPages, maxPages, price) {
  if (typeof minPages !== 'number' || !Number.isInteger(minPages) || minPages < 1) {
    return 'Minimum pages must be a whole number of at least 1.';
  }
  if (typeof maxPages !== 'number' || !Number.isInteger(maxPages) || maxPages < minPages) {
    return 'Maximum pages must be a whole number greater than or equal to minimum pages.';
  }
  if (typeof price !== 'number' || price < 0) {
    return 'Binding fee cannot be negative.';
  }
  return null;
}

async function checkOverlap(env, minPages, maxPages, excludeId = null) {
  let query = `
    SELECT id, min_pages, max_pages 
    FROM binding_pricing_rules 
    WHERE is_active = 1 
      AND (
        (? >= min_pages AND ? <= max_pages) OR 
        (? >= min_pages AND ? <= max_pages) OR 
        (? <= min_pages AND ? >= max_pages)
      )
  `;
  const params = [minPages, minPages, maxPages, maxPages, minPages, maxPages];

  if (excludeId) {
    query += ` AND id != ?`;
    params.push(excludeId);
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return results.length > 0;
}

export async function handleAdminGetBindingRules(request, env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, min_pages, max_pages, price, is_active, created_at, updated_at, created_by 
       FROM binding_pricing_rules 
       ORDER BY min_pages ASC`
    ).all();
    return successResponse({ rules: results });
  } catch (err) {
    console.error('Error fetching admin binding rules:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch binding rules', 500);
  }
}

export async function handleAdminPostBindingRule(request, env, context) {
  try {
    const body = await request.json();
    const { min_pages, max_pages, price, is_active } = body;
    const adminId = context.user?.id || 'admin';

    const validationError = validateBindingRule(min_pages, max_pages, price);
    if (validationError) return errorResponse('BAD_REQUEST', validationError, 400);

    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    if (activeStatus === 1) {
      const hasOverlap = await checkOverlap(env, min_pages, max_pages);
      if (hasOverlap) {
        return errorResponse('BAD_REQUEST', 'This page range overlaps an existing active pricing rule. Please choose a different range.', 400);
      }
    }

    const id = 'rule-' + Math.random().toString(36).substring(2, 10);
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO binding_pricing_rules (id, min_pages, max_pages, price, is_active, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, min_pages, max_pages, price, activeStatus, now, now, adminId).run();

    return successResponse({ success: true, id });
  } catch (err) {
    console.error('Error creating binding rule:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to create binding rule', 500);
  }
}

export async function handleAdminPutBindingRule(request, env, context, id) {
  try {
    const body = await request.json();
    const { min_pages, max_pages, price, is_active } = body;
    const adminId = context.user?.id || 'admin';

    const validationError = validateBindingRule(min_pages, max_pages, price);
    if (validationError) return errorResponse('BAD_REQUEST', validationError, 400);

    const activeStatus = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    if (activeStatus === 1) {
      const hasOverlap = await checkOverlap(env, min_pages, max_pages, id);
      if (hasOverlap) {
        return errorResponse('BAD_REQUEST', 'This page range overlaps an existing active pricing rule. Please choose a different range.', 400);
      }
    }

    const now = Date.now();
    const result = await env.DB.prepare(
      `UPDATE binding_pricing_rules 
       SET min_pages = ?, max_pages = ?, price = ?, is_active = ?, updated_at = ?, created_by = ?
       WHERE id = ?`
    ).bind(min_pages, max_pages, price, activeStatus, now, adminId, id).run();

    if (result.meta?.changes === 0) {
      return errorResponse('NOT_FOUND', 'Binding pricing rule not found', 404);
    }

    return successResponse({ success: true });
  } catch (err) {
    console.error('Error updating binding rule:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to update binding rule', 500);
  }
}

export async function handleAdminDeleteBindingRule(request, env, context, id) {
  try {
    const result = await env.DB.prepare(
      `DELETE FROM binding_pricing_rules WHERE id = ?`
    ).bind(id).run();

    if (result.meta?.changes === 0) {
      return errorResponse('NOT_FOUND', 'Binding pricing rule not found', 404);
    }

    return successResponse({ success: true });
  } catch (err) {
    console.error('Error deleting binding rule:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete binding rule', 500);
  }
}
