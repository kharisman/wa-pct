// Buat user: node server/seed.js email@x.com "Nama" password123
import { pool } from './db.js';
import { initDb } from './db.js';
import { initAuth, createUser, listUsers } from './auth.js';

const [email, name, pw] = process.argv.slice(2);
if (!email || !name || !pw) {
  console.error('Pakai: node server/seed.js <email> <nama> <password>');
  process.exit(1);
}
await initDb();
await initAuth();
await createUser(email, name, pw);
console.log('User dibuat:', email, '| total user:', (await listUsers()).length);
await pool.end();
