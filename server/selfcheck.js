// Cek cepat logika inti terhadap Postgres. Butuh DATABASE_URL. `node server/selfcheck.js`
import assert from 'node:assert';
import { pool, initDb, insertMessage, updateStatus, upsertContact, updateContact, q } from './db.js';

await initDb();
const wa = '628_test';

const a = await insertMessage({ waId: wa, direction: 'in', body: 'halo', waMsgId: 'wamid.X' });
const b = await insertMessage({ waId: wa, direction: 'in', body: 'halo', waMsgId: 'wamid.X' }); // redeliver
assert.equal(a, b, 'dedup gagal');

await insertMessage({ waId: wa, direction: 'out', body: 'hai', waMsgId: 'wamid.Y', status: 'sent' });
await updateStatus('wamid.Y', 'read');
const row = (await q('SELECT status FROM messages WHERE wa_msg_id=$1', ['wamid.Y'])).rows[0];
assert.equal(row.status, 'read', 'status update gagal');

await upsertContact(wa, 'Budi');
const c = await updateContact(wa, { labels: ['prospek', 'vip'], notes: 'suka diskon' });
assert.deepEqual(JSON.parse(c.labels), ['prospek', 'vip'], 'labels gagal');
assert.equal((await updateContact(wa, { name: 'Budi S' })).labels, c.labels, 'partial update reset labels');

await q('DELETE FROM messages WHERE wa_id=$1', [wa]);
await q('DELETE FROM contacts WHERE wa_id=$1', [wa]);
console.log('OK: dedup, status, kontak+label jalan (Postgres)');
await pool.end();
