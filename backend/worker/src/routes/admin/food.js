import { successResponse, errorResponse } from '../../utils/response.js';
import { ensureFoodTables } from '../food.js';

// Helper: Log Admin Food Audit Action
export async function logAdminFoodAudit(db, admin, action, targetType, targetId, details = {}, reason = '') {
  try {
    const id = `fa_log_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();
    await db.prepare(`
      INSERT INTO food_admin_audit_logs (
        id, admin_id, admin_email, action, target_type, target_id, details, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      admin?.id || 'admin_sys',
      admin?.email || 'admin@blintzy.com',
      action,
      targetType,
      targetId,
      JSON.stringify(details),
      reason || 'Administrative action',
      now
    ).run();
  } catch (err) {
    console.error('Failed to write admin food audit log:', err);
  }
}

// 1. Central Admin Overview
export async function handleAdminGetFoodOverview(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const now = Date.now();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startOfDayTs = startOfDay.getTime();

    // Today's order metrics
    const todayStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(CASE WHEN order_status = 'collected' THEN 1 ELSE 0 END) as completedOrders,
        SUM(CASE WHEN order_status IN ('confirmed', 'preparing', 'ready') THEN 1 ELSE 0 END) as pendingOrders,
        SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) as cancelledOrders,
        COALESCE(SUM(CASE WHEN order_status != 'cancelled' THEN grand_total ELSE 0 END), 0) as grossOrderValue,
        COALESCE(SUM(CASE WHEN payment_method = 'ONLINE_UPI' AND payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as verifiedOnlinePayments,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as cashCollected,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'pending' AND order_status != 'cancelled' THEN grand_total ELSE 0 END), 0) as cashPending
      FROM food_orders
      WHERE created_at >= ?
    `).bind(startOfDayTs).first();

    // Active food vendors
    const vendorsResult = await env.DB.prepare(`
      SELECT * FROM food_vendors ORDER BY name ASC
    `).all();
    const vendors = vendorsResult.results || [];
    const activeVendorsCount = vendors.filter(v => v.status === 'active').length;

    // Low stock items count (stock <= 10)
    const lowStockResult = await env.DB.prepare(`
      SELECT m.*, v.name as vendor_name, v.counter_location
      FROM food_menu_items m
      LEFT JOIN food_vendors v ON m.vendor_id = v.id
      WHERE m.stock <= 10
      ORDER BY m.stock ASC
      LIMIT 10
    `).all();
    const lowStockItems = lowStockResult.results || [];

    const lowStockTotalCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM food_menu_items WHERE stock <= 10
    `).first();

    // Recent orders (last 8)
    const recentOrdersResult = await env.DB.prepare(`
      SELECT id, order_number, token_number, student_name, student_phone, vendor_id, vendor_name,
             payment_method, payment_status, order_status, grand_total, created_at
      FROM food_orders
      ORDER BY created_at DESC
      LIMIT 8
    `).all();

    // Mask phone numbers for privacy
    const recentOrders = (recentOrdersResult.results || []).map(o => ({
      ...o,
      student_phone: o.student_phone ? o.student_phone.replace(/(\d{2})\d{4}(\d{4})/, '$1****$2') : ''
    }));

    return successResponse({
      overview: {
        totalOrdersToday: todayStats?.totalOrders || 0,
        completedOrdersToday: todayStats?.completedOrders || 0,
        pendingOrders: todayStats?.pendingOrders || 0,
        cancelledOrdersToday: todayStats?.cancelledOrders || 0,
        grossOrderValueToday: todayStats?.grossOrderValue || 0,
        verifiedOnlinePaymentsToday: todayStats?.verifiedOnlinePayments || 0,
        cashCollectedToday: todayStats?.cashCollected || 0,
        cashPendingToday: todayStats?.cashPending || 0,
        activeVendorsCount,
        totalVendorsCount: vendors.length,
        lowStockItemsCount: lowStockTotalCount?.count || 0
      },
      vendors,
      lowStockPreview: lowStockItems,
      recentOrders
    });
  } catch (err) {
    console.error('Admin Food Overview Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve admin food overview', 500);
  }
}

// 2. Vendor Management: List All Vendors with Metrics
export async function handleAdminGetFoodVendors(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const vendorsResult = await env.DB.prepare(`SELECT * FROM food_vendors ORDER BY name ASC`).all();
    const vendors = vendorsResult.results || [];

    const enrichedVendors = await Promise.all(vendors.map(async (v) => {
      // Order counts & revenue
      const stats = await env.DB.prepare(`
        SELECT 
          COUNT(*) as totalOrders,
          SUM(CASE WHEN order_status = 'collected' THEN 1 ELSE 0 END) as completedOrders,
          SUM(CASE WHEN order_status IN ('confirmed', 'preparing', 'ready') THEN 1 ELSE 0 END) as activeOrders,
          SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) as cancelledOrders,
          COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as totalRevenue
        FROM food_orders
        WHERE vendor_id = ?
      `).bind(v.id).first();

      // Menu count and low stock count
      const menuStats = await env.DB.prepare(`
        SELECT 
          COUNT(*) as totalItems,
          SUM(CASE WHEN stock <= 10 THEN 1 ELSE 0 END) as lowStockCount,
          SUM(CASE WHEN is_available = 0 OR stock = 0 THEN 1 ELSE 0 END) as soldOutCount
        FROM food_menu_items
        WHERE vendor_id = ?
      `).bind(v.id).first();

      return {
        ...v,
        stats: {
          totalOrders: stats?.totalOrders || 0,
          completedOrders: stats?.completedOrders || 0,
          activeOrders: stats?.activeOrders || 0,
          cancelledOrders: stats?.cancelledOrders || 0,
          totalRevenue: stats?.totalRevenue || 0,
          totalMenuItems: menuStats?.totalItems || 0,
          lowStockCount: menuStats?.lowStockCount || 0,
          soldOutCount: menuStats?.soldOutCount || 0
        }
      };
    }));

    return successResponse({ vendors: enrichedVendors });
  } catch (err) {
    console.error('Admin Get Food Vendors Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to list food vendors', 500);
  }
}

// 3. Vendor Management: Get Single Vendor Details
export async function handleAdminGetFoodVendorById(request, env, context, vendorId) {
  try {
    await ensureFoodTables(env.DB);
    const vendor = await env.DB.prepare(`SELECT * FROM food_vendors WHERE id = ?`).bind(vendorId).first();
    if (!vendor) return errorResponse('NOT_FOUND', 'Vendor not found', 404);

    // Menu items
    const menuResult = await env.DB.prepare(`
      SELECT * FROM food_menu_items WHERE vendor_id = ? ORDER BY category_id ASC, name ASC
    `).bind(vendorId).all();

    // Recent orders
    const ordersResult = await env.DB.prepare(`
      SELECT id, order_number, token_number, student_name, student_phone, payment_method,
             payment_status, order_status, grand_total, created_at
      FROM food_orders
      WHERE vendor_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(vendorId).all();

    const orders = (ordersResult.results || []).map(o => ({
      ...o,
      student_phone: o.student_phone ? o.student_phone.replace(/(\d{2})\d{4}(\d{4})/, '$1****$2') : ''
    }));

    return successResponse({
      vendor,
      menu: menuResult.results || [],
      recentOrders: orders
    });
  } catch (err) {
    console.error('Admin Get Food Vendor Detail Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to get vendor details', 500);
  }
}

// 4. Vendor Management: Activate or Suspend Vendor
export async function handleAdminPatchFoodVendorStatus(request, env, context, vendorId) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { status, reason } = body;

    if (!['active', 'suspended'].includes(status)) {
      return errorResponse('BAD_REQUEST', 'Status must be active or suspended', 400);
    }

    const now = Date.now();
    const updateResult = await env.DB.prepare(`
      UPDATE food_vendors SET status = ?, updated_at = ? WHERE id = ?
    `).bind(status, now, vendorId).run();

    if (updateResult.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'Vendor not found', 404);
    }

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'vendor_status_update',
      'vendor',
      vendorId,
      { status },
      reason || `Vendor status updated to ${status}`
    );

    return successResponse({
      success: true,
      vendorId,
      status,
      message: `Vendor status successfully updated to ${status}`
    });
  } catch (err) {
    console.error('Admin Patch Food Vendor Status Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update vendor status', 500);
  }
}

// 5. Central Order Management (Paginated, Filtered)
export async function handleAdminGetFoodOrders(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = url.searchParams.get('vendorId');
    const status = url.searchParams.get('status');
    const paymentMethod = url.searchParams.get('paymentMethod');
    const paymentStatus = url.searchParams.get('paymentStatus');
    const search = url.searchParams.get('search');
    const dateRange = url.searchParams.get('dateRange'); // 'today', '7d', '30d', 'all'
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    let conditions = ['1=1'];
    let params = [];

    if (vendorId && vendorId !== 'all') {
      conditions.push('vendor_id = ?');
      params.push(vendorId);
    }

    if (status && status !== 'all') {
      conditions.push('order_status = ?');
      params.push(status);
    }

    if (paymentMethod && paymentMethod !== 'all') {
      conditions.push('payment_method = ?');
      params.push(paymentMethod);
    }

    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push('payment_status = ?');
      params.push(paymentStatus);
    }

    if (dateRange === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      conditions.push('created_at >= ?');
      params.push(today.getTime());
    } else if (dateRange === '7d') {
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      conditions.push('created_at >= ?');
      params.push(sevenDaysAgo);
    } else if (dateRange === '30d') {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      conditions.push('created_at >= ?');
      params.push(thirtyDaysAgo);
    }

    if (search && search.trim().length > 0) {
      const term = `%${search.trim()}%`;
      conditions.push('(order_number LIKE ? OR token_number LIKE ? OR student_name LIKE ? OR student_phone LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    // Count
    const countSql = `SELECT COUNT(*) as total FROM food_orders WHERE ${whereClause}`;
    const countRow = await env.DB.prepare(countSql).bind(...params).first();
    const total = countRow?.total || 0;

    // Aggregate totals for the filtered set
    const aggregateSql = `
      SELECT 
        COALESCE(SUM(grand_total), 0) as totalValue,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as paidValue
      FROM food_orders 
      WHERE ${whereClause}
    `;
    const aggRow = await env.DB.prepare(aggregateSql).bind(...params).first();

    // Rows
    const dataSql = `
      SELECT id, order_number, token_number, student_id, student_name, student_phone,
             vendor_id, vendor_name, counter_location, payment_method, payment_status,
             order_status, subtotal, discount, grand_total, created_at, updated_at, collected_at
      FROM food_orders
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await env.DB.prepare(dataSql).bind(...params, limit, offset).all();

    // Attach order items summary
    const orders = await Promise.all((rows.results || []).map(async (o) => {
      const items = await env.DB.prepare(`
        SELECT product_name, quantity, unit_price, item_total, cooking_notes
        FROM food_order_items
        WHERE order_id = ?
      `).bind(o.id).all();

      return {
        ...o,
        student_phone: o.student_phone ? o.student_phone.replace(/(\d{2})\d{4}(\d{4})/, '$1****$2') : '',
        items: items.results || []
      };
    }));

    return successResponse({
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1
      },
      metrics: {
        totalFilteredValue: aggRow?.totalValue || 0,
        paidFilteredValue: aggRow?.paidValue || 0
      }
    });
  } catch (err) {
    console.error('Admin Get Food Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food orders', 500);
  }
}

// 6. Get Single Order Detail
export async function handleAdminGetFoodOrderById(request, env, context, orderId) {
  try {
    await ensureFoodTables(env.DB);
    const order = await env.DB.prepare(`SELECT * FROM food_orders WHERE id = ?`).bind(orderId).first();
    if (!order) return errorResponse('NOT_FOUND', 'Order not found', 404);

    const items = await env.DB.prepare(`SELECT * FROM food_order_items WHERE order_id = ?`).bind(orderId).all();

    return successResponse({
      order: {
        ...order,
        items: items.results || []
      }
    });
  } catch (err) {
    console.error('Admin Get Single Food Order Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food order details', 500);
  }
}

// 7. Admin Cancel Food Order (with Automatic Stock Restoral)
export async function handleAdminCancelFoodOrder(request, env, context, orderId) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { reason } = body;

    const order = await env.DB.prepare(`SELECT * FROM food_orders WHERE id = ?`).bind(orderId).first();
    if (!order) return errorResponse('NOT_FOUND', 'Order not found', 404);

    if (order.order_status === 'cancelled') {
      return errorResponse('CONFLICT', 'Order is already cancelled', 409);
    }
    if (order.order_status === 'collected') {
      return errorResponse('CONFLICT', 'Cannot cancel an order that has already been collected', 409);
    }

    const now = Date.now();
    const statements = [
      env.DB.prepare(`
        UPDATE food_orders 
        SET order_status = 'cancelled', updated_at = ?
        WHERE id = ?
      `).bind(now, orderId)
    ];

    // Restore stock for all items
    const orderItems = await env.DB.prepare(`
      SELECT product_id, quantity FROM food_order_items WHERE order_id = ?
    `).bind(orderId).all();

    for (const item of (orderItems.results || [])) {
      statements.push(
        env.DB.prepare(`
          UPDATE food_menu_items 
          SET stock = stock + ?, is_available = 1, updated_at = ?
          WHERE id = ?
        `).bind(item.quantity, now, item.product_id)
      );

      const logId = `inv_log_${crypto.randomUUID().replace(/-/g, '')}`;
      statements.push(
        env.DB.prepare(`
          INSERT INTO food_inventory_logs (id, vendor_id, product_id, change_amount, new_stock, reason, created_at)
          SELECT ?, ?, ?, ?, stock, ?, ? FROM food_menu_items WHERE id = ?
        `).bind(logId, order.vendor_id, item.product_id, item.quantity, `Restored via Admin Cancellation: ${reason || 'Admin Intervention'}`, now, item.product_id)
      );
    }

    await env.DB.batch(statements);

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'order_cancellation',
      'order',
      orderId,
      { orderNumber: order.order_number, vendorId: order.vendor_id, grandTotal: order.grand_total },
      reason || 'Administrative order cancellation'
    );

    return successResponse({
      success: true,
      orderId,
      orderNumber: order.order_number,
      status: 'cancelled',
      message: 'Order cancelled and stock restored successfully'
    });
  } catch (err) {
    console.error('Admin Cancel Order Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to cancel order', 500);
  }
}

// 8. Admin Status Override
export async function handleAdminPatchFoodOrderStatus(request, env, context, orderId) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { orderStatus, paymentStatus, reason } = body;

    const order = await env.DB.prepare(`SELECT * FROM food_orders WHERE id = ?`).bind(orderId).first();
    if (!order) return errorResponse('NOT_FOUND', 'Order not found', 404);

    const now = Date.now();
    const newOrderStatus = orderStatus || order.order_status;
    const newPaymentStatus = paymentStatus || order.payment_status;
    const collectedAt = (newOrderStatus === 'collected' && !order.collected_at) ? now : order.collected_at;

    await env.DB.prepare(`
      UPDATE food_orders 
      SET order_status = ?, payment_status = ?, collected_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(newOrderStatus, newPaymentStatus, collectedAt, now, orderId).run();

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'order_status_override',
      'order',
      orderId,
      { previousStatus: order.order_status, newOrderStatus, previousPaymentStatus: order.payment_status, newPaymentStatus },
      reason || 'Admin manual status intervention'
    );

    return successResponse({
      success: true,
      orderId,
      orderStatus: newOrderStatus,
      paymentStatus: newPaymentStatus
    });
  } catch (err) {
    console.error('Admin Patch Order Status Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update order status', 500);
  }
}

// 9. Payment Reconciliation Module
export async function handleAdminGetFoodReconciliation(request, env, context) {
  try {
    await ensureFoodTables(env.DB);

    // Global Payment Breakdown
    const totals = await env.DB.prepare(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_method = 'ONLINE_UPI' AND payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as onlinePaidTotal,
        COALESCE(SUM(CASE WHEN payment_method = 'ONLINE_UPI' AND payment_status = 'paid' THEN 1 ELSE 0 END), 0) as onlinePaidCount,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as cashCollectedTotal,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'paid' THEN 1 ELSE 0 END), 0) as cashCollectedCount,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'pending' AND order_status != 'cancelled' THEN grand_total ELSE 0 END), 0) as cashPendingTotal,
        COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'pending' AND order_status != 'cancelled' THEN 1 ELSE 0 END), 0) as cashPendingCount,
        COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN grand_total ELSE 0 END), 0) as refundedTotal,
        COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN 1 ELSE 0 END), 0) as refundedCount,
        COALESCE(SUM(CASE WHEN payment_status = 'failed' THEN grand_total ELSE 0 END), 0) as failedTotal,
        COALESCE(SUM(CASE WHEN payment_status = 'failed' THEN 1 ELSE 0 END), 0) as failedCount
      FROM food_orders
    `).first();

    // Per-Vendor Settlement Position
    const vendors = await env.DB.prepare(`SELECT * FROM food_vendors`).all();
    const vendorSettlements = await Promise.all((vendors.results || []).map(async (v) => {
      const vStats = await env.DB.prepare(`
        SELECT 
          COALESCE(SUM(CASE WHEN payment_method = 'ONLINE_UPI' AND payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as onlineCollected,
          COALESCE(SUM(CASE WHEN payment_method = 'CASH_AT_COUNTER' AND payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as cashCollected,
          COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN grand_total ELSE 0 END), 0) as totalGrossSales,
          COUNT(*) as totalOrders
        FROM food_orders
        WHERE vendor_id = ? AND order_status != 'cancelled'
      `).bind(v.id).first();

      const settledResult = await env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as totalSettled
        FROM food_settlements
        WHERE vendor_id = ?
      `).bind(v.id).first();

      const totalGross = vStats?.totalGrossSales || 0;
      const onlineCollected = vStats?.onlineCollected || 0;
      const cashHeldByVendor = vStats?.cashCollected || 0;
      const totalSettledToDate = settledResult?.totalSettled || 0;

      // Net amount owed by platform to vendor for Online UPI payments
      const netPayable = Math.max(0, onlineCollected - totalSettledToDate);

      return {
        vendorId: v.id,
        vendorName: v.name,
        counterLocation: v.counter_location,
        status: v.status,
        totalOrders: vStats?.totalOrders || 0,
        totalGrossSales: totalGross,
        onlineCollectedByPlatform: onlineCollected,
        cashCollectedByVendor: cashHeldByVendor,
        totalSettledToDate,
        netPayableToVendor: netPayable
      };
    }));

    // Recent Settlements History
    const settlementsHistory = await env.DB.prepare(`
      SELECT s.*, v.name as vendor_name
      FROM food_settlements s
      LEFT JOIN food_vendors v ON s.vendor_id = v.id
      ORDER BY s.created_at DESC
      LIMIT 20
    `).all();

    return successResponse({
      totals: {
        onlinePaidTotal: totals?.onlinePaidTotal || 0,
        onlinePaidCount: totals?.onlinePaidCount || 0,
        cashCollectedTotal: totals?.cashCollectedTotal || 0,
        cashCollectedCount: totals?.cashCollectedCount || 0,
        cashPendingTotal: totals?.cashPendingTotal || 0,
        cashPendingCount: totals?.cashPendingCount || 0,
        refundedTotal: totals?.refundedTotal || 0,
        refundedCount: totals?.refundedCount || 0,
        failedTotal: totals?.failedTotal || 0,
        failedCount: totals?.failedCount || 0,
        actualVerifiedRevenue: (totals?.onlinePaidTotal || 0) + (totals?.cashCollectedTotal || 0)
      },
      vendorPositions: vendorSettlements,
      settlementHistory: settlementsHistory.results || []
    });
  } catch (err) {
    console.error('Admin Food Reconciliation Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve reconciliation data', 500);
  }
}

// 10. Record Vendor Settlement Payout
export async function handleAdminPostFoodSettlement(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { vendorId, amount, orderCount, referenceId, notes } = body;

    if (!vendorId || !amount || amount <= 0) {
      return errorResponse('BAD_REQUEST', 'vendorId and a positive amount are required', 400);
    }

    const id = `stl_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO food_settlements (
        id, vendor_id, amount, order_count, status, reference_id, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, 'settled', ?, ?, ?, ?)
    `).bind(
      id,
      vendorId,
      parseFloat(amount),
      parseInt(orderCount || '0', 10),
      referenceId || `TXN-${Date.now()}`,
      notes || 'Scheduled vendor payout',
      context.admin?.email || 'admin@blintzy.com',
      now
    ).run();

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'vendor_settlement_recorded',
      'settlement',
      id,
      { vendorId, amount, referenceId },
      notes || 'Vendor settlement payout recorded'
    );

    return successResponse({
      success: true,
      settlementId: id,
      amount,
      message: 'Settlement record created successfully'
    });
  } catch (err) {
    console.error('Admin Post Settlement Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to record vendor settlement', 500);
  }
}

// 11. Central Food Analytics
export async function handleAdminGetFoodAnalytics(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '14', 10);
    const rangeStart = Date.now() - (days * 24 * 60 * 60 * 1000);

    // 1. Daily order trend
    const ordersResult = await env.DB.prepare(`
      SELECT created_at, grand_total, order_status, payment_method, vendor_id
      FROM food_orders
      WHERE created_at >= ?
      ORDER BY created_at ASC
    `).bind(rangeStart).all();

    const orders = ordersResult.results || [];
    const dailyMap = {};

    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStart + (i * 24 * 60 * 60 * 1000));
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = { date: key, orders: 0, revenue: 0, completed: 0, cancelled: 0 };
    }

    orders.forEach(o => {
      const d = new Date(o.created_at).toISOString().split('T')[0];
      if (!dailyMap[d]) {
        dailyMap[d] = { date: d, orders: 0, revenue: 0, completed: 0, cancelled: 0 };
      }
      dailyMap[d].orders += 1;
      if (o.order_status === 'collected') dailyMap[d].completed += 1;
      if (o.order_status === 'cancelled') dailyMap[d].cancelled += 1;
      if (o.order_status !== 'cancelled') dailyMap[d].revenue += o.grand_total;
    });

    const dailyTrend = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // 2. Vendor Comparison
    const vendorComparison = await env.DB.prepare(`
      SELECT 
        vendor_id, vendor_name,
        COUNT(*) as totalOrders,
        COALESCE(SUM(CASE WHEN order_status != 'cancelled' THEN grand_total ELSE 0 END), 0) as totalRevenue,
        COALESCE(AVG(CASE WHEN order_status != 'cancelled' THEN grand_total ELSE NULL END), 0) as averageTicket,
        SUM(CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END) as cancelledOrders
      FROM food_orders
      WHERE created_at >= ?
      GROUP BY vendor_id
    `).bind(rangeStart).all();

    // 3. Best Selling Products (Top 8)
    const bestSellers = await env.DB.prepare(`
      SELECT 
        i.product_id, i.product_name, i.category_id, i.dietary,
        SUM(i.quantity) as totalUnitsSold,
        SUM(i.item_total) as totalSales
      FROM food_order_items i
      JOIN food_orders o ON i.order_id = o.id
      WHERE o.created_at >= ? AND o.order_status != 'cancelled'
      GROUP BY i.product_id
      ORDER BY totalUnitsSold DESC
      LIMIT 8
    `).bind(rangeStart).all();

    // 4. Category Performance
    const categoryStats = await env.DB.prepare(`
      SELECT 
        COALESCE(i.category_id, 'Other') as category,
        SUM(i.quantity) as unitsSold,
        SUM(i.item_total) as categoryRevenue
      FROM food_order_items i
      JOIN food_orders o ON i.order_id = o.id
      WHERE o.created_at >= ? AND o.order_status != 'cancelled'
      GROUP BY i.category_id
      ORDER BY categoryRevenue DESC
    `).bind(rangeStart).all();

    // 5. Payment Method Breakdown
    const paymentMethods = await env.DB.prepare(`
      SELECT 
        payment_method,
        COUNT(*) as count,
        COALESCE(SUM(grand_total), 0) as totalValue
      FROM food_orders
      WHERE created_at >= ? AND order_status != 'cancelled'
      GROUP BY payment_method
    `).bind(rangeStart).all();

    // 6. Cancellation Rate
    const totalOrdersCount = orders.length;
    const cancelledCount = orders.filter(o => o.order_status === 'cancelled').length;
    const cancellationRate = totalOrdersCount > 0 ? ((cancelledCount / totalOrdersCount) * 100).toFixed(1) : 0;

    return successResponse({
      timeframeDays: days,
      summary: {
        totalOrders: totalOrdersCount,
        totalRevenue: orders.filter(o => o.order_status !== 'cancelled').reduce((acc, o) => acc + o.grand_total, 0),
        cancellationRate: `${cancellationRate}%`,
        cancelledCount
      },
      dailyTrend,
      vendorComparison: vendorComparison.results || [],
      bestSellers: bestSellers.results || [],
      categoryStats: categoryStats.results || [],
      paymentMethods: paymentMethods.results || []
    });
  } catch (err) {
    console.error('Admin Food Analytics Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food analytics', 500);
  }
}

// 12. Central Inventory Oversight
export async function handleAdminGetFoodInventory(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = url.searchParams.get('vendorId');

    let conditions = ['1=1'];
    let params = [];
    if (vendorId && vendorId !== 'all') {
      conditions.push('m.vendor_id = ?');
      params.push(vendorId);
    }

    const whereClause = conditions.join(' AND ');

    const itemsResult = await env.DB.prepare(`
      SELECT m.*, v.name as vendor_name, v.counter_location
      FROM food_menu_items m
      LEFT JOIN food_vendors v ON m.vendor_id = v.id
      WHERE ${whereClause}
      ORDER BY m.stock ASC, m.name ASC
    `).bind(...params).all();

    const items = itemsResult.results || [];
    const lowStockCount = items.filter(i => i.stock <= 10).length;
    const soldOutCount = items.filter(i => i.stock === 0 || i.is_available === 0).length;

    return successResponse({
      items,
      metrics: {
        totalItems: items.length,
        lowStockCount,
        soldOutCount
      }
    });
  } catch (err) {
    console.error('Admin Get Food Inventory Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to get inventory overview', 500);
  }
}

// 13. Inventory Audit Logs
export async function handleAdminGetFoodInventoryLogs(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '30', 10)));

    const logsResult = await env.DB.prepare(`
      SELECT l.*, m.name as product_name, v.name as vendor_name
      FROM food_inventory_logs l
      LEFT JOIN food_menu_items m ON l.product_id = m.id
      LEFT JOIN food_vendors v ON l.vendor_id = v.id
      ORDER BY l.created_at DESC
      LIMIT ?
    `).bind(limit).all();

    return successResponse({ logs: logsResult.results || [] });
  } catch (err) {
    console.error('Admin Get Inventory Logs Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve inventory logs', 500);
  }
}

// 14. Admin Adjust Inventory Stock (with Mandatory Audit Reason)
export async function handleAdminAdjustFoodInventory(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { productId, newStock, isAvailable, reason } = body;

    if (!productId || newStock === undefined || !reason || reason.trim().length === 0) {
      return errorResponse('BAD_REQUEST', 'productId, newStock, and an explicit reason are mandatory for admin adjustments', 400);
    }

    const item = await env.DB.prepare(`SELECT * FROM food_menu_items WHERE id = ?`).bind(productId).first();
    if (!item) return errorResponse('NOT_FOUND', 'Item not found', 404);

    const stockNum = Math.max(0, parseInt(newStock, 10));
    const availNum = typeof isAvailable === 'boolean' ? (isAvailable ? 1 : 0) : (stockNum > 0 ? 1 : 0);
    const now = Date.now();

    await env.DB.prepare(`
      UPDATE food_menu_items 
      SET stock = ?, is_available = ?, updated_at = ?
      WHERE id = ?
    `).bind(stockNum, availNum, now, productId).run();

    const diff = stockNum - item.stock;
    const logId = `inv_adj_${crypto.randomUUID().replace(/-/g, '')}`;
    await env.DB.prepare(`
      INSERT INTO food_inventory_logs (id, vendor_id, product_id, change_amount, new_stock, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(logId, item.vendor_id, productId, diff, stockNum, `Admin Adjustment: ${reason.trim()}`, now).run();

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'inventory_adjustment',
      'product',
      productId,
      { previousStock: item.stock, newStock: stockNum, diff, isAvailable: Boolean(availNum) },
      reason.trim()
    );

    return successResponse({
      success: true,
      productId,
      newStock: stockNum,
      isAvailable: Boolean(availNum),
      message: 'Stock updated and audit log recorded successfully'
    });
  } catch (err) {
    console.error('Admin Adjust Food Inventory Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to adjust inventory', 500);
  }
}

// 15. Admin Audit Logs
export async function handleAdminGetFoodAuditLogs(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10)));

    const logsResult = await env.DB.prepare(`
      SELECT * FROM food_admin_audit_logs ORDER BY created_at DESC LIMIT ?
    `).bind(limit).all();

    return successResponse({ logs: logsResult.results || [] });
  } catch (err) {
    console.error('Admin Get Food Audit Logs Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food audit logs', 500);
  }
}



/**
 * ============================================================================
 * STEP 11: ADMIN VENDOR ONBOARDING APPROVALS & MANAGEMENT
 * ============================================================================
 */

/**
 * 16. Get Vendor Onboarding Applications
 * GET /api/admin/food/vendors/applications
 */
export async function handleAdminGetVendorApplications(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'all';

    let sql = `SELECT * FROM food_vendors`;
    const params = [];
    if (statusFilter !== 'all') {
      sql += ` WHERE onboarding_status = ? OR status = ?`;
      params.push(statusFilter, statusFilter);
    }
    sql += ` ORDER BY created_at DESC`;

    const vendorsResult = await env.DB.prepare(sql).bind(...params).all();
    const vendors = vendorsResult.results || [];

    const enriched = await Promise.all(vendors.map(async (v) => {
      const isMess = v.vendor_type === 'mess' || v.id.includes('mess');

      let menuCount = 0;
      if (isMess) {
        const sched = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_mess_schedules WHERE vendor_id = ?`).bind(v.id).first();
        menuCount = sched?.cnt || 0;
      } else {
        const prods = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_menu_items WHERE vendor_id = ?`).bind(v.id).first();
        menuCount = prods?.cnt || 0;
      }

      const staffResult = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_vendor_staff WHERE vendor_id = ?`).bind(v.id).first();
      const staffCount = staffResult?.cnt || 0;

      const profileCompleted = Boolean(v.name && v.counter_location && v.contact);
      const menuCompleted = menuCount > 0;
      const staffCompleted = staffCount >= 1;
      const paymentCompleted = Boolean(v.payment_config && v.payment_config.length > 5);

      const checklist = {
        profileCompleted,
        menuCompleted,
        staffCompleted,
        paymentCompleted,
        pickupTested: Boolean(v.pickup_tested === 1),
        adminApproved: v.onboarding_status === 'approved'
      };

      const score = [
        profileCompleted,
        menuCompleted,
        staffCompleted,
        paymentCompleted,
        v.pickup_tested === 1,
        v.onboarding_status === 'approved'
      ].filter(Boolean).length;

      const progress = Math.round((score / 6) * 100);

      return {
        ...v,
        menuCount,
        staffCount,
        progress,
        checklist
      };
    }));

    return successResponse({ applications: enriched });
  } catch (err) {
    console.error('Admin Get Vendor Applications Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve vendor applications', 500);
  }
}

/**
 * 17. Approve Vendor Onboarding
 * POST /api/admin/food/vendors/:id/approve
 */
export async function handleAdminApproveVendor(request, env, context, vendorId) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const { notes } = body;

    const vendor = await env.DB.prepare(`SELECT * FROM food_vendors WHERE id = ?`).bind(vendorId).first();
    if (!vendor) return errorResponse('NOT_FOUND', 'Vendor not found', 404);

    const now = Date.now();
    const adminId = context.admin?.id || 'admin_super';

    await env.DB.prepare(`
      UPDATE food_vendors
      SET status = 'active',
          onboarding_status = 'approved',
          approved_by = ?,
          approved_at = ?,
          rejection_reason = NULL,
          updated_at = ?
      WHERE id = ?
    `).bind(adminId, now, now, vendorId).run();

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'vendor_onboarding_approved',
      'vendor',
      vendorId,
      { previousStatus: vendor.status, previousOnboardingStatus: vendor.onboarding_status },
      notes || 'Vendor onboarding approved and licensed for campus operations'
    );

    return successResponse({
      success: true,
      vendorId,
      status: 'active',
      onboarding_status: 'approved',
      approved_by: adminId,
      approved_at: now,
      message: `${vendor.name} has been approved and activated.`
    });
  } catch (err) {
    console.error('Admin Approve Vendor Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to approve vendor', 500);
  }
}

/**
 * 18. Reject Vendor Onboarding
 * POST /api/admin/food/vendors/:id/reject
 */
export async function handleAdminRejectVendor(request, env, context, vendorId) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const { reason } = body;

    if (!reason || !reason.trim()) {
      return errorResponse('BAD_REQUEST', 'Rejection reason is required.', 400);
    }

    const vendor = await env.DB.prepare(`SELECT * FROM food_vendors WHERE id = ?`).bind(vendorId).first();
    if (!vendor) return errorResponse('NOT_FOUND', 'Vendor not found', 404);

    const now = Date.now();
    const adminId = context.admin?.id || 'admin_super';

    await env.DB.prepare(`
      UPDATE food_vendors
      SET status = 'inactive',
          onboarding_status = 'rejected',
          rejection_reason = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(reason.trim(), now, vendorId).run();

    await logAdminFoodAudit(
      env.DB,
      context.admin,
      'vendor_onboarding_rejected',
      'vendor',
      vendorId,
      { previousStatus: vendor.status, previousOnboardingStatus: vendor.onboarding_status },
      `Vendor onboarding rejected: ${reason.trim()}`
    );

    return successResponse({
      success: true,
      vendorId,
      status: 'inactive',
      onboarding_status: 'rejected',
      rejection_reason: reason.trim(),
      message: `Vendor application rejected.`
    });
  } catch (err) {
    console.error('Admin Reject Vendor Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to reject vendor', 500);
  }
}
