import { errorResponse, successResponse } from '../utils/response.js';
import { 
  validateAndPriceFoodOrder, 
  validateAndPriceFoodMultiOrder,
  FOOD_VENDORS, 
  seedInitialMenuItems, 
  getFoodImageFallback, 
  ITEM_IMAGE_MAP 
} from '../config/foodMenu.js';
import { getStudentByUserId } from '../services/studentService.js';
import { PaymentProvider } from '../services/paymentProvider.js';

let foodTablesInitialized = false;

export async function ensureFoodTables(db) {
  try {
    // 10. Ensure food_checkouts table exists (Unified Multi-Counter Sessions)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_checkouts (
        id TEXT PRIMARY KEY,
        checkout_number TEXT UNIQUE NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT,
        student_phone TEXT,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        subtotal REAL NOT NULL,
        grand_total REAL NOT NULL,
        idempotency_key TEXT UNIQUE,
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        order_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_student ON food_checkouts(student_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_number ON food_checkouts(checkout_number)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_idemp ON food_checkouts(idempotency_key)`).run();

    // 11. Ensure food_order_issues exists (Student Help & Support)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_order_issues (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        order_number TEXT,
        student_id TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolution_notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_issues_order ON food_order_issues(order_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_issues_student ON food_order_issues(student_id)`).run();

    // Migration columns for multi-counter orders
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN checkout_id TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN checkout_number TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN cancelled_reason TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN cancelled_at INTEGER").run(); } catch {}
    try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_orders_checkout ON food_orders(checkout_id)").run(); } catch {}
  } catch (schemaErr) {
    console.error('Error ensuring food checkout schema:', schemaErr);
  }

  if (foodTablesInitialized) return;
  try {
    const probe = await db.prepare("SELECT COUNT(*) as count FROM food_menu_items").first();
    if (probe !== undefined && probe !== null) {
      await ensureVendorPlatformTables(db);
      foodTablesInitialized = true;
      await seedInitialMenuItems(db);
      return;
    }
  } catch {
    // Tables don't exist yet, proceed with creation below
  }
  try {
    // 1. Food Orders Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        token_number TEXT NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT,
        student_phone TEXT,
        vendor_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        counter_location TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        order_status TEXT NOT NULL,
        subtotal REAL NOT NULL,
        discount REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL,
        pickup_otp TEXT NOT NULL,
        pickup_qr_secret TEXT UNIQUE NOT NULL,
        idempotency_key TEXT UNIQUE,
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        collected_at INTEGER
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_orders_student ON food_orders(student_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_orders_number ON food_orders(order_number)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_orders_vendor ON food_orders(vendor_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_orders_qr ON food_orders(pickup_qr_secret)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_orders_otp ON food_orders(pickup_otp)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_orders_idemp ON food_orders(idempotency_key)`).run();

    // 1b. Food Parent Checkouts Table (Unified Multi-Counter Sessions)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_checkouts (
        id TEXT PRIMARY KEY,
        checkout_number TEXT UNIQUE NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT,
        student_phone TEXT,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        subtotal REAL NOT NULL,
        grand_total REAL NOT NULL,
        idempotency_key TEXT UNIQUE,
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        order_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_student ON food_checkouts(student_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_number ON food_checkouts(checkout_number)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_idemp ON food_checkouts(idempotency_key)`).run();

    // Migration columns for multi-counter orders
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN checkout_id TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN checkout_number TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN cancelled_reason TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN cancelled_at INTEGER").run(); } catch {}
    try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_orders_checkout ON food_orders(checkout_id)").run(); } catch {}

    // 2. Food Order Items Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        category_id TEXT,
        dietary TEXT,
        unit_price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        item_total REAL NOT NULL,
        cooking_notes TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES food_orders(id) ON DELETE CASCADE
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_order_items_order ON food_order_items(order_id)`).run();

    // 3. Vendor Menu Items Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_menu_items (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        category_id TEXT NOT NULL,
        dietary TEXT NOT NULL,
        image TEXT,
        is_available INTEGER NOT NULL DEFAULT 1,
        stock INTEGER NOT NULL DEFAULT 50,
        meal_type TEXT DEFAULT 'all_day',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_menu_vendor ON food_menu_items(vendor_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_menu_category ON food_menu_items(category_id)`).run();

    // 4. Inventory Change Logs Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_inventory_logs (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        change_amount INTEGER NOT NULL,
        new_stock INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_inv_vendor ON food_inventory_logs(vendor_id)`).run();

    // 5. Vendor Audit Logs Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_vendor_audit_logs (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_audit_vendor ON food_vendor_audit_logs(vendor_id)`).run();

    // 6. Food Vendors Master Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        counter_location TEXT NOT NULL,
        contact TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        opening_hours TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    // Seed default food vendors if not present
    const existingStall = await db.prepare(`SELECT id FROM food_vendors WHERE id = 'vendor_canteen_stall'`).first();
    const now = Date.now();
    if (!existingStall) {
      await db.prepare(`
        INSERT INTO food_vendors (id, name, counter_location, contact, status, opening_hours, created_at, updated_at)
        VALUES ('vendor_canteen_stall', 'Campus Canteen Stall', 'Counter 1 (Main Food Court)', '+91 98765 43210', 'active', '8:00 AM - 10:00 PM', ?, ?)
      `).bind(now, now).run();
    }
    const existingMess = await db.prepare(`SELECT id FROM food_vendors WHERE id = 'vendor_college_mess'`).first();
    if (!existingMess) {
      await db.prepare(`
        INSERT INTO food_vendors (id, name, counter_location, contact, status, opening_hours, created_at, updated_at)
        VALUES ('vendor_college_mess', 'College Mess Dining', 'Dining Hall Counter', '+91 98765 43211', 'active', '7:30 AM - 9:30 PM', ?, ?)
      `).bind(now, now).run();
    }

    // Ensure all onboarding and enterprise columns exist on food_vendors
    const vendorColumns = [
      "ALTER TABLE food_vendors ADD COLUMN vendor_type TEXT DEFAULT 'canteen'",
      "ALTER TABLE food_vendors ADD COLUMN owner_name TEXT",
      "ALTER TABLE food_vendors ADD COLUMN owner_email TEXT",
      "ALTER TABLE food_vendors ADD COLUMN owner_phone TEXT",
      "ALTER TABLE food_vendors ADD COLUMN logo_url TEXT",
      "ALTER TABLE food_vendors ADD COLUMN banner_url TEXT",
      "ALTER TABLE food_vendors ADD COLUMN onboarding_status TEXT DEFAULT 'approved'",
      "ALTER TABLE food_vendors ADD COLUMN onboarding_step INTEGER DEFAULT 10",
      "ALTER TABLE food_vendors ADD COLUMN payment_config TEXT",
      "ALTER TABLE food_vendors ADD COLUMN rejection_reason TEXT",
      "ALTER TABLE food_vendors ADD COLUMN approved_by TEXT",
      "ALTER TABLE food_vendors ADD COLUMN approved_at INTEGER",
      "ALTER TABLE food_vendors ADD COLUMN is_accepting_orders INTEGER DEFAULT 1",
      "ALTER TABLE food_vendors ADD COLUMN announcement TEXT",
      "ALTER TABLE food_vendors ADD COLUMN temporary_closure_reason TEXT",
      "ALTER TABLE food_vendors ADD COLUMN auto_accept_orders INTEGER DEFAULT 0",
      "ALTER TABLE food_vendors ADD COLUMN pickup_tested INTEGER DEFAULT 1"
    ];
    for (const sql of vendorColumns) {
      try { await db.prepare(sql).run(); } catch {}
    }

    // Ensure default vendors have valid types & approved onboarding
    try {
      await db.prepare(`
        UPDATE food_vendors 
        SET vendor_type = 'canteen', onboarding_status = 'approved', onboarding_step = 10,
            owner_name = COALESCE(owner_name, 'Ramesh Kumar'),
            owner_email = COALESCE(owner_email, 'ramesh.canteen@campus.blintzy.com'),
            owner_phone = COALESCE(owner_phone, '+91 98765 43210'),
            pickup_tested = 1,
            payment_config = COALESCE(payment_config, '{"upi_id":"canteen@upi","bank_account":"•••• 4821","ifsc":"HDFC0001248","accepted_methods":["ONLINE_UPI","PAY_AT_COUNTER"]}')
        WHERE id = 'vendor_canteen_stall'
      `).run();
      await db.prepare(`
        UPDATE food_vendors 
        SET vendor_type = 'mess', onboarding_status = 'approved', onboarding_step = 10,
            owner_name = COALESCE(owner_name, 'Govind Swamy'),
            owner_email = COALESCE(owner_email, 'govind.warden@campus.blintzy.com'),
            owner_phone = COALESCE(owner_phone, '+91 98765 43211'),
            pickup_tested = 1,
            payment_config = COALESCE(payment_config, '{"upi_id":"mess@upi","bank_account":"•••• 9012","ifsc":"SBIN0004521","accepted_methods":["ONLINE_UPI","PAY_AT_COUNTER"]}')
        WHERE id = 'vendor_college_mess'
      `).run();
    } catch {}

    // 7. Food Settlements Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_settlements (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        amount REAL NOT NULL,
        order_count INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'settled',
        reference_id TEXT,
        notes TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_settle_vendor ON food_settlements(vendor_id)`).run();

    // 8. Admin Food Audit Logs Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_admin_audit_logs (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        admin_email TEXT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_admin_audit_action ON food_admin_audit_logs(action)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_admin_audit_created ON food_admin_audit_logs(created_at)`).run();

    // 9. Food Order Status History Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_order_status_history (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_status_history_order ON food_order_status_history(order_id)`).run();

    // 10. Food Parent Checkouts Table (Unified Multi-Counter Sessions)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_checkouts (
        id TEXT PRIMARY KEY,
        checkout_number TEXT UNIQUE NOT NULL,
        student_id TEXT NOT NULL,
        student_name TEXT,
        student_phone TEXT,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        subtotal REAL NOT NULL,
        grand_total REAL NOT NULL,
        idempotency_key TEXT UNIQUE,
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        order_count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();

    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_student ON food_checkouts(student_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_number ON food_checkouts(checkout_number)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_checkouts_idemp ON food_checkouts(idempotency_key)`).run();

    // 11. Food Order Issues Table (Student Help & Support)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_order_issues (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        order_number TEXT,
        student_id TEXT NOT NULL,
        issue_type TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        resolution_notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_issues_order ON food_order_issues(order_id)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_issues_student ON food_order_issues(student_id)`).run();

    // Migration columns for multi-counter orders
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN checkout_id TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN checkout_number TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN cancelled_reason TEXT").run(); } catch {}
    try { await db.prepare("ALTER TABLE food_orders ADD COLUMN cancelled_at INTEGER").run(); } catch {}
    try { await db.prepare("CREATE INDEX IF NOT EXISTS idx_food_orders_checkout ON food_orders(checkout_id)").run(); } catch {}

    // Seed initial menu items if table is empty
    await seedInitialMenuItems(db);

    foodTablesInitialized = true;
  } catch (err) {
    console.error('Failed to initialize food order & vendor tables:', err);
  }
}

// Helper: Resolve & Validate Vendor Identity (Security Enforced: Context Authoritative)
function resolveVendorId(request, url, body = null, context = null) {
  // 1. Authenticated Vendor Context is strictly authoritative (Prevents BOLA/IDOR header forgery)
  if (context?.vendorId) return context.vendorId;
  if (context?.vendor?.id) return context.vendor.id;

  // 2. Authenticated Admin acting on behalf of a specific vendor
  if (context?.admin) {
    return (
      request.headers.get('X-Vendor-ID') ||
      url?.searchParams?.get('vendorId') ||
      body?.vendorId ||
      FOOD_VENDORS.CANTEEN_STALL.id
    );
  }

  // 3. Unauthenticated/Public Fallback
  return (
    request.headers.get('X-Vendor-ID') ||
    url?.searchParams?.get('vendorId') ||
    body?.vendorId ||
    FOOD_VENDORS.CANTEEN_STALL.id
  );
}

// Generate formatted Food Checkout Number e.g. BLZ-CHK-26-1001
async function generateFoodCheckoutNumber(db) {
  const yearStr = new Date().getFullYear().toString().slice(-2);
  const prefix = `BLZ-CHK-${yearStr}`;

  try {
    const seqResult = await db.prepare(`
      INSERT INTO sequences (prefix_key, last_sequence)
      VALUES (?, 1001)
      ON CONFLICT(prefix_key) DO UPDATE SET last_sequence = last_sequence + 1
      RETURNING last_sequence
    `).bind(prefix).first();

    const seqNum = seqResult?.last_sequence || Math.floor(1001 + Math.random() * 8999);
    return `${prefix}-${seqNum.toString().padStart(4, '0')}`;
  } catch (e) {
    const rand = Math.floor(1001 + Math.random() * 8999);
    return `${prefix}-${rand}`;
  }
}

// Generate formatted Food Order Number e.g. BLZ-FD-26-001
async function generateFoodOrderNumber(db) {
  const yearStr = new Date().getFullYear().toString().slice(-2);
  const prefix = `BLZ-FD-${yearStr}`;

  try {
    const seqResult = await db.prepare(`
      INSERT INTO sequences (prefix_key, last_sequence)
      VALUES (?, 1)
      ON CONFLICT(prefix_key) DO UPDATE SET last_sequence = last_sequence + 1
      RETURNING last_sequence
    `).bind(prefix).first();

    const seqNum = seqResult?.last_sequence || Math.floor(100 + Math.random() * 900);
    return `${prefix}-${seqNum.toString().padStart(3, '0')}`;
  } catch (e) {
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefix}-${rand}`;
  }
}

// Generate short 3-digit counter token e.g. F-108
async function generateCounterToken(db) {
  try {
    const todayPrefix = `TOKEN-FD-${new Date().toISOString().slice(0, 10)}`;
    const seqResult = await db.prepare(`
      INSERT INTO sequences (prefix_key, last_sequence)
      VALUES (?, 101)
      ON CONFLICT(prefix_key) DO UPDATE SET last_sequence = last_sequence + 1
      RETURNING last_sequence
    `).bind(todayPrefix).first();

    const num = seqResult?.last_sequence || Math.floor(101 + Math.random() * 899);
    return `F-${num}`;
  } catch (e) {
    return `F-${Math.floor(101 + Math.random() * 899)}`;
  }
}

// Record an action in the vendor audit log
async function logVendorAudit(db, vendorId, action, details) {
  try {
    const logId = `fal_${crypto.randomUUID().replace(/-/g, '')}`;
    await db.prepare(`
      INSERT INTO food_vendor_audit_logs (id, vendor_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(logId, vendorId, action, JSON.stringify(details), Date.now()).run();
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}

// Helper: Record Order Status History
export async function recordFoodOrderStatusHistory(db, orderId, fromStatus, toStatus, actorType, actorId, reason = null) {
  try {
    const id = `fsh_${crypto.randomUUID().replace(/-/g, '')}`;
    await db.prepare(`
      INSERT INTO food_order_status_history (id, order_id, from_status, to_status, actor_type, actor_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, orderId, fromStatus || null, toStatus, actorType, actorId || null, reason || null, Date.now()).run();
  } catch (e) {
    console.error('Failed to log order status history:', e);
  }
}

// ============================================================================
// STUDENT CATALOGUE & ORDER ENDPOINTS
// ============================================================================

/**
 * Public Food Catalogue Products
 * GET /api/food/products
 */
export async function handleGetFoodProducts(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = url.searchParams.get('vendorId');
    const categoryId = url.searchParams.get('categoryId');
    const dietary = url.searchParams.get('dietary');
    const search = url.searchParams.get('search');

    let conditions = ['1=1'];
    let params = [];

    if (vendorId && vendorId !== 'all') {
      conditions.push('m.vendor_id = ?');
      params.push(vendorId);
    }

    if (categoryId && categoryId !== 'all') {
      if (categoryId === 'meals') {
        conditions.push('(m.category_id = ? OR m.category_id = ?)');
        params.push('meals', 'veg-meals');
      } else if (categoryId === 'fast-food') {
        conditions.push('(m.category_id = ? OR m.category_id = ?)');
        params.push('fast-food', 'chicken-fast-food');
      } else if (categoryId === 'snacks') {
        conditions.push('(m.category_id = ? OR m.category_id = ?)');
        params.push('snacks', 'snacks-beverages');
      } else {
        conditions.push('m.category_id = ?');
        params.push(categoryId);
      }
    }

    if (dietary && dietary !== 'all') {
      conditions.push('m.dietary = ?');
      params.push(dietary);
    }

    if (search && search.trim().length > 0) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(m.name) LIKE ? OR LOWER(m.description) LIKE ?)');
      params.push(term, term);
    }

    // Filter available only by default
    if (url.searchParams.get('includeUnavailable') !== 'true') {
      conditions.push('m.is_available = 1');
      conditions.push('m.stock > 0');
    }

    // Only active and approved vendors
    conditions.push("(v.status = 'active' OR v.status IS NULL)");
    conditions.push("(v.onboarding_status = 'approved' OR v.onboarding_status IS NULL)");

    const sql = `
      SELECT m.*, v.name as vendor_name, v.counter_location, v.status as vendor_status
      FROM food_menu_items m
      LEFT JOIN food_vendors v ON m.vendor_id = v.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY m.vendor_id, m.category_id, m.name
    `;

    const rows = await env.DB.prepare(sql).bind(...params).all();
    const products = (rows.results || []).map(r => {
      const fallbackImg = getFoodImageFallback(r.id, r.category_id);
      const fallbackDesc = ITEM_IMAGE_MAP[r.id]?.description || 'Freshly prepared at campus counter.';
      return {
        id: r.id,
        name: r.name,
        description: (r.description && r.description.trim()) ? r.description.trim() : fallbackDesc,
        price: r.price,
        categoryId: r.category_id,
        dietary: r.dietary,
        image: (r.image && r.image.trim()) ? r.image.trim() : fallbackImg,
        isAvailable: r.is_available === 1 && r.stock > 0,
        stock: r.stock,
        vendorId: r.vendor_id,
        vendorName: r.vendor_name || (r.vendor_id === FOOD_VENDORS.COLLEGE_MESS.id ? FOOD_VENDORS.COLLEGE_MESS.name : FOOD_VENDORS.CANTEEN_STALL.name),
        counterLocation: r.counter_location || (r.vendor_id === FOOD_VENDORS.COLLEGE_MESS.id ? FOOD_VENDORS.COLLEGE_MESS.counterLocation : FOOD_VENDORS.CANTEEN_STALL.counterLocation),
        mealType: r.meal_type || 'all_day'
      };
    });

    return successResponse({ products, total: products.length });
  } catch (err) {
    console.error('Get Food Products Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food products', 500);
  }
}

/**
 * Public Single Food Product Detail
 * GET /api/food/products/:id
 */
export async function handleGetFoodProductById(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const row = await env.DB.prepare(`
      SELECT m.*, v.name as vendor_name, v.counter_location, v.status as vendor_status, v.opening_hours
      FROM food_menu_items m
      LEFT JOIN food_vendors v ON m.vendor_id = v.id
      WHERE m.id = ?
    `).bind(id).first();

    if (!row) {
      return errorResponse('NOT_FOUND', 'Food product not found', 404);
    }

    const fallbackImg = getFoodImageFallback(row.id, row.category_id);
    const fallbackDesc = ITEM_IMAGE_MAP[row.id]?.description || 'Freshly prepared at campus counter.';

    const product = {
      id: row.id,
      name: row.name,
      description: (row.description && row.description.trim()) ? row.description.trim() : fallbackDesc,
      price: row.price,
      categoryId: row.category_id,
      dietary: row.dietary,
      image: (row.image && row.image.trim()) ? row.image.trim() : fallbackImg,
      isAvailable: row.is_available === 1 && row.stock > 0 && (row.vendor_status === 'active' || !row.vendor_status),
      stock: row.stock,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      counterLocation: row.counter_location,
      vendorStatus: row.vendor_status || 'active',
      openingHours: row.opening_hours || '8:00 AM - 10:00 PM',
      mealType: row.meal_type || 'all_day'
    };

    return successResponse({ product });
  } catch (err) {
    console.error('Get Food Product By ID Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food product', 500);
  }
}

/**
 * Public Food Categories List
 * GET /api/food/categories
 */
export async function handleGetFoodCategories(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const rows = await env.DB.prepare(`
      SELECT category_id, COUNT(*) as count 
      FROM food_menu_items 
      WHERE is_available = 1 
      GROUP BY category_id
    `).all();

    const categories = (rows.results || []).map(r => ({
      id: r.category_id,
      label: r.category_id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count: r.count
    }));

    return successResponse({ categories });
  } catch (err) {
    console.error('Get Food Categories Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food categories', 500);
  }
}

/**
 * Public Food Counters/Vendors List
 * GET /api/food/vendors
 */
export async function handleGetFoodVendors(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const rows = await env.DB.prepare(`
      SELECT id, name, counter_location, contact, status, opening_hours, vendor_type,
             logo_url, banner_url, onboarding_status, is_accepting_orders, announcement
      FROM food_vendors
      WHERE status = 'active' AND (onboarding_status = 'approved' OR onboarding_status IS NULL)
      ORDER BY name
    `).all();

    const vendors = (rows.results || []).map(r => ({
      id: r.id,
      name: r.name,
      counterLocation: r.counter_location,
      contact: r.contact,
      status: r.status,
      openingHours: r.opening_hours || '8:00 AM - 10:00 PM',
      vendorType: r.vendor_type || (r.id === 'vendor_college_mess' ? 'mess' : 'canteen'),
      image: r.id === 'vendor_college_mess' ? '/images/food/rce_mess_cover.webp' : '/images/food/chopsticks_cover.webp',
      isAcceptingOrders: r.is_accepting_orders === 1,
      announcement: r.announcement
    }));

    return successResponse({ vendors });
  } catch (err) {
    console.error('Get Food Vendors Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food vendors', 500);
  }
}

/**
 * Public RCE Mess Weekly Schedule
 * GET /api/food/mess/weekly-menu
 */
export async function handleGetFoodMessWeeklyMenu(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    let rows = await env.DB.prepare(`
      SELECT * FROM food_mess_weekly_menu WHERE is_active = 1 ORDER BY sort_order ASC
    `).all().catch(() => ({ results: [] }));

    const DAY_MAP = {
      'sunday': 0, 'sun': 0, '0': 0,
      'monday': 1, 'mon': 1, '1': 1,
      'tuesday': 2, 'tue': 2, '2': 2,
      'wednesday': 3, 'wed': 3, '3': 3,
      'thursday': 4, 'thu': 4, '4': 4,
      'friday': 5, 'fri': 5, '5': 5,
      'saturday': 6, 'sat': 6, '6': 6,
      'monthly special': -1, 'monthly_special': -1, 'special': -1, '-1': -1
    };

    let menu = (rows.results || []).map(r => {
      let items = [];
      try {
        items = typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []);
      } catch {
        items = (r.items || '').split(',').map(s => s.trim());
      }
      const rawDay = String(r.day_of_week || '').toLowerCase().trim();
      const numDay = rawDay in DAY_MAP ? DAY_MAP[rawDay] : (typeof r.day_of_week === 'number' ? r.day_of_week : 1);
      return {
        id: r.id,
        vendorId: r.vendor_id,
        day: numDay === -1 ? 'Monthly Special' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][numDay] || r.day_of_week,
        dayOfWeek: numDay,
        title: r.title,
        items,
        image: r.image || '/images/food/rce_mess_cover.webp',
        notes: r.notes,
        mealTimings: r.meal_timings || 'Lunch: 12:30 PM - 2:30 PM | Dinner: 7:30 PM - 9:30 PM',
        adminFlagged: Boolean(r.admin_flagged),
        sortOrder: r.sort_order
      };
    });

    // Fallback if table had not been migrated yet
    if (menu.length === 0) {
      menu = RCE_MESS_WEEKLY_MENU.map((m, idx) => ({
        id: `mess_day_${m.day_of_week}`,
        vendorId: 'vendor_college_mess',
        day: m.day,
        dayOfWeek: m.day_of_week,
        title: m.title,
        items: m.items,
        image: '/images/food/rce_mess_cover.webp',
        notes: m.notes,
        mealTimings: m.meal_timings,
        adminFlagged: Boolean(m.admin_flagged),
        sortOrder: idx
      }));
    }

    return successResponse({ menu });
  } catch (err) {
    console.error('Get Mess Weekly Menu Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve weekly mess menu', 500);
  }
}

/**
 * Update RCE Mess Weekly Schedule
 * PUT /api/food/mess/weekly-menu/:id
 */
export async function handleUpdateFoodMessWeeklyMenu(request, env, context, menuId) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { title, items, notes, mealTimings, adminFlagged, isActive } = body;

    const existing = await env.DB.prepare('SELECT id FROM food_mess_weekly_menu WHERE id = ?').bind(menuId).first();
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Weekly mess menu entry not found', 404);
    }

    const itemsStr = Array.isArray(items) ? JSON.stringify(items) : (typeof items === 'string' ? items : '[]');
    const now = Date.now();

    await env.DB.prepare(`
      UPDATE food_mess_weekly_menu
      SET title = COALESCE(?, title),
          items = COALESCE(?, items),
          notes = COALESCE(?, notes),
          meal_timings = COALESCE(?, meal_timings),
          admin_flagged = COALESCE(?, admin_flagged),
          is_active = COALESCE(?, is_active),
          updated_at = ?
      WHERE id = ?
    `).bind(
      title !== undefined ? title : null,
      items !== undefined ? itemsStr : null,
      notes !== undefined ? notes : null,
      mealTimings !== undefined ? mealTimings : null,
      adminFlagged !== undefined ? (adminFlagged ? 1 : 0) : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      now,
      menuId
    ).run();

    return successResponse({ success: true, message: 'Mess weekly menu updated successfully' });
  } catch (err) {
    console.error('Update Mess Weekly Menu Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update weekly mess menu', 500);
  }
}

// ============================================================================
// STUDENT ORDER ENDPOINTS
// ============================================================================

/**
 * 1. Order Preview & Authoritative Price Calculation
 * POST /api/food/orders/preview
 */
export async function handlePreviewFoodOrder(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { items, vendorId } = body;

    const validation = await validateAndPriceFoodMultiOrder(env.DB, items);
    if (!validation.success) {
      return errorResponse('BAD_REQUEST', validation.error, 400);
    }

    return successResponse({
      ...validation,
      subtotal: validation.checkoutSubtotal,
      grandTotal: validation.checkoutGrandTotal,
    });
  } catch (err) {
    console.error('Food Order Preview Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to calculate food order pricing', 500);
  }
}

/**
 * 2. Secure Order Creation (Unified Checkout + Separate Vendor Child Orders)
 * POST /api/food/orders/create
 */
export async function handleCreateFoodOrder(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    // Check if food service is locked by administration
    try {
      const { results: settingRows } = await env.DB.prepare(
        "SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN ('food_service_status', 'food_service_enabled', 'food_service_main_locked', 'food_service_lock_message')"
      ).all();
      const fSettings = {};
      for (const r of settingRows || []) {
        try { fSettings[r.setting_key] = JSON.parse(r.setting_value); } catch { fSettings[r.setting_key] = r.setting_value; }
      }

      const isEnabled = fSettings.food_service_enabled === undefined || fSettings.food_service_enabled === true || fSettings.food_service_enabled === 'true';
      const isMainLocked = fSettings.food_service_main_locked === undefined || fSettings.food_service_main_locked === true || fSettings.food_service_main_locked === 'true';

      if (!isEnabled) {
        const msg = fSettings.food_service_lock_message || 'Campus Food ordering is currently locked by administration.';
        return errorResponse('SERVICE_LOCKED', msg, 403);
      }

      // Check if client is coming from main branch
      const origin = (request.headers.get('origin') || request.headers.get('referer') || '').toLowerCase();
      const isTestingClient = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('git-testing') || origin.includes('testing');
      
      if (isMainLocked && !isTestingClient) {
        const msg = fSettings.food_service_lock_message || 'Campus Food ordering is launching soon! Please check back later.';
        return errorResponse('SERVICE_LOCKED', msg, 403);
      }
    } catch (checkErr) {
      console.warn('Food service lock check skipped on error:', checkErr);
    }

    const body = await request.json();
    const { 
      items, 
      paymentMethod, 
      idempotencyKey,
    } = body;

    if (!paymentMethod || !['ONLINE_UPI', 'CASH_AT_COUNTER'].includes(paymentMethod)) {
      return errorResponse('BAD_REQUEST', 'Invalid payment method. Must be ONLINE_UPI or CASH_AT_COUNTER.', 400);
    }

    // 1. Authoritative Student Details strictly read-only from database
    const dbStudent = await getStudentByUserId(env.DB, studentId);
    const verifiedStudentName = dbStudent?.name || context.user.name || 'Student';
    const verifiedStudentPhone = dbStudent?.phone || '';

    // 2. Idempotency Check (Parent Checkouts & Child Orders)
    if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim().length > 0) {
      const cleanKey = idempotencyKey.trim();
      const existingCheckout = await env.DB.prepare(`
        SELECT * FROM food_checkouts WHERE idempotency_key = ? AND student_id = ?
      `).bind(cleanKey, studentId).first();

      if (existingCheckout) {
        const childOrders = await env.DB.prepare(`
          SELECT * FROM food_orders WHERE checkout_id = ? ORDER BY created_at ASC
        `).bind(existingCheckout.id).all();

        const ordersWithItems = [];
        for (const ord of childOrders.results || []) {
          const itms = await env.DB.prepare(`SELECT * FROM food_order_items WHERE order_id = ?`).bind(ord.id).all();
          ordersWithItems.push({ ...ord, items: itms.results || [] });
        }

        return successResponse({
          checkout: existingCheckout,
          order: ordersWithItems[0] || null,
          orders: ordersWithItems,
          isDuplicate: true,
          message: 'Order already exists for this idempotency session.',
        });
      }
    }

    // 3. Multi-Counter Pricing & Validation
    const validation = await validateAndPriceFoodMultiOrder(env.DB, items);
    if (!validation.success) {
      return errorResponse('BAD_REQUEST', validation.error, 400);
    }

    const { vendorGroups, checkoutSubtotal, checkoutGrandTotal } = validation;
    const now = Date.now();

    // 4. Create Parent Checkout Identity
    const internalCheckoutId = `chk_${crypto.randomUUID().replace(/-/g, '')}`;
    const publicCheckoutNumber = await generateFoodCheckoutNumber(env.DB);

    let razorpayOrderId = null;
    let paymentData = null;
    let initialPaymentStatus = 'pending';
    let initialOrderStatus = 'confirmed';

    // 5. Online Payment Gateway Integration (Single combined transaction for parent checkout)
    if (paymentMethod === 'ONLINE_UPI') {
      initialPaymentStatus = 'pending';
      initialOrderStatus = 'payment_pending';

      const provider = new PaymentProvider(env);
      const isDevMock = env.PAYMENT_MODE === 'mock' && env.ENVIRONMENT !== 'production';

      if (isDevMock) {
        razorpayOrderId = `mock_food_order_${internalCheckoutId.slice(4, 14)}_${Date.now()}`;
        paymentData = {
          providerOrderId: razorpayOrderId,
          amount: checkoutGrandTotal,
          currency: 'INR',
          keyId: 'mock_key',
        };
      } else {
        const receiptId = `chk_${internalCheckoutId.slice(4, 14)}`;
        try {
          const gwOrder = await provider.createOrder(checkoutGrandTotal, 'INR', receiptId);
          razorpayOrderId = gwOrder.id;
          paymentData = {
            providerOrderId: gwOrder.id,
            amount: checkoutGrandTotal,
            currency: 'INR',
            keyId: env.RAZORPAY_KEY_ID,
          };
        } catch (gwErr) {
          console.error('Razorpay Order Creation Failed:', gwErr);
          return errorResponse('SERVER_ERROR', 'Failed to initialize payment gateway order.', 500);
        }
      }
    } else {
      initialPaymentStatus = 'pending';
      initialOrderStatus = 'confirmed';
    }

    // 6. Concurrency & Stock Reservation across all vendor groups
    const reservedItems = [];
    let outOfStockItem = null;

    for (const group of vendorGroups) {
      for (const item of group.items) {
        const updateResult = await env.DB.prepare(`
          UPDATE food_menu_items 
          SET stock = stock - ?,
              is_available = CASE WHEN (stock - ?) <= 0 THEN 0 ELSE is_available END,
              updated_at = ?
          WHERE id = ? AND stock >= ? AND is_available = 1
        `).bind(item.quantity, item.quantity, now, item.productId, item.quantity).run();

        if (updateResult.meta.changes === 0) {
          outOfStockItem = item;
          break;
        }
        reservedItems.push(item);
      }
      if (outOfStockItem) break;
    }

    if (outOfStockItem) {
      // Rollback any successfully reserved portions
      for (const resItem of reservedItems) {
        await env.DB.prepare(`
          UPDATE food_menu_items 
          SET stock = stock + ?, is_available = 1, updated_at = ?
          WHERE id = ?
        `).bind(resItem.quantity, now, resItem.productId).run();
      }
      return errorResponse('CONFLICT', `Item "${outOfStockItem.name}" is out of stock or does not have enough remaining portions.`, 409);
    }

    // 7. Atomic Database Batch: Parent Checkout + Isolated Child Vendor Orders
    const statements = [];

    // Insert Parent Checkout
    statements.push(env.DB.prepare(`
      INSERT INTO food_checkouts (
        id, checkout_number, student_id, student_name, student_phone,
        payment_method, payment_status, subtotal, grand_total,
        idempotency_key, razorpay_order_id, order_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      internalCheckoutId, publicCheckoutNumber, studentId, verifiedStudentName, verifiedStudentPhone,
      paymentMethod, initialPaymentStatus, checkoutSubtotal, checkoutGrandTotal,
      idempotencyKey || null, razorpayOrderId, vendorGroups.length, now, now
    ));

    const createdOrders = [];

    // For each vendor group, generate separate vendor order record
    for (const group of vendorGroups) {
      const internalOrderId = `fo_${crypto.randomUUID().replace(/-/g, '')}`;
      const publicOrderNumber = await generateFoodOrderNumber(env.DB);
      const tokenNumber = await generateCounterToken(env.DB);

      // Secure 6-digit random pickup code (Part 11)
      const pickupOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const pickupQrSecret = `pkr_${crypto.randomUUID().replace(/-/g, '')}`;

      statements.push(env.DB.prepare(`
        INSERT INTO food_orders (
          id, order_number, token_number, student_id, student_name, student_phone,
          vendor_id, vendor_name, counter_location, payment_method,
          payment_status, order_status, subtotal, discount, grand_total,
          pickup_otp, pickup_qr_secret, idempotency_key, razorpay_order_id,
          checkout_id, checkout_number, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        internalOrderId, publicOrderNumber, tokenNumber, studentId, verifiedStudentName, verifiedStudentPhone,
        group.vendorId, group.vendorName, group.counterLocation, paymentMethod,
        initialPaymentStatus, initialOrderStatus, group.subtotal, group.grandTotal,
        pickupOtp, pickupQrSecret, idempotencyKey ? `${idempotencyKey}_${group.vendorId}` : null, razorpayOrderId,
        internalCheckoutId, publicCheckoutNumber, now, now
      ));

      // Items for this vendor order
      for (const item of group.items) {
        const itemId = `foi_${crypto.randomUUID().replace(/-/g, '')}`;
        statements.push(env.DB.prepare(`
          INSERT INTO food_order_items (
            id, order_id, product_id, product_name, category_id, dietary,
            unit_price, quantity, item_total, cooking_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          itemId, internalOrderId, item.productId, item.name, item.categoryId, item.dietary,
          item.unitPrice, item.quantity, item.itemTotal, item.cookingNotes, now
        ));

        // Inventory Log
        const logId = `inv_${crypto.randomUUID().replace(/-/g, '')}`;
        statements.push(env.DB.prepare(`
          INSERT INTO food_inventory_logs (id, vendor_id, product_id, change_amount, new_stock, reason, created_at)
          SELECT ?, ?, ?, ?, stock, 'order_placed', ? FROM food_menu_items WHERE id = ?
        `).bind(logId, group.vendorId, item.productId, -item.quantity, now, item.productId));
      }

      // Order status history
      const histId = `fsh_${crypto.randomUUID().replace(/-/g, '')}`;
      statements.push(env.DB.prepare(`
        INSERT INTO food_order_status_history (id, order_id, from_status, to_status, actor_type, actor_id, reason, created_at)
        VALUES (?, ?, NULL, ?, 'student', ?, 'Order Placed', ?)
      `).bind(histId, internalOrderId, initialOrderStatus, studentId, now));

      createdOrders.push({
        id: internalOrderId,
        orderNumber: publicOrderNumber,
        tokenNumber,
        studentId,
        studentName: verifiedStudentName,
        studentPhone: verifiedStudentPhone,
        vendorId: group.vendorId,
        vendorName: group.vendorName,
        counterLocation: group.counterLocation,
        paymentMethod,
        paymentStatus: initialPaymentStatus,
        orderStatus: initialOrderStatus,
        subtotal: group.subtotal,
        grandTotal: group.grandTotal,
        pickupOtp,
        pickupQrSecret,
        checkoutId: internalCheckoutId,
        checkoutNumber: publicCheckoutNumber,
        createdAt: now,
        items: group.items,
      });
    }

    try {
      await env.DB.batch(statements);
    } catch (batchErr) {
      // Restore reserved stock if database batch fails
      for (const resItem of reservedItems) {
        await env.DB.prepare(`
          UPDATE food_menu_items 
          SET stock = stock + ?, is_available = 1, updated_at = ?
          WHERE id = ?
        `).bind(resItem.quantity, now, resItem.productId).run();
      }
      throw batchErr;
    }

    const fullCheckout = {
      id: internalCheckoutId,
      checkoutNumber: publicCheckoutNumber,
      studentId,
      studentName: verifiedStudentName,
      studentPhone: verifiedStudentPhone,
      paymentMethod,
      paymentStatus: initialPaymentStatus,
      subtotal: checkoutSubtotal,
      grandTotal: checkoutGrandTotal,
      orderCount: createdOrders.length,
      createdAt: now,
      orders: createdOrders,
    };

    return successResponse({
      checkout: fullCheckout,
      order: createdOrders[0], // for backwards compatibility with single-counter readers
      orders: createdOrders,
      requiresPayment: paymentMethod === 'ONLINE_UPI',
      payment: paymentData,
    });
  } catch (err) {
    console.error('Create Food Order Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create food order.', 500);
  }
}

/**
 * 3. Server-side Payment Verification
 * POST /api/food/orders/verify-payment
 */
export async function handleVerifyFoodPayment(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await request.json();
    const { 
      checkoutId, 
      orderId, 
      providerOrderId, 
      providerPaymentId, 
      providerSignature 
    } = body;

    if ((!checkoutId && !orderId) || !providerOrderId) {
      return errorResponse('BAD_REQUEST', 'Missing required order or payment credentials.', 400);
    }

    const now = Date.now();
    const isDevMock = env.PAYMENT_MODE === 'mock' && env.ENVIRONMENT !== 'production';

    // Verify signature strictly on server
    if (!isDevMock) {
      if (!providerSignature || !providerPaymentId) {
        return errorResponse('BAD_REQUEST', 'Missing gateway signature or payment ID.', 400);
      }
      const provider = new PaymentProvider(env);
      const isValid = await provider.verifySignature(providerOrderId, providerPaymentId, providerSignature);
      if (!isValid) {
        return errorResponse('BAD_REQUEST', 'Server-side payment signature verification failed.', 400);
      }
    }

    const paymentId = providerPaymentId || `mock_pay_${Date.now()}`;

    // Case 1: Verification for Parent Checkout
    if (checkoutId) {
      const checkout = await env.DB.prepare(`
        SELECT * FROM food_checkouts 
        WHERE (id = ? OR checkout_number = ?) AND student_id = ?
      `).bind(checkoutId, checkoutId, studentId).first();

      if (checkout) {
        await env.DB.prepare(`
          UPDATE food_checkouts 
          SET payment_status = 'paid', razorpay_payment_id = ?, updated_at = ?
          WHERE id = ?
        `).bind(paymentId, now, checkout.id).run();

        await env.DB.prepare(`
          UPDATE food_orders 
          SET payment_status = 'paid', order_status = 'confirmed', razorpay_payment_id = ?, updated_at = ?
          WHERE checkout_id = ?
        `).bind(paymentId, now, checkout.id).run();

        const childOrders = await env.DB.prepare(`
          SELECT * FROM food_orders WHERE checkout_id = ?
        `).bind(checkout.id).all();

        for (const ord of childOrders.results || []) {
          await recordFoodOrderStatusHistory(env.DB, ord.id, 'payment_pending', 'confirmed', 'system', 'payment_verified', 'Online UPI Payment Confirmed');
        }

        return successResponse({
          status: 'paid',
          paymentStatus: 'paid',
          checkoutId: checkout.id,
          checkoutNumber: checkout.checkout_number,
          orders: childOrders.results || [],
          message: 'Checkout payment verified successfully.'
        });
      }
    }

    // Case 2: Verification for Single Child Order (or fallback by orderId)
    const targetId = orderId || checkoutId;
    const order = await env.DB.prepare(`
      SELECT * FROM food_orders 
      WHERE (id = ? OR order_number = ?) AND student_id = ?
    `).bind(targetId, targetId, studentId).first();

    if (!order) {
      return errorResponse('NOT_FOUND', 'Food order not found.', 404);
    }

    if (order.payment_status === 'paid') {
      return successResponse({
        status: 'paid',
        message: 'Order payment already verified.',
        orderId: order.order_number,
      });
    }

    // Update child order
    await env.DB.prepare(`
      UPDATE food_orders 
      SET payment_status = 'paid', order_status = 'confirmed', razorpay_payment_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(paymentId, now, order.id).run();

    await recordFoodOrderStatusHistory(env.DB, order.id, order.order_status, 'confirmed', 'system', 'payment_verified', 'Online UPI Payment Confirmed');

    // If order is part of parent checkout, update parent checkout and siblings
    if (order.checkout_id) {
      await env.DB.prepare(`
        UPDATE food_checkouts 
        SET payment_status = 'paid', razorpay_payment_id = ?, updated_at = ?
        WHERE id = ?
      `).bind(paymentId, now, order.checkout_id).run();

      await env.DB.prepare(`
        UPDATE food_orders 
        SET payment_status = 'paid', order_status = 'confirmed', razorpay_payment_id = ?, updated_at = ?
        WHERE checkout_id = ?
      `).bind(paymentId, now, order.checkout_id).run();
    }

    return successResponse({
      status: 'paid',
      paymentStatus: 'paid',
      orderStatus: 'confirmed',
      orderId: order.id,
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
    });
  } catch (err) {
    console.error('Verify Food Payment Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to verify food payment.', 500);
  }
}

/**
 * 4. List Student's Food Orders (Separated strictly from Printing)
 * GET /api/food/orders
 */
export async function handleGetFoodOrders(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get('status') || 'all';

    let conditions = ['student_id = ?'];
    let params = [studentId];

    if (statusFilter === 'active') {
      conditions.push("order_status IN ('confirmed', 'accepted', 'preparing')");
    } else if (statusFilter === 'ready_for_pickup') {
      conditions.push("order_status = 'ready_for_pickup'");
    } else if (statusFilter === 'completed') {
      conditions.push("order_status = 'completed'");
    } else if (statusFilter === 'cancelled') {
      conditions.push("order_status IN ('cancelled', 'rejected')");
    }

    const querySql = `
      SELECT * FROM food_orders 
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC 
      LIMIT 100
    `;

    const ordersResult = await env.DB.prepare(querySql).bind(...params).all();
    const ordersList = ordersResult.results || [];

    // Attach items to each order
    const populatedOrders = [];
    for (const ord of ordersList) {
      const itemsRes = await env.DB.prepare(`
        SELECT * FROM food_order_items WHERE order_id = ? ORDER BY created_at ASC
      `).bind(ord.id).all();

      populatedOrders.push({
        ...ord,
        items: itemsRes.results || [],
      });
    }

    return successResponse({ orders: populatedOrders, total: populatedOrders.length });
  } catch (err) {
    console.error('Get Food Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food orders.', 500);
  }
}

/**
 * 5. Get Detailed Food Order by ID (Includes parent checkout & sibling child orders)
 * GET /api/food/orders/:id
 */
export async function handleGetFoodOrderById(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    // 1. Try finding in food_orders
    const order = await env.DB.prepare(`
      SELECT * FROM food_orders 
      WHERE (id = ? OR order_number = ?) AND student_id = ?
    `).bind(id, id, studentId).first();

    if (order) {
      const itemsResult = await env.DB.prepare(`
        SELECT * FROM food_order_items WHERE order_id = ?
      `).bind(order.id).all();

      let childOrders = [{ ...order, items: itemsResult.results || [] }];
      let parentCheckout = null;

      if (order.checkout_id) {
        parentCheckout = await env.DB.prepare(`
          SELECT * FROM food_checkouts WHERE id = ?
        `).bind(order.checkout_id).first();

        const siblings = await env.DB.prepare(`
          SELECT * FROM food_orders WHERE checkout_id = ? AND student_id = ? ORDER BY created_at ASC
        `).bind(order.checkout_id, studentId).all();

        childOrders = [];
        for (const sib of siblings.results || []) {
          const sibItems = await env.DB.prepare(`SELECT * FROM food_order_items WHERE order_id = ?`).bind(sib.id).all();
          childOrders.push({ ...sib, items: sibItems.results || [] });
        }
      }

      return successResponse({
        order: {
          ...order,
          items: itemsResult.results || [],
        },
        checkout: parentCheckout,
        childOrders,
      });
    }

    // 2. Try finding in food_checkouts (if student queried by checkout number)
    const checkout = await env.DB.prepare(`
      SELECT * FROM food_checkouts 
      WHERE (id = ? OR checkout_number = ?) AND student_id = ?
    `).bind(id, id, studentId).first();

    if (checkout) {
      const linkedOrders = await env.DB.prepare(`
        SELECT * FROM food_orders WHERE checkout_id = ? AND student_id = ? ORDER BY created_at ASC
      `).bind(checkout.id, studentId).all();

      const ordersWithItems = [];
      for (const ord of linkedOrders.results || []) {
        const itms = await env.DB.prepare(`SELECT * FROM food_order_items WHERE order_id = ?`).bind(ord.id).all();
        ordersWithItems.push({ ...ord, items: itms.results || [] });
      }

      return successResponse({
        checkout,
        order: ordersWithItems[0] || null,
        childOrders: ordersWithItems,
      });
    }

    return errorResponse('NOT_FOUND', 'Food order not found.', 404);
  } catch (err) {
    console.error('Get Food Order Detail Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve food order details.', 500);
  }
}

/**
 * 5b. Get Food Checkout Session Details
 * GET /api/food/checkouts/:id
 */
export async function handleGetFoodCheckoutById(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const checkout = await env.DB.prepare(`
      SELECT * FROM food_checkouts 
      WHERE (id = ? OR checkout_number = ?) AND student_id = ?
    `).bind(id, id, studentId).first();

    if (!checkout) {
      return errorResponse('NOT_FOUND', 'Checkout session not found.', 404);
    }

    const linkedOrders = await env.DB.prepare(`
      SELECT * FROM food_orders WHERE checkout_id = ? ORDER BY created_at ASC
    `).bind(checkout.id).all();

    const ordersWithItems = [];
    for (const ord of linkedOrders.results || []) {
      const itms = await env.DB.prepare(`SELECT * FROM food_order_items WHERE order_id = ?`).bind(ord.id).all();
      ordersWithItems.push({ ...ord, items: itms.results || [] });
    }

    return successResponse({
      checkout: {
        ...checkout,
        orders: ordersWithItems,
      }
    });
  } catch (err) {
    console.error('Get Food Checkout Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve checkout details.', 500);
  }
}

/**
 * 5c. Report Issue with Food Order (Part 12 Help & Support)
 * POST /api/food/orders/:id/issue
 */
export async function handleReportFoodOrderIssue(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const studentId = context.user.id;
    if (!studentId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await request.json();
    const { issueType, description } = body;

    if (!issueType || !description || !description.trim()) {
      return errorResponse('BAD_REQUEST', 'Please select an issue type and provide a description.', 400);
    }

    const order = await env.DB.prepare(`
      SELECT id, order_number, vendor_name FROM food_orders 
      WHERE (id = ? OR order_number = ?) AND student_id = ?
    `).bind(id, id, studentId).first();

    if (!order) {
      return errorResponse('NOT_FOUND', 'Food order not found.', 404);
    }

    const issueId = `fiss_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO food_order_issues (
        id, order_id, order_number, student_id, issue_type, description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).bind(issueId, order.id, order.order_number, studentId, issueType, description.trim(), now, now).run();

    return successResponse({
      issueId,
      orderNumber: order.order_number,
      message: `Your issue regarding order ${order.order_number} has been logged. Our campus dining team will resolve it promptly.`
    });
  } catch (err) {
    console.error('Report Food Order Issue Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to submit food support issue.', 500);
  }
}

/**
 * 6. Quick Pickup Verification & Collection Endpoint
 * POST /api/food/orders/:id/verify-pickup
 */
export async function handleVerifyFoodPickup(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const { credential } = body;

    if (!credential || typeof credential !== 'string') {
      return errorResponse('BAD_REQUEST', 'Missing pickup verification credential (OTP or QR secret).', 400);
    }

    const cleanCred = credential.trim();

    const order = await env.DB.prepare(`
      SELECT * FROM food_orders 
      WHERE id = ? OR order_number = ? OR pickup_qr_secret = ? OR (pickup_otp = ? AND (id = ? OR order_number = ?))
    `).bind(id, id, cleanCred, cleanCred, id, id).first();

    if (!order) {
      return errorResponse('NOT_FOUND', 'Food order matching this reference or credential was not found.', 404);
    }

    if (order.order_status === 'collected') {
      const collectedTime = order.collected_at ? new Date(order.collected_at).toLocaleTimeString() : 'earlier';
      return errorResponse('CONFLICT', `Order #${order.token_number} has ALREADY been collected at ${collectedTime}. Credentials cannot be reused.`, 409);
    }

    if (order.order_status === 'cancelled') {
      return errorResponse('BAD_REQUEST', `Order #${order.token_number} was cancelled. Cannot verify pickup.`, 400);
    }

    const matchesOtp = order.pickup_otp === cleanCred;
    const matchesQr = order.pickup_qr_secret === cleanCred;

    if (!matchesOtp && !matchesQr) {
      return errorResponse('FORBIDDEN', 'Invalid pickup credential. Credential does not match this order.', 403);
    }

    const now = Date.now();
    const isCashPayment = order.payment_method === 'CASH_AT_COUNTER';
    const newPaymentStatus = isCashPayment ? 'paid' : order.payment_status;

    await env.DB.prepare(`
      UPDATE food_orders 
      SET order_status = 'collected',
          payment_status = ?,
          collected_at = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(newPaymentStatus, now, now, order.id).run();

    await recordFoodOrderStatusHistory(
      env.DB,
      order.id,
      order.order_status,
      'collected',
      'vendor_staff',
      vendorId,
      `Counter verification via ${cleanCred.length === 4 ? 'OTP' : 'QR_SECRET'}`
    );

    return successResponse({
      verified: true,
      orderStatus: 'collected',
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
      collectedAt: now,
      paymentStatus: newPaymentStatus,
      message: `Pickup verified successfully for Token #${order.token_number}!`,
    });
  } catch (err) {
    console.error('Verify Food Pickup Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to verify food pickup.', 500);
  }
}

// ============================================================================
// VENDOR DASHBOARD & KITCHEN MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * 7. Vendor Dashboard Aggregated Analytics
 * GET /api/food/vendor/dashboard
 */
export async function handleVendorGetDashboard(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);

    if (!vendorId) {
      return errorResponse('BAD_REQUEST', 'Invalid or missing vendor ID. Must be vendor_canteen_stall or vendor_college_mess.', 400);
    }

    // Today's start timestamp (00:00:00 local time)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTodayMs = startOfToday.getTime();

    // Query orders for this vendor
    const ordersResult = await env.DB.prepare(`
      SELECT * FROM food_orders 
      WHERE vendor_id = ? AND created_at >= ?
      ORDER BY created_at DESC
    `).bind(vendorId, startTodayMs).all();

    const orders = ordersResult.results || [];

    // Aggregations
    let todayOrdersCount = orders.length;
    let pendingCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let completedCount = 0;
    let todaySales = 0;
    let onlinePaid = 0;
    let cashCollected = 0;
    let cashPending = 0;

    for (const ord of orders) {
      const status = (ord.order_status || '').toLowerCase();
      const pStatus = (ord.payment_status || '').toLowerCase();
      const pMethod = ord.payment_method;
      const amt = Number(ord.grand_total) || 0;

      if (status === 'confirmed' || status === 'payment_pending') pendingCount++;
      else if (status === 'preparing') preparingCount++;
      else if (status === 'ready') readyCount++;
      else if (status === 'collected') completedCount++;

      if (status === 'collected' || pStatus === 'paid') {
        todaySales += amt;
      }

      if (pMethod === 'ONLINE_UPI' && pStatus === 'paid') {
        onlinePaid += amt;
      } else if (pMethod === 'CASH_AT_COUNTER') {
        if (status === 'collected' || pStatus === 'paid') {
          cashCollected += amt;
        } else {
          cashPending += amt;
        }
      }
    }

    // Active menu items count
    const menuStats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as totalItems,
        SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END) as availableItems,
        SUM(CASE WHEN is_available = 0 OR stock = 0 THEN 1 ELSE 0 END) as soldOutItems
      FROM food_menu_items 
      WHERE vendor_id = ?
    `).bind(vendorId).first();

    const vendorInfo = Object.values(FOOD_VENDORS).find((v) => v.id === vendorId) || {
      id: vendorId,
      name: 'Campus Vendor',
      counterLocation: 'Campus Counter',
    };

    return successResponse({
      vendor: vendorInfo,
      stats: {
        todayOrders: todayOrdersCount,
        pendingOrders: pendingCount,
        preparingOrders: preparingCount,
        readyOrders: readyCount,
        completedOrders: completedCount,
        todaySales,
      },
      paymentSummary: {
        onlinePaid,
        cashCollected,
        cashPending,
        totalReconciled: onlinePaid + cashCollected,
      },
      menuSummary: {
        totalItems: menuStats?.totalItems || 0,
        availableItems: menuStats?.availableItems || 0,
        soldOutItems: menuStats?.soldOutItems || 0,
      },
    });
  } catch (err) {
    console.error('Vendor Dashboard Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor dashboard stats.', 500);
  }
}

/**
 * 8. Live Kitchen Order Queue
 * GET /api/food/vendor/orders
 */
export async function handleVendorGetOrders(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);

    if (!vendorId) {
      return errorResponse('BAD_REQUEST', 'Invalid or missing vendor ID.', 400);
    }

    const filterStatus = url.searchParams.get('status') || 'all';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

    let query = `SELECT * FROM food_orders WHERE vendor_id = ?`;
    const params = [vendorId];

    if (filterStatus !== 'all') {
      query += ` AND order_status = ?`;
      params.push(filterStatus);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const ordersResult = await env.DB.prepare(query).bind(...params).all();
    const orders = ordersResult.results || [];

    // Fetch items for each order
    const enrichedOrders = await Promise.all(
      orders.map(async (ord) => {
        const items = await env.DB.prepare(`
          SELECT * FROM food_order_items WHERE order_id = ?
        `).bind(ord.id).all();

        return {
          ...ord,
          items: items.results || [],
        };
      })
    );

    return successResponse({
      vendorId,
      orders: enrichedOrders,
    });
  } catch (err) {
    console.error('Vendor Get Orders Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve vendor kitchen queue.', 500);
  }
}

/**
 * 9. Kitchen Status Transition
 * PATCH /api/food/vendor/orders/:id/status
 */
export async function handleVendorUpdateOrderStatus(request, env, context, orderId) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const body = await request.json();
    const vendorId = resolveVendorId(request, url, body, context);
    const rawTargetStatus = body.status;
    const allowedStatuses = ['confirmed', 'preparing', 'ready', 'ready_for_pickup', 'collected', 'cancelled'];
    if (!rawTargetStatus || !allowedStatuses.includes(rawTargetStatus)) {
      return errorResponse('BAD_REQUEST', `Invalid order status. Allowed: ${allowedStatuses.join(', ')}`, 400);
    }
    const targetStatus = (rawTargetStatus === 'ready' || rawTargetStatus === 'ready_for_pickup') ? 'ready_for_pickup' : rawTargetStatus;

    // 1. Verify vendor ownership
    const order = await env.DB.prepare(`
      SELECT * FROM food_orders WHERE id = ? OR order_number = ?
    `).bind(orderId, orderId).first();

    if (!order) {
      return errorResponse('NOT_FOUND', 'Order not found.', 404);
    }

    if (order.vendor_id !== vendorId) {
      return errorResponse('FORBIDDEN', 'Access denied. You can only update orders belonging to your counter.', 403);
    }

    // 2. Validate state transition
    const currStatus = order.order_status;
    if (currStatus === 'collected' && targetStatus !== 'collected') {
      return errorResponse('CONFLICT', 'Order has already been collected. Status cannot be modified.', 409);
    }
    if (currStatus === 'cancelled') {
      return errorResponse('CONFLICT', 'Order is cancelled and cannot transition to other stages.', 409);
    }

    const now = Date.now();
    const stmts = [];

    // If cancelled, restore item stock!
    if (targetStatus === 'cancelled' && currStatus !== 'cancelled') {
      const items = await env.DB.prepare(`SELECT product_id, quantity FROM food_order_items WHERE order_id = ?`).bind(order.id).all();
      for (const it of items.results || []) {
        stmts.push(env.DB.prepare(`
          UPDATE food_menu_items 
          SET stock = stock + ?, is_available = 1, updated_at = ? 
          WHERE id = ?
        `).bind(it.quantity, now, it.product_id));

        stmts.push(env.DB.prepare(`
          INSERT INTO food_inventory_logs (id, vendor_id, product_id, change_amount, new_stock, reason, created_at)
          VALUES (?, ?, ?, ?, (SELECT stock FROM food_menu_items WHERE id = ?), 'order_cancelled', ?)
        `).bind(`fil_${crypto.randomUUID().slice(0, 8)}`, vendorId, it.product_id, it.quantity, it.product_id, now));
      }
    }

    stmts.push(env.DB.prepare(`
      UPDATE food_orders 
      SET order_status = ?, updated_at = ?
      WHERE id = ?
    `).bind(targetStatus, now, order.id));

    // Record order status history
    const fshId = `fsh_${crypto.randomUUID().replace(/-/g, '')}`;
    stmts.push(env.DB.prepare(`
      INSERT INTO food_order_status_history (id, order_id, from_status, to_status, actor_type, actor_id, reason, created_at)
      VALUES (?, ?, ?, ?, 'vendor', ?, ?, ?)
    `).bind(fshId, order.id, currStatus, targetStatus, vendorId, body.reason || 'Kitchen stage transition', now));

    await env.DB.batch(stmts);

    // Audit log
    await logVendorAudit(env.DB, vendorId, 'status_transition', {
      orderId: order.id,
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
      fromStatus: currStatus,
      toStatus: targetStatus,
    });

    return successResponse({
      success: true,
      orderId: order.order_number,
      orderStatus: targetStatus,
      previousStatus: currStatus,
      currentStatus: targetStatus,
      updatedAt: now,
    });
  } catch (err) {
    console.error('Vendor Update Order Status Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update order status.', 500);
  }
}

/**
 * 10. Vendor Menu Listing
 * GET /api/food/vendor/menu
 */
export async function handleVendorGetMenu(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);

    if (!vendorId) {
      return errorResponse('BAD_REQUEST', 'Invalid or missing vendor ID.', 400);
    }

    const mealType = url.searchParams.get('mealType') || 'all';
    let query = `SELECT * FROM food_menu_items WHERE vendor_id = ?`;
    const params = [vendorId];

    if (mealType !== 'all') {
      query += ` AND (meal_type = ? OR meal_type = 'all_day')`;
      params.push(mealType);
    }

    query += ` ORDER BY category_id, name ASC`;

    const menuResult = await env.DB.prepare(query).bind(...params).all();

    return successResponse({
      vendorId,
      menu: menuResult.results || [],
    });
  } catch (err) {
    console.error('Vendor Get Menu Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to fetch vendor menu.', 500);
  }
}

/**
 * 11. Add Food Product
 * POST /api/food/vendor/menu
 */
export async function handleVendorCreateMenuItem(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const body = await request.json();
    const vendorId = resolveVendorId(request, url, body, context);

    if (!vendorId) {
      return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);
    }

    const { name, description, price, categoryId, dietary, image, stock, mealType } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return errorResponse('BAD_REQUEST', 'Product name must be at least 2 characters.', 400);
    }

    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return errorResponse('BAD_REQUEST', 'Price must be a positive number.', 400);
    }

    if (!categoryId) {
      return errorResponse('BAD_REQUEST', 'Category ID is required.', 400);
    }

    if (!dietary || !['veg', 'non-veg', 'egg'].includes(dietary)) {
      return errorResponse('BAD_REQUEST', 'Dietary must be veg, non-veg, or egg.', 400);
    }

    const now = Date.now();
    const newId = `food_${categoryId.slice(0, 2)}_${Date.now().toString().slice(-5)}`;
    const finalStock = Number(stock) || 50;
    const finalMealType = mealType || (vendorId === FOOD_VENDORS.COLLEGE_MESS.id ? 'lunch' : 'all_day');

    await env.DB.prepare(`
      INSERT INTO food_menu_items (
        id, vendor_id, name, description, price, category_id, dietary,
        image, is_available, stock, meal_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      newId, vendorId, name.trim(), description?.trim() || '', numPrice,
      categoryId, dietary, image || '/images/banners/banner_campus_food.webp',
      finalStock, finalMealType, now, now
    ).run();

    await logVendorAudit(env.DB, vendorId, 'create_menu_item', {
      itemId: newId,
      name: name.trim(),
      price: numPrice,
    });

    return successResponse({
      success: true,
      item: {
        id: newId,
        vendor_id: vendorId,
        name: name.trim(),
        price: numPrice,
        category_id: categoryId,
        dietary,
        stock: finalStock,
        meal_type: finalMealType,
      },
    });
  } catch (err) {
    console.error('Vendor Create Menu Item Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create menu item.', 500);
  }
}

/**
 * 12. Edit Food Product
 * PUT /api/food/vendor/menu/:id
 */
export async function handleVendorUpdateMenuItem(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const body = await request.json();
    const vendorId = resolveVendorId(request, url, body, context);

    const existing = await env.DB.prepare(`
      SELECT * FROM food_menu_items WHERE id = ? AND vendor_id = ?
    `).bind(id, vendorId).first();

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Menu item not found or does not belong to your counter.', 404);
    }

    const { name, description, price, categoryId, dietary, image, stock, isAvailable, mealType } = body;

    const numPrice = price !== undefined ? Number(price) : existing.price;
    const numStock = stock !== undefined ? Number(stock) : existing.stock;
    const now = Date.now();

    await env.DB.prepare(`
      UPDATE food_menu_items 
      SET name = ?, description = ?, price = ?, category_id = ?, dietary = ?,
          image = ?, stock = ?, is_available = ?, meal_type = ?, updated_at = ?
      WHERE id = ? AND vendor_id = ?
    `).bind(
      name?.trim() || existing.name,
      description !== undefined ? description.trim() : existing.description,
      numPrice,
      categoryId || existing.category_id,
      dietary || existing.dietary,
      image || existing.image,
      numStock,
      isAvailable !== undefined ? (isAvailable ? 1 : 0) : existing.is_available,
      mealType || existing.meal_type,
      now,
      id,
      vendorId
    ).run();

    await logVendorAudit(env.DB, vendorId, 'update_menu_item', {
      itemId: id,
      updates: body,
    });

    return successResponse({
      success: true,
      message: 'Product updated successfully.',
    });
  } catch (err) {
    console.error('Vendor Update Menu Item Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update menu item.', 500);
  }
}

/**
 * 13. Quick Toggle Availability (In Stock / Sold Out)
 * PATCH /api/food/vendor/menu/:id/toggle-availability
 */
export async function handleVendorToggleAvailability(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const body = await request.json();
    const vendorId = resolveVendorId(request, url, body, context);
    const { isAvailable } = body;

    const now = Date.now();
    let newStatus;
    if (typeof isAvailable === 'boolean') {
      newStatus = isAvailable ? 1 : 0;
      const result = await env.DB.prepare(`
        UPDATE food_menu_items 
        SET is_available = ?, updated_at = ?
        WHERE id = ? AND vendor_id = ?
      `).bind(newStatus, now, id, vendorId).run();

      if (result.meta.changes === 0) {
        return errorResponse('NOT_FOUND', 'Item not found for this vendor.', 404);
      }
    } else {
      const result = await env.DB.prepare(`
        UPDATE food_menu_items 
        SET is_available = (CASE WHEN is_available = 1 THEN 0 ELSE 1 END), updated_at = ?
        WHERE id = ? AND vendor_id = ?
      `).bind(now, id, vendorId).run();

      if (result.meta.changes === 0) {
        return errorResponse('NOT_FOUND', 'Item not found for this vendor.', 404);
      }
      const item = await env.DB.prepare(`SELECT is_available FROM food_menu_items WHERE id = ?`).bind(id).first();
      newStatus = item ? item.is_available : 1;
    }

    await logVendorAudit(env.DB, vendorId, 'toggle_availability', {
      itemId: id,
      isAvailable: Boolean(newStatus),
    });

    return successResponse({
      success: true,
      id,
      isAvailable: Boolean(newStatus),
    });
  } catch (err) {
    console.error('Toggle Availability Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to toggle product availability.', 500);
  }
}

/**
 * 14. Adjust Available Stock & Log History
 * PATCH /api/food/vendor/inventory/update-stock
 */
export async function handleVendorUpdateStock(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const body = await request.json();
    const vendorId = resolveVendorId(request, url, body, context);
    const { productId, newStock, reason } = body;

    if (!productId || newStock === undefined) {
      return errorResponse('BAD_REQUEST', 'productId and newStock are required.', 400);
    }

    const stockNum = Math.max(0, parseInt(newStock, 10));

    const existing = await env.DB.prepare(`
      SELECT * FROM food_menu_items WHERE id = ? AND vendor_id = ?
    `).bind(productId, vendorId).first();

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Menu item not found for this vendor.', 404);
    }

    const diff = stockNum - existing.stock;
    const now = Date.now();
    const isAvailable = stockNum > 0 ? 1 : 0;

    const stmts = [
      env.DB.prepare(`
        UPDATE food_menu_items 
        SET stock = ?, is_available = ?, updated_at = ?
        WHERE id = ? AND vendor_id = ?
      `).bind(stockNum, isAvailable, now, productId, vendorId),

      env.DB.prepare(`
        INSERT INTO food_inventory_logs (
          id, vendor_id, product_id, change_amount, new_stock, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `fil_${crypto.randomUUID().slice(0, 8)}`,
        vendorId,
        productId,
        diff,
        stockNum,
        reason || 'manual_adjustment',
        now
      ),
    ];

    await env.DB.batch(stmts);

    await logVendorAudit(env.DB, vendorId, 'inventory_adjustment', {
      productId,
      oldStock: existing.stock,
      newStock: stockNum,
      reason: reason || 'manual_adjustment',
    });

    return successResponse({
      success: true,
      productId,
      stock: stockNum,
      isAvailable: isAvailable === 1,
    });
  } catch (err) {
    console.error('Update Stock Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update inventory stock.', 500);
  }
}

/**
 * 15. Vendor Pickup Verification Endpoint
 * POST /api/food/vendor/verify-pickup
 */
export async function handleVendorVerifyPickup(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const body = await request.json();
    const vendorId = resolveVendorId(request, url, body, context);
    const { credential } = body;

    if (!credential || typeof credential !== 'string') {
      return errorResponse('BAD_REQUEST', 'Missing pickup credential (OTP or QR secret).', 400);
    }

    const cleanCred = credential.trim();

    // 1. Locate order by credential (QR Secret or OTP ONLY — never guessable order_number)
    const order = await env.DB.prepare(`
      SELECT * FROM food_orders 
      WHERE pickup_qr_secret = ? OR pickup_otp = ?
    `).bind(cleanCred, cleanCred).first();

    if (!order) {
      return errorResponse('NOT_FOUND', 'No food order matches this pickup code.', 404);
    }

    // 2. Strict Vendor Isolation Verification
    if (order.vendor_id !== vendorId) {
      return errorResponse(
        'FORBIDDEN',
        `Access Denied: This order belongs to "${order.vendor_name}" at ${order.counter_location}. Please direct the student to their designated counter.`,
        403
      );
    }

    // 3. Prevent Replay / Credential Reuse
    if (order.order_status === 'collected') {
      const collectedTime = order.collected_at ? new Date(order.collected_at).toLocaleTimeString() : 'earlier';
      return errorResponse(
        'CONFLICT',
        `Order #${order.token_number} (${order.order_number}) has ALREADY been collected at ${collectedTime}. Credentials cannot be reused.`,
        409
      );
    }

    if (order.order_status === 'cancelled') {
      return errorResponse('BAD_REQUEST', `Order #${order.token_number} was cancelled. Cannot verify pickup.`, 400);
    }

    const now = Date.now();
    const isCashPayment = order.payment_method === 'CASH_AT_COUNTER';
    const newPaymentStatus = isCashPayment ? 'paid' : order.payment_status;

    await env.DB.prepare(`
      UPDATE food_orders 
      SET order_status = 'collected',
          payment_status = ?,
          collected_at = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(newPaymentStatus, now, now, order.id).run();

    await recordFoodOrderStatusHistory(
      env.DB,
      order.id,
      order.order_status,
      'collected',
      'vendor_staff',
      vendorId,
      `Counter verification via ${cleanCred.length === 4 ? 'OTP' : 'QR_SECRET'}`
    );

    await logVendorAudit(env.DB, vendorId, 'pickup_verified', {
      orderId: order.id,
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
      credentialUsed: cleanCred.length === 4 ? 'OTP' : 'QR_SECRET',
    });

    return successResponse({
      verified: true,
      orderStatus: 'collected',
      orderNumber: order.order_number,
      tokenNumber: order.token_number,
      studentName: order.student_name,
      grandTotal: order.grand_total,
      paymentMethod: order.payment_method,
      paymentStatus: newPaymentStatus,
      collectedAt: now,
      message: `Pickup verified successfully for Token #${order.token_number}!`,
    });
  } catch (err) {
    console.error('Vendor Verify Pickup Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to verify pickup credential.', 500);
  }
}

// ============================================================================
// STEP 10: VENDOR PLATFORM ENTERPRISE MODULES (STAFF, MESS, INVENTORY, SETTINGS)
// ============================================================================

let vendorPlatformTablesInitialized = false;

export async function ensureVendorPlatformTables(db) {
  if (vendorPlatformTablesInitialized) return;
  try {
    // 0. Ensure all onboarding and enterprise columns exist on food_vendors
    const vendorColumns = [
      "ALTER TABLE food_vendors ADD COLUMN vendor_type TEXT DEFAULT 'canteen'",
      "ALTER TABLE food_vendors ADD COLUMN owner_name TEXT",
      "ALTER TABLE food_vendors ADD COLUMN owner_email TEXT",
      "ALTER TABLE food_vendors ADD COLUMN owner_phone TEXT",
      "ALTER TABLE food_vendors ADD COLUMN logo_url TEXT",
      "ALTER TABLE food_vendors ADD COLUMN banner_url TEXT",
      "ALTER TABLE food_vendors ADD COLUMN onboarding_status TEXT DEFAULT 'approved'",
      "ALTER TABLE food_vendors ADD COLUMN onboarding_step INTEGER DEFAULT 10",
      "ALTER TABLE food_vendors ADD COLUMN payment_config TEXT",
      "ALTER TABLE food_vendors ADD COLUMN rejection_reason TEXT",
      "ALTER TABLE food_vendors ADD COLUMN approved_by TEXT",
      "ALTER TABLE food_vendors ADD COLUMN approved_at INTEGER",
      "ALTER TABLE food_vendors ADD COLUMN is_accepting_orders INTEGER DEFAULT 1",
      "ALTER TABLE food_vendors ADD COLUMN announcement TEXT",
      "ALTER TABLE food_vendors ADD COLUMN temporary_closure_reason TEXT",
      "ALTER TABLE food_vendors ADD COLUMN auto_accept_orders INTEGER DEFAULT 0",
      "ALTER TABLE food_vendors ADD COLUMN pickup_tested INTEGER DEFAULT 1"
    ];
    for (const sql of vendorColumns) {
      try { await db.prepare(sql).run(); } catch {}
    }

    // Ensure default vendors have valid types & approved onboarding
    try {
      await db.prepare(`
        UPDATE food_vendors 
        SET vendor_type = 'canteen', onboarding_status = 'approved', onboarding_step = 10,
            owner_name = COALESCE(owner_name, 'Ramesh Kumar'),
            owner_email = COALESCE(owner_email, 'ramesh.canteen@campus.blintzy.com'),
            owner_phone = COALESCE(owner_phone, '+91 98765 43210'),
            pickup_tested = 1,
            payment_config = COALESCE(payment_config, '{"upi_id":"canteen@upi","bank_account":"•••• 4821","ifsc":"HDFC0001248","accepted_methods":["ONLINE_UPI","PAY_AT_COUNTER"]}')
        WHERE id = 'vendor_canteen_stall'
      `).run();
      await db.prepare(`
        UPDATE food_vendors 
        SET vendor_type = 'mess', onboarding_status = 'approved', onboarding_step = 10,
            owner_name = COALESCE(owner_name, 'Govind Swamy'),
            owner_email = COALESCE(owner_email, 'govind.warden@campus.blintzy.com'),
            owner_phone = COALESCE(owner_phone, '+91 98765 43211'),
            pickup_tested = 1,
            payment_config = COALESCE(payment_config, '{"upi_id":"mess@upi","bank_account":"•••• 9012","ifsc":"SBIN0004521","accepted_methods":["ONLINE_UPI","PAY_AT_COUNTER"]}')
        WHERE id = 'vendor_college_mess'
      `).run();
    } catch {}

    // 1. Food Vendor Staff Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_vendor_staff (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_staff_vendor ON food_vendor_staff(vendor_id)`).run();

    // 2. Food Mess Schedules Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_mess_schedules (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        cutoff_time TEXT NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 250,
        booked_count INTEGER NOT NULL DEFAULT 0,
        collected_count INTEGER NOT NULL DEFAULT 0,
        price REAL NOT NULL DEFAULT 80,
        menu_title TEXT NOT NULL,
        menu_items TEXT NOT NULL,
        is_available INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mess_sched_date ON food_mess_schedules(vendor_id, date)`).run();

    // 3. Food Ingredients Table
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS food_ingredients (
        id TEXT PRIMARY KEY,
        vendor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        current_stock REAL NOT NULL DEFAULT 0,
        unit TEXT NOT NULL,
        low_stock_threshold REAL NOT NULL DEFAULT 10,
        daily_consumption REAL NOT NULL DEFAULT 0,
        last_restocked_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_food_ing_vendor ON food_ingredients(vendor_id)`).run();

    // Seed default staff if empty
    const staffCount = await db.prepare("SELECT COUNT(*) as count FROM food_vendor_staff").first();
    const now = Date.now();
    if (!staffCount || staffCount.count === 0) {
      const defaultStaff = [
        { id: 'staff_cs_01', vendor_id: 'vendor_canteen_stall', name: 'Ramesh Kumar', email: 'ramesh.canteen@campus.blintzy.com', role: 'owner', phone: '+91 98765 43210' },
        { id: 'staff_cs_02', vendor_id: 'vendor_canteen_stall', name: 'Suresh Rao', email: 'suresh.kitchen@campus.blintzy.com', role: 'kitchen_staff', phone: '+91 98765 43212' },
        { id: 'staff_cs_03', vendor_id: 'vendor_canteen_stall', name: 'Anil Sharma', email: 'anil.counter@campus.blintzy.com', role: 'counter_staff', phone: '+91 98765 43213' },
        { id: 'staff_cm_01', vendor_id: 'vendor_college_mess', name: 'Govind Swamy', email: 'govind.warden@campus.blintzy.com', role: 'owner', phone: '+91 98765 43211' },
        { id: 'staff_cm_02', vendor_id: 'vendor_college_mess', name: 'Mahesh Babu', email: 'mahesh.chef@campus.blintzy.com', role: 'kitchen_staff', phone: '+91 98765 43214' },
        { id: 'staff_cm_03', vendor_id: 'vendor_college_mess', name: 'Raju Goud', email: 'raju.supervisor@campus.blintzy.com', role: 'meal_supervisor', phone: '+91 98765 43215' },
        { id: 'staff_cm_04', vendor_id: 'vendor_college_mess', name: 'Kiran Kumar', email: 'kiran.counter@campus.blintzy.com', role: 'counter_staff', phone: '+91 98765 43216' },
      ];
      for (const s of defaultStaff) {
        await db.prepare(`
          INSERT INTO food_vendor_staff (id, vendor_id, name, email, role, phone, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).bind(s.id, s.vendor_id, s.name, s.email, s.role, s.phone, now, now).run();
      }
    }

    // Seed default mess schedules for Today and Tomorrow if empty
    const schedCount = await db.prepare("SELECT COUNT(*) as count FROM food_mess_schedules").first();
    if (!schedCount || schedCount.count === 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const defaultSchedules = [
        {
          id: `sched_${todayStr}_bf`,
          vendor_id: 'vendor_college_mess',
          meal_type: 'breakfast',
          date: todayStr,
          start_time: '07:30',
          end_time: '09:30',
          cutoff_time: '07:00',
          capacity: 250,
          booked_count: 18,
          collected_count: 14,
          price: 35,
          menu_title: 'South Indian Breakfast Feast',
          menu_items: 'Steamed Rice Idlis (3 pcs), Medu Vada (1 pc), Coconut Chutney, Tomato Chutney, Drumstick Sambar & Filter Coffee',
        },
        {
          id: `sched_${todayStr}_lu`,
          vendor_id: 'vendor_college_mess',
          meal_type: 'lunch',
          date: todayStr,
          start_time: '12:30',
          end_time: '14:30',
          cutoff_time: '11:30',
          capacity: 350,
          booked_count: 42,
          collected_count: 36,
          price: 80,
          menu_title: 'Special South Indian Meals Thali',
          menu_items: 'Steamed Sona Masoori Rice, Aromatic Sambar, Pepper Rasam, Paneer Butter Masala, Beetroot Poriyal, Curd, Appalam & Pickle',
        },
        {
          id: `sched_${todayStr}_di`,
          vendor_id: 'vendor_college_mess',
          meal_type: 'dinner',
          date: todayStr,
          start_time: '19:30',
          end_time: '21:30',
          cutoff_time: '18:30',
          capacity: 300,
          booked_count: 28,
          collected_count: 0,
          price: 75,
          menu_title: 'North Indian Deluxe Dinner',
          menu_items: 'Phulka Rotis (3 pcs), Dal Makhani, Mixed Vegetable Korma, Jeera Rice, Fresh Salad & Gulab Jamun (1 pc)',
        },
        {
          id: `sched_${tomorrowStr}_bf`,
          vendor_id: 'vendor_college_mess',
          meal_type: 'breakfast',
          date: tomorrowStr,
          start_time: '07:30',
          end_time: '09:30',
          cutoff_time: '07:00',
          capacity: 250,
          booked_count: 8,
          collected_count: 0,
          price: 40,
          menu_title: 'Crispy Masala Dosa Morning',
          menu_items: 'Crispy Mysore Masala Dosa with Spiced Potato Filling, Coconut Chutney, Sambar & Ginger Tea',
        },
        {
          id: `sched_${tomorrowStr}_lu`,
          vendor_id: 'vendor_college_mess',
          meal_type: 'lunch',
          date: tomorrowStr,
          start_time: '12:30',
          end_time: '14:30',
          cutoff_time: '11:30',
          capacity: 350,
          booked_count: 15,
          collected_count: 0,
          price: 85,
          menu_title: 'Royal Biryani & Salan Thali',
          menu_items: 'Veg Dum Biryani / Egg Biryani, Mirchi ka Salan, Raita, Boiled Egg, Phulka (2 pcs) & Sweet Kesari',
        },
        {
          id: `sched_${tomorrowStr}_di`,
          vendor_id: 'vendor_college_mess',
          meal_type: 'dinner',
          date: tomorrowStr,
          start_time: '19:30',
          end_time: '21:30',
          cutoff_time: '18:30',
          capacity: 300,
          booked_count: 5,
          collected_count: 0,
          price: 75,
          menu_title: 'Traditional Khichdi & Aloo Gobi',
          menu_items: 'Moong Dal Khichdi, Kadai Aloo Gobi, Gujarati Kadhi, Roasted Papad & Pickle',
        },
      ];

      for (const sched of defaultSchedules) {
        await db.prepare(`
          INSERT INTO food_mess_schedules (
            id, vendor_id, meal_type, date, start_time, end_time, cutoff_time,
            capacity, booked_count, collected_count, price, menu_title, menu_items,
            is_available, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).bind(
          sched.id, sched.vendor_id, sched.meal_type, sched.date,
          sched.start_time, sched.end_time, sched.cutoff_time,
          sched.capacity, sched.booked_count, sched.collected_count,
          sched.price, sched.menu_title, sched.menu_items,
          now, now
        ).run();
      }
    }

    // Seed default ingredients if empty
    const ingCount = await db.prepare("SELECT COUNT(*) as count FROM food_ingredients").first();
    if (!ingCount || ingCount.count === 0) {
      const defaultIngredients = [
        { id: 'ing_01', vendor_id: 'vendor_college_mess', name: 'Sona Masoori Rice', category: 'grains', current_stock: 450, unit: 'kg', low_stock_threshold: 100, daily_consumption: 45 },
        { id: 'ing_02', vendor_id: 'vendor_college_mess', name: 'Toor Dal (Pigeon Pea)', category: 'grains', current_stock: 120, unit: 'kg', low_stock_threshold: 30, daily_consumption: 15 },
        { id: 'ing_03', vendor_id: 'vendor_college_mess', name: 'Refined Sunflower Oil', category: 'oil', current_stock: 85, unit: 'litres', low_stock_threshold: 25, daily_consumption: 12 },
        { id: 'ing_04', vendor_id: 'vendor_college_mess', name: 'Fresh Paneer', category: 'dairy', current_stock: 24, unit: 'kg', low_stock_threshold: 10, daily_consumption: 8 },
        { id: 'ing_05', vendor_id: 'vendor_college_mess', name: 'Whole Wheat Atta', category: 'grains', current_stock: 180, unit: 'kg', low_stock_threshold: 40, daily_consumption: 25 },
        { id: 'ing_06', vendor_id: 'vendor_college_mess', name: 'Tomatoes & Onions', category: 'vegetables', current_stock: 65, unit: 'kg', low_stock_threshold: 20, daily_consumption: 20 },
        { id: 'ing_07', vendor_id: 'vendor_college_mess', name: 'Fresh Full Cream Milk', category: 'dairy', current_stock: 40, unit: 'litres', low_stock_threshold: 15, daily_consumption: 30 },
        { id: 'ing_08', vendor_id: 'vendor_canteen_stall', name: 'Burger Buns & Patties', category: 'bakery', current_stock: 85, unit: 'units', low_stock_threshold: 25, daily_consumption: 20 },
        { id: 'ing_09', vendor_id: 'vendor_canteen_stall', name: 'Mozzarella Cheese Blend', category: 'dairy', current_stock: 18, unit: 'kg', low_stock_threshold: 5, daily_consumption: 4 },
        { id: 'ing_10', vendor_id: 'vendor_canteen_stall', name: 'Hakka Noodles Packets', category: 'grains', current_stock: 60, unit: 'packets', low_stock_threshold: 15, daily_consumption: 15 },
      ];
      for (const ing of defaultIngredients) {
        await db.prepare(`
          INSERT INTO food_ingredients (
            id, vendor_id, name, category, current_stock, unit, low_stock_threshold,
            daily_consumption, last_restocked_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          ing.id, ing.vendor_id, ing.name, ing.category, ing.current_stock, ing.unit,
          ing.low_stock_threshold, ing.daily_consumption, now, now, now
        ).run();
      }
    }

    vendorPlatformTablesInitialized = true;
  } catch (err) {
    console.error('Failed to ensure vendor platform tables:', err);
  }
}

/**
 * Vendor Identity & Profile Resolution
 * GET /api/food/vendor/me
 */
export async function handleVendorGetMe(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const vendor = await env.DB.prepare(`
      SELECT * FROM food_vendors WHERE id = ?
    `).bind(vendorId).first();

    const isMess = vendorId === FOOD_VENDORS.COLLEGE_MESS.id;

    return successResponse({
      vendor: {
        id: vendorId,
        name: vendor?.name || (isMess ? 'College Mess Dining' : 'Campus Canteen Stall'),
        counter_location: vendor?.counter_location || (isMess ? 'Dining Hall Counter' : 'Counter 1 (Main Food Court)'),
        contact: vendor?.contact || '+91 98765 43210',
        status: vendor?.status || 'active',
        opening_hours: vendor?.opening_hours || (isMess ? '7:30 AM - 9:30 PM' : '8:00 AM - 10:00 PM'),
        vendor_type: isMess ? 'mess' : 'canteen',
        role: 'owner',
        is_accepting_orders: 1,
        announcement: isMess ? 'Today special: South Indian Meals Thali with Payasam' : 'Flash Deal: 10% off on all Burgers & Cold Drinks today!',
      }
    });
  } catch (err) {
    console.error('Vendor Get Me Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve vendor profile', 500);
  }
}

/**
 * Vendor Staff Management
 * GET /api/food/vendor/staff
 */
export async function handleVendorGetStaff(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const rows = await env.DB.prepare(`
      SELECT * FROM food_vendor_staff 
      WHERE vendor_id = ? 
      ORDER BY created_at ASC
    `).bind(vendorId).all();

    return successResponse({ staff: rows.results || [] });
  } catch (err) {
    console.error('Vendor Get Staff Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve vendor staff', 500);
  }
}

/**
 * POST /api/food/vendor/staff
 */
export async function handleVendorCreateStaff(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const { name, email, role, phone } = body;
    if (!name || !email || !role) {
      return errorResponse('BAD_REQUEST', 'Name, email and role are required.', 400);
    }

    const id = `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO food_vendor_staff (id, vendor_id, name, email, role, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).bind(id, vendorId, name.trim(), email.trim().toLowerCase(), role, phone?.trim() || null, now, now).run();

    await logVendorAudit(env.DB, vendorId, 'staff_created', { staffId: id, name, role, email });

    return successResponse({
      staff: { id, vendor_id: vendorId, name, email, role, phone, status: 'active', created_at: now }
    });
  } catch (err) {
    console.error('Vendor Create Staff Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create staff account', 500);
  }
}

/**
 * PATCH /api/food/vendor/staff/:id
 */
export async function handleVendorUpdateStaff(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const existing = await env.DB.prepare(`
      SELECT * FROM food_vendor_staff WHERE id = ? AND vendor_id = ?
    `).bind(id, vendorId).first();

    if (!existing) return errorResponse('NOT_FOUND', 'Staff member not found for this vendor.', 404);

    const now = Date.now();
    const name = body.name?.trim() || existing.name;
    const role = body.role || existing.role;
    const phone = body.phone !== undefined ? body.phone : existing.phone;
    const status = body.status || existing.status;

    await env.DB.prepare(`
      UPDATE food_vendor_staff 
      SET name = ?, role = ?, phone = ?, status = ?, updated_at = ?
      WHERE id = ? AND vendor_id = ?
    `).bind(name, role, phone, status, now, id, vendorId).run();

    await logVendorAudit(env.DB, vendorId, 'staff_updated', { staffId: id, name, role, status });

    return successResponse({
      staff: { ...existing, name, role, phone, status, updated_at: now }
    });
  } catch (err) {
    console.error('Vendor Update Staff Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update staff member', 500);
  }
}

/**
 * DELETE /api/food/vendor/staff/:id
 */
export async function handleVendorDeleteStaff(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const res = await env.DB.prepare(`
      DELETE FROM food_vendor_staff WHERE id = ? AND vendor_id = ?
    `).bind(id, vendorId).run();

    if (res.meta.changes === 0) {
      return errorResponse('NOT_FOUND', 'Staff member not found for this vendor.', 404);
    }

    await logVendorAudit(env.DB, vendorId, 'staff_deleted', { staffId: id });
    return successResponse({ deleted: true, id });
  } catch (err) {
    console.error('Vendor Delete Staff Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to delete staff member', 500);
  }
}

/**
 * College Mess Meal Schedules & Daily Calendar
 * GET /api/food/vendor/mess/schedules
 */
export async function handleVendorGetMessSchedules(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (vendorId !== FOOD_VENDORS.COLLEGE_MESS.id) {
      return errorResponse('FORBIDDEN', 'Meal session schedules are strictly restricted to College Mess.', 403);
    }

    const date = url.searchParams.get('date');
    let sql = 'SELECT * FROM food_mess_schedules WHERE vendor_id = ?';
    let params = [vendorId];

    if (date) {
      sql += ' AND date = ?';
      params.push(date);
    }
    sql += ' ORDER BY date ASC, meal_type ASC';

    const rows = await env.DB.prepare(sql).bind(...params).all();
    return successResponse({ schedules: rows.results || [] });
  } catch (err) {
    console.error('Vendor Get Mess Schedules Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve meal schedules', 500);
  }
}

/**
 * POST /api/food/vendor/mess/schedules
 */
export async function handleVendorCreateMessSchedule(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (vendorId !== FOOD_VENDORS.COLLEGE_MESS.id) {
      return errorResponse('FORBIDDEN', 'Only College Mess may configure meal schedules.', 403);
    }

    const { meal_type, date, start_time, end_time, cutoff_time, capacity, price, menu_title, menu_items } = body;
    if (!meal_type || !date || !menu_title) {
      return errorResponse('BAD_REQUEST', 'Meal type, date, and menu title are required.', 400);
    }

    const id = `sched_${date}_${meal_type}_${Date.now().toString(36)}`;
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO food_mess_schedules (
        id, vendor_id, meal_type, date, start_time, end_time, cutoff_time,
        capacity, booked_count, collected_count, price, menu_title, menu_items,
        is_available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 1, ?, ?)
    `).bind(
      id, vendorId, meal_type, date, start_time || '12:30', end_time || '14:30',
      cutoff_time || '11:30', Number(capacity) || 300, Number(price) || 80,
      menu_title.trim(), menu_items || '', now, now
    ).run();

    await logVendorAudit(env.DB, vendorId, 'mess_schedule_created', { id, meal_type, date, menu_title });
    return successResponse({ schedule: { id, meal_type, date, menu_title, menu_items, price: Number(price) || 80 } });
  } catch (err) {
    console.error('Vendor Create Mess Schedule Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create meal schedule', 500);
  }
}

/**
 * PATCH /api/food/vendor/mess/schedules/:id
 */
export async function handleVendorUpdateMessSchedule(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (vendorId !== FOOD_VENDORS.COLLEGE_MESS.id) {
      return errorResponse('FORBIDDEN', 'Only College Mess may update meal schedules.', 403);
    }

    const existing = await env.DB.prepare(`
      SELECT * FROM food_mess_schedules WHERE id = ? AND vendor_id = ?
    `).bind(id, vendorId).first();

    if (!existing) return errorResponse('NOT_FOUND', 'Meal schedule not found.', 404);

    const now = Date.now();
    const menu_title = body.menu_title?.trim() || existing.menu_title;
    const menu_items = body.menu_items !== undefined ? body.menu_items : existing.menu_items;
    const capacity = body.capacity !== undefined ? Number(body.capacity) : existing.capacity;
    const price = body.price !== undefined ? Number(body.price) : existing.price;
    const start_time = body.start_time || existing.start_time;
    const end_time = body.end_time || existing.end_time;
    const cutoff_time = body.cutoff_time || existing.cutoff_time;
    const is_available = body.is_available !== undefined ? (body.is_available ? 1 : 0) : existing.is_available;

    await env.DB.prepare(`
      UPDATE food_mess_schedules 
      SET menu_title = ?, menu_items = ?, capacity = ?, price = ?, start_time = ?, end_time = ?, cutoff_time = ?, is_available = ?, updated_at = ?
      WHERE id = ? AND vendor_id = ?
    `).bind(menu_title, menu_items, capacity, price, start_time, end_time, cutoff_time, is_available, now, id, vendorId).run();

    await logVendorAudit(env.DB, vendorId, 'mess_schedule_updated', { id, menu_title, capacity, is_available });

    return successResponse({
      schedule: { ...existing, menu_title, menu_items, capacity, price, start_time, end_time, cutoff_time, is_available, updated_at: now }
    });
  } catch (err) {
    console.error('Vendor Update Mess Schedule Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update meal schedule', 500);
  }
}

/**
 * POST /api/food/vendor/mess/schedules/copy-day
 */
export async function handleVendorCopyDayMessSchedule(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (vendorId !== FOOD_VENDORS.COLLEGE_MESS.id) {
      return errorResponse('FORBIDDEN', 'Only College Mess may copy meal schedules.', 403);
    }

    const { fromDate, toDate } = body;
    if (!fromDate || !toDate) {
      return errorResponse('BAD_REQUEST', 'fromDate and toDate are required.', 400);
    }

    const sourceSchedules = await env.DB.prepare(`
      SELECT * FROM food_mess_schedules WHERE vendor_id = ? AND date = ?
    `).bind(vendorId, fromDate).all();

    const items = sourceSchedules.results || [];
    if (items.length === 0) {
      return errorResponse('NOT_FOUND', `No schedules found on source date ${fromDate}`, 404);
    }

    const now = Date.now();
    let copiedCount = 0;
    for (const s of items) {
      const newId = `sched_${toDate}_${s.meal_type}_${Date.now().toString(36)}`;
      await env.DB.prepare(`
        INSERT INTO food_mess_schedules (
          id, vendor_id, meal_type, date, start_time, end_time, cutoff_time,
          capacity, booked_count, collected_count, price, menu_title, menu_items,
          is_available, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 1, ?, ?)
      `).bind(
        newId, vendorId, s.meal_type, toDate, s.start_time, s.end_time, s.cutoff_time,
        s.capacity, s.price, s.menu_title, s.menu_items, now, now
      ).run();
      copiedCount++;
    }

    await logVendorAudit(env.DB, vendorId, 'mess_schedules_copied', { fromDate, toDate, copiedCount });
    return successResponse({ copied: copiedCount, toDate });
  } catch (err) {
    console.error('Vendor Copy Day Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to copy day schedule', 500);
  }
}

/**
 * Food Inventory & Ingredients
 * GET /api/food/vendor/ingredients
 */
export async function handleVendorGetIngredients(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const rows = await env.DB.prepare(`
      SELECT * FROM food_ingredients WHERE vendor_id = ? ORDER BY category ASC, name ASC
    `).bind(vendorId).all();

    return successResponse({ ingredients: rows.results || [] });
  } catch (err) {
    console.error('Vendor Get Ingredients Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve ingredients', 500);
  }
}

/**
 * POST /api/food/vendor/ingredients
 */
export async function handleVendorCreateIngredient(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const { name, category, current_stock, unit, low_stock_threshold } = body;
    if (!name || !category || !unit) {
      return errorResponse('BAD_REQUEST', 'Name, category, and unit are required.', 400);
    }

    const id = `ing_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO food_ingredients (
        id, vendor_id, name, category, current_stock, unit, low_stock_threshold,
        daily_consumption, last_restocked_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).bind(
      id, vendorId, name.trim(), category.trim(), Number(current_stock) || 0,
      unit.trim(), Number(low_stock_threshold) || 10, now, now, now
    ).run();

    await logVendorAudit(env.DB, vendorId, 'ingredient_created', { id, name, category, current_stock });
    return successResponse({ ingredient: { id, name, category, current_stock: Number(current_stock) || 0, unit } });
  } catch (err) {
    console.error('Vendor Create Ingredient Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to create ingredient', 500);
  }
}

/**
 * PATCH /api/food/vendor/ingredients/:id/stock
 */
export async function handleVendorUpdateIngredientStock(request, env, context, id) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const existing = await env.DB.prepare(`
      SELECT * FROM food_ingredients WHERE id = ? AND vendor_id = ?
    `).bind(id, vendorId).first();

    if (!existing) return errorResponse('NOT_FOUND', 'Ingredient not found for this vendor.', 404);

    const now = Date.now();
    let newStock = existing.current_stock;

    if (body.new_stock !== undefined) {
      newStock = Number(body.new_stock);
    } else if (body.change_amount !== undefined) {
      newStock = existing.current_stock + Number(body.change_amount);
    }

    if (newStock < 0) newStock = 0;

    await env.DB.prepare(`
      UPDATE food_ingredients 
      SET current_stock = ?, last_restocked_at = ?, updated_at = ?
      WHERE id = ? AND vendor_id = ?
    `).bind(newStock, now, now, id, vendorId).run();

    await logVendorAudit(env.DB, vendorId, 'ingredient_stock_adjusted', {
      ingredientId: id,
      name: existing.name,
      previousStock: existing.current_stock,
      newStock,
      reason: body.reason || 'Manual inventory adjustment'
    });

    return successResponse({ ingredient: { ...existing, current_stock: newStock, updated_at: now } });
  } catch (err) {
    console.error('Vendor Update Ingredient Stock Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update ingredient stock', 500);
  }
}

/**
 * POST /api/food/vendor/ingredients/consumption
 */
export async function handleVendorLogIngredientConsumption(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const { ingredient_id, amount, reason } = body;
    const existing = await env.DB.prepare(`
      SELECT * FROM food_ingredients WHERE id = ? AND vendor_id = ?
    `).bind(ingredient_id, vendorId).first();

    if (!existing) return errorResponse('NOT_FOUND', 'Ingredient not found for this vendor.', 404);

    const now = Date.now();
    const consumptionAmount = Number(amount) || 0;
    const newStock = Math.max(0, existing.current_stock - consumptionAmount);
    const totalDaily = (existing.daily_consumption || 0) + consumptionAmount;

    await env.DB.prepare(`
      UPDATE food_ingredients 
      SET current_stock = ?, daily_consumption = ?, updated_at = ?
      WHERE id = ? AND vendor_id = ?
    `).bind(newStock, totalDaily, now, ingredient_id, vendorId).run();

    await logVendorAudit(env.DB, vendorId, 'ingredient_consumption_logged', {
      ingredientId: ingredient_id,
      name: existing.name,
      consumptionAmount,
      reason: reason || 'Kitchen consumption'
    });

    return successResponse({ ingredient: { ...existing, current_stock: newStock, daily_consumption: totalDaily } });
  } catch (err) {
    console.error('Vendor Consumption Log Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to record consumption', 500);
  }
}

/**
 * Operational Settings
 * GET /api/food/vendor/settings
 */
export async function handleVendorGetSettings(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const vendor = await env.DB.prepare(`SELECT * FROM food_vendors WHERE id = ?`).bind(vendorId).first();
    const isMess = vendorId === FOOD_VENDORS.COLLEGE_MESS.id;

    return successResponse({
      settings: {
        id: vendorId,
        name: vendor?.name || (isMess ? 'College Mess Dining' : 'Campus Canteen Stall'),
        counter_location: vendor?.counter_location || (isMess ? 'Dining Hall Counter' : 'Counter 1 (Main Food Court)'),
        contact: vendor?.contact || '+91 98765 43210',
        opening_hours: vendor?.opening_hours || (isMess ? '7:30 AM - 9:30 PM' : '8:00 AM - 10:00 PM'),
        status: vendor?.status || 'active',
        vendor_type: isMess ? 'mess' : 'canteen',
        is_accepting_orders: 1,
        auto_accept_orders: 1,
        announcement: isMess ? 'Special Sunday Lunch Buffet bookings open.' : 'Hot Fresh Samosas available at 4 PM!',
        temporary_closure_reason: '',
      }
    });
  } catch (err) {
    console.error('Vendor Get Settings Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve settings', 500);
  }
}

/**
 * PATCH /api/food/vendor/settings
 */
export async function handleVendorUpdateSettings(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json();
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const existing = await env.DB.prepare(`SELECT * FROM food_vendors WHERE id = ?`).bind(vendorId).first();
    const now = Date.now();

    const name = body.name?.trim() || existing?.name || 'Campus Food Counter';
    const counter_location = body.counter_location?.trim() || existing?.counter_location || 'Food Court';
    const contact = body.contact?.trim() || existing?.contact || '+91 98765 43210';
    const opening_hours = body.opening_hours?.trim() || existing?.opening_hours || '8:00 AM - 10:00 PM';
    const status = body.status || existing?.status || 'active';

    await env.DB.prepare(`
      UPDATE food_vendors 
      SET name = ?, counter_location = ?, contact = ?, opening_hours = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).bind(name, counter_location, contact, opening_hours, status, now, vendorId).run();

    await logVendorAudit(env.DB, vendorId, 'settings_updated', body);

    return successResponse({
      settings: {
        id: vendorId,
        name,
        counter_location,
        contact,
        opening_hours,
        status,
        is_accepting_orders: body.is_accepting_orders !== undefined ? (body.is_accepting_orders ? 1 : 0) : 1,
        announcement: body.announcement || '',
        updated_at: now
      }
    });
  } catch (err) {
    console.error('Vendor Update Settings Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update settings', 500);
  }
}

/**
 * Payments & Financial Reconciliation
 * GET /api/food/vendor/payments
 */
export async function handleVendorGetPayments(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const ordersResult = await env.DB.prepare(`
      SELECT * FROM food_orders 
      WHERE vendor_id = ? 
      ORDER BY created_at DESC 
      LIMIT 100
    `).bind(vendorId).all();

    const orders = ordersResult.results || [];
    let onlinePaid = 0;
    let cashCollected = 0;
    let pendingCash = 0;
    let onlineCount = 0;
    let cashCollectedCount = 0;
    let cashPendingCount = 0;

    for (const ord of orders) {
      const amt = Number(ord.grand_total) || 0;
      if (ord.payment_method === 'ONLINE_UPI') {
        if (ord.payment_status === 'paid') {
          onlinePaid += amt;
          onlineCount++;
        }
      } else {
        if (ord.payment_status === 'paid' || ord.order_status === 'collected') {
          cashCollected += amt;
          cashCollectedCount++;
        } else if (ord.order_status !== 'cancelled') {
          pendingCash += amt;
          cashPendingCount++;
        }
      }
    }

    const settlementsResult = await env.DB.prepare(`
      SELECT * FROM food_settlements WHERE vendor_id = ? ORDER BY created_at DESC LIMIT 10
    `).bind(vendorId).all();

    return successResponse({
      summary: {
        onlinePaid,
        onlineCount,
        cashCollected,
        cashCollectedCount,
        pendingCash,
        cashPendingCount,
        totalRevenue: onlinePaid + cashCollected,
        totalOrders: orders.length,
      },
      settlements: settlementsResult.results || [],
      recentTransactions: orders.slice(0, 25).map(o => ({
        id: o.id,
        order_number: o.order_number,
        token_number: o.token_number,
        student_name: o.student_name,
        payment_method: o.payment_method,
        payment_status: o.payment_status,
        order_status: o.order_status,
        grand_total: o.grand_total,
        created_at: o.created_at
      }))
    });
  } catch (err) {
    console.error('Vendor Get Payments Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to retrieve payment records', 500);
  }
}

/**
 * POST /api/food/vendor/settlements/request
 */
export async function handleVendorRequestSettlement(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const id = `stl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();
    const amount = Number(body.amount) || 500;
    const orderCount = Number(body.orderCount) || 10;
    const refId = `SETTLE-BLZ-${Date.now().toString().slice(-6)}`;

    await env.DB.prepare(`
      INSERT INTO food_settlements (id, vendor_id, amount, order_count, status, reference_id, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, 'settled', ?, 'Automated Daily Vendor Payout Reconciliation', 'vendor_portal', ?)
    `).bind(id, vendorId, amount, orderCount, refId, now).run();

    await logVendorAudit(env.DB, vendorId, 'settlement_requested', { id, amount, reference_id: refId });

    return successResponse({
      settlement: { id, vendor_id: vendorId, amount, order_count: orderCount, status: 'settled', reference_id: refId, created_at: now }
    });
  } catch (err) {
    console.error('Vendor Settlement Request Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to generate settlement record', 500);
  }
}


/**
 * ============================================================================
 * STEP 11: VENDOR ONBOARDING & OPERATIONAL SETUP HANDLERS
 * ============================================================================
 */

/**
 * Submit New Vendor Application
 * POST /api/food/vendor/onboarding/apply
 */
export async function handleVendorOnboardingApply(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const {
      name,
      vendor_type,
      counter_location,
      contact,
      opening_hours,
      owner_name,
      owner_email,
      owner_phone,
      logo_url,
      banner_url,
      payment_config
    } = body;

    if (!name || !counter_location || !contact) {
      return errorResponse('BAD_REQUEST', 'Business name, counter location, and contact phone are required.', 400);
    }

    const type = (vendor_type === 'mess' || vendor_type === 'college_mess') ? 'mess' : 'canteen';
    const id = body.id || `vendor_${type}_${Date.now()}`;
    const now = Date.now();

    await env.DB.prepare(`
      INSERT INTO food_vendors (
        id, name, counter_location, contact, status, opening_hours,
        vendor_type, owner_name, owner_email, owner_phone,
        logo_url, banner_url, onboarding_status, onboarding_step,
        payment_config, is_accepting_orders, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'suspended', ?, ?, ?, ?, ?, ?, ?, 'pending_approval', 1, ?, 0, ?, ?)
    `).bind(
      id,
      name.trim(),
      counter_location.trim(),
      contact.trim(),
      opening_hours || '8:00 AM - 9:00 PM',
      type,
      owner_name || name,
      owner_email || `${id}@campus.blintzy.com`,
      owner_phone || contact,
      logo_url || '',
      banner_url || '',
      typeof payment_config === 'object' ? JSON.stringify(payment_config) : (payment_config || ''),
      now,
      now
    ).run();

    // Create default owner staff
    const staffId = `staff_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await env.DB.prepare(`
      INSERT INTO food_vendor_staff (id, vendor_id, name, email, role, phone, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'owner', ?, 'active', ?, ?)
    `).bind(
      staffId,
      id,
      owner_name || name,
      owner_email || `${id}@campus.blintzy.com`,
      owner_phone || contact,
      now,
      now
    ).run();

    await logVendorAudit(env.DB, id, 'onboarding_application_submitted', {
      name,
      vendor_type: type,
      owner: owner_name
    });

    return successResponse({
      vendorId: id,
      vendor: {
        id,
        name,
        vendor_type: type,
        onboarding_status: 'pending_approval',
        status: 'suspended'
      },
      onboarding_status: 'pending_approval',
      message: 'Onboarding application registered successfully. Pending central admin authorization.'
    }, 201);
  } catch (err) {
    console.error('Vendor Onboarding Apply Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to register vendor onboarding application.', 500);
  }
}

/**
 * Get Real Database Checklist Progress
 * GET /api/food/vendor/onboarding/progress
 */
export async function handleVendorGetOnboardingProgress(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const vendor = await env.DB.prepare(`
      SELECT * FROM food_vendors WHERE id = ?
    `).bind(vendorId).first();

    if (!vendor) return errorResponse('NOT_FOUND', 'Vendor not found.', 404);

    const isMess = vendor.vendor_type === 'mess' || vendorId.includes('mess');

    // 1. Business Profile
    const profileCompleted = Boolean(
      vendor.name &&
      vendor.counter_location &&
      vendor.contact &&
      vendor.opening_hours
    );

    // 2. Menu Configured
    let menuCount = 0;
    if (isMess) {
      const sched = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_mess_schedules WHERE vendor_id = ?`).bind(vendorId).first();
      menuCount = sched?.cnt || 0;
    } else {
      const prods = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_menu_items WHERE vendor_id = ?`).bind(vendorId).first();
      menuCount = prods?.cnt || 0;
    }
    const menuCompleted = menuCount > 0;

    // 3. Inventory Configured
    let inventoryCompleted = false;
    if (isMess) {
      const ings = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_ingredients WHERE vendor_id = ?`).bind(vendorId).first();
      inventoryCompleted = (ings?.cnt || 0) > 0;
    } else {
      const inStock = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_menu_items WHERE vendor_id = ? AND stock > 0`).bind(vendorId).first();
      inventoryCompleted = (inStock?.cnt || 0) > 0;
    }

    // 4. Staff Added
    const staffResult = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM food_vendor_staff WHERE vendor_id = ?`).bind(vendorId).first();
    const staffCount = staffResult?.cnt || 0;
    const staffCompleted = staffCount >= 1;

    // 5. Payment Configured
    const paymentCompleted = Boolean(vendor.payment_config && vendor.payment_config.length > 5);

    // 6. Pickup Tested
    const pickupTested = Boolean(vendor.pickup_tested === 1);

    // 7. Admin Approved
    const adminApproved = vendor.onboarding_status === 'approved';

    const checklist = [
      {
        step: 1,
        key: 'profile',
        title: 'Business Profile & Identity',
        description: 'Store name, campus pickup coordinates, operating schedule, and owner contact.',
        completed: profileCompleted,
        details: `${vendor.name} (${vendor.counter_location})`
      },
      {
        step: 2,
        key: 'menu',
        title: isMess ? 'Meal Sessions & Schedules' : 'Food Catalogue & Pricing',
        description: isMess ? 'Breakfast, lunch, and dinner meal windows and daily recipes.' : 'Menu dishes, categories, dietary labels, and pricing.',
        completed: menuCompleted,
        details: isMess ? `${menuCount} meal sessions configured` : `${menuCount} dishes in catalogue`
      },
      {
        step: 3,
        key: 'inventory',
        title: isMess ? 'Raw Commodities & Bulk Stock' : 'Portion Stock Thresholds',
        description: isMess ? 'Pantry staples (grains, lentils, dairy in kg/litres).' : 'Dish portion counts and low-stock reorder points.',
        completed: inventoryCompleted,
        details: inventoryCompleted ? 'Inventory active' : 'Zero items stocked'
      },
      {
        step: 4,
        key: 'staff',
        title: 'Operators & Counter Cashiers',
        description: 'Assign kitchen cooks and turnstile staff with 4-digit fast login PINs.',
        completed: staffCompleted,
        details: `${staffCount} staff accounts active`
      },
      {
        step: 5,
        key: 'payment',
        title: 'Direct Settlement Account',
        description: 'Linked campus merchant bank account and UPI routing for online payouts.',
        completed: paymentCompleted,
        details: paymentCompleted ? 'Bank & UPI Configured' : 'Missing payment config'
      },
      {
        step: 6,
        key: 'pickup_test',
        title: 'Counter Handover Test',
        description: 'Simulate student token verification on the counter touch terminal.',
        completed: pickupTested,
        details: pickupTested ? 'Handover verified' : 'Pending counter verification test'
      },
      {
        step: 7,
        key: 'admin_approval',
        title: 'Central Administration Approval',
        description: 'Institutional verification by Campus Administration before going live.',
        completed: adminApproved,
        details: adminApproved ? 'Approved & Licensed' : (vendor.onboarding_status === 'rejected' ? 'Application Rejected' : 'Under Review')
      }
    ];

    const completedSteps = checklist.filter(c => c.completed).length;
    const completionPercentage = Math.round((completedSteps / checklist.length) * 100);
    const missingSteps = checklist.filter(c => !c.completed);
    const canActivate = profileCompleted && menuCompleted && staffCompleted && adminApproved;

    return successResponse({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        vendor_type: vendor.vendor_type,
        status: vendor.status,
        onboarding_status: vendor.onboarding_status,
        onboarding_step: vendor.onboarding_step || 1,
        rejection_reason: vendor.rejection_reason || null,
        approved_by: vendor.approved_by || null,
        approved_at: vendor.approved_at || null
      },
      checklist,
      checklistMap: {
        profileCompleted,
        menuCompleted,
        inventoryCompleted,
        staffCompleted,
        paymentCompleted,
        pickupTested,
        adminApproved
      },
      completionPercentage,
      progress: completionPercentage,
      completedSteps,
      totalSteps: checklist.length,
      missingSteps,
      canActivate,
      can_activate: canActivate,
      onboarding_status: vendor.onboarding_status,
      rejection_reason: vendor.rejection_reason || null
    });
  } catch (err) {
    console.error('Vendor Onboarding Progress Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to calculate onboarding progress.', 500);
  }
}

/**
 * Update Current Onboarding Wizard Step
 * PATCH /api/food/vendor/onboarding/step
 */
export async function handleVendorUpdateOnboardingStep(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const step = Number(body.step) || 1;
    const now = Date.now();

    await env.DB.prepare(`
      UPDATE food_vendors 
      SET onboarding_step = MAX(COALESCE(onboarding_step, 1), ?), updated_at = ?
      WHERE id = ?
    `).bind(step, now, vendorId).run();

    if (body.test_verified || body.pickup_tested) {
      await env.DB.prepare(`
        UPDATE food_vendors SET pickup_tested = 1, updated_at = ? WHERE id = ?
      `).bind(now, vendorId).run();
    }

    return successResponse({ step, vendorId, pickup_tested: 1, updated_at: now });
  } catch (err) {
    console.error('Vendor Update Onboarding Step Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update onboarding step.', 500);
  }
}

/**
 * Bulk Create Products
 * POST /api/food/vendor/menu/bulk-create
 */
export async function handleVendorBulkCreateMenu(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const products = body.products || body.items;
    if (!Array.isArray(products) || products.length === 0) {
      return errorResponse('BAD_REQUEST', 'Products array must contain at least one item.', 400);
    }

    const errors = [];
    const validProducts = [];

    products.forEach((p, index) => {
      const line = index + 1;
      const name = (p.name || '').trim();
      const price = Number(p.price);
      const categoryId = (p.categoryId || p.category_id || 'fast-food').trim();
      const dietary = (p.dietary || 'veg').trim().toLowerCase();
      const stock = Number(p.stock !== undefined ? p.stock : 50);

      if (!name || name.length < 2) {
        errors.push(`Item #${line}: Valid item name is required.`);
      }
      if (isNaN(price) || price <= 0) {
        errors.push(`Item #${line} (${name || 'Unnamed'}): Price must be a positive number.`);
      }
      if (!['veg', 'non-veg', 'egg'].includes(dietary)) {
        errors.push(`Item #${line} (${name}): Dietary must be 'veg', 'non-veg', or 'egg'.`);
      }

      validProducts.push({
        id: `food_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        price,
        categoryId,
        dietary: ['veg', 'non-veg', 'egg'].includes(dietary) ? dietary : 'veg',
        description: (p.description || '').trim(),
        image: (p.image || '').trim(),
        stock: isNaN(stock) ? 50 : stock,
        isAvailable: p.isAvailable !== undefined ? (p.isAvailable ? 1 : 0) : 1
      });
    });

    if (errors.length > 0) {
      return errorResponse('VALIDATION_FAILED', 'Bulk menu creation failed due to invalid rows.', 400, { errors });
    }

    const now = Date.now();
    for (const item of validProducts) {
      await env.DB.prepare(`
        INSERT INTO food_menu_items (
          id, vendor_id, name, description, price, category_id,
          dietary, image, stock, is_available, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id,
        vendorId,
        item.name,
        item.description,
        item.price,
        item.categoryId,
        item.dietary,
        item.image,
        item.stock,
        item.isAvailable,
        now,
        now
      ).run();
    }

    await logVendorAudit(env.DB, vendorId, 'bulk_menu_created', { count: validProducts.length });

    return successResponse({
      createdCount: validProducts.length,
      items: validProducts,
      message: `Successfully created ${validProducts.length} items.`
    }, 201);
  } catch (err) {
    console.error('Vendor Bulk Create Menu Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to bulk create menu items.', 500);
  }
}

/**
 * Bulk Availability Update
 * POST /api/food/vendor/menu/bulk-availability
 */
export async function handleVendorBulkUpdateAvailability(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const { itemIds, isAvailable } = body;
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return errorResponse('BAD_REQUEST', 'itemIds array is required.', 400);
    }

    const statusVal = isAvailable ? 1 : 0;
    const now = Date.now();

    for (const id of itemIds) {
      await env.DB.prepare(`
        UPDATE food_menu_items
        SET is_available = ?, updated_at = ?
        WHERE id = ? AND vendor_id = ?
      `).bind(statusVal, now, id, vendorId).run();
    }

    await logVendorAudit(env.DB, vendorId, 'bulk_availability_updated', {
      count: itemIds.length,
      isAvailable
    });

    return successResponse({
      updatedCount: itemIds.length,
      isAvailable: Boolean(isAvailable)
    });
  } catch (err) {
    console.error('Vendor Bulk Update Availability Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to update bulk availability.', 500);
  }
}

/**
 * Import Menu from CSV
 * POST /api/food/vendor/menu/import-csv
 */
export async function handleVendorImportMenuCSV(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, body, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const csvContent = body.csvContent;
    if (!csvContent || typeof csvContent !== 'string') {
      return errorResponse('BAD_REQUEST', 'csvContent string is required.', 400);
    }

    const lines = csvContent
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return errorResponse('BAD_REQUEST', 'CSV must contain a header row and at least one product row.', 400);
    }

    const header = lines[0].toLowerCase();
    if (!header.includes('name') || !header.includes('price')) {
      return errorResponse('BAD_REQUEST', 'CSV header must include at least Name and Price columns. Example: Name,Category,Price,Dietary,Description,Stock', 400);
    }

    const errors = [];
    const parsedProducts = [];

    for (let i = 1; i < lines.length; i++) {
      const lineNum = i + 1;
      const parts = lines[i].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));

      if (parts.length < 2) {
        errors.push(`Line ${lineNum}: Incomplete data row.`);
        continue;
      }

      const name = parts[0];
      const category = parts[1] || 'fast-food';
      const price = Number(parts[2]);
      const dietary = (parts[3] || 'veg').toLowerCase();
      const description = parts[4] || '';
      const stock = parts[5] !== undefined ? Number(parts[5]) : 50;

      if (!name || name.length < 2) {
        errors.push(`Line ${lineNum}: Missing or invalid product name.`);
      }
      if (isNaN(price) || price <= 0) {
        errors.push(`Line ${lineNum} (${name || 'Item'}): Invalid price. Must be positive.`);
      }
      if (!['veg', 'non-veg', 'egg'].includes(dietary)) {
        errors.push(`Line ${lineNum} (${name}): Dietary must be 'veg', 'non-veg', or 'egg'.`);
      }

      parsedProducts.push({
        id: `food_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        category_id: category,
        price,
        dietary: ['veg', 'non-veg', 'egg'].includes(dietary) ? dietary : 'veg',
        description,
        stock: isNaN(stock) ? 50 : stock,
        is_available: 1
      });
    }

    if (errors.length > 0) {
      return errorResponse('CSV_VALIDATION_ERROR', `CSV validation failed: ${errors.join('; ')}`, 400);
    }

    const now = Date.now();
    for (const p of parsedProducts) {
      await env.DB.prepare(`
        INSERT INTO food_menu_items (
          id, vendor_id, name, description, price, category_id,
          dietary, stock, is_available, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        p.id,
        vendorId,
        p.name,
        p.description,
        p.price,
        p.category_id,
        p.dietary,
        p.stock,
        p.is_available,
        now,
        now
      ).run();
    }

    await logVendorAudit(env.DB, vendorId, 'csv_menu_imported', { count: parsedProducts.length });

    return successResponse({
      importedCount: parsedProducts.length,
      message: `Successfully imported ${parsedProducts.length} dishes from CSV.`
    }, 201);
  } catch (err) {
    console.error('Vendor CSV Import Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to import CSV.', 500);
  }
}

/**
 * Export Menu to CSV
 * GET /api/food/vendor/menu/export-csv
 */
export async function handleVendorExportMenuCSV(request, env, context) {
  try {
    await ensureFoodTables(env.DB);
    const url = new URL(request.url);
    const vendorId = resolveVendorId(request, url, null, context);
    if (!vendorId) return errorResponse('BAD_REQUEST', 'Invalid vendor ID.', 400);

    const rows = await env.DB.prepare(`
      SELECT name, category_id, price, dietary, description, stock, is_available
      FROM food_menu_items
      WHERE vendor_id = ?
      ORDER BY category_id, name
    `).bind(vendorId).all();

    const items = rows.results || [];
    let csv = 'Name,Category,Price,Dietary,Description,Stock,IsAvailable\n';

    items.forEach(it => {
      const escape = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      csv += `${escape(it.name)},${escape(it.category_id)},${it.price},${escape(it.dietary)},${escape(it.description)},${it.stock},${it.is_available === 1 ? 'Yes' : 'No'}\n`;
    });

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${vendorId}_menu_export.csv"`
      }
    });
  } catch (err) {
    console.error('Vendor Export Menu CSV Error:', err);
    return errorResponse('SERVER_ERROR', 'Failed to export menu CSV.', 500);
  }
}
