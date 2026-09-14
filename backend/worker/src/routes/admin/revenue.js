import { errorResponse, successResponse } from '../../utils/response.js';

export async function handleGetVendorBlintzyPricing(request, env) {
  try {
    const rules = await env.DB.prepare(`SELECT * FROM vendor_blintzy_pricing ORDER BY created_at DESC`).all();
    return successResponse({ pricing_rules: rules.results });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor pricing rules', 500);
  }
}

export async function handlePostVendorBlintzyPricing(request, env, context) {
  try {
    const body = await request.json();
    const { service_type, pricing_method, min_pages, max_pages, customer_unit_price, vendor_unit_price, blintzy_unit_earning, is_active, notes } = body;
    
    if (!service_type || customer_unit_price < 0 || vendor_unit_price < 0 || blintzy_unit_earning < 0) {
      return errorResponse('BAD_REQUEST', 'Invalid pricing data', 400);
    }
    
    const id = crypto.randomUUID();
    const now = Date.now();
    
    await env.DB.prepare(`
      INSERT INTO vendor_blintzy_pricing (
        id, service_type, pricing_method, min_pages, max_pages, 
        customer_unit_price, vendor_unit_price, blintzy_unit_earning, 
        is_active, created_at, updated_at, created_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, service_type, pricing_method || 'per_page', min_pages || null, max_pages || null,
      customer_unit_price, vendor_unit_price, blintzy_unit_earning,
      is_active === undefined ? 1 : is_active, now, now, context.adminId, notes || null
    ).run();

    return successResponse({ message: 'Pricing rule created successfully', id });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to create vendor pricing rule', 500);
  }
}

export async function handlePutVendorBlintzyPricing(request, env, context, id) {
  try {
    const body = await request.json();
    const { service_type, pricing_method, min_pages, max_pages, customer_unit_price, vendor_unit_price, blintzy_unit_earning, is_active, notes } = body;
    
    await env.DB.prepare(`
      UPDATE vendor_blintzy_pricing 
      SET service_type = ?, pricing_method = ?, min_pages = ?, max_pages = ?, 
          customer_unit_price = ?, vendor_unit_price = ?, blintzy_unit_earning = ?, 
          is_active = ?, updated_at = ?, notes = ?
      WHERE id = ?
    `).bind(
      service_type, pricing_method, min_pages || null, max_pages || null,
      customer_unit_price, vendor_unit_price, blintzy_unit_earning,
      is_active, Date.now(), notes || null, id
    ).run();

    return successResponse({ message: 'Pricing rule updated successfully' });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to update vendor pricing rule', 500);
  }
}

export async function handleDeleteVendorBlintzyPricing(request, env, context, id) {
  try {
    await env.DB.prepare(`DELETE FROM vendor_blintzy_pricing WHERE id = ?`).bind(id).run();
    return successResponse({ message: 'Pricing rule deleted successfully' });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to delete vendor pricing rule', 500);
  }
}

export async function handleGetEarningsSummary(request, env) {
  try {
    const url = new URL(request.url);
    const range = url.searchParams.get('range') || 'all'; 
    let dateFilter = '';
    const now = new Date();
    
    if (range === 'today') {
       now.setHours(0,0,0,0);
       dateFilter = `AND created_at >= ${now.getTime()}`;
    } else if (range === 'week') {
       now.setDate(now.getDate() - 7);
       dateFilter = `AND created_at >= ${now.getTime()}`;
    } else if (range === 'month') {
       now.setMonth(now.getMonth() - 1);
       dateFilter = `AND created_at >= ${now.getTime()}`;
    }
    
    const summary = await env.DB.prepare(`
      SELECT 
        COUNT(internal_id) as total_orders,
        SUM(grand_total) as customer_revenue,
        SUM(vendor_payable_total) as vendor_cost,
        SUM(blintzy_gross_earning) as blintzy_gross,
        SUM(payment_gateway_fee) as gateway_fees,
        SUM(refunds_total) as refunds,
        SUM(blintzy_net_earning) as blintzy_net
      FROM orders
      WHERE payment_status = 'paid' ${dateFilter}
    `).first();
    
    return successResponse({ summary });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch earnings summary', 500);
  }
}

export async function handleGetEarningsOrders(request, env) {
  try {
    const orders = await env.DB.prepare(`
      SELECT 
        internal_id, public_id, created_at, grand_total, vendor_payable_total, 
        blintzy_gross_earning, payment_gateway_fee, refunds_total, blintzy_net_earning,
        status, payment_status, revenue_status
      FROM orders
      WHERE payment_status = 'paid'
      ORDER BY created_at DESC
    `).all();
    
    return successResponse({ orders: orders.results });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch revenue orders', 500);
  }
}

export async function handleGetOrderRevenue(request, env, context, id) {
  try {
    const order = await env.DB.prepare(`
      SELECT public_id, grand_total, vendor_payable_total, blintzy_gross_earning, payment_gateway_fee, refunds_total, blintzy_net_earning, created_at
      FROM orders WHERE public_id = ?
    `).bind(id).first();
    
    if (!order) return errorResponse('NOT_FOUND', 'Order not found', 404);

    const items = await env.DB.prepare(`
      SELECT item_type, copies, page_count, customer_total, vendor_total, blintzy_total_earning, pricing_rule_snapshot
      FROM order_items
      WHERE order_id = (SELECT internal_id FROM orders WHERE public_id = ?)
    `).bind(id).all();

    return successResponse({ order, items: items.results });
  } catch(err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch order revenue', 500);
  }
}
