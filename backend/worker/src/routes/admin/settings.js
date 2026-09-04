import { errorResponse, successResponse } from '../../utils/response.js';
import { hasPermission } from './roles.js';

export async function handleGetSettings(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results } = await env.DB.prepare(`
      SELECT setting_key, setting_value, updated_at
      FROM platform_settings
      ORDER BY setting_key ASC
    `).all();

    // Map to key-value pairs (parsing JSON values if they are stored as strings)
    const settings = {};
    for (const row of results) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }

    return successResponse({ settings, raw: results });
  } catch (err) {
    console.error('Get settings error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch settings', 500);
  }
}

export async function handlePatchSettings(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    const { updates } = body; // Expecting { updates: [{ key: 'maintenance_mode', value: true }] }

    if (!updates || !Array.isArray(updates)) {
      return errorResponse('BAD_REQUEST', 'Updates array is required', 400);
    }

    const now = Date.now();
    const stmts = [];

    for (const update of updates) {
      const { key, value } = update;
      const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      stmts.push(
        env.DB.prepare(`
          INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
        `).bind(key, strValue, now, context.admin.id)
      );

      stmts.push(
        env.DB.prepare(`
          INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
          VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'platform_setting', ?, ?, ?)
        `).bind(context.admin.id, context.admin.role, key, strValue, now)
      );
    }

    if (stmts.length > 0) {
      await env.DB.batch(stmts);
    }

    return successResponse({ success: true });
  } catch (err) {
    console.error('Update settings error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update settings', 500);
  }
}

const DEFAULT_PRICING_SETTINGS = {
  printRates: {
    bw_single: 1.0,
    bw_double: 1.5,
    color_single: 5.0,
    color_double: 8.0
  },
  bindingFees: {
    none: 0,
    spiral: 30.0,
    soft_bound: 50.0,
    hard_bound: 100.0
  },
  defaultDeliveryFee: 40.0
};

export async function handleGetPricingSettings(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.view');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const { results } = await env.DB.prepare(`
      SELECT setting_value
      FROM platform_settings
      WHERE setting_key = 'pricing_settings'
    `).all();

    let settings = DEFAULT_PRICING_SETTINGS;
    if (results && results.length > 0) {
      try {
        const stored = JSON.parse(results[0].setting_value);
        settings = { ...DEFAULT_PRICING_SETTINGS, ...stored };
      } catch (e) {
        console.error('Failed to parse pricing settings', e);
      }
    }

    return successResponse({ settings });
  } catch (err) {
    console.error('Get pricing settings error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch pricing settings', 500);
  }
}

export async function handlePatchPricingSettings(request, env, context) {
  try {
    const hasAccess = await hasPermission(env.DB, context.admin.id, 'settings.manage');
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions', 403);

    const body = await request.json();
    // Validate body structure loosely
    if (!body || typeof body !== 'object') {
       return errorResponse('BAD_REQUEST', 'Invalid pricing settings data', 400);
    }

    const now = Date.now();
    const strValue = JSON.stringify(body);

    await env.DB.prepare(`
      INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `).bind('pricing_settings', strValue, now, context.admin.id).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, 'UPDATE', 'platform_setting', ?, ?, ?)
    `).bind(context.admin.id, context.admin.role, 'pricing_settings', strValue, now).run();

    return successResponse({ success: true });
  } catch (err) {
    console.error('Patch pricing settings error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update pricing settings', 500);
  }
}
