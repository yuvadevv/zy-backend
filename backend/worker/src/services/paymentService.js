export async function getPaymentByOrderId(db, orderId) {
  const stmt = db.prepare(`
    SELECT *
    FROM payments
    WHERE order_id = ?
  `).bind(orderId);
  return await stmt.first();
}

export async function createPayment(db, paymentData) {
  const { order_id, provider, provider_order_id, amount, currency } = paymentData;
  const now = Date.now();
  
  const stmt = db.prepare(`
    INSERT INTO payments (
      id, order_id, provider, provider_order_id, 
      amount, currency, status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, 
      ?, ?, 'pending', ?, ?
    )
    RETURNING *
  `).bind(
    crypto.randomUUID(), order_id, provider, provider_order_id,
    amount, currency, now, now
  );
  
  return await stmt.first();
}

export async function verifyDevelopmentPayment(db, provider_order_id) {
  const stmt = db.prepare(`
    SELECT *
    FROM payments
    WHERE provider_order_id = ? AND provider = 'mock' AND status = 'pending'
  `).bind(provider_order_id);
  
  return await stmt.first();
}

export async function markPaymentPaid(db, paymentId, provider_payment_id) {
  const now = Date.now();
  
  const stmt = db.prepare(`
    UPDATE payments
    SET status = 'paid', provider_payment_id = ?, paid_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
    RETURNING *
  `).bind(provider_payment_id, now, now, paymentId);
  
  return await stmt.first();
}
