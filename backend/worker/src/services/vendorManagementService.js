import { errorResponse, successResponse } from '../utils/response.js';

async function callSupabaseAdmin(env, path, method, body = null) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase configuration missing');
  }

  const url = `${env.SUPABASE_URL}${path}`;
  const headers = {
    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  const options = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = (data && (data.message || data.msg || (data.error && data.error.message))) || `Supabase API Error: ${response.status} ${response.statusText}`;
    throw new Error(errorMsg);
  }

  return data;
}

export async function createVendor(db, env, vendorData, adminId) {
  const { business_name, contact_person, username, email, phone, whatsapp, address, city, state, pincode, description, password } = vendorData;

  if (!username || !password || !business_name) {
    return { error: 'Username, password, and business name are required', status: 400 };
  }

  // Determine email to use for Supabase (if none provided, create a dummy one)
  const vendorEmail = email || `${username}@vendor.blintzy.local`;

  // 1. Create user in Supabase Auth
  let authUser;
  try {
    authUser = await callSupabaseAdmin(env, '/auth/v1/admin/users', 'POST', {
      email: vendorEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username,
        role: 'vendor'
      }
    });
  } catch (err) {
    console.error('Failed to create Supabase user:', err);
    return { error: err.message || 'Failed to create authentication user', status: 400 };
  }

  const supabaseUserId = authUser.id;
  const vendorId = crypto.randomUUID();
  const now = Date.now();

  // 2. Create record in D1
  try {
    await db.prepare(`
      INSERT INTO vendors (
        id, supabase_user_id, email, name, business_name, contact_person, username, 
        phone, whatsapp, address, city, state, pincode, description, 
        role, status, password_change_required, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vendor', 'active', 1, ?, ?
      )
    `).bind(
      vendorId, supabaseUserId, vendorEmail, contact_person || business_name, business_name, contact_person, username,
      phone || null, whatsapp || null, address || null, city || null, state || null, pincode || null, description || null,
      now, now
    ).run();

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, created_at)
      VALUES (?, ?, 'admin', 'vendor.created', 'vendor', ?, ?)
    `).bind(crypto.randomUUID(), adminId, vendorId, now).run();

    return { success: true, id: vendorId };
  } catch (err) {
    console.error('Failed to insert vendor into D1:', err);
    // Attempt rollback in Supabase (best effort)
    try {
      await callSupabaseAdmin(env, `/auth/v1/admin/users/${supabaseUserId}`, 'DELETE');
    } catch (e) {
      console.error('Failed to rollback Supabase user creation:', e);
    }
    
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
       return { error: 'Username or email already exists in our records.', status: 409 };
    }
    
    return { error: 'Failed to create vendor record', status: 500 };
  }
}

export async function getVendor(db, vendorId) {
  const vendor = await db.prepare(`SELECT * FROM vendors WHERE id = ?`).bind(vendorId).first();
  if (!vendor) return { error: 'Vendor not found', status: 404 };
  return { vendor };
}

export async function updateVendor(db, vendorId, updates, adminId) {
  const vendor = await db.prepare(`SELECT * FROM vendors WHERE id = ?`).bind(vendorId).first();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  const { business_name, contact_person, username, email, phone, whatsapp, address, city, state, pincode, description } = updates;
  const now = Date.now();

  const updateFields = [];
  const params = [];

  const addField = (col, val) => {
    if (val !== undefined) {
      updateFields.push(`${col} = ?`);
      params.push(val);
    }
  };

  addField('business_name', business_name);
  addField('contact_person', contact_person);
  addField('name', contact_person || business_name);
  addField('username', username);
  addField('email', email);
  addField('phone', phone);
  addField('whatsapp', whatsapp);
  addField('address', address);
  addField('city', city);
  addField('state', state);
  addField('pincode', pincode);
  addField('description', description);

  if (updateFields.length === 0) return { success: true };

  updateFields.push('updated_at = ?');
  params.push(now);
  params.push(vendorId);

  try {
    await db.prepare(`UPDATE vendors SET ${updateFields.join(', ')} WHERE id = ?`).bind(...params).run();
    
    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, created_at)
      VALUES (?, ?, 'admin', 'vendor.updated', 'vendor', ?, ?)
    `).bind(crypto.randomUUID(), adminId, vendorId, now).run();

    return { success: true };
  } catch (err) {
    console.error('Failed to update vendor:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
       return { error: 'Username or email already exists.', status: 409 };
    }
    return { error: 'Failed to update vendor', status: 500 };
  }
}

export async function updateVendorStatus(db, vendorId, status, adminId) {
  if (!['active', 'blocked', 'suspended', 'inactive'].includes(status)) {
    return { error: 'Invalid status', status: 400 };
  }

  const vendor = await db.prepare(`SELECT status FROM vendors WHERE id = ?`).bind(vendorId).first();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  const now = Date.now();
  await db.prepare(`UPDATE vendors SET status = ?, updated_at = ? WHERE id = ?`).bind(status, now, vendorId).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, before_value, after_value, created_at)
    VALUES (?, ?, 'admin', ?, 'vendor', ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), adminId, `vendor.${status === 'active' ? 'activated' : status}`, vendorId, 
    JSON.stringify({ status: vendor.status }), JSON.stringify({ status }), now
  ).run();

  return { success: true };
}

export async function resetVendorPassword(db, env, vendorId, newPassword, adminId) {
  const vendor = await db.prepare(`SELECT supabase_user_id FROM vendors WHERE id = ?`).bind(vendorId).first();
  if (!vendor) return { error: 'Vendor not found', status: 404 };

  if (!newPassword) return { error: 'New password is required', status: 400 };

  try {
    await callSupabaseAdmin(env, `/auth/v1/admin/users/${vendor.supabase_user_id}`, 'PUT', {
      password: newPassword
    });
  } catch (err) {
    console.error('Failed to reset Supabase password:', err);
    return { error: 'Failed to reset authentication password', status: 500 };
  }

  const now = Date.now();
  await db.prepare(`UPDATE vendors SET password_change_required = 1, updated_at = ? WHERE id = ?`).bind(now, vendorId).run();

  await db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, created_at)
    VALUES (?, ?, 'admin', 'vendor.password_reset', 'vendor', ?, ?)
  `).bind(crypto.randomUUID(), adminId, vendorId, now).run();

  return { success: true };
}

export async function getVendorStats(db, vendorId) {
  const stats = await db.prepare(`
    SELECT 
      COUNT(*) as totalOrders,
      SUM(CASE WHEN status = 'printing' THEN 1 ELSE 0 END) as printingOrders,
      SUM(CASE WHEN status = 'ready_for_pickup' THEN 1 ELSE 0 END) as readyOrders,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as deliveredOrders,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledOrders,
      SUM(CASE WHEN created_at >= (strftime('%s', 'now', 'start of day') * 1000) THEN 1 ELSE 0 END) as todayOrders
    FROM orders 
    WHERE vendor_id = ?
  `).bind(vendorId).first();

  return { stats };
}
