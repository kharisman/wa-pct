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
  await q('ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_off int DEFAULT 0'); // AI dimatikan utk kontak ini (diambil alih agen)
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
  (await q('SELECT wa_id, name, labels, notes, assignee, channel_id, stage, pipeline_id, ai_off, created_at FROM contacts WHERE wa_id=$1', [waId])).rows[0];

export async function updateContact(waId, { name, labels, notes, assignee, stage, pipeline_id, ai_off }) {
  await q(
    `UPDATE contacts SET
       name        = COALESCE($1, name),
       labels      = COALESCE($2, labels),
       notes       = COALESCE($3, notes),
       assignee    = COALESCE($4, assignee),
       stage       = COALESCE($5, stage),
       pipeline_id = COALESCE($6, pipeline_id),
       ai_off      = COALESCE($7, ai_off)
     WHERE wa_id=$8`,
    [name ?? null, labels ? JSON.stringify(labels) : null, notes ?? null,
     assignee === undefined ? null : assignee, stage ?? null, pipeline_id ?? null,
     ai_off === undefined ? null : ai_off, waId]
  );
  return getContact(waId);
}
export const setContactAiOff = (waId, off) => q('UPDATE contacts SET ai_off=$1 WHERE wa_id=$2', [off ? 1 : 0, waId]);

export const listConversations = async () =>
  (await q(`
    SELECT c.wa_id, c.name, c.labels, c.assignee, c.channel_id, c.stage, c.pipeline_id, c.ai_off,
           ch.label AS channel_label, ch.ai_enabled AS channel_ai,
           (SELECT body FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_body,
           (SELECT direction FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_dir,
           (SELECT created_at FROM messages m WHERE m.wa_id=c.wa_id ORDER BY m.id DESC LIMIT 1) AS last_at
    FROM contacts c LEFT JOIN channels ch ON ch.id=c.channel_id ORDER BY last_at DESC NULLS LAST
  `)).rows;

// pagination: `limit` terakhir (default 10); `before` = id pesan tertua yg sudah dimuat (buat "muat lama")
export const listMessages = async (waId, before, limit = 10) => {
  const rows = before
    ? (await q('SELECT * FROM messages WHERE wa_id=$1 AND id<$2 ORDER BY id DESC LIMIT $3', [waId, before, limit])).rows
    : (await q('SELECT * FROM messages WHERE wa_id=$1 ORDER BY id DESC LIMIT $2', [waId, limit])).rows;
  return rows.reverse();
};

// Cari wa_id yang punya pesan mengandung teks (buat pencarian isi chat)
export const searchWaIds = async (text) =>
  (await q("SELECT DISTINCT wa_id FROM messages WHERE body ILIKE $1 LIMIT 300", ['%' + text + '%'])).rows.map((r) => r.wa_id);

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
  await q('ALTER TABLE channels ADD COLUMN IF NOT EXISTS phone_number text'); // nomor tampil (+62..)
}
const CH_COLS = 'id, label, phone_id, waba_id, token, ai_enabled, phone_number';
export const listChannels = async () => (await q(`SELECT ${CH_COLS} FROM channels ORDER BY id`)).rows;
export const getChannel = async (id) => (await q(`SELECT ${CH_COLS} FROM channels WHERE id=$1`, [id])).rows[0];
export const getChannelByPhone = async (phoneId) => (await q(`SELECT ${CH_COLS} FROM channels WHERE phone_id=$1`, [phoneId])).rows[0];
export const setChannelAi = (id, on) => q('UPDATE channels SET ai_enabled=$1 WHERE id=$2', [on ? 1 : 0, id]);
export const setChannelNumber = (id, num) => q('UPDATE channels SET phone_number=$1 WHERE id=$2', [num, id]);
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

// ===== Push subscription (Web Push, per staff) =====
export async function initPush() {
  await q(`CREATE TABLE IF NOT EXISTS push_subs (
    endpoint   text PRIMARY KEY,
    email      text NOT NULL,
    keys       text NOT NULL,
    created_at bigint NOT NULL
  )`);
}
export const savePushSub = (email, sub) =>
  q('INSERT INTO push_subs(endpoint,email,keys,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(endpoint) DO UPDATE SET keys=EXCLUDED.keys',
    [sub.endpoint, email, JSON.stringify(sub.keys), Date.now()]);
export const deletePushSub = (endpoint) => q('DELETE FROM push_subs WHERE endpoint=$1', [endpoint]);
export const listPushSubs = async () =>
  (await q('SELECT endpoint, email, keys FROM push_subs')).rows.map((r) => ({ endpoint: r.endpoint, email: r.email, keys: JSON.parse(r.keys) }));

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

// ===== Master data (divisi & jabatan) =====
export async function initMasters() {
  await q('CREATE TABLE IF NOT EXISTS masters (type text, name text, created_at bigint, PRIMARY KEY(type,name))');
}
export const listMasters = async (type) => (await q('SELECT name FROM masters WHERE type=$1 ORDER BY name', [type])).rows.map((r) => r.name);
export const addMaster = (type, name) => q('INSERT INTO masters(type,name,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [type, name, Date.now()]);
export const deleteMaster = (type, name) => q('DELETE FROM masters WHERE type=$1 AND name=$2', [type, name]);

// ===== Roles & hak akses (custom) =====
// perms = array capability: reports, agents, templates, quick, forms, channels, settings, pipeline_admin. 'all' = admin penuh.
export async function initRoles() {
  await q('CREATE TABLE IF NOT EXISTS roles (name text PRIMARY KEY, label text, perms text, created_at bigint NOT NULL)');
  if ((await q('SELECT count(*)::int c FROM roles')).rows[0].c === 0) {
    const seed = [
      ['admin', 'Admin', ['all']],
      ['supervisor', 'Supervisor', ['reports', 'pipeline_admin', 'quick']],
      ['agen', 'Agen', []],
    ];
    for (const [name, label, perms] of seed)
      await q('INSERT INTO roles(name,label,perms,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO NOTHING', [name, label, JSON.stringify(perms), Date.now()]);
  }
}
export const listRoles = async () =>
  (await q('SELECT name, label, perms FROM roles ORDER BY created_at')).rows.map((r) => ({ name: r.name, label: r.label, perms: JSON.parse(r.perms || '[]') }));
export const getRolePerms = async (name) => {
  const r = (await q('SELECT perms FROM roles WHERE name=$1', [name])).rows[0];
  return r ? JSON.parse(r.perms || '[]') : [];
};
export const upsertRole = (name, label, perms) =>
  q('INSERT INTO roles(name,label,perms,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO UPDATE SET label=EXCLUDED.label, perms=EXCLUDED.perms',
    [name, label, JSON.stringify(perms), Date.now()]);
export const deleteRole = (name) => q('DELETE FROM roles WHERE name=$1', [name]);

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

// Rentang waktu (ms) untuk periode dashboard
function periodRange(period) {
  const now = new Date();
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const DAY = 24 * 3600 * 1000;
  if (period === 'today') return [midnight.getTime(), Date.now()];
  if (period === 'yesterday') return [midnight.getTime() - DAY, midnight.getTime()];
  if (period === 'month') return [Date.now() - 30 * DAY, Date.now()];
  return [Date.now() - 7 * DAY, Date.now()]; // week (default)
}

export const stats = async (period = 'week', channelId = null) => {
  const [from, to] = periodRange(period);
  const now = Date.now();
  const ch = channelId ? Number(channelId) : null; // null = semua nomor
  return (await q(`WITH seq AS (
      SELECT wa_id, direction, created_at,
             lead(direction)  OVER w AS next_dir,
             lead(created_at) OVER w AS next_at
      FROM messages
      WHERE direction IN ('in','out') AND created_at >= $1 AND ($4::int IS NULL OR channel_id = $4)
      WINDOW w AS (PARTITION BY wa_id ORDER BY id)
    ), reply AS (
      SELECT (next_at - created_at) AS ms
      FROM seq WHERE direction='in' AND next_dir='out' AND next_at >= created_at AND created_at <= $2
    ), last_msg AS (
      SELECT DISTINCT ON (wa_id) wa_id, direction, created_at
      FROM messages WHERE direction IN ('in','out') AND ($4::int IS NULL OR channel_id = $4)
      ORDER BY wa_id, id DESC
    )
    SELECT
    (SELECT count(*) FROM contacts WHERE ($4::int IS NULL OR channel_id = $4))::int AS contacts,
    (SELECT count(*) FROM messages WHERE ($4::int IS NULL OR channel_id = $4))::int AS messages,
    (SELECT count(*) FROM messages WHERE direction='in'  AND created_at BETWEEN $1 AND $2 AND ($4::int IS NULL OR channel_id = $4))::int AS incoming,
    (SELECT count(*) FROM messages WHERE direction='out' AND created_at BETWEEN $1 AND $2 AND ($4::int IS NULL OR channel_id = $4))::int AS outgoing,
    (SELECT count(DISTINCT wa_id) FROM messages WHERE created_at BETWEEN $1 AND $2 AND ($4::int IS NULL OR channel_id = $4))::int AS ongoing,
    (SELECT count(*) FROM contacts WHERE (assignee IS NULL OR assignee='') AND ($4::int IS NULL OR channel_id = $4))::int AS unassigned,
    (SELECT count(*) FROM last_msg WHERE direction='in')::int AS unanswered,
    (SELECT $3::bigint - min(created_at) FROM last_msg WHERE direction='in')::bigint AS longest_await_ms,
    (SELECT count(*) FROM reminders r WHERE r.done=0 AND ($4::int IS NULL OR EXISTS (SELECT 1 FROM contacts c WHERE c.wa_id=r.wa_id AND c.channel_id=$4)))::int AS tasks_open,
    (SELECT count(*) FROM reply)::int AS replied,
    (SELECT avg(ms) FROM reply)::bigint AS reply_avg_ms,
    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FROM reply)::bigint AS reply_median_ms`,
    [from, to, now, ch])).rows[0];
};

// Pesan masuk per nomor (channel) dalam periode — buat "sumber"
export const incomingByChannel = async (period = 'week') => {
  const [from, to] = periodRange(period);
  return (await q(`SELECT ch.label, count(*)::int AS n
    FROM messages m LEFT JOIN channels ch ON ch.id=m.channel_id
    WHERE m.direction='in' AND m.created_at BETWEEN $1 AND $2
    GROUP BY ch.label ORDER BY n DESC`, [from, to])).rows;
};

// ===== Form builder (bisa di-share publik lewat /f/<slug>) =====
// fields: [{ key, label, type: text|textarea|number|email|tel|date|select, required, options: [] }]
export async function initForms() {
  await q('CREATE TABLE IF NOT EXISTS forms (id serial PRIMARY KEY, slug text UNIQUE NOT NULL, title text NOT NULL, description text, fields jsonb NOT NULL, created_at bigint NOT NULL)');
  await q('CREATE TABLE IF NOT EXISTS form_responses (id serial PRIMARY KEY, form_id int NOT NULL REFERENCES forms(id) ON DELETE CASCADE, data jsonb NOT NULL, created_at bigint NOT NULL)');
  await q('ALTER TABLE forms ADD COLUMN IF NOT EXISTS pipeline_id int'); // isian masuk ke pipeline ini
  await q('ALTER TABLE forms ENABLE ROW LEVEL SECURITY');
  await q('ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY');
}
export const listForms = async () =>
  (await q('SELECT f.id, f.slug, f.title, f.description, f.fields, f.pipeline_id, (SELECT count(*)::int FROM form_responses r WHERE r.form_id=f.id) AS responses FROM forms f ORDER BY f.id DESC')).rows;
export const getFormBySlug = async (slug) =>
  (await q('SELECT id, slug, title, description, fields, pipeline_id FROM forms WHERE slug=$1', [slug])).rows[0];
export const createForm = async ({ slug, title, description, fields, pipeline_id }) =>
  (await q('INSERT INTO forms(slug,title,description,fields,pipeline_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [slug, title, description || '', JSON.stringify(fields), pipeline_id || null, Date.now()])).rows[0].id;
export const updateForm = (id, { title, description, fields, pipeline_id }) =>
  q('UPDATE forms SET title=$1, description=$2, fields=$3, pipeline_id=$4 WHERE id=$5', [title, description || '', JSON.stringify(fields), pipeline_id || null, id]);
export const deleteForm = (id) => q('DELETE FROM forms WHERE id=$1', [id]);
export const addFormResponse = (formId, data) =>
  q('INSERT INTO form_responses(form_id,data,created_at) VALUES($1,$2,$3)', [formId, JSON.stringify(data), Date.now()]);
export const listFormResponses = async (formId) =>
  (await q('SELECT id, data, created_at FROM form_responses WHERE form_id=$1 ORDER BY id DESC', [formId])).rows;
