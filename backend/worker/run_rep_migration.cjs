const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  const { createRemoteD1 } = await import('./src/adapters/remoteD1.js');
  
  const DB = createRemoteD1({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_D1_API_TOKEN
  });

  // Step 1: Create admin_user_scopes table
  console.log('Creating admin_user_scopes table...');
  try {
    await DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_user_scopes (
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
    console.log('✓ admin_user_scopes table created');
  } catch (err) {
    console.error('admin_user_scopes table error:', err.message);
  }

  const now = Date.now();

  // Step 2: Insert representative role (if not exists)
  console.log('Inserting representative role...');
  try {
    await DB.prepare(`
      INSERT OR IGNORE INTO roles (id, name, description, created_at)
      VALUES ('role_representative', 'representative', 'Class representative with scoped order access', ?)
    `).bind(now).run();
    console.log('✓ representative role seeded');
  } catch (err) {
    console.error('Role seed error:', err.message);
  }

  // Step 3: Insert permissions
  const permissions = [
    ['perm_rep_orders_view',          'representative.orders.view',          'View orders within assigned academic scope'],
    ['perm_rep_orders_update_status', 'representative.orders.update_status', 'Update order status within assigned scope'],
    ['perm_rep_orders_collect',       'representative.orders.collect',       'Mark orders as collected'],
    ['perm_rep_orders_deliver',       'representative.orders.deliver',       'Mark orders as delivered'],
    ['perm_rep_orders_view_student',  'representative.orders.view_student',  'View student name on orders'],
  ];

  console.log('Inserting representative permissions...');
  for (const [id, action, description] of permissions) {
    try {
      await DB.prepare(`
        INSERT OR IGNORE INTO permissions (id, action, description)
        VALUES (?, ?, ?)
      `).bind(id, action, description).run();
      console.log(`  ✓ ${action}`);
    } catch (err) {
      console.error(`  ✗ Permission ${action}:`, err.message);
    }
  }

  // Step 4: Assign permissions to representative role
  console.log('Assigning permissions to representative role...');
  for (const [permId] of permissions) {
    try {
      await DB.prepare(`
        INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        VALUES ('role_representative', ?)
      `).bind(permId).run();
      console.log(`  ✓ Assigned ${permId}`);
    } catch (err) {
      console.error(`  ✗ Role-permission assignment ${permId}:`, err.message);
    }
  }

  // Step 5: Also insert the representatives.manage permission for super admins
  try {
    await DB.prepare(`
      INSERT OR IGNORE INTO permissions (id, action, description)
      VALUES ('perm_representatives_manage', 'representatives.manage', 'Create, edit, and delete representative accounts')
    `).run();
    console.log('✓ representatives.manage permission created');
  } catch (err) {
    console.error('representatives.manage error:', err.message);
  }

  // Step 6: Assign representatives.manage to SUPER_ADMIN role
  // First, find the SUPER_ADMIN role ID
  try {
    const superAdminRole = await DB.prepare(`SELECT id FROM roles WHERE name = 'SUPER_ADMIN'`).first();
    if (superAdminRole) {
      await DB.prepare(`
        INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
        VALUES (?, 'perm_representatives_manage')
      `).bind(superAdminRole.id).run();
      console.log('✓ representatives.manage assigned to SUPER_ADMIN');
    } else {
      console.warn('⚠ SUPER_ADMIN role not found - manually assign representatives.manage permission');
    }
  } catch (err) {
    console.error('SUPER_ADMIN assignment error:', err.message);
  }

  console.log('\n✅ Migration complete!');
}

run().catch(console.error);
