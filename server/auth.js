import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { q, getRolePerms } from './db.js';
import { validate, required, email as emailRule, minLen } from './validate.js';

export async function initAuth() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      email      text PRIMARY KEY,
      name       text NOT NULL,
      pass       text NOT NULL,        -- salt:hash (scrypt)
      is_admin   integer DEFAULT 0,
      created_at bigint NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      text PRIMARY KEY,
      email      text NOT NULL,
      name       text NOT NULL,
      created_at bigint NOT NULL
    );
  `);
  await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS role text');
  await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS division text');
  await q('ALTER TABLE users ADD COLUMN IF NOT EXISTS jabatan text');
  await q(`
    CREATE TABLE IF NOT EXISTS api_keys (
      key        text PRIMARY KEY,
      label      text NOT NULL,
      created_at bigint NOT NULL
    );
  `);
  const WEEK = 7 * 24 * 3600 * 1000;
  await q('DELETE FROM sessions WHERE created_at < $1', [Date.now() - WEEK]);
}

// API key (buat app Android dll) — akses penuh, bisa dibuat banyak
export const createApiKey = async (label) => {
  const key = 'wak_' + randomBytes(24).toString('hex');
  await q('INSERT INTO api_keys(key,label,created_at) VALUES($1,$2,$3)', [key, label || 'tanpa nama', Date.now()]);
  return key;
};
export const listApiKeys = async () =>
  (await q('SELECT key, label, created_at FROM api_keys ORDER BY created_at')).rows;
export const deleteApiKey = (key) => q('DELETE FROM api_keys WHERE key=$1', [key]);

const hash = (pw, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;

// role: 'admin' | 'supervisor' | 'agen' (admin = akses penuh)
export async function createUser(email, name, pw, opts = {}) {
  const first = (await q('SELECT COUNT(*)::int n FROM users')).rows[0].n === 0;
  const role = opts.role || (first ? 'admin' : 'agen');
  await q('INSERT INTO users(email,name,pass,is_admin,role,division,jabatan,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [email.toLowerCase(), name, hash(pw), role === 'admin' ? 1 : 0, role, opts.division || null, opts.jabatan || null, Date.now()]);
}

export async function updateUser(email, { role, division, jabatan }) {
  await q(`UPDATE users SET
      role     = COALESCE($1, role),
      is_admin = CASE WHEN $1 IS NULL THEN is_admin WHEN $1='admin' THEN 1 ELSE 0 END,
      division = COALESCE($2, division),
      jabatan  = COALESCE($3, jabatan)
    WHERE email=$4`, [role ?? null, division ?? null, jabatan ?? null, email.toLowerCase()]);
}

export const listUsers = async () =>
  (await q('SELECT email, name, is_admin, role, division, jabatan FROM users ORDER BY created_at')).rows;

async function verify(email, pw) {
  const u = (await q('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];
  if (!u) return null;
  const [salt, h] = u.pass.split(':');
  const a = Buffer.from(h, 'hex');
  const b = scryptSync(pw, salt, 32);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { email: u.email, name: u.name };
}

const parseCookie = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p[0]));

export async function requireAuth(req, res, next) {
  try {
    // Token dari header (X-API-Key / Authorization: Bearer) atau cookie sesi
    const headerTok = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (headerTok) {
      // 1) API key statis → akses penuh
      const k = (await q('SELECT label FROM api_keys WHERE key=$1', [headerTok])).rows[0];
      if (k) { req.user = { email: 'apikey', name: k.label, is_admin: 1, perms: ['all'] }; return next(); }
    }
    // 2) Token sesi hasil /api/login (via header Bearer atau cookie) → akses sesuai role user
    const token = headerTok || parseCookie(req.headers.cookie).sid;
    const s = token && (await q('SELECT email FROM sessions WHERE token=$1', [token])).rows[0];
    if (!s) return res.status(401).json({ error: 'unauthorized' });
    const u = (await q('SELECT email, name, is_admin, role, division, jabatan FROM users WHERE email=$1', [s.email])).rows[0];
    const roleName = u.role || (u.is_admin ? 'admin' : 'agen');
    let perms = await getRolePerms(roleName);
    if (u.is_admin && !perms.length) perms = ['all'];
    u.perms = perms;
    req.user = u;
    next();
  } catch (e) { next(e); }
}

const has = (user, cap) => user?.perms?.includes('all') || user?.perms?.includes(cap);
export const requireCap = (cap) => (req, res, next) =>
  has(req.user, cap) ? next() : res.status(403).json({ error: 'akses ditolak' });
export function requireAdmin(req, res, next) { // = akses penuh ('all')
  return has(req.user, 'all') ? next() : res.status(403).json({ error: 'khusus admin' });
}
export const requireReports = requireCap('reports');

export function mountAuth(app) {
  app.post('/api/login', async (req, res) => {
    const err = validate(req.body, { email: [required('Email'), emailRule()], password: [required('Password')] });
    if (err) return res.status(400).json({ error: err });
    const user = await verify(req.body.email || '', req.body.password || '');
    if (!user) return res.status(401).json({ error: 'Email atau password salah' });
    const token = randomBytes(24).toString('hex');
    await q('INSERT INTO sessions(token,email,name,created_at) VALUES($1,$2,$3,$4)',
      [token, user.email, user.name, Date.now()]);
    res.set('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    res.json({ ...user, token }); // token buat klien non-browser (Android): kirim sbg `Authorization: Bearer <token>`
  });
  app.post('/api/logout', async (req, res) => {
    const tok = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || parseCookie(req.headers.cookie).sid || '';
    await q('DELETE FROM sessions WHERE token=$1', [tok]);
    res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0').json({ ok: true });
  });
  app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

  app.post('/api/change-password', requireAuth, async (req, res) => {
    const { old_password, new_password } = req.body;
    const err = validate(req.body, { old_password: [required('Password lama')], new_password: [required('Password baru'), minLen(6, 'Password baru')] });
    if (err) return res.status(400).json({ error: err });
    if (!(await verify(req.user.email, old_password))) return res.status(400).json({ error: 'Password lama salah' });
    await q('UPDATE users SET pass=$1 WHERE email=$2', [hash(new_password), req.user.email]);
    res.json({ ok: true });
  });
  app.get('/api/users', requireAuth, async (_req, res) => res.json(await listUsers()));

  app.post('/api/users', requireAuth, requireCap('agents'), async (req, res) => {
    const { email, name, password, role, division, jabatan } = req.body;
    const err = validate(req.body, { name: [required('Nama')], email: [required('Email'), emailRule()], password: [required('Password'), minLen(6, 'Password')] });
    if (err) return res.status(400).json({ error: err });
    try { await createUser(email, name, password, { role, division, jabatan }); res.json({ ok: true }); }
    catch { res.status(409).json({ error: 'email sudah dipakai' }); }
  });
  app.patch('/api/users/:email', requireAuth, requireCap('agents'), async (req, res) => {
    await updateUser(req.params.email, req.body); res.json({ ok: true });
  });
  app.delete('/api/users/:email', requireAuth, requireCap('agents'), async (req, res) => {
    if (req.params.email === req.user.email) return res.status(400).json({ error: 'tak bisa hapus diri sendiri' });
    await q('DELETE FROM users WHERE email=$1', [req.params.email]);
    await q('DELETE FROM sessions WHERE email=$1', [req.params.email]);
    res.json({ ok: true });
  });

  // ===== API keys (khusus admin) — full key ikut dikirim biar bisa dicopy/hapus dari UI
  app.get('/api/keys', requireAuth, requireAdmin, async (_req, res) => res.json(await listApiKeys()));
  app.post('/api/keys', requireAuth, requireAdmin, async (req, res) => {
    res.json({ key: await createApiKey(req.body.label) });
  });
  app.delete('/api/keys/:key', requireAuth, requireAdmin, async (req, res) => {
    await deleteApiKey(req.params.key); res.json({ ok: true });
  });
}
