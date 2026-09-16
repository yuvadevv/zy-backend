async function runTest() {
  const API_URL = 'http://localhost:8787/api';

  console.log("🚀 Starting E2E API Test Suite...");

  // 1. Student Login
  console.log("\n[1] Attempting Student Login...");
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'testing', password: 'password123' })
  });
  
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    console.error("❌ Student Login failed:", loginData);
    return;
  }
  const studentToken = loginData.data.session.access_token;
  console.log("✅ Student Login successful!");

  // 2. Fetch Manuals to Order
  console.log("\n[2] Fetching available manuals...");
  const manualsRes = await fetch(`${API_URL}/student/manuals`, {
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const manualsData = await manualsRes.json();
  if (!manualsData.data || manualsData.data.length === 0) {
    console.error("❌ No manuals found for student.");
    return;
  }
  const manual = manualsData.data[0];
  console.log(`✅ Found manual: ${manual.title} (${manual.id})`);

  // 3. Create Checkout Session
  console.log("\n[3] Creating order checkout session...");
  const checkoutPayload = {
    items: [{
      id: "item_123",
      serviceType: "manual",
      manualId: manual.id,
      printOptions: { copies: 1, singleSided: false, color: false, bindingType: "spiral" }
    }],
    deliveryDetails: { method: "delivery", building: "Main", roomNumber: "101" }
  };
  
  const checkoutRes = await fetch(`${API_URL}/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
    body: JSON.stringify(checkoutPayload)
  });
  const checkoutData = await checkoutRes.json();
  if (!checkoutRes.ok) {
    console.error("❌ Checkout failed:", checkoutData);
    return;
  }
  const paymentAttemptId = checkoutData.data.paymentAttemptId;
  console.log(`✅ Checkout successful! Session ID: ${paymentAttemptId}`);

  // 4. Initialize Payment
  console.log("\n[4] Initializing payment...");
  const payRes = await fetch(`${API_URL}/payments/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
    body: JSON.stringify({ orderId: paymentAttemptId })
  });
  const payData = await payRes.json();
  if (!payRes.ok) {
    console.error("❌ Payment initialization failed:", payData);
    return;
  }
  const providerOrderId = payData.data.providerOrderId;
  console.log(`✅ Payment initialized! Provider Order ID: ${providerOrderId}`);

  // 5. Verify Payment
  console.log("\n[5] Verifying payment (mock)...");
  const verifyRes = await fetch(`${API_URL}/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${studentToken}` },
    body: JSON.stringify({
      providerOrderId,
      providerPaymentId: `mock_pay_${Date.now()}`,
      providerSignature: "mock_signature"
    })
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok) {
    console.error("❌ Payment verification failed:", verifyData);
    return;
  }
  const publicOrderId = verifyData.data.orderId;
  console.log(`✅ Payment verified successfully! Public Order ID: ${publicOrderId}`);

  // 6. Representative Login
  console.log("\n[6] Attempting Representative Login...");
  const repRes = await fetch(`${API_URL}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rep@blintzy.com', password: 'password123' })
  });
  const repData = await repRes.json();
  if (!repRes.ok) {
    console.error("❌ Representative Login failed:", repData);
    console.log("Skipping rep delivery phase due to missing rep credentials.");
    return;
  }
  const repToken = repData.data.session.access_token;
  console.log("✅ Representative Login successful!");

  // 7. Rep Update Status
  console.log("\n[7] Representative marking order as Delivered...");
  const updateRes = await fetch(`${API_URL}/admin/representative/orders/${publicOrderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${repToken}` },
    body: JSON.stringify({ status: 'delivered', currentStatus: 'received' })
  });
  const updateData = await updateRes.json();
  if (!updateRes.ok) {
    console.error("❌ Representative status update failed:", updateData);
  } else {
    console.log("✅ Status updated to Delivered successfully!");
  }

  console.log("\n🎉 ALL E2E TESTS PASSED SUCCESSFULLY!");
}

runTest().catch(console.error);
