import pg from 'pg';

try { process.loadEnvFile(); } catch { /* pakai env asli */ }

// int8/bigint -> number (biar created_at & id balik sebagai angka, bukan string)
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) throw new Error('DATABASE_URL belum diset (connection string Supabase)');

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Supabase pakai SSL
  max: 5,
});

export const q = (text, params) => pool.query(text, params);

export async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS contacts (
      wa_id      text PRIMARY KEY,
      name       text,
      labels     text DEFAULT '[]',
      notes      text,
      assignee   text,
      created_at bigint NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      wa_id      text NOT NULL,
      direction  text NOT NULL,
      type       text NOT NULL DEFAULT 'text',
      body       text,
      wa_msg_id  text,
      status     text,
      media_url  text,
      created_at bigint NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_wa ON messages(wa_id, id);
  `);
}

const now = () => Date.now();

export async function upsertContact(waId, name) {
  await q(
    `INSERT INTO contacts(wa_id, name, created_at) VALUES($1,$2,$3)
     ON CONFLICT(wa_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name)`,
    [waId, name ?? null, now()]
  );
}

export async function insertMessage({ waId, direction, type = 'text', body, waMsgId, status, mediaUrl }) {
  // ponytail: dedup inbound by wa_msg_id — Meta redelivers webhooks on retry
  if (waMsgId) {
    const dup = await q('SELECT id FROM messages WHERE wa_msg_id=$1', [waMsgId]);
    if (dup.rows[0]) return dup.rows[0].id;
  }
  const r = await q(
    `INSERT INTO messages(wa_id,direction,type,body,wa_msg_id,status,media_url,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [waId, direction, type, body ?? null, waMsgId ?? null, status ?? null, mediaUrl ?? null, now()]
  );
  return r.rows[0].id;
}

export async function updateStatus(waMsgId, status) {
  await q('UPDATE messages SET status=$1 WHERE wa_msg_id=$2', [status, waMsgId]);
}

export const getContact = async (waId) =>
  (await q('SELECT wa_id, name, labels, notes, assignee, created_at FROM contacts WHERE wa_id=$1', [waId])).rows[0];

export async function updateContact(waId, { name, labels, notes, assignee }) {
  await q(
    `UPDATE contacts SET
       name     = COALESCE($1, name),
       labels   = COALESCE($2, labels),
       notes    = COALESCE($3, notes),
       assignee = COALESCE($4, assignee)
     WHERE wa_id=$5`,
    [name ?? null, labels ? JSON.stringify(labels) : null, notes ?? null,
     assignee === undefined ? null : assignee, waId]
  );
  return getContact(waId);
}

export const listConversations = async () =>
  (await q(`
    SELECT c.wa_id, c.name, c.labels, c.assignee,
           (SELECT body FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_at
    FROM contacts c ORDER BY last_at DESC NULLS LAST
  `)).rows;

export const listMessages = async (waId) =>
  (await q('SELECT * FROM messages WHERE wa_id=$1 ORDER BY id ASC', [waId])).rows;

export const stats = async () => {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  return (await q(`SELECT
    (SELECT count(*) FROM contacts)::int AS contacts,
    (SELECT count(*) FROM messages)::int AS messages,
    (SELECT count(*) FROM messages WHERE direction='in'  AND created_at > $1)::int AS in24,
    (SELECT count(*) FROM messages WHERE direction='out' AND created_at > $1)::int AS out24,
    (SELECT count(*) FROM contacts WHERE assignee IS NULL OR assignee='')::int AS unassigned`,
    [dayAgo])).rows[0];
};
