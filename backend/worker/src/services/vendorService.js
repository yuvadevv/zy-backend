export const VALID_VENDOR_TRANSITIONS = {
  'received': ['printing'],
  'printing': ['binding', 'quality_check', 'packed'],
  'binding': ['quality_check', 'packed'],
  'quality_check': ['packed'],
  'packed': ['ready_for_pickup', 'out_for_delivery'],
  'ready_for_pickup': ['delivered'],
  'out_for_delivery': ['delivered']
};

export async function getVendorOrders(db, vendorId, { status, search, page = 1, limit = 25 }) {
  let query = `
    SELECT 
      o.public_id as orderId, 
      o.status as orderStatus, 
      o.grand_total as total, 
      o.created_at, 
      o.updated_at,
      s.name as studentName, 
      s.roll_number as rollNumber,
      b.name as branchName,
      o.delivery_room as classroom,
      p.status as paymentStatus
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
    WHERE o.vendor_id = ?
  `;
  
  const params = [vendorId];
  
  if (status && status !== 'all') {
    query += ` AND o.status = ?`;
    params.push(status);
  }
  
  if (search) {
    query += ` AND (o.public_id LIKE ? OR s.roll_number LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  
  query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, (page - 1) * limit);
  
  const stmt = db.prepare(query).bind(...params);
  const result = await stmt.all();
  
  let countQuery = `
    SELECT COUNT(*) as total 
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    WHERE o.vendor_id = ?
  `;
  const countParams = [vendorId];
  
  if (status && status !== 'all') {
    countQuery += ` AND o.status = ?`;
    countParams.push(status);
  }
  if (search) {
    countQuery += ` AND (o.public_id LIKE ? OR s.roll_number LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`);
  }
  
  const countStmt = db.prepare(countQuery).bind(...countParams);
  const countResult = await countStmt.first();
  
  return {
    orders: result.results,
    total: countResult.total,
    page,
    limit,
    totalPages: Math.ceil(countResult.total / limit)
  };
}

export async function getVendorOrderDetails(db, vendorId, publicOrderId) {
  const order = await db.prepare(`
    SELECT 
      o.public_id as orderId, 
      o.internal_id,
      o.status as orderStatus, 
      o.grand_total as total, 
      o.created_at,
      s.name as studentName, 
      s.roll_number as rollNumber, 
      b.name as branchName,
      o.delivery_room as classroom,
      p.status as paymentStatus,
      p.provider as paymentProvider
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
    WHERE o.public_id = ? AND o.vendor_id = ?
  `).bind(publicOrderId, vendorId).first();

  if (!order) return null;

  const items = await db.prepare(`
    SELECT 
      oi.item_type,
      oi.copies,
      oi.page_count,
      oi.print_type,
      oi.color_mode,
      oi.binding_type,
      m.title as manual_title, 
      d.original_filename as document_filename, 
      d.id as document_id
    FROM order_items oi
    LEFT JOIN manuals m ON oi.manual_id = m.id
    LEFT JOIN documents d ON oi.document_id = d.id
    WHERE oi.order_id = ?
  `).bind(order.internal_id).all();

  const { internal_id, ...cleanOrder } = order;

  return {
    order: cleanOrder,
    items: items.results
  };
}

export async function updateVendorOrderStatus(db, vendorId, publicOrderId, newStatus, currentStatus) {
  const order = await db.prepare(`SELECT internal_id, status FROM orders WHERE public_id = ? AND vendor_id = ?`).bind(publicOrderId, vendorId).first();
  if (!order) return { error: 'Order not found or unauthorized', status: 404 };

  const validNextStates = VALID_VENDOR_TRANSITIONS[order.status] || [];
  
  if (!validNextStates.includes(newStatus)) {
    return { error: `Invalid operational status transition from ${order.status} to ${newStatus}`, status: 400 };
  }

  const now = Date.now();
  
  // Use batch for atomic update + audit log
  const stmts = [];
  stmts.push(db.prepare(`
    UPDATE orders 
    SET status = ?, updated_at = ?
    WHERE internal_id = ? AND status = ? AND vendor_id = ?
  `).bind(newStatus, now, order.internal_id, currentStatus, vendorId));
  
  stmts.push(db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), vendorId, 'vendor', 'update_order_status', 'orders', order.internal_id, currentStatus, newStatus, now));
  
  const results = await db.batch(stmts);

  if (results[0].meta.changes === 0) {
    return { error: 'Concurrency conflict: The order status was changed by another operator. Please refresh.', status: 409 };
  }

  return { success: true };
}

export async function getVendorDashboardStats(db, vendorId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = today.getTime();

  const [receivedResult, printingResult, bindingResult, qualityCheckResult, packedResult, readyResult, outResult, deliveredResult, todayOrdersResult, vendorResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'received' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'printing' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'binding' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'quality_check' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'packed' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'ready_for_pickup' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'out_for_delivery' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'delivered' AND vendor_id = ?`).bind(vendorId).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND vendor_id = ?`).bind(startOfDay, vendorId).first(),
    db.prepare(`SELECT password_change_required FROM vendors WHERE id = ?`).bind(vendorId).first()
  ]);

  return {
    received: receivedResult.count,
    printing: printingResult.count,
    binding: bindingResult.count,
    quality_check: qualityCheckResult.count,
    packed: packedResult.count,
    ready_for_pickup: readyResult.count,
    out_for_delivery: outResult.count,
    delivered: deliveredResult.count,
    todayOrders: todayOrdersResult.count,
    password_change_required: vendorResult ? !!vendorResult.password_change_required : false
  };
}

export async function getVendorDocumentAccess(db, vendorId, documentId) {
  const linkCheck = await db.prepare(`
    SELECT oi.id 
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.internal_id
    WHERE oi.document_id = ? AND o.vendor_id = ?
  `).bind(documentId, vendorId).first();

  if (!linkCheck) {
    return null; 
  }

  const now = Date.now();
  return await db.prepare(`
    SELECT r2_object_key, original_filename, file_type
    FROM documents 
    WHERE id = ? AND deleted_at IS NULL AND expires_at > ?
  `).bind(documentId, now).first();
}
