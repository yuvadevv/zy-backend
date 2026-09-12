import fs from 'fs';
const code = `
export async function getStudentFullDetails(db, studentId) {
  // 1. Resolve canonical student
  const studentQuery = \`
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
  \`;
  const student = await db.prepare(studentQuery).bind(studentId).first();
  if (!student) return null;

  // 2. Orders
  const ordersQuery = \`
    SELECT o.*, oi.id as item_id, oi.item_type, oi.copies, oi.page_count, oi.print_type, oi.color_mode, oi.binding_type, oi.item_total
    FROM orders o
    LEFT JOIN order_items oi ON o.internal_id = oi.order_id
    WHERE o.student_id = ?
    ORDER BY o.created_at DESC
  \`;
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
  const paymentsQuery = \`
    SELECT p.*, o.public_id as order_public_id
    FROM payments p
    JOIN orders o ON p.order_id = o.internal_id
    WHERE o.student_id = ?
    ORDER BY p.created_at DESC
  \`;
  const payments = (await db.prepare(paymentsQuery).bind(student.id).all()).results;

  // 4. Refunds
  const refundsQuery = \`
    SELECT r.*, o.public_id as order_public_id
    FROM refunds r
    JOIN orders o ON r.order_id = o.internal_id
    WHERE r.student_id = ?
    ORDER BY r.created_at DESC
  \`;
  const refunds = (await db.prepare(refundsQuery).bind(student.id).all()).results;

  // 5. Documents
  const docsQuery = \`
    SELECT id, document_type, original_filename, file_type, file_size, scan_status, created_at
    FROM documents
    WHERE student_id = ?
    ORDER BY created_at DESC
  \`;
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
    activity.push({ type: 'order_created', desc: \`Order \${o.public_id} created\`, timestamp: o.created_at, ref: o.public_id });
  }
  for (const p of payments) {
    if (p.status === 'paid') {
      activity.push({ type: 'payment_captured', desc: \`Payment captured for \${p.order_public_id}\`, timestamp: p.created_at, ref: p.order_public_id });
    }
  }
  for (const r of refunds) {
    activity.push({ type: 'refund_initiated', desc: \`Refund initiated for \${r.order_public_id}\`, timestamp: r.created_at, ref: r.public_refund_id });
    if (r.status === 'processed') {
      activity.push({ type: 'refund_processed', desc: \`Refund processed for \${r.order_public_id}\`, timestamp: r.processed_at, ref: r.public_refund_id });
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
`;
fs.appendFileSync('./backend/worker/src/services/adminService.js', '\n' + code);
