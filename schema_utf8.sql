[D1_QUERY] SELECT sql FROM sqlite_master WHERE type='table' | Params: []
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID
CREATE TABLE colleges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL
, status TEXT DEFAULT 'active')
CREATE TABLE branches (
    id TEXT PRIMARY KEY,
    college_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL, status TEXT DEFAULT 'active',
    FOREIGN KEY (college_id) REFERENCES colleges(id),
    UNIQUE (college_id, code)
)
CREATE TABLE academic_years (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    value INTEGER UNIQUE NOT NULL
, status TEXT DEFAULT 'active')
CREATE TABLE semesters (
    id TEXT PRIMARY KEY,
    academic_year_id TEXT NOT NULL,
    label TEXT NOT NULL,
    value INTEGER UNIQUE NOT NULL, status TEXT DEFAULT 'active',
    FOREIGN KEY (academic_year_id) REFERENCES academic_years(id)
)
CREATE TABLE manuals (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    pages INTEGER NOT NULL,
    base_price REAL NOT NULL,
    availability_status TEXT NOT NULL, r2_object_key TEXT, preview_object_key TEXT, vendor_id TEXT REFERENCES vendors(id), price_override REAL, delivery_override REAL, print_type TEXT DEFAULT 'Black & White', print_side TEXT DEFAULT 'Single Side', binding_type TEXT DEFAULT 'Spiral', branch_id TEXT REFERENCES branches(id), academic_year_id TEXT REFERENCES academic_years(id), semester_id TEXT REFERENCES semesters(id), stock INTEGER NOT NULL DEFAULT 0, pricing_mode TEXT DEFAULT 'settings', pdf_source TEXT DEFAULT 'r2', public_url TEXT,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
)
CREATE TABLE "orders_old" (
    internal_id TEXT PRIMARY KEY,
    public_id TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    status TEXT NOT NULL,
    internal_status TEXT NOT NULL,
    delivery_type TEXT NOT NULL,
    delivery_building TEXT,
    delivery_room TEXT,
    platform_fee REAL NOT NULL,
    gst REAL NOT NULL,
    delivery_fee REAL NOT NULL,
    discount REAL NOT NULL,
    grand_total REAL NOT NULL,
    estimated_delivery INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, vendor_id TEXT REFERENCES vendors(id), order_type TEXT DEFAULT 'manual', coupon_code TEXT, payment_attempt_id TEXT, razorpay_order_id TEXT, razorpay_payment_id TEXT, payment_status TEXT, payment_verified_at INTEGER, vendor_payable_total REAL, blintzy_gross_earning REAL, payment_gateway_fee REAL, refunds_total REAL, adjustments_total REAL, blintzy_net_earning REAL, revenue_status TEXT,
    FOREIGN KEY (student_id) REFERENCES "students_old"(id)
)
CREATE TABLE order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    manual_id TEXT,
    document_id TEXT,
    copies INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    print_type TEXT NOT NULL,
    color_mode INTEGER NOT NULL,
    binding_type TEXT NOT NULL,
    base_price REAL NOT NULL,
    printing_cost REAL NOT NULL,
    binding_cost REAL NOT NULL,
    item_total REAL NOT NULL,
    created_at INTEGER NOT NULL, pricing_mode TEXT, paper_size TEXT, printing_rate REAL, binding_rate REAL, custom_file_id TEXT, binding_rule_id TEXT, customer_unit_price REAL, customer_total REAL, vendor_unit_price REAL, vendor_total REAL, blintzy_unit_earning REAL, blintzy_total_earning REAL, pricing_rule_id TEXT, pricing_rule_snapshot TEXT, calculation_details TEXT,
    FOREIGN KEY (order_id) REFERENCES "orders_old"(internal_id),
    FOREIGN KEY (manual_id) REFERENCES manuals(id),
    FOREIGN KEY (document_id) REFERENCES documents(id)
)
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_order_id TEXT UNIQUE NOT NULL,
    provider_payment_id TEXT UNIQUE,
    provider_signature TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    paid_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES "orders_old"(internal_id)
)
CREATE TABLE sequences (
    prefix_key TEXT PRIMARY KEY,
    last_sequence INTEGER NOT NULL
)
CREATE TABLE "subjects" (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    semester_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL, status TEXT DEFAULT 'active',
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (semester_id) REFERENCES semesters(id),
    UNIQUE(branch_id, semester_id, code)
)
CREATE TABLE permissions (
    id TEXT PRIMARY KEY,
    action TEXT UNIQUE NOT NULL, -- e.g., 'users.view', 'orders.edit'
    description TEXT
)
CREATE TABLE role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
)
CREATE TABLE admin_users (
    id TEXT PRIMARY KEY, -- Maps to Supabase Auth UUID
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'suspended'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
)
CREATE TABLE admin_user_roles (
    admin_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (admin_id, role_id),
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
)
CREATE TABLE new_subjects (
    id TEXT PRIMARY KEY,
    branch_id TEXT NOT NULL,
    semester_id TEXT NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (semester_id) REFERENCES semesters(id),
    UNIQUE(branch_id, semester_id, code)
)
CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at INTEGER NOT NULL
  )
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    before_value TEXT,
    after_value TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  )
CREATE TABLE platform_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_by TEXT,
    updated_at INTEGER NOT NULL
  )
CREATE TABLE website_content (
    id TEXT PRIMARY KEY,
    content_type TEXT NOT NULL,
    title TEXT,
    metadata TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'inactive',
    start_time INTEGER,
    end_time INTEGER,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
CREATE TABLE "students_old" (
      id TEXT PRIMARY KEY,
      roll_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      college_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      study_year_id TEXT NOT NULL,
      semester_id TEXT NOT NULL,
      section TEXT,
      account_status TEXT NOT NULL,
      password_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
  , block_id TEXT, classroom_id TEXT, last_login_at INTEGER, last_active_at INTEGER)
CREATE TABLE blocks (
            id TEXT PRIMARY KEY,
            college_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (college_id) REFERENCES colleges(id)
        )
CREATE TABLE classrooms (
            id TEXT PRIMARY KEY,
            block_id TEXT NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (block_id) REFERENCES blocks(id)
        )
CREATE TABLE sections (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'active')
CREATE TABLE "vendors" (
    id TEXT PRIMARY KEY,
    supabase_user_id TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    business_name TEXT,
    contact_person TEXT,
    username TEXT UNIQUE NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    description TEXT,
    role TEXT NOT NULL DEFAULT 'vendor',
    status TEXT NOT NULL DEFAULT 'active',
    password_change_required INTEGER NOT NULL DEFAULT 1,
    last_login INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
)
CREATE TABLE coupons (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            discount_amount REAL NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
CREATE TABLE webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    processing_status TEXT NOT NULL, -- received, processed, ignored, failed
    received_at INTEGER NOT NULL,
    processed_at INTEGER,
    error_message TEXT,
    created_at INTEGER NOT NULL
)
CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    type TEXT NOT NULL, -- refund_initiated, refund_processing, refund_processed, refund_failed, payment_success, order_update
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_order_id TEXT,
    related_refund_id TEXT,
    dedupe_key TEXT UNIQUE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    read_at INTEGER, category TEXT, icon TEXT, action_label TEXT, action_url TEXT, audience_type TEXT, audience_filter_snapshot TEXT, created_by TEXT, status TEXT, sent_at INTEGER, updated_at INTEGER,
    FOREIGN KEY (student_id) REFERENCES "students_old"(id)
)
CREATE TABLE notification_recipients (
    id TEXT PRIMARY KEY,
    notification_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    delivered_at INTEGER,
    read_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES "students_old"(id) ON DELETE CASCADE,
    UNIQUE(notification_id, user_id)
)
CREATE TABLE faqs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  updated_at INTEGER
)
CREATE TABLE binding_pricing_rules (
        id TEXT PRIMARY KEY,
        min_pages INTEGER NOT NULL,
        max_pages INTEGER NOT NULL,
        price REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at INTEGER,
        updated_at INTEGER,
        created_by TEXT
      )
CREATE TABLE payment_attempts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        checkout_payload TEXT NOT NULL,
        calculated_amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT NOT NULL,
        razorpay_order_id TEXT UNIQUE,
        razorpay_payment_id TEXT UNIQUE,
        razorpay_signature TEXT,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        paid_at INTEGER
      )
CREATE TABLE vendor_blintzy_pricing (
        id TEXT PRIMARY KEY,
        service_type TEXT NOT NULL,
        pricing_method TEXT NOT NULL,
        min_pages INTEGER,
        max_pages INTEGER,
        customer_unit_price REAL NOT NULL,
        vendor_unit_price REAL NOT NULL,
        blintzy_unit_earning REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        effective_from INTEGER,
        effective_to INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        created_by TEXT,
        notes TEXT
      )
CREATE TABLE "admin_user_scopes_old" (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        study_year_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        section TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
        FOREIGN KEY (study_year_id) REFERENCES academic_years(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        UNIQUE (admin_id, study_year_id, branch_id, section)
      )
CREATE TABLE students_new (
        id TEXT PRIMARY KEY,
        roll_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        college_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        study_year_id TEXT NOT NULL,
        semester_id TEXT NOT NULL,
        section TEXT,
        account_status TEXT NOT NULL,
        password_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        block_id TEXT,
        classroom_id TEXT,
        last_login_at INTEGER,
        last_active_at INTEGER,
        FOREIGN KEY (section) REFERENCES sections(id) ON DELETE SET NULL
      )
CREATE TABLE students (
        id TEXT PRIMARY KEY,
        roll_number TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        college_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        study_year_id TEXT NOT NULL,
        semester_id TEXT NOT NULL,
        section TEXT,
        account_status TEXT NOT NULL,
        password_hash TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        block_id TEXT,
        classroom_id TEXT,
        last_login_at INTEGER,
        last_active_at INTEGER,
        FOREIGN KEY (section) REFERENCES sections(id) ON DELETE SET NULL
      )
CREATE TABLE admin_user_scopes (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        study_year_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        section_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
        FOREIGN KEY (study_year_id) REFERENCES academic_years(id),
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (section_id) REFERENCES sections(id),
        UNIQUE (admin_id, study_year_id, branch_id, section_id)
      )
CREATE TABLE orders (
        internal_id TEXT PRIMARY KEY,
        public_id TEXT UNIQUE NOT NULL,
        student_id TEXT NOT NULL,
        status TEXT NOT NULL,
        internal_status TEXT NOT NULL,
        delivery_type TEXT NOT NULL,
        delivery_building TEXT,
        delivery_room TEXT,
        platform_fee REAL NOT NULL,
        gst REAL NOT NULL,
        delivery_fee REAL NOT NULL,
        discount REAL NOT NULL,
        grand_total REAL NOT NULL,
        estimated_delivery INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL, 
        vendor_id TEXT REFERENCES vendors(id) ON DELETE SET NULL, 
        order_type TEXT DEFAULT 'manual', 
        coupon_code TEXT, 
        payment_attempt_id TEXT, 
        razorpay_order_id TEXT, 
        razorpay_payment_id TEXT, 
        payment_status TEXT, 
        payment_verified_at INTEGER, 
        vendor_payable_total REAL, 
        blintzy_gross_earning REAL, 
        payment_gateway_fee REAL, 
        refunds_total REAL, 
        adjustments_total REAL, 
        blintzy_net_earning REAL, 
        revenue_status TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id)
      )
CREATE TABLE refunds (
        id TEXT PRIMARY KEY,
        public_refund_id TEXT UNIQUE NOT NULL,
        order_id TEXT NOT NULL,
        payment_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_payment_id TEXT NOT NULL,
        provider_refund_id TEXT UNIQUE,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        admin_id TEXT NOT NULL,
        admin_note TEXT,
        initiated_at INTEGER NOT NULL,
        processed_at INTEGER,
        failed_at INTEGER,
        failure_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(internal_id),
        FOREIGN KEY (payment_id) REFERENCES payment_attempts(id),
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (admin_id) REFERENCES admin_users(id)
      )
CREATE TABLE oversized_file_requests (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        order_id TEXT,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT,
        pdf_count INTEGER NOT NULL DEFAULT 0,
        total_pages INTEGER NOT NULL DEFAULT 0,
        printing_options TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (student_id) REFERENCES students(id),
        FOREIGN KEY (order_id) REFERENCES orders(internal_id)
      )
CREATE TABLE "documents" (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        page_count INTEGER NOT NULL,
        r2_object_key TEXT UNIQUE NOT NULL,
        scan_status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        deleted_at INTEGER, 
        order_id TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id)
    )
CREATE TABLE documents_new (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        page_count INTEGER NOT NULL,
        r2_object_key TEXT UNIQUE NOT NULL,
        scan_status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        deleted_at INTEGER, 
        order_id TEXT,
        FOREIGN KEY (student_id) REFERENCES students(id)
    )
CREATE TABLE "custom_files" (
        id TEXT PRIMARY KEY,
        order_id TEXT,
        service_type TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        stored_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        page_count INTEGER NOT NULL DEFAULT 0,
        storage_provider TEXT NOT NULL,
        r2_bucket TEXT NOT NULL,
        r2_object_key TEXT UNIQUE NOT NULL,
        upload_status TEXT NOT NULL,
        is_temporary INTEGER NOT NULL DEFAULT 1,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        FOREIGN KEY (order_id) REFERENCES orders(internal_id)
    )
