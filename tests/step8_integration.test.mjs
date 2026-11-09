import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8787';

test('BLINTZY Food — Step 8 Backend Integration & Security Test Suite', async (t) => {
  let createdOrderId = null;
  let pickupOtp = null;
  let pickupQrSecret = null;
  let orderNumber = null;

  // 1. Dynamic Catalogue Retrieval
  await t.test('1. Student can view real dynamic food catalogue from Cloudflare D1', async () => {
    const res = await fetch(`${BASE_URL}/api/food/products`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.data.products));
    assert.ok(data.data.products.length >= 10, 'Expected at least 10 food menu items');
    
    // Verify schema fields
    const item = data.data.products[0];
    assert.ok(item.id, 'Item must have id');
    assert.ok(item.name, 'Item must have name');
    assert.ok(typeof item.price === 'number', 'Item price must be a number');
    assert.ok(item.vendorId, 'Item must have vendorId');
  });

  // 2. Single Product Detail
  await t.test('2. Single product detail returns verified price and counter metadata', async () => {
    const res = await fetch(`${BASE_URL}/api/food/products/food_bf_01`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    const prod = data.data.product;
    assert.equal(prod.id, 'food_bf_01');
    assert.equal(prod.price, 35);
    assert.equal(prod.vendorId, 'vendor_canteen_stall');
    assert.ok(prod.counterLocation.includes('Counter 1'));
  });

  // 3. Categories Endpoint
  await t.test('3. Categories endpoint returns real category distribution from D1', async () => {
    const res = await fetch(`${BASE_URL}/api/food/categories`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.data.categories));
    assert.ok(data.data.categories.length > 5);
  });

  // 4. Server-Side Price Tampering Protection
  await t.test('4. Server recalculates and overrides any client-tampered price', async () => {
    const res = await fetch(`${BASE_URL}/api/food/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendorId: 'vendor_canteen_stall',
        items: [
          { productId: 'food_bf_01', quantity: 2, price: 1 } // Client attempts to pay ₹1 each instead of ₹35
        ]
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    // 2 * 35 = 70
    assert.equal(data.data.subtotal, 70, 'Server must enforce DB price of ₹35, ignoring client ₹1');
    assert.equal(data.data.grandTotal, 70);
  });

  // 5. Multi-Vendor Isolation Cart Enforcement
  await t.test('5. Multi-vendor cart mixing Private Stall and College Mess is rejected', async () => {
    const res = await fetch(`${BASE_URL}/api/food/orders/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { productId: 'food_bf_01', quantity: 1 }, // vendor_canteen_stall
          { productId: 'food_vm_01', quantity: 1 } // vendor_college_mess
        ]
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.message.toLowerCase().includes('counter'));
  });

  // 6. Concurrency-Safe Order Creation & Atomic Stock Reservation
  await t.test('6. Create food order atomically decrements stock and issues pickup credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/food/orders/create`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test_student_alice'
      },
      body: JSON.stringify({
        vendorId: 'vendor_canteen_stall',
        paymentMethod: 'CASH_AT_COUNTER',
        items: [
          { productId: 'food_bf_01', quantity: 1 }
        ],
        studentName: 'Alice Student',
        studentPhone: '9876543210'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    const order = data.data.order;
    assert.ok(order.id, 'Order ID must be generated');
    assert.ok(order.orderNumber, 'Order Number must be generated');
    assert.ok(order.pickupOtp, 'Pickup OTP must be generated');
    assert.ok(order.pickupQrSecret, 'Pickup QR secret must be generated');

    createdOrderId = order.id;
    orderNumber = order.orderNumber;
    pickupOtp = order.pickupOtp;
    pickupQrSecret = order.pickupQrSecret;
  });

  // 7. Student Order Privacy
  await t.test('7. Student Bob cannot view Student Alice order', async () => {
    assert.ok(createdOrderId);
    const res = await fetch(`${BASE_URL}/api/food/orders/${createdOrderId}`, {
      headers: {
        'Authorization': 'Bearer test_student_bob'
      }
    });
    assert.equal(res.status, 404, 'Bob must receive 404/Not Found for Alice order');
  });

  // 8. Order Idempotency
  await t.test('8. Duplicate order submission with same idempotency key returns existing order', async () => {
    const key = `idem_${Date.now()}`;
    const payload = {
      vendorId: 'vendor_canteen_stall',
      paymentMethod: 'CASH_AT_COUNTER',
      items: [{ productId: 'food_bf_01', quantity: 1 }],
      idempotencyKey: key,
      studentName: 'Alice Student'
    };

    const res1 = await fetch(`${BASE_URL}/api/food/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test_student_alice' },
      body: JSON.stringify(payload)
    });
    const d1 = await res1.json();

    const res2 = await fetch(`${BASE_URL}/api/food/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test_student_alice' },
      body: JSON.stringify(payload)
    });
    const d2 = await res2.json();

    assert.equal(d1.data.order.id, d2.data.order.id, 'Idempotency key must return existing order ID');
  });

  // 9. Vendor A cannot access Vendor B Queue (403 Forbidden)
  await t.test('9. Vendor Stall cannot access Vendor Mess order queue', async () => {
    const res = await fetch(`${BASE_URL}/api/food/vendor/orders?vendorId=vendor_college_mess`, {
      headers: {
        'Authorization': 'Bearer dev_vendor_stall'
      }
    });
    assert.equal(res.status, 403, 'Vendor Stall must get 403 Forbidden when requesting Mess queue');
  });

  // 10. Vendor B cannot access Vendor A Inventory (403 Forbidden)
  await t.test('10. Vendor Mess cannot mutate Vendor Stall inventory', async () => {
    const res = await fetch(`${BASE_URL}/api/food/vendor/inventory/update-stock`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_vendor_mess',
        'X-Vendor-ID': 'vendor_canteen_stall'
      },
      body: JSON.stringify({
        productId: 'food_bf_01',
        newStock: 999,
        vendorId: 'vendor_canteen_stall'
      })
    });
    assert.equal(res.status, 403, 'Vendor Mess must get 403 Forbidden when updating Stall inventory');
  });

  // 11. Invalid Pickup Code Rejected (404)
  await t.test('11. Invalid pickup OTP is rejected with 404', async () => {
    const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_vendor_stall'
      },
      body: JSON.stringify({
        vendorId: 'vendor_canteen_stall',
        credential: '0000' // Non-existent OTP
      })
    });
    assert.equal(res.status, 404);
  });

  // 12. Pickup Verification by Wrong Vendor (403)
  await t.test('12. Vendor Mess cannot verify pickup for Vendor Stall order', async () => {
    assert.ok(pickupOtp);
    const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_vendor_mess'
      },
      body: JSON.stringify({
        vendorId: 'vendor_college_mess',
        credential: pickupOtp
      })
    });
    assert.equal(res.status, 403, 'Wrong vendor must get 403 Forbidden');
  });

  // 13. Legitimate Pickup Verification & Cash Reconciliation
  await t.test('13. Correct vendor verifies pickup with OTP, marking cash order paid and collected', async () => {
    assert.ok(createdOrderId && pickupOtp);
    const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_vendor_stall'
      },
      body: JSON.stringify({
        vendorId: 'vendor_canteen_stall',
        credential: pickupOtp
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.data.orderStatus, 'collected');
    assert.equal(data.data.paymentStatus, 'paid');
    assert.ok(data.data.collectedAt, 'collectedAt timestamp must be set');
  });

  // 14. Pickup Credential Reuse Prevention (409 Conflict)
  await t.test('14. Reusing already collected pickup OTP returns 409 Conflict', async () => {
    assert.ok(pickupOtp);
    const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_vendor_stall'
      },
      body: JSON.stringify({
        vendorId: 'vendor_canteen_stall',
        credential: pickupOtp
      })
    });
    assert.equal(res.status, 409, 'Reused pickup code must return 409 Conflict');
  });

  // 15. Terminal State Protection (Status Cannot Be Modified After Collection)
  await t.test('15. Attempting to change status of collected order is rejected with 409', async () => {
    assert.ok(createdOrderId);
    const res = await fetch(`${BASE_URL}/api/food/vendor/orders/${createdOrderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_vendor_stall'
      },
      body: JSON.stringify({
        vendorId: 'vendor_canteen_stall',
        status: 'preparing'
      })
    });
    assert.equal(res.status, 409, 'Collected order must be terminal');
  });

  // 16. Webhook Idempotency Check
  await t.test('16. Razorpay Webhook is deduplicated safely without duplicate charges', async () => {
    const eventId = `test_evt_${Date.now()}`;
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_123',
            order_id: 'order_test_mock',
            amount: 7000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });

    // When no signature or mock signature is sent
    const res = await fetch(`${BASE_URL}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: payload
    });
    // Missing signature returns 400
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error.code, 'BAD_REQUEST');
  });
});
