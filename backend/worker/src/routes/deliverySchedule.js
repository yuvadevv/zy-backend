import { errorResponse, successResponse } from '../utils/response.js';
import { 
  getDeliveryScheduleConfig, 
  updateDeliveryScheduleConfig, 
  computeDeliveryDetails,
  createOrderDeliverySnapshot,
  computeEtaMsIST
} from '../services/deliveryScheduleService.js';
import { hasPermission } from './admin/roles.js';

/**
 * GET /api/public/delivery-schedule
 * Public endpoint for students to retrieve currently active delivery schedule and computed IST details.
 */
export async function handleGetPublicDeliverySchedule(request, env) {
  try {
    const config = await getDeliveryScheduleConfig(env.DB);
    const computed = computeDeliveryDetails(config);
    return successResponse({ schedule: config, computed });
  } catch (err) {
    console.error('Error fetching delivery schedule:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch delivery schedule', 500);
  }
}

/**
 * GET /api/admin/delivery-schedule
 * Admin authenticated endpoint to inspect active delivery schedule.
 */
export async function handleGetAdminDeliverySchedule(request, env, context) {
  try {
    const config = await getDeliveryScheduleConfig(env.DB);
    const computed = computeDeliveryDetails(config);
    return successResponse({ schedule: config, computed });
  } catch (err) {
    console.error('Error fetching admin delivery schedule:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch delivery schedule', 500);
  }
}

/**
 * PUT /api/admin/delivery-schedule
 * Admin authenticated endpoint to update delivery schedule configuration.
 */
export async function handleUpdateAdminDeliverySchedule(request, env, context) {
  try {
    const adminId = context.admin?.id || 'admin';
    const hasAccess = await hasPermission(env.DB, adminId, 'settings.manage').catch(() => true);
    if (!hasAccess) return errorResponse('FORBIDDEN', 'Insufficient permissions to update delivery schedule', 403);

    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return errorResponse('BAD_REQUEST', 'Invalid payload', 400);
    }

    const VALID_DATE_MODES = ['today', 'tomorrow', 'next_working_day', 'custom_date'];
    if (body.dateMode && !VALID_DATE_MODES.includes(body.dateMode)) {
      return errorResponse('BAD_REQUEST', `Invalid dateMode. Must be one of: ${VALID_DATE_MODES.join(', ')}`, 400);
    }

    const VALID_TIME_SLOTS = ['morning', 'afternoon', 'evening', 'custom'];
    if (body.timeSlot && !VALID_TIME_SLOTS.includes(body.timeSlot)) {
      return errorResponse('BAD_REQUEST', `Invalid timeSlot. Must be one of: ${VALID_TIME_SLOTS.join(', ')}`, 400);
    }

    if (body.dateMode === 'custom_date' && !body.customDate) {
      return errorResponse('BAD_REQUEST', 'customDate is required when dateMode is custom_date', 400);
    }

    const updatedConfig = await updateDeliveryScheduleConfig(env.DB, {
      dateMode: body.dateMode,
      customDate: body.customDate || '',
      timeSlot: body.timeSlot,
      startTime: body.startTime,
      endTime: body.endTime,
      deliveryLabel: body.deliveryLabel,
      deliveryLocation: body.deliveryLocation,
      deliveryMessage: body.deliveryMessage,
      enabled: body.enabled !== false,
      classroomDeliveryStatus: body.classroomDeliveryStatus || 'active'
    }, adminId);

    const computed = computeDeliveryDetails(updatedConfig);
    return successResponse({ 
      success: true, 
      message: 'Delivery schedule updated successfully',
      schedule: updatedConfig, 
      computed 
    });
  } catch (err) {
    console.error('Error updating admin delivery schedule:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update delivery schedule', 500);
  }
}

/**
 * PATCH /api/admin/orders/:id/delivery
 * Admin authenticated endpoint to override delivery details for a specific order.
 */
export async function handleUpdateOrderDelivery(request, env, context) {
  try {
    const adminId = context.admin?.id || 'admin';
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/delivery$/);
    if (!match) return errorResponse('NOT_FOUND', 'Order delivery endpoint not found', 404);

    const publicId = match[1];
    const body = await request.json();

    const order = await env.DB.prepare('SELECT internal_id, public_id, estimated_delivery, delivery_snapshot, delivery_building, delivery_room FROM orders WHERE public_id = ? OR internal_id = ?').bind(publicId, publicId).first();
    if (!order) {
      return errorResponse('NOT_FOUND', `Order ${publicId} not found`, 404);
    }

    let existingSnapshot = {};
    if (order.delivery_snapshot) {
      try { existingSnapshot = JSON.parse(order.delivery_snapshot); } catch (e) {}
    }

    const now = Date.now();
    let newEtaMs = body.estimatedDelivery !== undefined ? body.estimatedDelivery : order.estimated_delivery;

    const expectedDate = body.expected_date || body.expectedDate || existingSnapshot.expectedDate || '';
    const startTime = body.start_time || body.startTime || existingSnapshot.startTime || '';
    const endTime = body.end_time || body.endTime || existingSnapshot.endTime || '';

    // If admin supplied date and time strings, recalculate newEtaMs in IST
    if (expectedDate && startTime) {
      const [y, m, d] = expectedDate.split('-').map(Number);
      if (y && m && d) {
        newEtaMs = computeEtaMsIST(y, m, d, startTime);
      }
    }

    const updatedSnapshot = {
      ...existingSnapshot,
      expectedDate,
      expectedDateLabel: body.expected_date_label || body.expectedDateLabel || existingSnapshot.expectedDateLabel || expectedDate,
      targetDay: body.target_day || body.targetDay || existingSnapshot.targetDay || '',
      timeSlot: body.time_slot || body.timeSlot || existingSnapshot.timeSlot || 'custom',
      startTime,
      endTime,
      timeRange: body.time_range || body.timeRange || (startTime && endTime ? `${startTime} – ${endTime}` : existingSnapshot.timeRange || ''),
      deliveryLabel: body.delivery_label || body.deliveryLabel || existingSnapshot.deliveryLabel || '',
      deliveryMethod: body.delivery_method || body.deliveryMethod || existingSnapshot.deliveryMethod || 'Direct Classroom Delivery',
      deliveryLocation: body.delivery_location || body.deliveryLocation || existingSnapshot.deliveryLocation || 'Directly to Your Classroom',
      deliveryMessage: body.delivery_message || body.deliveryMessage || existingSnapshot.deliveryMessage || '',
      classroomDeliveryStatus: body.classroom_delivery_status || body.classroomDeliveryStatus || existingSnapshot.classroomDeliveryStatus || 'active',
      etaMs: newEtaMs,
      isOverridden: true,
      overriddenAt: now,
      overriddenBy: adminId
    };

    const snapshotStr = JSON.stringify(updatedSnapshot);
    const deliveryBuilding = (body.delivery_building !== undefined ? body.delivery_building : body.deliveryBuilding) ?? order.delivery_building;
    const deliveryRoom = (body.delivery_room !== undefined ? body.delivery_room : body.deliveryRoom) ?? order.delivery_room;

    await env.DB.prepare(`
      UPDATE orders 
      SET delivery_snapshot = ?,
          estimated_delivery = ?,
          delivery_building = ?,
          delivery_room = ?,
          updated_at = ?
      WHERE internal_id = ?
    `).bind(snapshotStr, newEtaMs, deliveryBuilding, deliveryRoom, now, order.internal_id).run();

    await env.DB.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, after_value, created_at)
      VALUES (lower(hex(randomblob(16))), ?, 'ADMIN', 'UPDATE_ORDER_DELIVERY', 'order', ?, ?, ?)
    `).bind(adminId, publicId, snapshotStr, now).run().catch(() => {});

    return successResponse({
      success: true,
      message: `Delivery schedule for order ${publicId} updated successfully`,
      orderId: publicId,
      deliverySnapshot: updatedSnapshot,
      estimatedDelivery: newEtaMs
    });
  } catch (err) {
    console.error('Error updating order delivery schedule:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update order delivery schedule', 500);
  }
}
