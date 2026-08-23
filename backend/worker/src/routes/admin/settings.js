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
