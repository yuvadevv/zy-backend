import test from 'node:test';
import assert from 'node:assert/strict';
import { handleFinalOrderConfirm } from '../backend/worker/src/routes/orders.js';

function createMockDB() {
  const orders = new Map();

  return {
    _orders: orders,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes('FROM orders WHERE public_id = ? AND student_id = ?')) {
                const [pubId, stuId] = params;
                const o = orders.get(pubId);
                if (!o || o.student_id !== stuId) return null;
                return {
                  internal_id: o.internal_id || 1,
                  status: o.status,
                  payment_status: o.payment_status,
                  internal_status: o.internal_status
                };
              }
              return null;
            },
            async run() {
              if (sql.includes("UPDATE orders SET internal_status = ?")) {
                const [newStatus, , pubId, stuId] = params;
                const o = orders.get(pubId);
                if (o && o.student_id === stuId) {
                  o.internal_status = newStatus;
                }
                return { success: true };
              }
              return { success: true };
            }
          };
        }
      };
    }
  };
}

test('handleFinalOrderConfirm: rejects unauthenticated user', async () => {
  const db = createMockDB();
  const env = { DB: db };
  const req = {
    url: 'https://example.com/api/orders/ord_123/final-confirm',
    params: { id: 'ord_123' }
  };
  const context = { user: {} };

  const res = await handleFinalOrderConfirm(req, env, context);
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.error.code, 'UNAUTHORIZED');
});

test('handleFinalOrderConfirm: rejects non-existent order', async () => {
  const db = createMockDB();
  const env = { DB: db };
  const req = {
    url: 'https://example.com/api/orders/ord_missing/final-confirm',
    params: { id: 'ord_missing' }
  };
  const context = { user: { id: 'stu_1' } };

  const res = await handleFinalOrderConfirm(req, env, context);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.equal(data.error.code, 'NOT_FOUND');
});

test('handleFinalOrderConfirm: rejects order owned by different student', async () => {
  const db = createMockDB();
  db._orders.set('ord_foreign', {
    public_id: 'ord_foreign',
    student_id: 'stu_other',
    payment_status: 'paid',
    status: 'received'
  });
  const env = { DB: db };
  const req = {
    url: 'https://example.com/api/orders/ord_foreign/final-confirm',
    params: { id: 'ord_foreign' }
  };
  const context = { user: { id: 'stu_1' } };

  const res = await handleFinalOrderConfirm(req, env, context);
  assert.equal(res.status, 404); // Returns not found for non-matching ownership
  const data = await res.json();
  assert.equal(data.error.code, 'NOT_FOUND');
});

test('handleFinalOrderConfirm: rejects order with unpaid payment_status', async () => {
  const db = createMockDB();
  db._orders.set('ord_unpaid', {
    public_id: 'ord_unpaid',
    student_id: 'stu_1',
    payment_status: 'pending',
    status: 'pending'
  });
  const env = { DB: db };
  const req = {
    url: 'https://example.com/api/orders/ord_unpaid/final-confirm',
    params: { id: 'ord_unpaid' }
  };
  const context = { user: { id: 'stu_1' } };

  const res = await handleFinalOrderConfirm(req, env, context);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error.code, 'BAD_REQUEST');
});

test('handleFinalOrderConfirm: successfully and idempotently confirms paid order', async () => {
  const db = createMockDB();
  db._orders.set('ord_paid', {
    public_id: 'ord_paid',
    student_id: 'stu_1',
    payment_status: 'paid',
    status: 'received',
    internal_status: null
  });
  const env = { DB: db };
  const req = {
    url: 'https://example.com/api/orders/ord_paid/final-confirm',
    params: { id: 'ord_paid' }
  };
  const context = { user: { id: 'stu_1' } };

  // First call
  const res1 = await handleFinalOrderConfirm(req, env, context);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.data.status, 'confirmed');
  assert.equal(db._orders.get('ord_paid').internal_status, 'final_confirmed');

  // Second call (idempotency check)
  const res2 = await handleFinalOrderConfirm(req, env, context);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.data.status, 'already_confirmed');
  assert.equal(db._orders.get('ord_paid').internal_status, 'final_confirmed');
});

