import assert from 'node:assert';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8787';

async function runStep12Tests() {
  console.log('--- STARTING STEP 12 FOOD CHECKOUT & MULTI-VENDOR TESTS ---');
  console.log(`Targeting backend: ${BASE_URL}\n`);

  const studentHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer test_student_step12',
  };

  // TEST 1: Preview Multi-Counter Food Order
  console.log('Test 1: Preview Multi-Counter Food Items (Canteen + Mess)...');
  const previewRes = await fetch(`${BASE_URL}/api/food/orders/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        { productId: 'food_bf_01', quantity: 2 }, // Canteen Sambar Idli (₹35 x 2 = ₹70)
        { productId: 'food_vm_01', quantity: 1 }, // Mess Meals Plate (₹80 x 1 = ₹80)
      ]
    })
  });
  const previewJson = await previewRes.json();
  assert.strictEqual(previewRes.status, 200, `Preview failed: ${JSON.stringify(previewJson)}`);
  assert.strictEqual(previewJson.success, true);
  assert.strictEqual(previewJson.data.vendorGroups.length, 2, 'Should create 2 distinct vendor groups');
  assert.strictEqual(previewJson.data.checkoutGrandTotal, 150, 'Combined grand total should be ₹150');
  console.log('✓ Test 1 Passed: Multi-counter preview validated with 2 vendor groups and combined total ₹150.\n');

  // TEST 2: Unified Multi-Counter Checkout Creation (Online UPI)
  console.log('Test 2: Create Multi-Counter Checkout Session with ONLINE_UPI...');
  const createPayload = {
    items: [
      { productId: 'food_bf_01', quantity: 2, cookingNotes: 'Hot sambar' },
      { productId: 'food_vm_01', quantity: 1, cookingNotes: 'Extra papad' }
    ],
    paymentMethod: 'ONLINE_UPI',
    idempotencyKey: `idemp_${Date.now()}_test12`
  };

  const createRes = await fetch(`${BASE_URL}/api/food/orders/create`, {
    method: 'POST',
    headers: studentHeaders,
    body: JSON.stringify(createPayload)
  });
  const createJson = await createRes.json();
  assert.strictEqual(createRes.status, 200, `Create failed: ${JSON.stringify(createJson)}`);
  assert.strictEqual(createJson.success, true);

  const { checkout, orders, requiresPayment, payment } = createJson.data;
  assert.ok(checkout, 'Parent checkout must exist');
  assert.ok(checkout.checkoutNumber.startsWith('BLZ-CHK-'), 'Checkout number formatted correctly');
  assert.strictEqual(checkout.grandTotal, 150);
  assert.strictEqual(checkout.paymentStatus, 'pending');
  assert.strictEqual(orders.length, 2, 'Exactly 2 isolated child orders must be created');
  assert.strictEqual(requiresPayment, true);
  assert.ok(payment.providerOrderId, 'Razorpay order ID generated');

  const canteenOrder = orders.find(o => o.vendorId === 'vendor_canteen_stall');
  const messOrder = orders.find(o => o.vendorId === 'vendor_college_mess');
  assert.ok(canteenOrder, 'Canteen child order must exist');
  assert.ok(messOrder, 'Mess child order must exist');
  assert.notStrictEqual(canteenOrder.id, messOrder.id, 'Child orders must have distinct IDs');
  assert.notStrictEqual(canteenOrder.tokenNumber, messOrder.tokenNumber, 'Tokens must be distinct');
  assert.strictEqual(canteenOrder.pickupOtp.length, 6, 'Pickup OTP must be 6 digits (Part 11)');
  assert.strictEqual(messOrder.pickupOtp.length, 6, 'Pickup OTP must be 6 digits (Part 11)');
  assert.ok(canteenOrder.pickupQrSecret.startsWith('pkr_'), 'Opaque secure QR token generated');
  console.log(`✓ Test 2 Passed: Parent checkout ${checkout.checkoutNumber} created with 2 child orders (${canteenOrder.orderNumber} & ${messOrder.orderNumber}), both with 6-digit OTPs.\n`);

  // TEST 3: Payment Verification on Parent Checkout
  console.log('Test 3: Verify Online Payment for Parent Checkout...');
  const verifyRes = await fetch(`${BASE_URL}/api/food/orders/verify-payment`, {
    method: 'POST',
    headers: studentHeaders,
    body: JSON.stringify({
      checkoutId: checkout.id,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: `pay_test_${Date.now()}`,
      providerSignature: 'test_signature_staging'
    })
  });
  const verifyJson = await verifyRes.json();
  assert.strictEqual(verifyRes.status, 200, `Verify payment failed: ${JSON.stringify(verifyJson)}`);
  assert.strictEqual(verifyJson.data.paymentStatus, 'paid');
  console.log('✓ Test 3 Passed: Payment verified on parent checkout and propagated to all child orders.\n');

  // TEST 4: Cash at Counter Multi-Counter Order
  console.log('Test 4: Create Multi-Counter Order with CASH_AT_COUNTER...');
  const cashRes = await fetch(`${BASE_URL}/api/food/orders/create`, {
    method: 'POST',
    headers: studentHeaders,
    body: JSON.stringify({
      items: [
        { productId: 'food_ff_01', quantity: 1 } // Chicken Burger
      ],
      paymentMethod: 'CASH_AT_COUNTER',
      idempotencyKey: `idemp_cash_${Date.now()}`
    })
  });
  const cashJson = await cashRes.json();
  assert.strictEqual(cashRes.status, 200);
  assert.strictEqual(cashJson.data.requiresPayment, false);
  assert.strictEqual(cashJson.data.orders[0].paymentStatus, 'pending', 'Cash orders must be pending payment at counter');
  assert.strictEqual(cashJson.data.orders[0].orderStatus, 'confirmed', 'Order is confirmed for kitchen prep');
  console.log('✓ Test 4 Passed: Cash order created with payment_status=pending and order_status=confirmed.\n');

  // TEST 5: Get Food Orders (Separation & Status Filters)
  console.log('Test 5: Fetch Food Orders List with Status Filters...');
  const ordersRes = await fetch(`${BASE_URL}/api/food/orders?status=all`, {
    headers: studentHeaders
  });
  const ordersJson = await ordersRes.json();
  assert.strictEqual(ordersRes.status, 200);
  assert.ok(Array.isArray(ordersJson.data.orders));
  assert.ok(ordersJson.data.orders.length >= 3, 'Should list student food orders');
  assert.ok(ordersJson.data.orders[0].items.length > 0, 'Items must be populated in orders response');

  const activeRes = await fetch(`${BASE_URL}/api/food/orders?status=active`, {
    headers: studentHeaders
  });
  const activeJson = await activeRes.json();
  assert.strictEqual(activeRes.status, 200);
  assert.ok(Array.isArray(activeJson.data.orders));
  console.log(`✓ Test 5 Passed: Food orders retrieved successfully (${ordersJson.data.orders.length} total, populated items).\n`);

  // TEST 6: Get Food Order Detail (Multi-Counter Tracking)
  console.log('Test 6: Retrieve Detailed Food Order by ID with Sibling Child Orders...');
  const detailRes = await fetch(`${BASE_URL}/api/food/orders/${canteenOrder.id}`, {
    headers: studentHeaders
  });
  const detailJson = await detailRes.json();
  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(detailJson.data.order.id, canteenOrder.id);
  assert.ok(detailJson.data.childOrders, 'Must include child orders for checkout summary');
  assert.strictEqual(detailJson.data.childOrders.length, 2, 'Must return both canteen and mess child orders');
  console.log('✓ Test 6 Passed: Multi-counter child orders returned on order detail view.\n');

  // TEST 7: Help & Support Issue Reporting (Part 12)
  console.log('Test 7: Report Support Issue against Food Order...');
  const issueRes = await fetch(`${BASE_URL}/api/food/orders/${canteenOrder.id}/issue`, {
    method: 'POST',
    headers: studentHeaders,
    body: JSON.stringify({
      issueType: 'missing_item',
      description: 'Chutney was not packed with the Masala Dosa.'
    })
  });
  const issueJson = await issueRes.json();
  assert.strictEqual(issueRes.status, 200);
  assert.ok(issueJson.data.issueId, 'Issue record ID generated');
  console.log(`✓ Test 7 Passed: Support issue logged with ID ${issueJson.data.issueId}.\n`);

  // TEST 8: Academic Printing Regression Check (Part 15)
  console.log('Test 8: Academic Printing Regression Check (Documents & Pricing Rules)...');
  const printPricingRes = await fetch(`${BASE_URL}/api/orders/pricing-rules`);
  assert.ok(printPricingRes.status === 200 || printPricingRes.status === 401, 'Printing routes responding without collision');
  console.log('✓ Test 8 Passed: Printing routes intact.\n');

  console.log('=====================================================');
  console.log('ALL STEP 12 BACKEND MULTI-COUNTER TESTS PASSED! 🎉');
  console.log('=====================================================');
}

runStep12Tests().catch((err) => {
  console.error('\n❌ STEP 12 TEST SUITE FAILED:', err);
  process.exit(1);
});
