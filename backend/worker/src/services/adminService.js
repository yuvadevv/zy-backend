export const VALID_TRANSITIONS = {
  'received': ['accepted', 'cancelled', 'rejected'],
  'accepted': ['printing', 'cancelled'],
  'printing': ['binding', 'quality_check', 'packed', 'cancelled'],
  'binding': ['quality_check', 'packed', 'cancelled'],
  'quality_check': ['packed', 'cancelled'],
  'packed': ['ready_for_pickup', 'out_for_delivery', 'cancelled'],
  'ready_for_pickup': ['delivered', 'cancelled'],
  'out_for_delivery': ['delivered', 'failed', 'cancelled'],
  'failed': ['out_for_delivery', 'cancelled'],
  // Terminal states: delivered, cancelled, rejected, refunded
};


// ---------------------------------------------------------
// AUTHORITATIVE ORDER DTO MAPPING
// ---------------------------------------------------------
function buildOrderDTO(o, items = []) {
  return {
    publicId: o.public_id,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    status: o.status,
    paymentStatus: o.paymentStatus || 'pending',
    estimatedDelivery: o.estimated_delivery,
    student: {
      name: o.studentName || 'Not provided',
      rollNumber: o.rollNumber || 'Not provided',
      email: o.studentEmail || 'Not provided',
      phone: o.studentPhone || 'Not provided'
    },
    academic: {
      branchId: o.branch_id,
      branchCode: o.branchCode || 'N/A',
      yearId: o.study_year_id,
      yearLabel: o.yearLabel || 'N/A',
      semesterId: o.semester_id,
      semesterLabel: o.semesterLabel || 'N/A'
    },
    items: items,
    pricing: {
      subtotal: o.grand_total - o.delivery_fee - o.platform_fee - o.gst + o.discount,
      deliveryFee: o.delivery_fee,
      platformFee: o.platform_fee,
      discount: o.discount,
      grandTotal: o.grand_total
    },
    delivery: {
      type: o.delivery_type,
      building: o.delivery_building,
      room: o.delivery_room
    },
    vendorId: o.vendor_id
  };
}

export async function getOrders(db, params) {
  const { 
    status, search, page = 1, limit = 25, 
    branch, year, semester, manual_id, payment_status,
    min_price, max_price, sort = 'newest', vendor_id, order_type
  } = params;

  let query = `
    SELECT 
      o.*, 
      s.name as studentName, 
      s.roll_number as rollNumber,
      s.email as studentEmail,
      s.phone as studentPhone,
      s.branch_id,
      s.study_year_id,
      s.semester_id,
      p.status as paymentStatus,
      b.code as branchCode,
      ay.label as yearLabel,
      sem.label as semesterLabel,
      (
        SELECT json_group_array(json_object(
          'manualId', oi.manual_id,
          'document_id', oi.document_id,
          'document_filename', COALESCE(d.original_filename, 'Document'),
          'title', COALESCE(m.title, d.original_filename, 'Document'),
          'quantity', oi.copies,
          'pages', oi.page_count,
          'printType', oi.print_type,
          'colorMode', oi.color_mode,
          'binding', oi.binding_type,
          'unitPrice', oi.base_price,
          'totalPrice', oi.item_total
        ))
        FROM order_items oi
        LEFT JOIN manuals m ON oi.manual_id = m.id
        LEFT JOIN documents d ON oi.document_id = d.id
        WHERE oi.order_id = o.internal_id
      ) as items_json
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN academic_years ay ON s.study_year_id = ay.id
    LEFT JOIN semesters sem ON s.semester_id = sem.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
    WHERE 1=1
  `;
  
  let countQuery = `
    SELECT COUNT(DISTINCT o.internal_id) as total 
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
  `;
  
  if (manual_id && manual_id !== 'all') {
    countQuery += ` LEFT JOIN order_items oi_count ON oi_count.order_id = o.internal_id`;
  }
  countQuery += ` WHERE 1=1`;

  const qParams = [];
  
  if (vendor_id) {
    const vClause = ` AND o.vendor_id = ?`;
    query += vClause; countQuery += vClause; qParams.push(vendor_id);
  }
  if (status && status !== 'all') {
    if (status.includes(',')) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      const placeholders = statuses.map(() => '?').join(',');
      const statusClause = ` AND o.status IN (${placeholders})`;
      query += statusClause; countQuery += statusClause;
      qParams.push(...statuses);
    } else {
      const statusClause = ` AND o.status = ?`;
      query += statusClause; countQuery += statusClause; qParams.push(status);
    }
  }
  if (search) {
    const searchClause = ` AND (o.public_id LIKE ? OR s.roll_number LIKE ? OR s.name LIKE ? OR s.email LIKE ? OR s.phone LIKE ?)`;
    query += searchClause; countQuery += searchClause; 
    qParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (branch && branch !== 'all') {
    const branchClause = ` AND s.branch_id = ?`;
    query += branchClause; countQuery += branchClause; qParams.push(branch);
  }
  if (year && year !== 'all') {
    const yearClause = ` AND s.study_year_id = ?`;
    query += yearClause; countQuery += yearClause; qParams.push(year);
  }
  if (semester && semester !== 'all') {
    const semClause = ` AND s.semester_id = ?`;
    query += semClause; countQuery += semClause; qParams.push(semester);
  }
  if (payment_status && payment_status !== 'all') {
    if (payment_status === 'paid') {
      const pClause = ` AND p.status = 'paid'`;
      query += pClause; countQuery += pClause;
    } else {
      const pClause = ` AND (p.status IS NULL OR p.status != 'paid')`;
      query += pClause; countQuery += pClause;
    }
  }
  if (min_price) {
    const pClause = ` AND o.grand_total >= ?`;
    query += pClause; countQuery += pClause; qParams.push(Number(min_price));
  }
  if (max_price) {
    const pClause = ` AND o.grand_total <= ?`;
    query += pClause; countQuery += pClause; qParams.push(Number(max_price));
  }
  if (manual_id && manual_id !== 'all') {
    const mClause = ` AND EXISTS (SELECT 1 FROM order_items oi2 WHERE oi2.order_id = o.internal_id AND oi2.manual_id = ?)`;
    query += mClause; countQuery += ` AND oi_count.manual_id = ?`; qParams.push(manual_id);
  }
  if (order_type && order_type !== 'all') {
    const otClause = ` AND EXISTS (SELECT 1 FROM order_items oi3 WHERE oi3.order_id = o.internal_id AND oi3.item_type = ?)`;
    query += otClause; 
    if (!(manual_id && manual_id !== 'all')) {
        // Since countQuery already has WHERE 1=1 and other conditions might have been appended,
        // we can just use EXISTS for count as well to keep it simple and avoid LEFT JOIN mess.
        countQuery += ` AND EXISTS (SELECT 1 FROM order_items oi3 WHERE oi3.order_id = o.internal_id AND oi3.item_type = ?)`;
    } else {
        countQuery += ` AND oi_count.item_type = ?`;
    }
    qParams.push(order_type);
  }

  let orderBy = ` ORDER BY o.created_at DESC`;
  if (sort === 'oldest') orderBy = ` ORDER BY o.created_at ASC`;
  if (sort === 'price_asc') orderBy = ` ORDER BY o.grand_total ASC, o.created_at DESC`;
  if (sort === 'price_desc') orderBy = ` ORDER BY o.grand_total DESC, o.created_at DESC`;
  if (sort === 'eta_asc') orderBy = ` ORDER BY o.estimated_delivery ASC NULLS LAST, o.created_at DESC`;
  if (sort === 'eta_desc') orderBy = ` ORDER BY o.estimated_delivery DESC NULLS LAST, o.created_at DESC`;
  if (sort === 'student_az') orderBy = ` ORDER BY s.name ASC, o.created_at DESC`;
  if (sort === 'student_za') orderBy = ` ORDER BY s.name DESC, o.created_at DESC`;

  query += orderBy;
  
  const countParams = [...qParams];
  
  if (limit !== 'all') {
    query += ` LIMIT ? OFFSET ?`;
    qParams.push(limit, (page - 1) * limit);
  }

  const stmt = db.prepare(query).bind(...qParams);
  const result = await stmt.all();
  
  const countStmt = db.prepare(countQuery).bind(...countParams);
  const countResult = await countStmt.first();
  
  return {
    orders: result.results.map(o => buildOrderDTO(o, JSON.parse(o.items_json || '[]'))),
    total: countResult.total,
    page: limit === 'all' ? 1 : page,
    limit: limit === 'all' ? countResult.total : limit,
    totalPages: limit === 'all' ? 1 : Math.ceil(countResult.total / limit)
  };
}

export async function getOrderDetails(db, publicOrderId, vendorId = null) {
  let query = `
    SELECT 
      o.*, 
      s.name as studentName, 
      s.roll_number as rollNumber, 
      s.email as studentEmail,
      s.phone as studentPhone,
      s.branch_id,
      s.study_year_id,
      s.semester_id,
      b.code as branchCode,
      ay.label as yearLabel,
      sem.label as semesterLabel,
      p.status as paymentStatus,
      p.provider as paymentProvider,
      p.provider_order_id as paymentProviderOrderId
    FROM orders o
    LEFT JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN academic_years ay ON s.study_year_id = ay.id
    LEFT JOIN semesters sem ON s.semester_id = sem.id
    LEFT JOIN payments p ON o.internal_id = p.order_id AND p.status = 'paid'
    WHERE o.public_id = ?
  `;
  const params = [publicOrderId];
  if (vendorId) {
    query += ` AND o.vendor_id = ?`;
    params.push(vendorId);
  }

  const orderRow = await db.prepare(query).bind(...params).first();
  if (!orderRow) return null;

  const items = await db.prepare(`
    SELECT oi.item_type, oi.manual_id as manualId, COALESCE(m.title, 'Document') as title, oi.copies as quantity, 
           oi.page_count as pages, oi.print_type as printType, oi.color_mode as colorMode, 
           oi.binding_type as binding, oi.base_price as unitPrice, oi.item_total as totalPrice,
           d.original_filename as document_filename, d.r2_object_key, d.id as document_uuid
    FROM order_items oi
    LEFT JOIN manuals m ON oi.manual_id = m.id
    LEFT JOIN documents d ON oi.document_id = d.id
    WHERE oi.order_id = ?
  `).bind(orderRow.internal_id).all();

  return buildOrderDTO(orderRow, items.results);
}

export async function updateAdminOrderStatus(db, publicOrderId, newStatus, currentStatus, adminOrVendorId, vendorIdScope = null) {
  // Concurrency check
  let query = `SELECT internal_id, status FROM orders WHERE public_id = ?`;
  const params = [publicOrderId];
  
  if (vendorIdScope) {
    query += ` AND vendor_id = ?`;
    params.push(vendorIdScope);
  }
  
  const order = await db.prepare(query).bind(...params).first();
  if (!order) {
    return { error: 'Order not found', status: 404 };
  }
  
  if (order.status !== currentStatus) {
    return { error: 'Order was updated elsewhere', status: 409, currentDbStatus: order.status };
  }
  
  // Using updateAdminOrdersBulk for individual updates to ensure shared state logic
  return await updateAdminOrdersBulk(db, [publicOrderId], { status: newStatus }, adminOrVendorId, vendorIdScope);
}

export async function updateAdminOrdersBulk(db, publicOrderIds, updates, adminId, vendorIdScope = null) {
  if (!publicOrderIds || publicOrderIds.length === 0) return { error: 'No orders selected', status: 400 };
  if (publicOrderIds.length > 500) return { error: 'Too many orders. Max 500 per batch.', status: 400 };

  const { status, estimatedDelivery, deliveryType, deliveryBuilding, deliveryRoom, vendorId } = updates;
  const now = Date.now();
  
  if (vendorId) {
    const vendor = await db.prepare(`SELECT id, status FROM vendors WHERE id = ?`).bind(vendorId).first();
    if (!vendor || vendor.status !== 'active') {
      return { error: 'Vendor not found or not active', status: 400 };
    }
  }

  const placeholders = publicOrderIds.map(() => '?').join(',');
  let selectQuery = `SELECT internal_id, public_id, status, vendor_id FROM orders WHERE public_id IN (${placeholders})`;
  const params = [...publicOrderIds];
  if (vendorIdScope) {
    selectQuery += ` AND vendor_id = ?`;
    params.push(vendorIdScope);
  }
  
  const orders = await db.prepare(selectQuery).bind(...params).all();
  
  if (!orders || orders.results.length === 0) {
    return { error: 'No matching orders found or unauthorized', status: 404 };
  }

  const ALL_STATUSES = [
    'draft', 'pending', 'received', 'accepted', 'printing', 'binding', 
    'quality_check', 'packed', 'ready_for_pickup', 'out_for_delivery', 
    'delivered', 'cancelled', 'rejected', 'refunded', 'failed', 'on_hold'
  ];

  let updated = 0; let skipped = 0; let conflicts = 0;
  const failures = []; const stmts = []; const auditStmts = [];

  for (const order of orders.results) {
    let shouldUpdate = false;
    let nextStatus = order.status;
    let isOverride = false;

    if (status && status !== order.status) {
      const validNextStates = VALID_TRANSITIONS[order.status] || [];
      const isAdmin = vendorIdScope === null;
      
      if (isAdmin && ALL_STATUSES.includes(status)) {
        nextStatus = status;
        shouldUpdate = true;
        isOverride = !validNextStates.includes(status);
      } else if (!isAdmin && validNextStates.includes(status)) {
        nextStatus = status;
        shouldUpdate = true;
        isOverride = false;
      } else {
        skipped++;
        failures.push({ orderId: order.public_id, reason: `Invalid transition from ${order.status} to ${status}` });
        continue;
      }
    }

    if (estimatedDelivery !== undefined || deliveryType !== undefined || deliveryBuilding !== undefined || deliveryRoom !== undefined || vendorId !== undefined) {
      shouldUpdate = true;
    }

    if (shouldUpdate) {
      let updateQuery = `UPDATE orders SET updated_at = ?`;
      const updateParams = [now];
      
      if (status && status !== order.status) {
        updateQuery += `, status = ?`; updateParams.push(status);
      }
      if (estimatedDelivery !== undefined) {
        updateQuery += `, estimated_delivery = ?`; updateParams.push(estimatedDelivery === null ? null : estimatedDelivery);
      }
      if (deliveryType !== undefined) {
        updateQuery += `, delivery_type = ?`; updateParams.push(deliveryType);
      }
      if (deliveryBuilding !== undefined) {
        updateQuery += `, delivery_building = ?`; updateParams.push(deliveryBuilding);
      }
      if (deliveryRoom !== undefined) {
        updateQuery += `, delivery_room = ?`; updateParams.push(deliveryRoom);
      }
      if (vendorId !== undefined) {
        updateQuery += `, vendor_id = ?`; updateParams.push(vendorId);
      }
      
      updateQuery += ` WHERE internal_id = ? AND status = ?`;
      updateParams.push(order.internal_id, order.status);
      
      stmts.push(db.prepare(updateQuery).bind(...updateParams));
      
      let actionName = 'order.bulk_update';
      if (status && isOverride) actionName = 'order.status_override';
      else if (status) actionName = 'order.bulk_status';
      if (estimatedDelivery !== undefined && !status) actionName = 'order.bulk_eta';
      if (vendorId !== undefined && !status && estimatedDelivery === undefined) actionName = 'order.vendor_assigned';
      
      auditStmts.push(db.prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), adminId, vendorIdScope ? 'vendor' : 'admin', actionName, 'order', order.internal_id, 
        JSON.stringify({ status: order.status }), 
        JSON.stringify(updates), 
        now
      ));
      
      updated++;
    } else {
      skipped++;
    }
  }

  if (stmts.length > 0) {
    try {
      await db.batch([...stmts, ...auditStmts]);
    } catch (e) {
      console.error("Bulk update batch failed", e);
      return { error: 'Database transaction failed during bulk update', status: 500 };
    }
  }

  return { success: true, results: { updated, skipped, conflicts, failures } };
}

export async function getCommonManualBatches(db, params) {
  // Finds orders grouped by manual_id, branch_id, study_year_id, semester_id
  const { vendor_id, status } = params;
  let query = `
    SELECT 
      oi.manual_id as manualId,
      m.title as manualTitle,
      s.branch_id as branchId,
      b.code as branchCode,
      s.study_year_id as yearId,
      ay.label as yearLabel,
      s.semester_id as semesterId,
      sem.label as semesterLabel,
      COUNT(DISTINCT o.internal_id) as orderCount,
      COUNT(DISTINCT s.id) as studentCount,
      SUM(oi.copies) as copyCount,
      SUM(o.grand_total) as totalValue,
      SUM(CASE WHEN o.status = 'printing' THEN 1 ELSE 0 END) as printingCount,
      SUM(CASE WHEN o.status = 'ready_for_pickup' THEN 1 ELSE 0 END) as readyCount,
      SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as deliveredCount
    FROM orders o
    JOIN order_items oi ON o.internal_id = oi.order_id
    JOIN manuals m ON oi.manual_id = m.id
    JOIN students s ON o.student_id = s.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN academic_years ay ON s.study_year_id = ay.id
    LEFT JOIN semesters sem ON s.semester_id = sem.id
    WHERE 1=1
  `;
  const qParams = [];
  if (vendor_id) { query += ` AND o.vendor_id = ?`; qParams.push(vendor_id); }
  if (status && status !== 'all') { query += ` AND o.status = ?`; qParams.push(status); }

  query += `
    GROUP BY oi.manual_id, m.title, s.branch_id, b.code, s.study_year_id, ay.label, s.semester_id, sem.label
    ORDER BY copyCount DESC
  `;
  
  const results = await db.prepare(query).bind(...qParams).all();
  return { batches: results.results };
}

export async function validateImportOrders(db, importRows, vendorIdScope = null) {
  const results = { valid: 0, warnings: 0, errors: 0, rows: [] };
  
  for (const row of importRows) {
    if (!row.orderId) continue;
    let query = `SELECT internal_id, status, updated_at, vendor_id FROM orders WHERE public_id = ?`;
    const params = [row.orderId];
    if (vendorIdScope) { query += ` AND vendor_id = ?`; params.push(vendorIdScope); }
    
    const dbOrder = await db.prepare(query).bind(...params).first();
    
    let resultRow = { orderId: row.orderId, changes: [], isValid: true, error: null };
    
    if (!dbOrder) {
      resultRow.isValid = false;
      resultRow.error = 'Order not found or unauthorized';
      results.errors++;
      results.rows.push(resultRow);
      continue;
    }
    
    // Check conflicts
    if (row.exportTimestamp && dbOrder.updated_at > row.exportTimestamp) {
      resultRow.isValid = false;
      resultRow.error = 'CONFLICT — ORDER CHANGED SINCE EXPORT';
      results.errors++;
      results.rows.push(resultRow);
      continue;
    }
    
    // Check Status Transition
    if (row.status && row.status !== dbOrder.status) {
      const validNextStates = VALID_TRANSITIONS[dbOrder.status] || [];
      if (!validNextStates.includes(row.status)) {
        resultRow.isValid = false;
        resultRow.error = `Invalid status transition from ${dbOrder.status} to ${row.status}`;
      } else {
        resultRow.changes.push({ field: 'status', old: dbOrder.status, new: row.status });
      }
    }
    
    if (row.estimatedDelivery !== undefined) {
      resultRow.changes.push({ field: 'ETA', old: '...', new: row.estimatedDelivery }); // Simplify display
    }
    if (row.deliveryType !== undefined) {
      resultRow.changes.push({ field: 'Delivery Type', new: row.deliveryType });
    }
    if (row.vendorId !== undefined && row.vendorId !== dbOrder.vendor_id) {
      resultRow.changes.push({ field: 'vendor_id', old: dbOrder.vendor_id, new: row.vendorId });
    }
    
    if (resultRow.isValid && resultRow.changes.length > 0) {
      results.valid++;
    } else if (resultRow.isValid && resultRow.changes.length === 0) {
      // Unchanged
    } else {
      results.errors++;
    }
    
    if (resultRow.changes.length > 0 || !resultRow.isValid) {
      results.rows.push(resultRow);
    }
  }
  return results;
}

export async function updateAdminOrderVendor(db, publicOrderId, vendorId, adminId) {
  // Check if vendor exists and is active
  const vendor = await db.prepare(`SELECT id, status FROM vendors WHERE id = ?`).bind(vendorId).first();
  if (!vendor) return { error: 'Vendor not found', status: 404 };
  if (vendor.status !== 'active') return { error: 'Vendor is not active', status: 400 };

  // Check if order exists and get previous vendor
  const order = await db.prepare(`SELECT internal_id, vendor_id FROM orders WHERE public_id = ?`).bind(publicOrderId).first();
  if (!order) return { error: 'Order not found', status: 404 };

  const prevVendorId = order.vendor_id;
  const now = Date.now();

  const stmts = [];
  stmts.push(db.prepare(`
    UPDATE orders 
    SET vendor_id = ?, updated_at = ?
    WHERE internal_id = ?
  `).bind(vendorId, now, order.internal_id));

  stmts.push(db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), 
    adminId, 
    'admin', 
    'order.vendor_assigned', 
    'order', 
    order.internal_id, 
    JSON.stringify({ vendor_id: prevVendorId }), 
    JSON.stringify({ vendor_id: vendorId }), 
    now
  ));

  await db.batch(stmts);

  return { success: true };
}

export async function getDashboardStats(db) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  // Calculate start of week (Sunday)
  const d = new Date(now);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const startOfWeek = new Date(d.setDate(diff)).setHours(0,0,0,0);
  
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Run aggregate queries in parallel
  const [
    totalUsersResult,
    activeUsersResult,
    newUsersResult,
    
    ordersMetrics,
    ordersThisWeekResult,
    ordersThisMonthResult,
    
    revenueTodayResult,
    revenueThisWeekResult,
    revenueThisMonthResult,
    
    paymentsMetrics,
    
    chartOrdersOverTime,
    chartOrdersByStatus
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM students`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM students WHERE account_status = 'active'`).first(),
    db.prepare(`SELECT COUNT(*) as count FROM students WHERE created_at >= ?`).bind(today).first(),
    
    db.prepare(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as todayOrders,
        SUM(CASE WHEN status IN ('received', 'accepted') THEN 1 ELSE 0 END) as pendingOrders,
        SUM(CASE WHEN status IN ('printing', 'binding', 'quality_check', 'packed') THEN 1 ELSE 0 END) as printingOrders,
        SUM(CASE WHEN status IN ('ready_for_pickup', 'out_for_delivery') THEN 1 ELSE 0 END) as readyOrders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as deliveredOrders,
        SUM(CASE WHEN status IN ('cancelled', 'rejected', 'failed', 'refunded') THEN 1 ELSE 0 END) as cancelledOrders
      FROM orders
    `).bind(today).first(),

    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE created_at >= ?`).bind(startOfWeek).first(),
    db.prepare(`SELECT COUNT(*) as count FROM orders WHERE created_at >= ?`).bind(startOfMonth).first(),
    
    db.prepare(`SELECT SUM(amount) as total FROM payments WHERE status = 'paid' AND paid_at >= ?`).bind(today).first(),
    db.prepare(`SELECT SUM(amount) as total FROM payments WHERE status = 'paid' AND paid_at >= ?`).bind(startOfWeek).first(),
    db.prepare(`SELECT SUM(amount) as total FROM payments WHERE status = 'paid' AND paid_at >= ?`).bind(startOfMonth).first(),
    
    db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paidOrders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingPayments
      FROM payments
    `).first(),

    // Simple last 7 days chart data (SQLite date function trick using ms)
    db.prepare(`
      SELECT 
        date(created_at / 1000, 'unixepoch') as day, 
        COUNT(*) as count
      FROM orders
      WHERE created_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).bind(today - (7 * 24 * 60 * 60 * 1000)).all(),

    db.prepare(`
      SELECT status, COUNT(*) as count
      FROM orders
      GROUP BY status
    `).all()
  ]);

  return {
    users: {
      total: totalUsersResult.count || 0,
      active: activeUsersResult.count || 0,
      newToday: newUsersResult.count || 0,
    },
    orders: {
      total: ordersMetrics.totalOrders || 0,
      today: ordersMetrics.todayOrders || 0,
      thisWeek: ordersThisWeekResult.count || 0,
      thisMonth: ordersThisMonthResult.count || 0,
      pending: ordersMetrics.pendingOrders || 0,
      printing: ordersMetrics.printingOrders || 0,
      ready: ordersMetrics.readyOrders || 0,
      delivered: ordersMetrics.deliveredOrders || 0,
      cancelled: ordersMetrics.cancelledOrders || 0,
    },
    revenue: {
      today: revenueTodayResult.total || 0,
      thisWeek: revenueThisWeekResult.total || 0,
      thisMonth: revenueThisMonthResult.total || 0,
    },
    payments: {
      paid: paymentsMetrics.paidOrders || 0,
      pending: paymentsMetrics.pendingPayments || 0,
    },
    charts: {
      ordersOverTime: chartOrdersOverTime.results,
      ordersByStatus: chartOrdersByStatus.results,
    }
  };
}

export async function getDocumentAccessMetadata(db, documentId) {
  const now = Date.now();
  return await db.prepare(`
    SELECT r2_object_key, original_filename, file_type
    FROM documents 
    WHERE id = ? AND deleted_at IS NULL AND expires_at > ?
  `).bind(documentId, now).first();
}


export async function getPayments(db, { search, status, page = 1, limit = 25 }) {
  let query = `
    SELECT p.*, o.public_id as order_public_id, s.name as student_name
    FROM payments p
    LEFT JOIN orders o ON p.order_id = o.internal_id
    LEFT JOIN students s ON o.student_id = s.id
    WHERE 1=1
  `;
  const params = [];
  if (status && status !== 'all') { query += ' AND p.status = ?'; params.push(status); }
  if (search) { query += ' AND (o.public_id LIKE ? OR p.provider_order_id LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const results = await db.prepare(query).bind(...params).all();
  return { payments: results.results, page, limit };
}

export async function getVendors(db, { search, status, page = 1, limit = 25 }) {
  let query = 'SELECT id, name, email, status, created_at FROM vendors WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { query += ' AND status = ?'; params.push(status); }
  if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const results = await db.prepare(query).bind(...params).all();
  return { vendors: results.results, page, limit };
}

export async function getAuditLogs(db, { actor, action, page = 1, limit = 25 }) {
  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];
  if (actor) { query += ' AND actor_id = ?'; params.push(actor); }
  if (action && action !== 'all') { query += ' AND action = ?'; params.push(action); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const results = await db.prepare(query).bind(...params).all();
  return { logs: results.results, page, limit };
}

export async function getAnalytics(db) {
  // Reuse dashboard stats for all the KPI metrics to ensure consistency
  const dashboardStats = await getDashboardStats(db);
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = today - (7 * 24 * 60 * 60 * 1000);

  // Add missing charts: Revenue over time, Orders by branch
  const [
    chartRevenueOverTime,
    chartOrdersByBranch
  ] = await Promise.all([
    db.prepare(`
      SELECT 
        date(paid_at / 1000, 'unixepoch') as day, 
        SUM(amount) as revenue
      FROM payments
      WHERE status = 'paid' AND paid_at >= ?
      GROUP BY day
      ORDER BY day ASC
    `).bind(sevenDaysAgo).all(),

    db.prepare(`
      SELECT b.code as branch, COUNT(o.internal_id) as count
      FROM orders o
      JOIN students s ON o.student_id = s.id
      JOIN branches b ON s.branch_id = b.id
      GROUP BY b.code
    `).all()
  ]);

  return {
    ...dashboardStats,
    charts: {
      ...dashboardStats.charts,
      revenueOverTime: chartRevenueOverTime.results,
      ordersByBranch: chartOrdersByBranch.results
    }
  };
}

export async function getContent(db) {
  const results = await db.prepare('SELECT * FROM website_content ORDER BY priority ASC, created_at DESC').all();
  const parsed = results.results.map(row => {
    let meta = {};
    try { meta = JSON.parse(row.metadata || '{}'); } catch(e) {}
    return {
      id: row.id,
      type: row.content_type,
      title: row.title,
      description: meta.subtitle || meta.message || '',
      link_url: meta.url || meta.cta_url || '',
      cta_label: meta.cta || meta.cta_label || '',
      image_url: meta.image_key || meta.image_url || '',
      theme: meta.theme || '',
      icon: meta.icon || '',
      priority: row.priority,
      is_active: row.status === 'active',
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at
    };
  });
  return { content: parsed };
}

export async function createContent(db, contentData, adminId) {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare(`
    INSERT INTO website_content (id, content_type, title, metadata, priority, status, start_time, end_time, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, contentData.content_type, contentData.title, JSON.stringify(contentData.metadata || {}), 
    contentData.priority || 0, contentData.status || 'inactive', contentData.start_time || null, contentData.end_time || null, adminId, now, now
  ).run();
  
  await db.prepare('INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), adminId, 'admin', 'content.create', 'website_content', id, now).run();
  return { success: true, id };
}

export async function updateContent(db, id, contentData, adminId) {
  const now = Date.now();
  await db.prepare(`
    UPDATE website_content SET title = ?, metadata = ?, priority = ?, status = ?, start_time = ?, end_time = ?, updated_at = ? WHERE id = ?
  `).bind(
    contentData.title, JSON.stringify(contentData.metadata || {}), contentData.priority || 0, contentData.status || 'inactive', contentData.start_time || null, contentData.end_time || null, now, id
  ).run();
  
  await db.prepare('INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), adminId, 'admin', 'content.update', 'website_content', id, now).run();
  return { success: true };
}

export async function deleteContent(db, id, adminId) {
  const now = Date.now();
  await db.prepare('DELETE FROM website_content WHERE id = ?').bind(id).run();
  await db.prepare('INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), adminId, 'admin', 'content.delete', 'website_content', id, now).run();
  return { success: true };
}

export async function getExports(db, type, params = {}) {
  let query = '';
  const queryParams = [];

  if (type === 'users') {
    query = `
      SELECT s.id, s.email, s.name, s.roll_number, b.code as branch, s.account_status, s.created_at
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE 1=1
    `;
    if (params.status && params.status !== 'all') {
      query += ' AND s.account_status = ?';
      queryParams.push(params.status);
    }
    if (params.search) {
      query += ' AND (s.name LIKE ? OR s.email LIKE ? OR s.roll_number LIKE ?)';
      queryParams.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
    }
  } else if (type === 'orders') {
    query = `
      SELECT o.public_id, o.status, o.grand_total, o.created_at, b.code as branch
      FROM orders o
      LEFT JOIN students s ON o.student_id = s.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE 1=1
    `;
    if (params.status && params.status !== 'all') {
      query += ' AND o.status = ?';
      queryParams.push(params.status);
    }
    if (params.branch && params.branch !== 'all') {
      query += ' AND b.code = ?';
      queryParams.push(params.branch);
    }
    if (params.search) {
      query += ' AND o.public_id LIKE ?';
      queryParams.push(`%${params.search}%`);
    }
  } else if (type === 'payments') {
    query = `
      SELECT p.id as payment_id, p.amount, p.status, p.provider, p.created_at, o.public_id as order_id
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.internal_id
      WHERE 1=1
    `;
    if (params.status && params.status !== 'all') {
      query += ' AND p.status = ?';
      queryParams.push(params.status);
    }
    if (params.search) {
      query += ' AND (o.public_id LIKE ? OR p.provider_order_id LIKE ?)';
      queryParams.push(`%${params.search}%`, `%${params.search}%`);
    }
  } else {
    return null;
  }

  const results = await db.prepare(query).bind(...queryParams).all();
  
  if (results.results.length === 0) return '';
  const headers = Object.keys(results.results[0]).join(',');
  const rows = results.results.map(row => Object.values(row).map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
  return [headers, ...rows].join('\n');
}

export async function getPublicStatus(db) {
  const result = await db.prepare("SELECT setting_value FROM platform_settings WHERE setting_key = 'maintenance'").first();
  if (result && result.setting_value) {
    const val = JSON.parse(result.setting_value);
    return { maintenanceMode: val.enabled || false, maintenanceMessage: val.message || 'System under maintenance' };
  }
  return { maintenanceMode: false, maintenanceMessage: '' };
}


export async function getStudentFullDetails(db, studentId) {
  // 1. Resolve canonical student
  const studentQuery = `
    SELECT s.id, s.name, s.roll_number, s.phone, s.email,
           s.college_id, s.branch_id, s.study_year_id as year, s.semester_id as semester, s.section,
           s.account_status, s.created_at, s.updated_at, s.last_login_at, s.last_active_at,
           c.name as college_name, b.name as branch_name,
           ay.label as year_label, sem.label as semester_label, sec.name as section_name
    FROM students s
    LEFT JOIN colleges c ON s.college_id = c.id
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN academic_years ay ON s.study_year_id = ay.id
    LEFT JOIN semesters sem ON s.semester_id = sem.id
    LEFT JOIN sections sec ON s.section = sec.id
    WHERE s.id = ?
  `;
  const student = await db.prepare(studentQuery).bind(studentId).first();
  if (!student) return null;

  // 2. Orders
  const ordersQuery = `
    SELECT o.*, oi.id as item_id, oi.item_type, oi.copies, oi.page_count, oi.print_type, oi.color_mode, oi.binding_type, oi.item_total
    FROM orders o
    LEFT JOIN order_items oi ON o.internal_id = oi.order_id
    WHERE o.student_id = ?
    ORDER BY o.created_at DESC
  `;
  const ordersRaw = await db.prepare(ordersQuery).bind(student.id).all();
  
  // Group orders
  const ordersMap = new Map();
  for (const row of ordersRaw.results) {
    if (!ordersMap.has(row.internal_id)) {
      ordersMap.set(row.internal_id, {
        internal_id: row.internal_id,
        public_id: row.public_id,
        status: row.status,
        internal_status: row.internal_status,
        delivery_type: row.delivery_type,
        delivery_building: row.delivery_building,
        delivery_room: row.delivery_room,
        grand_total: row.grand_total,
        created_at: row.created_at,
        items: []
      });
    }
    if (row.item_id) {
      ordersMap.get(row.internal_id).items.push({
        id: row.item_id, item_type: row.item_type, copies: row.copies, item_total: row.item_total
      });
    }
  }
  const orders = Array.from(ordersMap.values());

  // 3. Payments
  const paymentsQuery = `
    SELECT p.*, o.public_id as order_public_id
    FROM payments p
    JOIN orders o ON p.order_id = o.internal_id
    WHERE o.student_id = ?
    ORDER BY p.created_at DESC
  `;
  const payments = (await db.prepare(paymentsQuery).bind(student.id).all()).results;

  // 4. Refunds
  const refundsQuery = `
    SELECT r.*, o.public_id as order_public_id
    FROM refunds r
    JOIN orders o ON r.order_id = o.internal_id
    WHERE r.student_id = ?
    ORDER BY r.created_at DESC
  `;
  const refunds = (await db.prepare(refundsQuery).bind(student.id).all()).results;

  // 5. Documents
  const docsQuery = `
    SELECT id, document_type, original_filename, file_type, file_size, scan_status, created_at
    FROM documents
    WHERE student_id = ?
    ORDER BY created_at DESC
  `;
  const documents = (await db.prepare(docsQuery).bind(student.id).all()).results;

  // 6. Summary Stats
  let totalOrders = orders.length;
  let completedOrders = orders.filter(o => o.status === 'delivered').length;
  let activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length;
  let cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
  
  let totalPaid = 0;
  for (const p of payments) {
    if (p.status === 'paid') totalPaid += p.amount;
  }
  
  let totalRefunded = 0;
  for (const r of refunds) {
    if (r.status === 'processed') totalRefunded += r.amount;
  }

  let remainingRefundable = totalPaid - totalRefunded;

  // 7. Activity Timeline
  const activity = [];
  activity.push({ type: 'account_created', desc: 'Account Created', timestamp: student.created_at });
  if (student.last_login_at) activity.push({ type: 'login', desc: 'Last Login', timestamp: student.last_login_at });
  
  for (const o of orders) {
    activity.push({ type: 'order_created', desc: `Order ${o.public_id} created`, timestamp: o.created_at, ref: o.public_id });
  }
  for (const p of payments) {
    if (p.status === 'paid') {
      activity.push({ type: 'payment_captured', desc: `Payment captured for ${p.order_public_id}`, timestamp: p.created_at, ref: p.order_public_id });
    }
  }
  for (const r of refunds) {
    activity.push({ type: 'refund_initiated', desc: `Refund initiated for ${r.order_public_id}`, timestamp: r.created_at, ref: r.public_refund_id });
    if (r.status === 'processed') {
      activity.push({ type: 'refund_processed', desc: `Refund processed for ${r.order_public_id}`, timestamp: r.processed_at, ref: r.public_refund_id });
    }
  }
  
  activity.sort((a, b) => b.timestamp - a.timestamp); // newest first

  return {
    student,
    summary: {
      totalOrders, completedOrders, activeOrders, cancelledOrders,
      totalPaid, totalRefunded, remainingRefundable,
      lastOrderAt: orders.length > 0 ? orders[0].created_at : null,
      lastPaymentAt: payments.length > 0 ? payments[0].created_at : null,
      lastRefundAt: refunds.length > 0 ? refunds[0].created_at : null
    },
    orders,
    payments,
    refunds,
    documents,
    activity
  };
}
