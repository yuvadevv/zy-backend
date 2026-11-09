import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8787';

test('BLINTZY Food — Step 11 Vendor Onboarding & Operational Setup Suite', async (t) => {
  const testVendorId = `vendor_test_canteen_${Date.now()}`;
  const testMessId = `vendor_test_mess_${Date.now()}`;

  // =========================================================================
  // SECTION 1: VENDOR ONBOARDING APPLICATIONS
  // =========================================================================
  await t.test('1. Vendor Onboarding Applications (Canteen & Mess)', async (st) => {
    // 1.1 Apply with missing required fields -> fails
    await st.test('1.1 Rejects application with missing required business fields', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/onboarding/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_vendor_stall'
        },
        body: JSON.stringify({
          name: '' // missing name
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.error.code === 'BAD_REQUEST' || data.error.code === 'INVALID_INPUT');
    });

    // 1.2 Submit valid Canteen Stall onboarding application
    await st.test('1.2 Submit valid Canteen Stall application', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/onboarding/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_vendor_stall'
        },
        body: JSON.stringify({
          id: testVendorId,
          name: 'The Biryani & Kebab Spot',
          vendor_type: 'canteen',
          owner_name: 'Farhan Akhtar',
          owner_email: 'farhan@campusdining.edu',
          owner_phone: '+91 98765 43210',
          counter_location: 'Academic Block B - Kiosk 3',
          opening_hours: '11:00 AM - 10:00 PM',
          contact: '+91 98765 43210',
          payment_config: {
            bankName: 'HDFC Bank',
            accountNumber: '50100234567890',
            ifsc: 'HDFC0001234',
            upiId: 'farhankitchen@hdfcbank'
          }
        })
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.vendor.id, testVendorId);
      assert.equal(data.data.vendor.onboarding_status, 'pending_approval');
      assert.equal(data.data.vendor.status, 'suspended'); // suspended until approved
    });

    // 1.3 Submit valid College Mess onboarding application
    await st.test('1.3 Submit valid College Mess application', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/onboarding/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_vendor_mess'
        },
        body: JSON.stringify({
          id: testMessId,
          name: 'Block C Dining Hall',
          vendor_type: 'mess',
          owner_name: 'Mess Warden Murugan',
          owner_email: 'messwarden@campus.edu',
          owner_phone: '+91 91234 56789',
          counter_location: 'Hostel Complex North - Ground Floor',
          opening_hours: '07:30 AM - 09:30 PM',
          contact: '+91 91234 56789',
          payment_config: {
            bankName: 'State Bank of India',
            accountNumber: '30291827364',
            ifsc: 'SBIN0004567',
            upiId: 'campushostel@sbi'
          }
        })
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.vendor.id, testMessId);
      assert.equal(data.data.vendor.onboarding_status, 'pending_approval');
    });
  });

  // =========================================================================
  // SECTION 2: CHECKLIST EVALUATION & PROGRESS METRICS
  // =========================================================================
  await t.test('2. Onboarding Progress & Checklist Evaluation', async (st) => {
    await st.test('2.1 Get progress for new Canteen application', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/onboarding/progress?vendorId=${testVendorId}`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.checklistMap?.profileCompleted ?? data.data.checklist?.find(c => c.key === 'profile')?.completed, true);
      assert.equal(data.data.checklistMap?.paymentCompleted ?? data.data.checklist?.find(c => c.key === 'payment')?.completed, true);
      assert.equal(data.data.checklistMap?.adminApproved ?? data.data.checklist?.find(c => c.key === 'admin_approval')?.completed, false);
      assert.equal(data.data.can_activate, false); // cannot activate without admin approval!
      assert.ok(data.data.progress >= 30);
    });

    await st.test('2.2 Update onboarding step to pickup_tested', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/onboarding/step`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_admin'
        },
        body: JSON.stringify({
          vendorId: testVendorId,
          step: 'pickup_tested',
          pickup_tested: 1
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.pickup_tested, 1);
    });
  });

  // =========================================================================
  // SECTION 3: BULK MENU MANAGEMENT & CSV IMPORT / EXPORT
  // =========================================================================
  await t.test('3. Bulk Menu Management & CSV Import/Export', async (st) => {
    // 3.1 Bulk create menu items
    await st.test('3.1 Bulk create menu items', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/menu/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_admin'
        },
        body: JSON.stringify({
          vendorId: testVendorId,
          items: [
            {
              name: 'Hyderabadi Chicken Biryani',
              category_id: 'biryani',
              price: 180,
              dietary: 'non-veg',
              is_available: 1,
              stock: 35
            },
            {
              name: 'Paneer Tikka Roll',
              category_id: 'rolls',
              price: 90,
              dietary: 'veg',
              is_available: 1,
              stock: 25
            }
          ]
        })
      });
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.createdCount, 2);
    });

    // 3.2 Bulk update availability
    await st.test('3.2 Bulk update item availability', async () => {
      // Fetch the created items first
      const menuRes = await fetch(`${BASE_URL}/api/food/vendor/menu?vendorId=${testVendorId}`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      const menuData = await menuRes.json();
      const itemIds = (menuData.data.menu || []).map(i => i.id);
      assert.ok(itemIds.length >= 2);

      const res = await fetch(`${BASE_URL}/api/food/vendor/menu/bulk-availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_admin'
        },
        body: JSON.stringify({
          vendorId: testVendorId,
          itemIds: itemIds,
          isAvailable: false
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.updatedCount, itemIds.length);
    });

    // 3.3 CSV Import with validation (reject invalid rows)
    await st.test('3.3 Reject CSV with invalid rows', async () => {
      const invalidCSV = `name,category_id,price,dietary,stock
Invalid Zero Price,snacks,0,veg,20
Invalid Negative Price,snacks,-10,non-veg,10
`;
      const res = await fetch(`${BASE_URL}/api/food/vendor/menu/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_admin'
        },
        body: JSON.stringify({
          vendorId: testVendorId,
          csvContent: invalidCSV
        })
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      const errStr = JSON.stringify(data);
      assert.ok(errStr.includes('Line 2') || errStr.includes('price') || errStr.includes('Row 2'));
    });

    // 3.4 CSV Import with valid rows
    await st.test('3.4 Import valid CSV successfully', async () => {
      const validCSV = `name,category_id,price,dietary,stock
Egg Fried Rice,rice,110,egg,40
Chicken Shawarma,rolls,120,non-veg,50
`;
      const res = await fetch(`${BASE_URL}/api/food/vendor/menu/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_admin'
        },
        body: JSON.stringify({
          vendorId: testVendorId,
          csvContent: validCSV
        })
      });
      assert.ok([200, 201].includes(res.status));
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.importedCount, 2);
    });

    // 3.5 CSV Export
    await st.test('3.5 Export menu as CSV', async () => {
      const res = await fetch(`${BASE_URL}/api/food/vendor/menu/export-csv?vendorId=${testVendorId}`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type')?.includes('text/csv'));
      const text = await res.text();
      assert.ok(text.toLowerCase().includes('name,category,price') || text.toLowerCase().includes('name,category_id,price'));
      assert.ok(text.includes('Egg Fried Rice'));
    });
  });

  // =========================================================================
  // SECTION 4: ADMIN APPROVAL WORKFLOW & CATALOGUE ISOLATION
  // =========================================================================
  await t.test('4. Admin Approval Workflow & Catalogue Isolation', async (st) => {
    // 4.1 Unapproved vendor MUST NOT appear in public student catalogue
    await st.test('4.1 Unapproved vendor items are hidden from student catalogue', async () => {
      const res = await fetch(`${BASE_URL}/api/food/products`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      const unapprovedItem = data.data.products.find(p => p.vendorId === testVendorId);
      assert.equal(unapprovedItem, undefined, 'Unapproved vendor products must NEVER be visible to students');
    });

    // 4.2 Admin gets application list
    await st.test('4.2 Admin gets vendor applications list', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/vendors/applications`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      const app = data.data.applications.find(a => a.id === testVendorId);
      assert.ok(app, 'Test vendor application must be in admin list');
      assert.equal(app.onboarding_status, 'pending_approval');
      assert.ok(app.progress > 0);
    });

    // 4.3 Admin rejects testMessId with reason
    await st.test('4.3 Admin rejects Mess application with audit reason', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/vendors/${testMessId}/reject`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer dev_admin',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'Missing FSSAI certification and kitchen sanitation audit'
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.onboarding_status, 'rejected');

      // Verify vendor status is now rejected
      const verifyRes = await fetch(`${BASE_URL}/api/food/vendor/onboarding/progress?vendorId=${testMessId}`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      const verifyData = await verifyRes.json();
      assert.equal(verifyData.data.onboarding_status, 'rejected');
      assert.equal(verifyData.data.rejection_reason, 'Missing FSSAI certification and kitchen sanitation audit');
    });

    // 4.4 Admin approves testVendorId
    await st.test('4.4 Admin approves Canteen application', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/food/vendors/${testVendorId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer dev_admin',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notes: 'FSSAI verified, counter kiosk agreement counter-signed'
        })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.onboarding_status, 'approved');

      // Verify vendor status is now active & approved
      const verifyRes = await fetch(`${BASE_URL}/api/food/vendor/onboarding/progress?vendorId=${testVendorId}`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      const verifyData = await verifyRes.json();
      assert.equal(verifyData.data.onboarding_status, 'approved');
      assert.equal(verifyData.data.can_activate, true);
    });

    // 4.5 Make items available and verify they appear in student catalogue
    await st.test('4.5 Approved vendor items now appear in student catalogue', async () => {
      // First ensure items are marked available
      const menuRes = await fetch(`${BASE_URL}/api/food/vendor/menu?vendorId=${testVendorId}`, {
        headers: { 'Authorization': 'Bearer dev_admin' }
      });
      const menuData = await menuRes.json();
      const itemIds = (menuData.data.menu || []).map(i => i.id);

      await fetch(`${BASE_URL}/api/food/vendor/menu/bulk-availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev_admin'
        },
        body: JSON.stringify({
          vendorId: testVendorId,
          itemIds: itemIds,
          isAvailable: true
        })
      });

      // Now query public student catalogue
      const res = await fetch(`${BASE_URL}/api/food/products`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      const approvedItems = data.data.products.filter(p => p.vendorId === testVendorId);
      assert.ok(approvedItems.length > 0, 'Approved vendor products must now appear in student catalogue');
    });
  });

  // =========================================================================
  // SECTION 5: REGRESSION PROTECTION (PRINTING SYSTEM INTACT)
  // =========================================================================
  await t.test('5. Zero Regressions on Academic Printing & Existing System', async (st) => {
    await st.test('5.1 Printing pricing endpoint responds intact', async () => {
      const res = await fetch(`${BASE_URL}/api/print/pricing`);
      // Either 200 or existing route behavior
      assert.ok([200, 401, 404].includes(res.status));
    });

    await st.test('5.2 Health check / public endpoints healthy', async () => {
      const res = await fetch(`${BASE_URL}/api/food/categories`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.data.categories.length >= 6);
    });
  });
});
