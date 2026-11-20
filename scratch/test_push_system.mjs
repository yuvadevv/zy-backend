const BASE_URL = 'http://localhost:8787';
const TEST_STUDENT_TOKEN = 'cba45b3c-f723-4284-b86b-81b395908c12';
const ADMIN_TOKEN = 'dev_admin';

async function runTests() {
  console.log('--- BLINTZY PUSH NOTIFICATION BACKEND TEST SUITE ---');

  // 1. Subscribe Student FCM Token
  console.log('\n[Test 1] Testing Student Push Subscribe...');
  const testFcmToken = `mock_token_student_${Date.now()}_abc123`;
  const subRes = await fetch(`${BASE_URL}/api/notifications/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_STUDENT_TOKEN}`
    },
    body: JSON.stringify({
      fcmToken: testFcmToken,
      platform: 'web_chrome',
      deviceInfo: 'Mozilla/5.0 Windows NT 10.0',
      preferences: {
        order_updates: true,
        food_announcements: true,
        promotions: true,
        campus_announcements: true
      }
    })
  });
  console.log('Subscribe Status:', subRes.status);
  const subData = await subRes.json();
  console.log('Subscribe Response:', subData);
  if (!subData.success) throw new Error('Subscribe failed');

  // 2. Duplicate Token Idempotency Check
  console.log('\n[Test 2] Testing Duplicate Token Registration Idempotency...');
  const dupRes = await fetch(`${BASE_URL}/api/notifications/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_STUDENT_TOKEN}`
    },
    body: JSON.stringify({
      fcmToken: testFcmToken,
      platform: 'web_chrome',
      deviceInfo: 'Mozilla/5.0 Windows NT 10.0 (Updated)'
    })
  });
  const dupData = await dupRes.json();
  console.log('Duplicate Subscribe Status:', dupRes.status, dupData.message);
  if (!dupData.success) throw new Error('Duplicate subscribe failed');

  // 3. Get Student Push Preferences
  console.log('\n[Test 3] Testing Get Preferences...');
  const prefRes = await fetch(`${BASE_URL}/api/notifications/push/preferences`, {
    headers: { 'Authorization': `Bearer ${TEST_STUDENT_TOKEN}` }
  });
  const prefData = await prefRes.json();
  console.log('Get Preferences Status:', prefRes.status, prefData);
  if (!prefData.success || !prefData.data?.preferences) throw new Error('Get preferences failed');

  // 4. Update Student Push Preferences
  console.log('\n[Test 4] Testing Update Preferences...');
  const updatePrefRes = await fetch(`${BASE_URL}/api/notifications/push/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_STUDENT_TOKEN}`
    },
    body: JSON.stringify({
      preferences: {
        order_updates: true,
        food_announcements: false,
        promotions: false,
        campus_announcements: true
      }
    })
  });
  const updatePrefData = await updatePrefRes.json();
  console.log('Update Preferences Status:', updatePrefRes.status, updatePrefData);

  // 5. Admin Audience Count Calculation
  console.log('\n[Test 5] Testing Admin Audience Count...');
  const countRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast/audience-count?branchId=all&service=all`, {
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
  });
  console.log('Audience Count Status:', countRes.status);
  const countData = await countRes.json();
  console.log('Audience Count Data:', countData);
  if (!countData.success) throw new Error('Audience count failed');

  // 6. Admin Broadcast Creation & Batch Dispatch
  console.log('\n[Test 6] Testing Admin Broadcast...');
  const broadcastRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({
      title: 'Campus Fest Special Offers! 🎉',
      message: 'Get special discounts at Campus Food Court and Express Printing today!',
      imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500',
      actionUrl: '/app/campus-food',
      actionLabel: 'View Specials',
      category: 'promotions',
      audienceFilter: {
        branchId: 'all',
        studyYearId: 'all',
        section: 'all',
        service: 'all'
      }
    })
  });
  console.log('Broadcast Status:', broadcastRes.status);
  const broadcastData = await broadcastRes.json();
  console.log('Broadcast Data:', broadcastData);
  if (!broadcastData.success) throw new Error('Broadcast failed');

  // 7. Admin List Campaigns
  console.log('\n[Test 7] Testing Admin List Campaigns...');
  const campRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast/campaigns`, {
    headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
  });
  const campData = await campRes.json();
  console.log('Campaigns count:', campData.data?.campaigns?.length || 0);

  // 8. Scale / Token Cleanup Test
  console.log('\n[Test 8] Testing Token Invalidation Cleanup on dead token...');
  const deadToken = `mock_token_invalid_${Date.now()}`;
  await fetch(`${BASE_URL}/api/notifications/push/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TEST_STUDENT_TOKEN}`
    },
    body: JSON.stringify({ fcmToken: deadToken, platform: 'web_safari' })
  });

  const deadBroadcastRes = await fetch(`${BASE_URL}/api/admin/notifications/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    },
    body: JSON.stringify({
      title: 'Cleanup Test',
      message: 'Testing automatic token cleanup',
      actionUrl: '/app'
    })
  });
  const deadBroadcastData = await deadBroadcastRes.json();
  console.log('Cleanup Broadcast Result:', deadBroadcastData);
  console.log('Deactivated Tokens:', deadBroadcastData.data?.deactivatedTokens);

  console.log('\n✅ ALL BACKEND PUSH NOTIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
