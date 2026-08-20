// Cek cepat logika inti: dedup inbound & status update. `node server/selfcheck.js`
import assert from 'node:assert';
import { insertMessage, updateStatus, updateContact, upsertContact, db } from './db.js';

const wa = '628_test';
const a = insertMessage({ waId: wa, direction: 'in', body: 'halo', waMsgId: 'wamid.X' });
const b = insertMessage({ waId: wa, direction: 'in', body: 'halo', waMsgId: 'wamid.X' }); // redeliver
assert.equal(a, b, 'dedup gagal: pesan sama masuk dua kali');

const out = insertMessage({ waId: wa, direction: 'out', body: 'hai', waMsgId: 'wamid.Y', status: 'sent' });
updateStatus('wamid.Y', 'read');
const row = db.prepare('SELECT status FROM messages WHERE id=?').get(out);
assert.equal(row.status, 'read', 'status update gagal');

upsertContact(wa, 'Budi');
const c = updateContact(wa, { labels: ['prospek', 'vip'], notes: 'suka diskon' });
assert.deepEqual(JSON.parse(c.labels), ['prospek', 'vip'], 'labels gagal');
assert.equal(c.notes, 'suka diskon', 'notes gagal');
assert.equal(updateContact(wa, { name: 'Budi S' }).labels, c.labels, 'partial update tak boleh reset labels');

db.prepare('DELETE FROM messages WHERE wa_id=?').run(wa);
db.prepare('DELETE FROM contacts WHERE wa_id=?').run(wa);
console.log('OK: dedup, status, kontak+label jalan');
