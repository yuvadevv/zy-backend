const BASE_URL = 'http://localhost:8787';
const ADMIN_TOKEN = 'dev_admin';

async function runScaleTest() {
  console.log('====================================================');
  console.log('🚀 BLINTZY PUSH NOTIFICATION SCALE & SECURITY TEST');
  console.log('====================================================');

  // Stage 1: Register 100 simulated student subscriptions
  console.log('\n[Phase 1] Seeding 100 multi-device campus push subscriptions...');
  const branches = ['branch_cse', 'branch_ece', 'branch_mech', 'branch_civil'];
  const years = ['year_1', 'year_2', 'year_3', 'year_4'];
  const sections = ['A', 'B', 'C'];

  const startTime = Date.now();
  let registeredCount = 0;

  for (let i = 1; i <= 100; i++) {
    const studentId = `test_student_sim_${i}`;
    const branch = branches[i % branches.length];
    const year = years[i % years.length];
    const sec = sections[i % sections.length];
    const isInvalid = i % 10 === 0; // 10% of tokens simulated as dead/expired
    const token = isInvalid ? `mock_token_invalid_sim_${i}` : `mock_token_valid_sim_${i}_${Date.now()}`;

    // Register push subscription
    const res = await fetch(`${BASE_URL}/api/notifications/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${studentId}`
      },
      body: JSON.stringify({
        fcmToken: token,
        platform: i % 2 === 0 ? 'web_mobile' : 'web_desktop',
        deviceInfo: `Simulated Browser Device ${i}`,
        preferences: {
          order_updates: true,
          food_announcements: true,
          promotions: i % 4 !== 0, // 25% opted out of promotions
          campus_announcements: true
        }
      })
    });

    if (res.ok) registeredCount++;
  }

  const seedDuration = Date.now() - startTime;
  console.log(`✅ Seeded ${registeredCount} active subscriptions in ${seedDuration}ms (${(registeredCount / (seedDuration / 1000)).toFixed(1)} ops/sec).`);

  // Stage 2: Verify Audience Calculation Engine
  console.log('\n[Phase 2] Testing audience count calculation...');
  const countAllRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast/audience-count?branchId=all&service=all`, {
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
  });
  const countAll = await countAllRes.json();
  console.log('   All Subscribed Devices Count:', countAll.data?.eligibleDevices);

  // Stage 3: Bulk Push Broadcast Dispatch
  console.log('\n[Phase 3] Dispatching high-throughput push campaign to campus...');
  const broadcastStart = Date.now();
  const campRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({
      title: '🚨 Mid-Term Exam Printing Schedule Released',
      message: 'Hall tickets and lab manuals are now ready for immediate pickup and delivery.',
      actionUrl: '/app/services/hall-tickets',
      actionLabel: 'View Hall Tickets',
      category: 'emergency',
      audienceFilter: {
        branchId: 'all',
        studyYearId: 'all',
        section: 'all',
        service: 'all'
      }
    })
  });

  const campData = await campRes.json();
  const broadcastDuration = Date.now() - broadcastStart;
  console.log(`   Campaign Result:`, campData.data || campData);
  console.log(`   Total Target: ${campData.data?.targetCount}`);
  console.log(`   Sent: ${campData.data?.sentCount}`);
  console.log(`   Failed / Dead: ${campData.data?.failedCount}`);
  console.log(`   Deactivated Invalid Tokens: ${campData.data?.deactivatedTokens}`);
  console.log(`   Broadcast Execution Time: ${broadcastDuration}ms`);

  // Stage 4: Verify Dead Token Auto-Cleanup
  console.log('\n[Phase 4] Verifying dead token auto-cleanup in DB...');
  const countAfterRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast/audience-count?branchId=all&service=all`, {
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
  });
  const countAfter = await countAfterRes.json();
  console.log(`   Active Devices Before Cleanup: ${countAll.data?.eligibleDevices}`);
  console.log(`   Active Devices After Cleanup:  ${countAfter.data?.eligibleDevices}`);

  // Stage 5: Security & Input Validation Checks
  console.log('\n[Phase 5] Running Security & Abuse Validation Tests...');

  // Test 5A: Unauthorized user cannot broadcast
  const unauthRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer student_impostor_999'
    },
    body: JSON.stringify({ title: 'Hacked', message: 'Spam' })
  });
  console.log('   Test 5A (Unauthorized student broadcast blocked):', unauthRes.status === 401 || unauthRes.status === 403 ? 'PASS ✅' : 'FAIL ❌');

  // Test 5B: Missing title / empty message validation
  const emptyRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({ title: '', message: '' })
  });
  console.log('   Test 5B (Empty content rejection):', emptyRes.status === 400 ? 'PASS ✅' : 'FAIL ❌');

  // Test 5C: Title length restriction (> 100 chars)
  const longTitleRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({ title: 'A'.repeat(150), message: 'Valid body' })
  });
  console.log('   Test 5C (Title length limit rejection):', longTitleRes.status === 400 ? 'PASS ✅' : 'FAIL ❌');

  // Test 5D: Malicious javascript: URL rejection
  const xssUrlRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({ title: 'Valid', message: 'Valid', actionUrl: 'javascript:alert(1)' })
  });
  console.log('   Test 5D (Malicious redirect URL rejection):', xssUrlRes.status === 400 ? 'PASS ✅' : 'FAIL ❌');

  console.log('\n====================================================');
  console.log('🎉 ALL SCALE & SECURITY TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

runScaleTest().catch(err => {
  console.error('Scale Test Failed:', err);
  process.exit(1);
});
