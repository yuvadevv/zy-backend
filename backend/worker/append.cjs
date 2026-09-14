const fs = require('fs');

const appendText = `
export async function getDocumentAccessMetadata(db, documentId) {
  const now = Date.now();
  return await db.prepare(\`
    SELECT r2_object_key, original_filename, file_type
    FROM documents 
    WHERE id = ? AND deleted_at IS NULL AND expires_at > ?
  \`).bind(documentId, now).first();
}

export async function getPayments(db, { search, status, page = 1, limit = 25 }) {
  let query = \`
    SELECT p.*, o.public_id as order_public_id, s.name as student_name
    FROM payments p
    LEFT JOIN orders o ON p.order_id = o.internal_id
    LEFT JOIN students s ON o.student_id = s.id
    WHERE 1=1
  \`;
  const params = [];
  if (status && status !== 'all') { query += ' AND p.status = ?'; params.push(status); }
  if (search) { query += ' AND (o.public_id LIKE ? OR p.provider_order_id LIKE ?)'; params.push(\`%\${search}%\`, \`%\${search}%\`); }
  query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);

  const results = await db.prepare(query).bind(...params).all();
  return { payments: results.results, page, limit };
}

export async function getVendors(db, { search, status, page = 1, limit = 25 }) {
  let query = 'SELECT id, name, email, status, created_at FROM vendors WHERE 1=1';
  const params = [];
  if (status && status !== 'all') { query += ' AND status = ?'; params.push(status); }
  if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(\`%\${search}%\`, \`%\${search}%\`); }
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
    db.prepare(\`
      SELECT 
        date(paid_at / 1000, 'unixepoch') as day, 
        SUM(amount) as revenue
      FROM payments
      WHERE status = 'paid' AND paid_at >= ?
      GROUP BY day
      ORDER BY day ASC
    \`).bind(sevenDaysAgo).all(),

    db.prepare(\`
      SELECT b.code as branch, COUNT(o.internal_id) as count
      FROM orders o
      JOIN students s ON o.student_id = s.id
      JOIN branches b ON s.branch_id = b.id
      GROUP BY b.code
    \`).all()
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
`;

fs.appendFileSync('C:/Users/SAI/Documents/yuvadev-zy/zy-backend/backend/worker/src/services/adminService.js', appendText);
console.log('Appended');
