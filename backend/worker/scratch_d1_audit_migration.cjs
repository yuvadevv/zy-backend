const { createRemoteD1 } = require('./src/adapters/remoteD1.js');
const fs = require('fs');

async function run() {
  const env = {};
  fs.readFileSync('../../.env', 'utf8').split('\n').forEach(l => {
    const m = l.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  
  const DB = createRemoteD1({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: env.CLOUDFLARE_DATABASE_ID,
    apiToken: env.CLOUDFLARE_D1_API_TOKEN
  });

  console.log('Starting DB migration...');

  try {
    // 1. Rename all tables to _old (SQLite automatically updates existing FKs to point to the renamed tables)
    console.log('Renaming tables to _old...');
    await DB.prepare('ALTER TABLE oversized_file_requests RENAME TO oversized_file_requests_old').run();
    await DB.prepare('ALTER TABLE refunds RENAME TO refunds_old').run();
    await DB.prepare('ALTER TABLE orders RENAME TO orders_old').run();
    await DB.prepare('ALTER TABLE admin_user_scopes RENAME TO admin_user_scopes_old').run();
    await DB.prepare('ALTER TABLE students RENAME TO students_old').run();

    // 2. Create all new tables with correct schemas
    console.log('Creating new tables...');
    
    await DB.prepare(`
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
    `).run();

    await DB.prepare(`
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
    `).run();

    await DB.prepare(`
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
    `).run();

    await DB.prepare(`
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
    `).run();

    await DB.prepare(`
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
    `).run();

    // 3. Copy data
    console.log('Copying data...');
    await DB.prepare(`INSERT INTO students SELECT * FROM students_old`).run();
    
    await DB.prepare(`
      INSERT INTO admin_user_scopes (id, admin_id, study_year_id, branch_id, section_id, created_at)
      SELECT aus.id, aus.admin_id, aus.study_year_id, aus.branch_id, s.id, aus.created_at
      FROM admin_user_scopes_old aus
      JOIN sections s ON aus.section = s.name
    `).run();

    await DB.prepare(`INSERT INTO orders SELECT * FROM orders_old`).run();
    await DB.prepare(`INSERT INTO refunds SELECT * FROM refunds_old`).run();
    await DB.prepare(`INSERT INTO oversized_file_requests SELECT * FROM oversized_file_requests_old`).run();

    // 4. Drop _old tables
    console.log('Dropping old tables...');
    await DB.prepare(`DROP TABLE oversized_file_requests_old`).run();
    await DB.prepare(`DROP TABLE refunds_old`).run();
    await DB.prepare(`DROP TABLE orders_old`).run();
    await DB.prepare(`DROP TABLE admin_user_scopes_old`).run();
    await DB.prepare(`DROP TABLE students_old`).run();

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

run();
