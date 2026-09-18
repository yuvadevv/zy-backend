import Database from 'better-sqlite3';
const db = new Database('./local.db');

const rows = db.prepare('SELECT * FROM admin_users').all();
console.log(JSON.stringify(rows, null, 2));
