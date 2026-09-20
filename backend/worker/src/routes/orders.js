import { errorResponse, successResponse } from '../utils/response.js';
import { calculateManualPrice, calculateOrderTotal } from '../services/pricingService.js';
import { calculateEstimatedDelivery } from '../services/deliveryService.js';

// Generate BLZ-[YEAR]-[BRANCH_CODE]-[SEQ]
export async function generateOrderId(db, branchCode) {
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

    // Fetch binding pricing rules
    const rulesResult = await env.DB.prepare(`SELECT id, min_pages, max_pages, price, is_active FROM binding_pricing_rules`).all();
    const bindingRules = rulesResult.results || [];

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

      let requiresPageVerification = false;

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
        let doc = await env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).bind(documentId).first();
        if (!doc) {
          // Create a pending document stub so checkout can proceed seamlessly
          await env.DB.prepare(`
            INSERT INTO documents (
              id, student_id, document_type, original_filename, file_type,
              file_size, page_count, r2_object_key, scan_status, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            documentId, studentId, item.serviceType, 'pending_upload', 'application/pdf',
            0, item.pages || 0, `pending_${documentId}`, 'pending', Date.now(), Date.now() + (3 * 24 * 60 * 60 * 1000)
          ).run();
          
          pages = item.pages || 0;
        } else {
          if (doc.student_id !== studentId) return errorResponse('FORBIDDEN', `Document ${documentId} does not belong to you`, 403);
          pages = doc.page_count;
        }
      } else if (item.serviceType === 'code_tantra_files') {
        documentId = item.documentId || item.referenceId;
        const cf = await env.DB.prepare(`SELECT * FROM custom_files WHERE id = ? AND is_deleted = 0`).bind(documentId).first();
        if (!cf) return errorResponse('NOT_FOUND', `Custom file ${documentId} not found`, 404);
        
        pages = cf.page_count; // Enforce DB value, don't trust frontend payload
        pricingMode = 'settings';
        requiresPageVerification = true;
      } else {
        return errorResponse('BAD_REQUEST', `Invalid serviceType ${item.serviceType}`, 400);
      }

      const pricing = calculateManualPrice(pages, item.printOptions, pricingSettings, priceOverride, bindingRules);
      
      if (pricing.bindingError) {
        return errorResponse('BAD_REQUEST', pricing.bindingError, 400);
      }

      itemSubtotals.push(pricing.subtotal);

      validatedItems.push({
        item_type: item.serviceType,
        manual_id: manualId,
        document_id: item.serviceType === 'code_tantra_files' ? null : documentId,
        custom_file_id: item.serviceType === 'code_tantra_files' ? documentId : null,
        copies: item.printOptions.copies,
        page_count: pages,
        requires_page_verification: requiresPageVerification,
        paper_size: item.printOptions.paperSize || 'A4',
        print_type: item.printOptions.color ? 'color' : 'bw',
        print_side: item.printOptions.singleSided ? 'single' : 'double',
        color_mode: item.printOptions.color ? 1 : 0,
        binding_type: item.printOptions.bindingType || 'none',
        pricing_mode: pricingMode,
        printing_rate: pricing.printingRate,
        binding_rate: pricing.bindingRate,
        binding_rule_id: pricing.bindingRuleId,
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
      
      const nowTime = Date.now();

      if (!coupon || coupon.is_active !== 1) {
        return errorResponse('BAD_REQUEST', 'Invalid or inactive coupon code', 400);
      } else if (coupon.valid_until && coupon.valid_until < nowTime) {
        return errorResponse('BAD_REQUEST', 'Coupon has expired', 400);
      } else if (coupon.usage_limit && coupon.current_usage >= coupon.usage_limit) {
        return errorResponse('BAD_REQUEST', 'Coupon usage limit reached', 400);
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

    // 6. Generate Payment Attempt ID
    const paymentAttemptId = `pa_${crypto.randomUUID().replace(/-/g, '')}`;
    const nowMs = Date.now();
    
    const checkoutPayload = {
      items: validatedItems,
      deliveryDetails,
      couponCode: appliedCoupon,
      orderTotal,
      etaMs,
      branchCode,
      studentId
    };

    // 7. Insert into payment_attempts
    await env.DB.prepare(`
      INSERT INTO payment_attempts (
        id, user_id, checkout_payload, calculated_amount, currency, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'INR', 'created', ?, ?)
    `).bind(
      paymentAttemptId, studentId, JSON.stringify(checkoutPayload), orderTotal.grandTotal, nowMs, nowMs
    ).run();

    return successResponse({
      orderId: paymentAttemptId, // We return this so frontend can call /api/payments/create with it
      grandTotal: orderTotal.grandTotal,
      status: 'payment_pending'
    });

  } catch (err) {
    console.error('Create Payment Attempt Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to initialize checkout session', 500);
  }
}

export async function handleGetOrders(request, env, context) {
  try {
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const orders = await env.DB.prepare(`
      SELECT public_id, status, grand_total, created_at, estimated_delivery, order_type
      FROM orders
      WHERE student_id = ? AND status != 'payment_pending'
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

    const customFiles = await env.DB.prepare(`
      SELECT id, original_filename, stored_filename, file_size, upload_status, is_deleted
      FROM custom_files
      WHERE order_id = ?
    `).bind(order.internal_id).all();

    return successResponse({
      order,
      items: items.results,
      customFiles: customFiles.results
    });
  } catch (err) {
    return errorResponse('SERVER_ERROR', 'Failed to fetch order', 500);
  }
}
