import { errorResponse, successResponse } from '../utils/response.js';
import { calculateManualPrice, calculateOrderTotal } from '../services/pricingService.js';
import { calculateEstimatedDelivery } from '../services/deliveryService.js';

// Generate BLZ-[YEAR]-[BRANCH_CODE]-[SEQ]
async function generateOrderId(db, branchCode) {
  const yearStr = new Date().getFullYear().toString().slice(-2);
  const prefix = `BLZ-${yearStr}-${branchCode}`;
  
  // Update sequence safely using RETURNING
  const seqResult = await db.prepare(`
    INSERT INTO sequences (prefix_key, last_sequence)
    VALUES (?, 1)
    ON CONFLICT(prefix_key) DO UPDATE SET last_sequence = last_sequence + 1
    RETURNING last_sequence
  `).bind(prefix).first();
  
  const seqNum = seqResult.last_sequence;
  const paddedSeq = seqNum.toString().padStart(3, '0');
  
  return `${prefix}-${paddedSeq}`;
}

export async function handlePostOrder(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await request.json();
    const { items, deliveryDetails, couponCode } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse('BAD_REQUEST', 'Order must contain at least one item', 400);
    }

    // 1. Fetch student's branch code & academic info
    const studentData = await env.DB.prepare(`
      SELECT s.branch_id, s.study_year_id as academic_year_id, b.code as branch_code 
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE s.id = ?
    `).bind(studentId).first();

    if (!studentData) {
      return errorResponse('NOT_FOUND', 'Student profile not found. Please complete onboarding.', 404);
    }

    const branchCode = studentData.branch_code || '00';

    // 2. Fetch pricing and delivery settings
    const settingsResult = await env.DB.prepare(`SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('pricing_settings', 'delivery_settings', 'delivery_calendar')`).all();
    
    let pricingSettings = null;
    let deliverySettings = null;
    let deliveryCalendar = [];

    for (const row of settingsResult.results) {
        try {
            if (row.setting_key === 'pricing_settings') pricingSettings = JSON.parse(row.setting_value);
            if (row.setting_key === 'delivery_settings') deliverySettings = JSON.parse(row.setting_value);
            if (row.setting_key === 'delivery_calendar') deliveryCalendar = JSON.parse(row.setting_value);
        } catch(e) {}
    }

    const validatedItems = [];
    const itemSubtotals = [];

    // 3. Validate all items and calculate individual prices
    for (const item of items) {
      if (item.printOptions.copies < 1) {
        return errorResponse('BAD_REQUEST', 'Copies must be at least 1', 400);
      }
      if (item.printOptions.bindingType && !['spiral', 'none', 'softbound', 'hardbound'].includes(item.printOptions.bindingType)) {
        return errorResponse('BAD_REQUEST', 'Unsupported binding type', 400);
      }

      let pages = 0;
      let manualId = null;
      let documentId = null;
      let priceOverride = null;
      let pricingMode = 'settings';

      if (item.serviceType === 'manual') {
        manualId = item.manualId || item.referenceId;
        const manual = await env.DB.prepare(`SELECT * FROM manuals WHERE id = ?`).bind(manualId).first();
        if (!manual) return errorResponse('NOT_FOUND', `Manual ${manualId} not found`, 404);
        if (manual.stock < item.printOptions.copies) {
          return errorResponse('BAD_REQUEST', `Only ${manual.stock} copies of Manual ${manualId} are currently available.`, 400);
        }
        
        pages = manual.pages;
        pricingMode = manual.pricing_mode;
        priceOverride = manual.price_override;
      } else if (item.serviceType === 'hall_ticket' || item.serviceType === 'custom') {
        documentId = item.documentId || item.referenceId;
        const doc = await env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).bind(documentId).first();
        if (!doc) return errorResponse('NOT_FOUND', `Document ${documentId} not found`, 404);
        if (doc.student_id !== studentId) return errorResponse('FORBIDDEN', `Document ${documentId} does not belong to you`, 403);
        
        pages = doc.page_count;
      } else {
        return errorResponse('BAD_REQUEST', `Invalid serviceType ${item.serviceType}`, 400);
      }

      const pricing = calculateManualPrice(pages, item.printOptions, pricingSettings, priceOverride);
      itemSubtotals.push(pricing.subtotal);

      validatedItems.push({
        item_type: item.serviceType,
        manual_id: manualId,
        document_id: documentId,
        copies: item.printOptions.copies,
        page_count: pages,
        paper_size: item.printOptions.paperSize || 'A4',
        print_type: item.printOptions.color ? 'color' : 'bw',
        color_mode: item.printOptions.color ? 1 : 0,
        binding_type: item.printOptions.bindingType || 'none',
        pricing_mode: pricingMode,
        printing_rate: pricing.printingRate,
        binding_rate: pricing.bindingRate,
        base_price: pricing.unitPrice,
        printing_cost: pricing.printingCost,
        binding_cost: pricing.bindingCost,
        item_total: pricing.subtotal
      });
    }

    let couponDiscount = 0;
    let appliedCoupon = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
      const normalizedCode = couponCode.trim().toUpperCase();
      const coupon = await env.DB.prepare(`SELECT * FROM coupons WHERE code = ?`).bind(normalizedCode).first();
      
      if (!coupon || coupon.is_active !== 1) {
        return errorResponse('BAD_REQUEST', 'Invalid or inactive coupon code', 400);
      } else {
        couponDiscount = coupon.discount_amount;
        appliedCoupon = normalizedCode;
      }
    }

    // 4. Final Calculations
    // Note: deliveryMethod could be 'delivery' or 'pickup'
    const deliveryMethod = 'delivery'; // assume delivery for now unless passed in
    const orderTotal = calculateOrderTotal(itemSubtotals, deliveryMethod, pricingSettings, couponDiscount);
    
    // 5. Generate ETA
    const now = new Date();
    const etaMs = calculateEstimatedDelivery(now, deliverySettings, deliveryCalendar, studentData);

    // 6. Generate Order ID
    const publicOrderId = await generateOrderId(env.DB, branchCode);
    const internalOrderId = crypto.randomUUID();
    const nowMs = Date.now();

    // 7. Insert into D1 using batch transaction
    const stmts = [];
    
    // Decrement stock for manuals atomically
    for (const item of validatedItems) {
      if (item.item_type === 'manual') {
        stmts.push(env.DB.prepare(`
          UPDATE manuals
          SET stock = stock - ?
          WHERE id = ?
            AND CASE 
              WHEN stock >= ? THEN 1 
              ELSE json_extract('invalid_stock_decrement', '$') 
            END
        `).bind(item.copies, item.manual_id, item.copies));
      }
    }

    // Determine primary order_type based on first item
    const orderType = validatedItems[0].item_type;

    let deliveryBuilding = deliveryDetails?.building;
    let deliveryRoom = deliveryDetails?.roomNumber || deliveryDetails?.room;
    if (deliveryBuilding === undefined) deliveryBuilding = null;
    if (deliveryRoom === undefined) deliveryRoom = null;

    // Insert order
    stmts.push(env.DB.prepare(`
      INSERT INTO orders (
        internal_id, public_id, student_id, status, internal_status,
        order_type, delivery_type, delivery_building, delivery_room,
        platform_fee, gst, delivery_fee, discount, grand_total,
        estimated_delivery, created_at, updated_at, coupon_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      internalOrderId, publicOrderId, studentId, 'received', 'processing',
      orderType, 'classroom', deliveryBuilding, deliveryRoom,
      orderTotal.platformFee, 0, orderTotal.deliveryFee, orderTotal.couponDiscount, orderTotal.grandTotal,
      etaMs, nowMs, nowMs, appliedCoupon
    ));

    // Insert items
    for (const item of validatedItems) {
      const itemId = crypto.randomUUID();
      stmts.push(env.DB.prepare(`
        INSERT INTO order_items (
          id, order_id, item_type, manual_id, document_id, copies, page_count,
          paper_size, print_type, color_mode, binding_type, pricing_mode,
          printing_rate, binding_rate, base_price, printing_cost, binding_cost,
          item_total, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId, internalOrderId, item.item_type, item.manual_id, item.document_id,
        item.copies, item.page_count, item.paper_size, item.print_type, item.color_mode, 
        item.binding_type, item.pricing_mode, item.printing_rate, item.binding_rate,
        item.base_price, item.printing_cost, item.binding_cost, item.item_total, nowMs
      ));
      
      // If it's a document, link the document to this order
      if (item.document_id) {
          stmts.push(env.DB.prepare(`UPDATE documents SET order_id = ? WHERE id = ?`).bind(internalOrderId, item.document_id));
      }
    }

    try {
      await env.DB.batch(stmts);
    } catch (batchErr) {
      if (batchErr.message && batchErr.message.includes('malformed JSON')) {
        return errorResponse('CONFLICT', 'One or more items are out of stock or have insufficient quantity.', 409);
      }
      throw batchErr;
    }

    return successResponse({
      orderId: publicOrderId,
      grandTotal: orderTotal.grandTotal,
      status: 'received'
    });

  } catch (err) {
    console.error('Create Order Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create order', 500);
  }
}

export async function handleGetOrders(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const orders = await env.DB.prepare(`
      SELECT public_id, status, grand_total, created_at, estimated_delivery, order_type
      FROM orders
      WHERE student_id = ?
      ORDER BY created_at DESC
    `).bind(studentId).all();

    return successResponse({ orders: orders.results });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch orders', 500);
  }
}

export async function handleGetOrder(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (!match) return errorResponse('NOT_FOUND', 'Not found', 404);
    
    const publicId = match[1];

    const order = await env.DB.prepare(`
      SELECT o.*, 
             s.name as student_name, 
             s.roll_number, 
             s.phone as student_phone,
             b.name as branch_name,
             s.study_year_id as study_year,
             s.section,
             c.name as college
      FROM orders o
      LEFT JOIN students s ON o.student_id = s.id
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN colleges c ON s.college_id = c.id
      WHERE o.public_id = ? AND o.student_id = ?
    `).bind(publicId, studentId).first();

    if (!order) return errorResponse('NOT_FOUND', 'Order not found', 404);

    const items = await env.DB.prepare(`
      SELECT oi.*, m.title as manual_title, d.original_filename as document_filename
      FROM order_items oi
      LEFT JOIN manuals m ON oi.manual_id = m.id
      LEFT JOIN documents d ON oi.document_id = d.id
      WHERE oi.order_id = ?
    `).bind(order.internal_id).all();

    return successResponse({
      order,
      items: items.results
    });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch order', 500);
  }
}
