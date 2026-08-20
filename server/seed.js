// Buat user: node server/seed.js email@x.com "Nama" password123
import { createUser, listUsers } from './auth.js';

const [email, name, pw] = process.argv.slice(2);
if (!email || !name || !pw) {
  console.error('Pakai: node server/seed.js <email> <nama> <password>');
  process.exit(1);
}
createUser(email, name, pw);
console.log('User dibuat:', email);
console.log('Total user:', listUsers().length);
