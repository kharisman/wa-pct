// Jalankan: node server/run-rls.mjs
import { readFileSync } from 'node:fs';
import pg from 'pg';

process.loadEnvFile('.env');

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(readFileSync('server/enable-rls.sql', 'utf8'));
console.table((Array.isArray(r) ? r.at(-1) : r).rows);
await c.end();
console.log('Selesai — RLS aktif di semua tabel public.');
