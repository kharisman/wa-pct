import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const path = fileURLToPath(new URL('../data.db', import.meta.url));
export const db = new DatabaseSync(path);

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    wa_id      TEXT PRIMARY KEY,
    name       TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id      TEXT NOT NULL,
    direction  TEXT NOT NULL,          -- 'in' | 'out'
    type       TEXT NOT NULL DEFAULT 'text',
    body       TEXT,
    wa_msg_id  TEXT,                   -- id pesan dari WhatsApp (untuk status/dedup)
    status     TEXT,                   -- sent|delivered|read|failed
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_msg_wa ON messages(wa_id, id);
`);

// Migrasi kolom CRM (SQLite tak punya ADD COLUMN IF NOT EXISTS)
const cols = new Set(db.prepare(`PRAGMA table_info(contacts)`).all().map((c) => c.name));
for (const [name, def] of [['labels', "TEXT DEFAULT '[]'"], ['notes', 'TEXT'], ['assignee', 'TEXT']]) {
  if (!cols.has(name)) db.exec(`ALTER TABLE contacts ADD COLUMN ${name} ${def}`);
}
const mcols = new Set(db.prepare(`PRAGMA table_info(messages)`).all().map((c) => c.name));
if (!mcols.has('media_url')) db.exec(`ALTER TABLE messages ADD COLUMN media_url TEXT`);

const now = () => Date.now();

export function upsertContact(waId, name) {
  db.prepare(
    `INSERT INTO contacts(wa_id, name, created_at) VALUES(?,?,?)
     ON CONFLICT(wa_id) DO UPDATE SET name=COALESCE(excluded.name, name)`
  ).run(waId, name ?? null, now());
}

export function insertMessage({ waId, direction, type = 'text', body, waMsgId, status, mediaUrl }) {
  // ponytail: dedup inbound by wa_msg_id — Meta redelivers webhooks on retry
  if (waMsgId) {
    const dup = db.prepare('SELECT id FROM messages WHERE wa_msg_id=?').get(waMsgId);
    if (dup) return dup.id;
  }
  return db.prepare(
    `INSERT INTO messages(wa_id,direction,type,body,wa_msg_id,status,media_url,created_at)
     VALUES(?,?,?,?,?,?,?,?)`
  ).run(waId, direction, type, body ?? null, waMsgId ?? null, status ?? null, mediaUrl ?? null, now()).lastInsertRowid;
}

export function updateStatus(waMsgId, status) {
  db.prepare('UPDATE messages SET status=? WHERE wa_msg_id=?').run(status, waMsgId);
}

export const getContact = (waId) =>
  db.prepare('SELECT wa_id, name, labels, notes, assignee, created_at FROM contacts WHERE wa_id=?').get(waId);

export function updateContact(waId, { name, labels, notes, assignee }) {
  db.prepare(
    `UPDATE contacts SET
       name     = COALESCE(?, name),
       labels   = COALESCE(?, labels),
       notes    = COALESCE(?, notes),
       assignee = COALESCE(?, assignee)
     WHERE wa_id=?`
  ).run(name ?? null, labels ? JSON.stringify(labels) : null, notes ?? null,
        assignee === undefined ? null : assignee, waId);
  return getContact(waId);
}

export const listConversations = () =>
  db.prepare(`
    SELECT c.wa_id, c.name, c.labels, c.assignee,
           (SELECT body FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_at
    FROM contacts c ORDER BY last_at DESC
  `).all();

export const listMessages = (waId) =>
  db.prepare('SELECT * FROM messages WHERE wa_id=? ORDER BY id ASC').all(waId);
