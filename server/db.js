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
  await q('ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_by text'); // nama agen pengirim (out/note)
  await q("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage text"); // tahap pipeline
  // index buat kecepatan (dedup, laporan, filter)
  await q('CREATE INDEX IF NOT EXISTS idx_msg_wamsgid ON messages(wa_msg_id)');
  await q('CREATE INDEX IF NOT EXISTS idx_msg_sentby ON messages(sent_by)');
  await q('CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at)');
  await q('CREATE INDEX IF NOT EXISTS idx_contacts_assignee ON contacts(assignee)');
}

const now = () => Date.now();

export async function upsertContact(waId, name, channelId) {
  await q(
    `INSERT INTO contacts(wa_id, name, channel_id, created_at) VALUES($1,$2,$3,$4)
     ON CONFLICT(wa_id) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, contacts.name),
       channel_id = COALESCE(contacts.channel_id, EXCLUDED.channel_id)`,
    [waId, name ?? null, channelId ?? null, now()]
  );
}

export async function insertMessage({ waId, direction, type = 'text', body, waMsgId, status, mediaUrl, sentBy, channelId }) {
  // ponytail: dedup inbound by wa_msg_id — Meta redelivers webhooks on retry
  if (waMsgId) {
    const dup = await q('SELECT id FROM messages WHERE wa_msg_id=$1', [waMsgId]);
    if (dup.rows[0]) return dup.rows[0].id;
  }
  const r = await q(
    `INSERT INTO messages(wa_id,direction,type,body,wa_msg_id,status,media_url,sent_by,channel_id,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [waId, direction, type, body ?? null, waMsgId ?? null, status ?? null, mediaUrl ?? null, sentBy ?? null, channelId ?? null, now()]
  );
  return r.rows[0].id;
}

export async function updateStatus(waMsgId, status) {
  await q('UPDATE messages SET status=$1 WHERE wa_msg_id=$2', [status, waMsgId]);
}

export const getContact = async (waId) =>
  (await q('SELECT wa_id, name, labels, notes, assignee, channel_id, stage, pipeline_id, created_at FROM contacts WHERE wa_id=$1', [waId])).rows[0];

export async function updateContact(waId, { name, labels, notes, assignee, stage, pipeline_id }) {
  await q(
    `UPDATE contacts SET
       name        = COALESCE($1, name),
       labels      = COALESCE($2, labels),
       notes       = COALESCE($3, notes),
       assignee    = COALESCE($4, assignee),
       stage       = COALESCE($5, stage),
       pipeline_id = COALESCE($6, pipeline_id)
     WHERE wa_id=$7`,
    [name ?? null, labels ? JSON.stringify(labels) : null, notes ?? null,
     assignee === undefined ? null : assignee, stage ?? null, pipeline_id ?? null, waId]
  );
  return getContact(waId);
}

export const listConversations = async () =>
  (await q(`
    SELECT c.wa_id, c.name, c.labels, c.assignee, c.channel_id, c.stage, c.pipeline_id,
           ch.label AS channel_label,
           (SELECT body FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT direction FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_dir,
           (SELECT created_at FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_at
    FROM contacts c LEFT JOIN channels ch ON ch.id=c.channel_id ORDER BY last_at DESC NULLS LAST
  `)).rows;

// pagination: 50 terakhir; `before` = id pesan tertua yg sudah dimuat (buat "muat lama")
export const listMessages = async (waId, before) => {
  const rows = before
    ? (await q('SELECT * FROM messages WHERE wa_id=$1 AND id<$2 ORDER BY id DESC LIMIT 50', [waId, before])).rows
    : (await q('SELECT * FROM messages WHERE wa_id=$1 ORDER BY id DESC LIMIT 50', [waId])).rows;
  return rows.reverse();
};

// ===== Multi-nomor (channels) =====
export async function initChannels() {
  await q(`CREATE TABLE IF NOT EXISTS channels (
    id serial PRIMARY KEY,
    label text,
    phone_id text UNIQUE,
    waba_id text,
    token text,
    created_at bigint NOT NULL
  )`);
  await q('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel_id int');
  await q('ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel_id int');
  await q('ALTER TABLE channels ADD COLUMN IF NOT EXISTS ai_enabled int DEFAULT 0');
}
const CH_COLS = 'id, label, phone_id, waba_id, token, ai_enabled';
export const listChannels = async () => (await q(`SELECT ${CH_COLS} FROM channels ORDER BY id`)).rows;
export const getChannel = async (id) => (await q(`SELECT ${CH_COLS} FROM channels WHERE id=$1`, [id])).rows[0];
export const getChannelByPhone = async (phoneId) => (await q(`SELECT ${CH_COLS} FROM channels WHERE phone_id=$1`, [phoneId])).rows[0];
export const setChannelAi = (id, on) => q('UPDATE channels SET ai_enabled=$1 WHERE id=$2', [on ? 1 : 0, id]);
export const createChannel = async ({ label, phone_id, waba_id, token }) =>
  (await q('INSERT INTO channels(label,phone_id,waba_id,token,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [label, phone_id, waba_id, token ?? null, Date.now()])).rows[0].id;
export const deleteChannel = (id) => q('DELETE FROM channels WHERE id=$1', [id]);
export const setContactChannel = (waId, channelId) =>
  q('UPDATE contacts SET channel_id=$1 WHERE wa_id=$2 AND channel_id IS NULL', [channelId, waId]);

// ===== Follow-up terjadwal (reminders) =====
export async function initReminders() {
  await q('CREATE TABLE IF NOT EXISTS reminders (id serial PRIMARY KEY, wa_id text, remind_at bigint, note text, created_by text, done int DEFAULT 0, created_at bigint NOT NULL)');
}
export const createReminder = async (waId, remindAt, note, by) =>
  (await q('INSERT INTO reminders(wa_id,remind_at,note,created_by,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id', [waId, remindAt, note, by, Date.now()])).rows[0].id;
export const listReminders = async (waId) =>
  (await q('SELECT id, remind_at, note, created_by, done FROM reminders WHERE wa_id=$1 ORDER BY remind_at', [waId])).rows;
export const dueReminders = async () =>
  (await q('SELECT id, wa_id, note, created_by FROM reminders WHERE done=0 AND remind_at<=$1', [Date.now()])).rows;
export const markReminderDone = (id) => q('UPDATE reminders SET done=1 WHERE id=$1', [id]);
export const deleteReminder = (id) => q('DELETE FROM reminders WHERE id=$1', [id]);

// ===== Setting generik (key/value di tabel settings) =====
export const getSetting = async (k) => (await q('SELECT value FROM settings WHERE key=$1', [k])).rows[0]?.value;
export const setSetting = (k, v) => q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [k, String(v)]);

// Auto-assign round-robin ke agen (kalau kontak belum ada yang pegang)
export async function assignRoundRobin(waId) {
  const agents = (await q('SELECT email FROM users ORDER BY created_at')).rows.map((r) => r.email);
  if (!agents.length) return null;
  const n = parseInt((await getSetting('RR_COUNTER')) || '0', 10);
  const email = agents[n % agents.length];
  await setSetting('RR_COUNTER', n + 1);
  await q("UPDATE contacts SET assignee=$1 WHERE wa_id=$2 AND (assignee IS NULL OR assignee='')", [email, waId]);
  return email;
}

// ===== Balasan cepat (snippet) =====
export async function initQuickReplies() {
  await q('CREATE TABLE IF NOT EXISTS quick_replies (id serial PRIMARY KEY, title text, body text, created_at bigint NOT NULL)');
}
export const listQuickReplies = async () =>
  (await q('SELECT id, title, body FROM quick_replies ORDER BY title')).rows;
export const createQuickReply = async (title, body) =>
  (await q('INSERT INTO quick_replies(title,body,created_at) VALUES($1,$2,$3) RETURNING id', [title, body, Date.now()])).rows[0].id;
export const deleteQuickReply = (id) => q('DELETE FROM quick_replies WHERE id=$1', [id]);

// ===== Pipeline (multi, custom stages) =====
export async function initPipelines() {
  await q('CREATE TABLE IF NOT EXISTS pipelines (id serial PRIMARY KEY, name text, stages text, created_at bigint NOT NULL)');
  await q('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pipeline_id int');
}
export const listPipelines = async () =>
  (await q('SELECT id, name, stages FROM pipelines ORDER BY id')).rows.map((p) => ({ id: p.id, name: p.name, stages: JSON.parse(p.stages || '[]') }));
export const createPipeline = async (name, stages) =>
  (await q('INSERT INTO pipelines(name,stages,created_at) VALUES($1,$2,$3) RETURNING id', [name, JSON.stringify(stages), Date.now()])).rows[0].id;
export const updatePipeline = (id, name, stages) =>
  q('UPDATE pipelines SET name=COALESCE($1,name), stages=COALESCE($2,stages) WHERE id=$3', [name ?? null, stages ? JSON.stringify(stages) : null, id]);
export const deletePipeline = (id) => q('DELETE FROM pipelines WHERE id=$1', [id]);

// gambar default per template (biar tak upload ulang tiap kirim)
export async function initTplMedia() {
  await q('CREATE TABLE IF NOT EXISTS template_media (name text PRIMARY KEY, path text, mime text)');
}
export const setTplMedia = (name, path, mime) =>
  q('INSERT INTO template_media(name,path,mime) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET path=EXCLUDED.path, mime=EXCLUDED.mime', [name, path, mime]);
export const getTplMedia = async (name) =>
  (await q('SELECT path, mime FROM template_media WHERE name=$1', [name])).rows[0];

export const agentReport = async () => {
  const users = (await q('SELECT email, name, is_admin FROM users ORDER BY created_at')).rows;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const out = [];
  for (const u of users) {
    const sent = (await q("SELECT count(*)::int c FROM messages WHERE direction='out' AND sent_by=$1", [u.name])).rows[0].c;
    const sent24 = (await q("SELECT count(*)::int c FROM messages WHERE direction='out' AND sent_by=$1 AND created_at>$2", [u.name, dayAgo])).rows[0].c;
    const assigned = (await q('SELECT count(*)::int c FROM contacts WHERE assignee=$1', [u.email])).rows[0].c;
    out.push({ name: u.name, email: u.email, is_admin: u.is_admin, sent, sent24, assigned });
  }
  return out;
};

export const pipelineFunnel = async () => {
  const pipes = await listPipelines();
  const rows = (await q('SELECT pipeline_id, stage, count(*)::int c FROM contacts GROUP BY pipeline_id, stage')).rows;
  return pipes.map((p) => ({
    name: p.name,
    stages: p.stages.map((s) => ({ stage: s, count: rows.find((r) => r.pipeline_id === p.id && r.stage === s)?.c || 0 })),
  }));
};

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
