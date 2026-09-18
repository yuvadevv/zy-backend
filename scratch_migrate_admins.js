import Database from 'better-sqlite3';

try {
  const db = new Database('./local.db');
  
  db.exec(`
    ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'sub_admin';
  `);
  
  db.exec(`
    ALTER TABLE admin_users ADD COLUMN permissions TEXT DEFAULT '[]';
  `);

  // Update existing main admin to super_admin
  db.exec(`
    UPDATE admin_users SET role = 'super_admin' WHERE email = 'theblintzy@gmail.com';
  `);

  console.log("Migration complete");
} catch (e) {
  console.error("Migration failed", e);
}
