import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8787';

test('BLINTZY Food — Step 9 Complete End-to-End & Staging Launch Suite', async (t) => {
  let stallOrderId = null;
  let stallOrderNumber = null;
  let stallPickupOtp = null;
  let stallPickupQrSecret = null;

  let messOrderId = null;
  let messOrderNumber = null;
  let messPickupOtp = null;
  let messPickupQrSecret = null;
  let messRazorpayOrderId = null;

  // =========================================================================
  // SECTION 1: COMPLETE STUDENT JOURNEY — PRIVATE FOOD STALL (VENDOR A)
  // =========================================================================
  await t.test('1. Student Journey — Private Food Stall (Cash Flow)', async (st) => {
    // 1.1 Browse Catalogue
    await st.test('1.1 Browse full campus catalogue', async () => {
      const res = await fetch(`${BASE_URL}/api/food/products`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.products.length >= 10);
    });

    // 1.2 Search for "Dosa"
    await st.test('1.2 Search catalogue for "Dosa"', async () => {
      const res = await fetch(`${BASE_URL}/api/food/products?search=Dosa`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      const found = data.data.products.find(p => p.id === 'food_bf_02');
      assert.ok(found, 'Crispy Masala Dosa must be found in search');
      assert.equal(found.price, 50);
    });

    // 1.3 Filter by category "breakfast"
    await st.test('1.3 Filter catalogue by category "breakfast"', async () => {
      const res = await fetch(`${BASE_URL}/api/food/products?categoryId=breakfast`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      for (const p of data.data.products) {
        assert.equal(p.categoryId, 'breakfast');
      }
    });

    // 1.4 Product Details for food_bf_02
    await st.test('1.4 Product details returns real price, counter and stock', async () => {
      const res = await fetch(`${BASE_URL}/api/food/products/food_bf_02`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.product.id, 'food_bf_02');
      assert.equal(data.data.product.vendorId, 'vendor_canteen_stall');
      assert.equal(data.data.product.price, 50);
      assert.ok(data.data.product.counterLocation.includes('Counter 1'));
    });

    // 1.5 Cart Preview with 2 Masala Dosas (₹50 x 2 = ₹100)
    await st.test('1.5 Cart preview recalculates accurate subtotal server-side', async () => {
      const res = await fetch(`${BASE_URL}/api/food/orders/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: 'vendor_canteen_stall',
          items: [{ productId: 'food_bf_02', quantity: 2, price: 5 }] // Client tries price ₹5
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.subtotal, 100, 'Server must enforce 2 * 50 = 100');
      assert.equal(data.data.grandTotal, 100);
    });

    // 1.6 Checkout & Create Cash Order
    await st.test('1.6 Complete Checkout with Cash at Counter', async () => {
      const res = await fetch(`${BASE_URL}/api/food/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_student_priya'
        },
        body: JSON.stringify({
          vendorId: 'vendor_canteen_stall',
          paymentMethod: 'CASH_AT_COUNTER',
          items: [{ productId: 'food_bf_02', quantity: 2, cookingNotes: 'Extra crispy please' }],
          studentName: 'Priya Sharma',
          studentPhone: '9876543210'
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.order.id);
      assert.ok(data.data.order.orderNumber.startsWith('BLZ-FD-'));
      assert.ok(data.data.order.tokenNumber.startsWith('F-'));
      assert.equal(data.data.order.paymentMethod, 'CASH_AT_COUNTER');
      assert.equal(data.data.order.paymentStatus, 'pending');
      assert.equal(data.data.order.orderStatus, 'confirmed');
      assert.equal(data.data.order.grandTotal, 100);
      assert.ok(data.data.order.pickupOtp);
      assert.ok(data.data.order.pickupQrSecret);

      stallOrderId = data.data.order.id;
      stallOrderNumber = data.data.order.orderNumber;
      stallPickupOtp = data.data.order.pickupOtp;
      stallPickupQrSecret = data.data.order.pickupQrSecret;
    });

    // 1.7 Order Tracking & Privacy
    await st.test('1.7 Student can track order; other student receives 404', async () => {
      assert.ok(stallOrderId);
      // Priya accesses her order -> 200
      const resOwn = await fetch(`${BASE_URL}/api/food/orders/${stallOrderId}`, {
        headers: { 'Authorization': 'Bearer test_student_priya' }
      });
      assert.equal(resOwn.status, 200);
      const dataOwn = await resOwn.json();
      assert.equal(dataOwn.data.order.id, stallOrderId);

      // Other student tries -> 404
      const resOther = await fetch(`${BASE_URL}/api/food/orders/${stallOrderId}`, {
        headers: { 'Authorization': 'Bearer test_student_intruder' }
      });
      assert.equal(resOther.status, 404);
    });
  });

  // =========================================================================
  // SECTION 2: COMPLETE STUDENT JOURNEY — COLLEGE MESS DINING (VENDOR B)
  // =========================================================================
  await t.test('2. Student Journey — College Mess Dining (Online Payment Flow)', async (st) => {
    // 2.1 Multi-Vendor Conflict Prevention
    await st.test('2.1 Multi-vendor mixing (Stall + Mess) is rejected with 400', async () => {
      const res = await fetch(`${BASE_URL}/api/food/orders/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { productId: 'food_bf_02', quantity: 1 }, // Stall
            { productId: 'food_vm_01', quantity: 1 }  // Mess
          ]
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.error.message.toLowerCase().includes('counter'));
    });

    // 2.2 Product Details for food_vm_01 (Special South Indian Meals Plate)
    await st.test('2.2 Mess product details returns correct thali price and dining hall counter', async () => {
      const res = await fetch(`${BASE_URL}/api/food/products/food_vm_01`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.product.id, 'food_vm_01');
      assert.equal(data.data.product.vendorId, 'vendor_college_mess');
      assert.equal(data.data.product.price, 80);
      assert.ok(data.data.product.counterLocation.includes('Dining Hall'));
    });

    // 2.3 Create Online Payment Order for College Mess
    await st.test('2.3 Create Mess order with ONLINE_UPI generates gateway order', async () => {
      const res = await fetch(`${BASE_URL}/api/food/orders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_student_rohit'
        },
        body: JSON.stringify({
          vendorId: 'vendor_college_mess',
          paymentMethod: 'ONLINE_UPI',
          items: [{ productId: 'food_vm_01', quantity: 1 }],
          studentName: 'Rohit Verma',
          studentPhone: '9876543211'
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.order.vendorId, 'vendor_college_mess');
      assert.equal(data.data.order.grandTotal, 80);
      assert.ok(data.data.requiresPayment);
      assert.ok(data.data.payment.providerOrderId);

      messOrderId = data.data.order.id;
      messOrderNumber = data.data.order.orderNumber;
      messPickupOtp = data.data.order.pickupOtp;
      messPickupQrSecret = data.data.order.pickupQrSecret;
      messRazorpayOrderId = data.data.payment.providerOrderId;
    });

    // 2.4 Verify Online Payment
    await st.test('2.4 Verify online payment updates status to paid and confirmed', async () => {
      assert.ok(messOrderId && messRazorpayOrderId);
      const res = await fetch(`${BASE_URL}/api/food/orders/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test_student_rohit'
        },
        body: JSON.stringify({
          orderId: messOrderId,
          providerOrderId: messRazorpayOrderId,
          providerPaymentId: `pay_mock_${Date.now()}`
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.paymentStatus, 'paid');
      assert.equal(data.data.orderStatus, 'confirmed');
    });
  });

  // =========================================================================
  // SECTION 3: VENDOR A JOURNEY — PRIVATE STALL OPERATIONS & KITCHEN
  // =========================================================================
  await t.test('3. Vendor A Journey — Private Food Stall Kitchen Management', async (vt) => {
    // 3.1 Vendor Dashboard
    await vt.test('3.1 Vendor Stall dashboard returns isolated statistics', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/dashboard?vendorId=vendor_canteen_stall`, {
        headers: { 'Authorization': 'Bearer dev_vendor_stall' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.vendor);
      assert.equal(data.data.vendor.id, 'vendor_canteen_stall');
      assert.ok(typeof data.data.stats.todayOrders === 'number');
    });

    // 3.2 Order Queue
    await vt.test('3.2 Vendor Stall order queue contains Priya order', async () => {
      assert.ok(stallOrderId);
      const res = await fetch(`${BASE_URL}/api/food/vendor/orders?vendorId=vendor_canteen_stall`, {
        headers: { 'Authorization': 'Bearer dev_vendor_stall' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      const found = data.data.orders.find(o => o.id === stallOrderId);
      assert.ok(found, 'Stall order must be present in Stall queue');
    });

    // 3.3 Stage Progression: confirmed -> preparing -> ready_for_pickup
    await vt.test('3.3 Transition order to preparing, then ready_for_pickup', async () => {
      assert.ok(stallOrderId);
      // to preparing
      const resPrep = await fetch(`${BASE_URL}/api/food/vendor/orders/${stallOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_stall' },
        body: JSON.stringify({ vendorId: 'vendor_canteen_stall', status: 'preparing' })
      });
      assert.equal(resPrep.status, 200);

      // to ready_for_pickup
      const resReady = await fetch(`${BASE_URL}/api/food/vendor/orders/${stallOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_stall' },
        body: JSON.stringify({ vendorId: 'vendor_canteen_stall', status: 'ready_for_pickup' })
      });
      assert.equal(resReady.status, 200);
      const dataReady = await resReady.json();
      assert.equal(dataReady.success, true);
      assert.equal(dataReady.data.orderStatus, 'ready_for_pickup');
    });

    // 3.4 Pickup Verification with OTP & Cash Collection
    await vt.test('3.4 Correct counter verifies OTP, collecting cash and marking order collected', async () => {
      assert.ok(stallPickupOtp);
      const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_stall' },
        body: JSON.stringify({
          vendorId: 'vendor_canteen_stall',
          credential: stallPickupOtp
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.orderStatus, 'collected');
      assert.equal(data.data.paymentStatus, 'paid');
      assert.ok(data.data.collectedAt);
    });

    // 3.5 Replay / Reuse Protection
    await vt.test('3.5 Already-collected OTP cannot be reused (409 Conflict)', async () => {
      assert.ok(stallPickupOtp);
      const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_stall' },
        body: JSON.stringify({
          vendorId: 'vendor_canteen_stall',
          credential: stallPickupOtp
        })
      });
      assert.equal(res.status, 409);
    });

    // 3.6 Strict Vendor Isolation: Stall cannot access Mess
    await vt.test('3.6 Vendor Stall cannot access College Mess orders (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/orders?vendorId=vendor_college_mess`, {
        headers: { 'Authorization': 'Bearer dev_vendor_stall' }
      });
      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // SECTION 4: VENDOR B JOURNEY — COLLEGE MESS OPERATIONS
  // =========================================================================
  await t.test('4. Vendor B Journey — College Mess Daily Dining & Verification', async (vt) => {
    // 4.1 Vendor Mess Dashboard
    await vt.test('4.1 Vendor Mess dashboard returns isolated dining statistics', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/dashboard?vendorId=vendor_college_mess`, {
        headers: { 'Authorization': 'Bearer dev_vendor_mess' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.vendor.id, 'vendor_college_mess');
    });

    // 4.2 Product Availability Toggle
    await vt.test('4.2 Vendor Mess toggles dish availability off then on', async () => {
      // Toggle OFF
      const resOff = await fetch(`${BASE_URL}/api/food/vendor/menu/food_vm_01/toggle-availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_mess' },
        body: JSON.stringify({ vendorId: 'vendor_college_mess', isAvailable: false })
      });
      assert.equal(resOff.status, 200);

      // Verify Student sees it unavailable
      const resStud = await fetch(`${BASE_URL}/api/food/products/food_vm_01`);
      const dataStud = await resStud.json();
      assert.equal(dataStud.data.product.isAvailable, false);

      // Toggle back ON
      const resOn = await fetch(`${BASE_URL}/api/food/vendor/menu/food_vm_01/toggle-availability`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_mess' },
        body: JSON.stringify({ vendorId: 'vendor_college_mess', isAvailable: true })
      });
      assert.equal(resOn.status, 200);
    });

    // 4.3 Transition Mess Order to Ready for Pickup
    await vt.test('4.3 Transition Mess order to ready_for_pickup', async () => {
      assert.ok(messOrderId);
      const res = await fetch(`${BASE_URL}/api/food/vendor/orders/${messOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_mess' },
        body: JSON.stringify({ vendorId: 'vendor_college_mess', status: 'ready_for_pickup' })
      });
      assert.equal(res.status, 200);
    });

    // 4.4 Pickup Verification with QR Secret
    await vt.test('4.4 College Mess counter verifies pickup via QR Secret', async () => {
      assert.ok(messPickupQrSecret);
      const res = await fetch(`${BASE_URL}/api/food/vendor/verify-pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer dev_vendor_mess' },
        body: JSON.stringify({
          vendorId: 'vendor_college_mess',
          credential: messPickupQrSecret
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.orderStatus, 'collected');
    });

    // 4.5 Cross-Vendor Protection
    await vt.test('4.5 Vendor Mess cannot modify Stall inventory (403 Forbidden)', async () => {
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
      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // SECTION 5: ADMIN JOURNEY — CENTRAL OVERSIGHT & GOVERNANCE
  // =========================================================================
  await t.test('5. Admin Journey — Platform-Wide Oversight & Settlement', async (at) => {
    // 5.1 Admin Overview Metrics
    await at.test('5.1 Central admin overview returns live platform-wide KPIs', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/overview`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.overview.totalOrdersToday >= 2);
      assert.ok(data.data.overview.completedOrdersToday >= 2);
      assert.ok(data.data.overview.activeVendorsCount >= 2);
      assert.ok(data.data.overview.grossOrderValueToday >= 180);
    });

    // 5.2 Vendor Oversight
    await at.test('5.2 Admin can view both vendor profiles and details', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/vendors`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.vendors.some(v => v.id === 'vendor_canteen_stall'));
      assert.ok(data.data.vendors.some(v => v.id === 'vendor_college_mess'));
    });

    // 5.3 Central Food Orders Query
    await at.test('5.3 Admin can query all food orders with vendor filter', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/orders?vendorId=vendor_canteen_stall`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      for (const o of data.data.orders) {
        assert.equal(o.vendor_id, 'vendor_canteen_stall');
      }
    });

    // 5.4 Cash & Online Reconciliation
    await at.test('5.4 Admin financial reconciliation separates Cash and Gateway funds', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/reconciliation`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.totals.cashCollectedTotal >= 100);
    });

    // 5.5 Audit Logs
    await at.test('5.5 Admin can retrieve audit trail and status history logs', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/audit-logs`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(Array.isArray(data.data.logs));
    });
  });

  // =========================================================================
  // SECTION 6: PERFORMANCE & LATENCY MEASUREMENTS (Cloudflare D1 Remote Proxy)
  // =========================================================================
  await t.test('6. Performance Latency Measurements against Staging Backend', async (pt) => {
    await pt.test('6.1 Catalog response measurement', async () => {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/food/products`);
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed > 0);
      console.log(`      [PERF] Catalog response: ${elapsed}ms`);
    });

    await pt.test('6.2 Single Product detail measurement', async () => {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/food/products/food_bf_01`);
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed > 0);
      console.log(`      [PERF] Product detail response: ${elapsed}ms`);
    });

    await pt.test('6.3 Admin overview measurement', async () => {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/admin/food/overview`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      const elapsed = Date.now() - start;
      assert.equal(res.status, 200);
      assert.ok(elapsed > 0);
      console.log(`      [PERF] Admin overview response: ${elapsed}ms`);
    });
  });
});
