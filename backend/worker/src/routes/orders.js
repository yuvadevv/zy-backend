import { errorResponse, successResponse } from '../utils/response.js';

// Replicate pricing logic from frontend
const calculateManualPrice = (basePrice, pages, config) => {
  let costPerPage = 1.0; // Base cost for A4 B&W

  if (config.paperSize === 'letter') costPerPage += 0.5;
  if (config.color) costPerPage += 4.0;
  
  const totalPages = config.singleSided ? pages : Math.ceil(pages / 2);
  const printingCost = totalPages * costPerPage * config.copies;
  
  let bindingCost = 0;
  if (config.bindingType === 'spiral') {
    bindingCost = 30 * config.copies;
  }
  
  const deliveryCharge = 0;
  const totalBasePrice = basePrice * config.copies;
  
  return {
    basePrice: totalBasePrice,
    printingCost: Math.ceil(printingCost),
    bindingCost,
    deliveryCharge,
    total: totalBasePrice + Math.ceil(printingCost) + bindingCost + deliveryCharge,
  };
};

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
    const { items, deliveryDetails } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return errorResponse('BAD_REQUEST', 'Order must contain at least one item', 400);
    }

    // 1. Fetch student's branch code
    const studentData = await env.DB.prepare(`
      SELECT s.branch_id, b.code as branch_code 
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE s.id = ?
    `).bind(studentId).first();

    if (!studentData) {
      return errorResponse('NOT_FOUND', 'Student profile not found. Please complete onboarding.', 404);
    }

    const branchCode = studentData.branch_code || '00';

    let subtotal = 0;
    const validatedItems = [];

    // 2. Validate all items
    for (const item of items) {
      if (item.printOptions.copies < 1) {
        return errorResponse('BAD_REQUEST', 'Copies must be at least 1', 400);
      }
      if (item.printOptions.bindingType && item.printOptions.bindingType !== 'spiral' && item.printOptions.bindingType !== 'none') {
        return errorResponse('BAD_REQUEST', 'Unsupported binding type', 400);
      }

      let basePrice = 0;
      let pages = 0;
      let manualId = null;
      let documentId = null;

      if (item.serviceType === 'manual') {
        manualId = item.manualId;
        const manual = await env.DB.prepare(`SELECT * FROM manuals WHERE id = ?`).bind(manualId).first();
        if (!manual) return errorResponse('NOT_FOUND', `Manual ${manualId} not found`, 404);
        if (manual.availability_status !== 'available' && manual.availability_status !== 'in_stock') return errorResponse('BAD_REQUEST', `Manual ${manualId} is not available`, 400);
        
        basePrice = manual.base_price;
        pages = manual.pages;
      } else if (item.serviceType === 'hall_ticket' || item.serviceType === 'custom') {
        documentId = item.documentId;
        const doc = await env.DB.prepare(`SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`).bind(documentId).first();
        if (!doc) return errorResponse('NOT_FOUND', `Document ${documentId} not found`, 404);
        if (doc.student_id !== studentId) return errorResponse('FORBIDDEN', `Document ${documentId} does not belong to you`, 403);
        
        basePrice = 0;
        pages = doc.page_count;
      } else {
        return errorResponse('BAD_REQUEST', `Invalid serviceType ${item.serviceType}`, 400);
      }

      const pricing = calculateManualPrice(basePrice, pages, item.printOptions);
      subtotal += pricing.total;

      validatedItems.push({
        item_type: item.serviceType,
        manual_id: manualId,
        document_id: documentId,
        copies: item.printOptions.copies,
        page_count: pages,
        print_type: item.printOptions.color ? 'color' : 'bw',
        color_mode: item.printOptions.color ? 1 : 0,
        binding_type: item.printOptions.bindingType || 'none',
        base_price: pricing.basePrice,
        printing_cost: pricing.printingCost,
        binding_cost: pricing.bindingCost,
        item_total: pricing.total
      });
    }

    // 3. Final Calculations
    const deliveryCharge = 0; // FREE
    const platformFee = 0;
    const gst = 0;
    const discount = 0;
    const grandTotal = subtotal + deliveryCharge + platformFee + gst - discount;

    // 4. Generate Order ID
    const publicOrderId = await generateOrderId(env.DB, branchCode);
    const internalOrderId = crypto.randomUUID();
    const now = Date.now();

    // 5. Insert into D1 using batch transaction
    const stmts = [];
    
    // Insert order
    stmts.push(env.DB.prepare(`
      INSERT INTO orders (
        internal_id, public_id, student_id, status, internal_status,
        delivery_type, delivery_building, delivery_room,
        platform_fee, gst, delivery_fee, discount, grand_total,
        estimated_delivery, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      internalOrderId, publicOrderId, studentId, 'received', 'processing',
      'classroom', deliveryDetails?.building || null, deliveryDetails?.roomNumber || null,
      platformFee, gst, deliveryCharge, discount, grandTotal,
      now + (24 * 60 * 60 * 1000), now, now
    ));

    // Insert items
    for (const item of validatedItems) {
      const itemId = crypto.randomUUID();
      stmts.push(env.DB.prepare(`
        INSERT INTO order_items (
          id, order_id, item_type, manual_id, document_id, copies, page_count,
          print_type, color_mode, binding_type, base_price, printing_cost, binding_cost,
          item_total, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId, internalOrderId, item.item_type, item.manual_id, item.document_id,
        item.copies, item.page_count, item.print_type, item.color_mode, item.binding_type,
        item.base_price, item.printing_cost, item.binding_cost, item.item_total, now
      ));
    }

    await env.DB.batch(stmts);

    return successResponse({
      orderId: publicOrderId,
      grandTotal,
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
      SELECT public_id, status, grand_total, created_at, estimated_delivery
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
