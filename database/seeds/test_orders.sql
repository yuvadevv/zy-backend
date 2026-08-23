PRAGMA foreign_keys=off;

-- Insert a test student
INSERT INTO students (id, roll_number, name, phone, email, college_id, branch_id, study_year_id, semester_id, section, account_status, password_hash, created_at, updated_at)
VALUES (
    'stu_test_1', '20MH1A0412', 'Test User', '9876543210', 'test@example.com',
    'COL-001', 'b_cse', 'y_2', 's_3', 'A', 'active',
    'dummy_hash', unixepoch(), unixepoch()
) ON CONFLICT(id) DO NOTHING;

-- Insert a test order 1
INSERT INTO orders (internal_id, public_id, student_id, status, internal_status, delivery_type, delivery_building, delivery_room, platform_fee, gst, delivery_fee, discount, grand_total, estimated_delivery, created_at, updated_at)
VALUES (
    'ord_int_1', 'ORD-2026-001', 'stu_test_1', 'pending', 'pending',
    'hostel', 'Hostel A', 'Room 101', 5.0, 10.0, 0.0, 0.0, 150.0,
    unixepoch() + 86400, unixepoch(), unixepoch()
) ON CONFLICT(internal_id) DO NOTHING;

-- Insert an order item for order 1
INSERT INTO order_items (id, order_id, item_type, manual_id, document_id, copies, page_count, print_type, color_mode, binding_type, base_price, printing_cost, binding_cost, item_total, created_at)
VALUES (
    'item_1', 'ord_int_1', 'manual', 'm_ds_v1', NULL, 1, 124,
    'single_sided', 0, 'spiral', 135.0, 135.0, 0.0, 135.0, unixepoch()
) ON CONFLICT(id) DO NOTHING;

-- Insert payment for order 1
INSERT INTO payments (id, order_id, provider, provider_order_id, amount, currency, status, created_at, updated_at)
VALUES (
    'pay_1', 'ord_int_1', 'razorpay', 'rp_ord_1', 150.0, 'INR', 'pending', unixepoch(), unixepoch()
) ON CONFLICT(id) DO NOTHING;


-- Insert a test order 2 (paid, printing)
INSERT INTO orders (internal_id, public_id, student_id, status, internal_status, delivery_type, platform_fee, gst, delivery_fee, discount, grand_total, estimated_delivery, created_at, updated_at)
VALUES (
    'ord_int_2', 'ORD-2026-002', 'stu_test_1', 'printing', 'printing',
    'pickup', 5.0, 20.0, 0.0, 0.0, 250.0,
    unixepoch() + 86400, unixepoch(), unixepoch()
) ON CONFLICT(internal_id) DO NOTHING;

INSERT INTO payments (id, order_id, provider, provider_order_id, provider_payment_id, amount, currency, status, paid_at, created_at, updated_at)
VALUES (
    'pay_2', 'ord_int_2', 'razorpay', 'rp_ord_2', 'rp_pay_2', 250.0, 'INR', 'paid', unixepoch(), unixepoch(), unixepoch()
) ON CONFLICT(id) DO NOTHING;

PRAGMA foreign_keys=on;
