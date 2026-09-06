export const VALID_VENDOR_TRANSITIONS = {
  'received': ['accepted', 'printing'],
  'accepted': ['printing'],
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
      o.vendor_id as vendorId,
      v.business_name as vendorName,
      o.order_type as orderType,
      s.name as studentName, 
      s.roll_number as rollNumber,
      s.phone as studentPhone,
      s.email as studentEmail,
      b.name as branchName,
      o.delivery_room as classroom,
      p.status as paymentStatus
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
    LEFT JOIN vendors v ON o.vendor_id = v.id
    WHERE o.status != 'draft'
  `;
  
  const params = [];
  
  if (status && status !== 'all') {
    query += ` AND o.status = ?`;
    params.push(status);
  }
  
  if (search) {
    query += ` AND (o.public_id LIKE ? OR s.roll_number LIKE ? OR s.phone LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, (page - 1) * limit);
  
  const stmt = db.prepare(query).bind(...params);
  const result = await stmt.all();
  
  let countQuery = `
    SELECT COUNT(*) as total 
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    WHERE o.status != 'draft'
  `;
  const countParams = [];
  
  if (status && status !== 'all') {
    countQuery += ` AND o.status = ?`;
    countParams.push(status);
  }
  if (search) {
    countQuery += ` AND (o.public_id LIKE ? OR s.roll_number LIKE ? OR s.phone LIKE ?)`;
    countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
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
      o.vendor_id as vendorId,
      (SELECT business_name FROM vendors WHERE id = o.vendor_id) as vendorName,
      o.order_type as orderType,
      s.name as studentName, 
      s.roll_number as rollNumber, 
      s.phone as studentPhone,
      s.email as studentEmail,
      b.name as branchName,
      o.delivery_room as classroom,
      p.status as paymentStatus,
      p.provider as paymentProvider
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
    WHERE o.public_id = ? AND o.status != 'draft'
  `).bind(publicOrderId).first();

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
  const order = await db.prepare(`SELECT internal_id, status, vendor_id FROM orders WHERE public_id = ?`).bind(publicOrderId).first();
  if (!order) return { error: 'Order not found', status: 404 };

  const validNextStates = VALID_VENDOR_TRANSITIONS[order.status] || [];
  
  if (!validNextStates.includes(newStatus)) {
    return { error: `Invalid operational status transition from ${order.status} to ${newStatus}`, status: 400 };
  }

  const now = Date.now();
  const stmts = [];

  // Claim logic: if the order is unassigned and we're accepting it
  if (order.vendor_id === null && newStatus === 'accepted') {
    stmts.push(db.prepare(`
      UPDATE orders 
      SET status = ?, vendor_id = ?, updated_at = ?
      WHERE internal_id = ? AND status = ? AND vendor_id IS NULL
    `).bind(newStatus, vendorId, now, order.internal_id, currentStatus));
  } else {
    // Normal update logic: vendor must own it
    if (order.vendor_id !== vendorId) {
       return { error: 'Order is being processed by another Vendor.', status: 403 };
    }
    stmts.push(db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = ?
      WHERE internal_id = ? AND status = ? AND vendor_id = ?
    `).bind(newStatus, now, order.internal_id, currentStatus, vendorId));
  }
  
  stmts.push(db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), vendorId, 'vendor', 'update_order_status', 'orders', order.internal_id, currentStatus, newStatus, now));
  
  const results = await db.batch(stmts);

  if (results[0].meta.changes === 0) {
    return { error: 'Order is already being processed by another Vendor.', status: 409 };
  }

  return { success: true };
}

export async function getVendorDashboardStats(db, vendorId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = today.getTime();

  const [receivedResult, acceptedResult, printingResult, bindingResult, qualityCheckResult, packedResult, readyResult, outResult, deliveredResult, todayOrdersResult, vendorResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'received'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'accepted'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'printing'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'binding'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'quality_check'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'packed'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'ready_for_pickup'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'out_for_delivery'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE status = 'delivered'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND status != 'draft'`).bind(startOfDay).first(),
    db.prepare(`SELECT password_change_required FROM vendors WHERE id = ?`).bind(vendorId).first()
  ]);

  return {
    received: receivedResult.count,
    accepted: acceptedResult.count,
    printing: printingResult.count,
    binding: bindingResult.count,
    quality_check: qualityCheckResult.count,
    packed: packedResult.count,
    ready_for_pickup: readyResult.count,
    out_for_delivery: outResult.count,
    delivered: deliveredResult.count,
    todayOrders: todayOrdersResult.count,
    password_change_required: vendorResult ? (vendorResult.password_change_required === 1 || vendorResult.password_change_required === '1' || vendorResult.password_change_required === true) : false
  };
}

export async function getVendorDocumentAccess(db, vendorId, documentId) {
  const linkCheck = await db.prepare(`
    SELECT oi.id 
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.internal_id
    WHERE oi.document_id = ? AND o.status != 'draft'
  `).bind(documentId).first();

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

export async function getVendorDocuments(db, vendorId, { search, page = 1, limit = 25 }) {
  const offset = (page - 1) * limit;
  let query = `
    SELECT 
      d.id, d.original_filename, d.file_type, d.file_size, d.page_count, d.document_type, d.created_at,
      o.public_id as order_public_id, o.status as order_status,
      o.vendor_id, v.business_name as vendor_name,
      s.name as student_name, s.roll_number as student_roll, s.phone as student_phone
    FROM documents d
    JOIN order_items oi ON oi.document_id = d.id
    JOIN orders o ON oi.order_id = o.internal_id
    JOIN students s ON o.student_id = s.id
    LEFT JOIN vendors v ON o.vendor_id = v.id
    WHERE o.status != 'draft' AND d.deleted_at IS NULL
  `;
  let countQuery = `
    SELECT COUNT(*) as count
    FROM documents d
    JOIN order_items oi ON oi.document_id = d.id
    JOIN orders o ON oi.order_id = o.internal_id
    JOIN students s ON o.student_id = s.id
    WHERE o.status != 'draft' AND d.deleted_at IS NULL
  `;
  const params = [];
  const countParams = [];

  if (search) {
    const sClause = ` AND (d.original_filename LIKE ? OR o.public_id LIKE ? OR s.name LIKE ? OR s.roll_number LIKE ? OR s.phone LIKE ?)`;
    query += sClause; countQuery += sClause;
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
    countParams.push(term, term, term, term, term);
  }

  query += ` ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const [countRes, rowsRes] = await Promise.all([
    db.prepare(countQuery).bind(...countParams).first(),
    db.prepare(query).bind(...params).all()
  ]);

  const total = countRes?.count || 0;
  return {
    documents: rowsRes?.results || [],
    total, page, limit, totalPages: Math.ceil(total / limit)
  };
}

export async function getVendorActivity(db, vendorId, { page = 1, limit = 25 }) {
  const offset = (page - 1) * limit;
  const countRes = await db.prepare(`
    SELECT COUNT(*) as count FROM audit_logs 
    WHERE actor_id = ? OR (entity_type = 'vendor' AND entity_id = ?)
  `).bind(vendorId, vendorId).first();

  const rows = await db.prepare(`
    SELECT id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at
    FROM audit_logs
    WHERE actor_id = ? OR (entity_type = 'vendor' AND entity_id = ?)
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).bind(vendorId, vendorId, limit, offset).all();

  const total = countRes?.count || 0;
  return {
    activities: rows?.results || [],
    total, page, limit, totalPages: Math.ceil(total / limit)
  };
}

export async function getVendorProfile(db, vendorId) {
  return await db.prepare(`
    SELECT id, email, name, business_name, contact_person, username, phone, whatsapp, address, city, state, pincode, description, role, status, created_at
    FROM vendors WHERE id = ?
  `).bind(vendorId).first();
}

export async function updateVendorProfile(db, vendorId, updates) {
  const allowedFields = ['name', 'business_name', 'contact_person', 'phone', 'whatsapp', 'address', 'city', 'state', 'pincode', 'description'];
  const fieldsToUpdate = [];
  const params = [];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fieldsToUpdate.push(`${field} = ?`);
      params.push(updates[field]);
    }
  }
  if (fieldsToUpdate.length === 0) return { success: true };
  
  fieldsToUpdate.push('updated_at = ?');
  params.push(Date.now(), vendorId);

  await db.prepare(`UPDATE vendors SET ${fieldsToUpdate.join(', ')} WHERE id = ?`).bind(...params).run();
  return { success: true };
}
