import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { q } from './db.js';

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
  const WEEK = 7 * 24 * 3600 * 1000;
  await q('DELETE FROM sessions WHERE created_at < $1', [Date.now() - WEEK]);
}

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
    const token = parseCookie(req.headers.cookie).sid;
    const s = token && (await q('SELECT email FROM sessions WHERE token=$1', [token])).rows[0];
    if (!s) return res.status(401).json({ error: 'unauthorized' });
    req.user = (await q('SELECT email, name, is_admin FROM users WHERE email=$1', [s.email])).rows[0];
    next();
  } catch (e) { next(e); }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'khusus admin' });
  next();
}

export function mountAuth(app) {
  app.post('/api/login', async (req, res) => {
    const user = await verify(req.body.email || '', req.body.password || '');
    if (!user) return res.status(401).json({ error: 'Email atau password salah' });
    const token = randomBytes(24).toString('hex');
    await q('INSERT INTO sessions(token,email,name,created_at) VALUES($1,$2,$3,$4)',
      [token, user.email, user.name, Date.now()]);
    res.set('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    res.json(user);
  });
  app.post('/api/logout', async (req, res) => {
    await q('DELETE FROM sessions WHERE token=$1', [parseCookie(req.headers.cookie).sid || '']);
    res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0').json({ ok: true });
  });
  app.get('/api/me', requireAuth, (req, res) => res.json(req.user));
  app.get('/api/users', requireAuth, async (_req, res) => res.json(await listUsers()));

  app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { email, name, password, role, division, jabatan } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'email, nama, password wajib' });
    try { await createUser(email, name, password, { role, division, jabatan }); res.json({ ok: true }); }
    catch { res.status(409).json({ error: 'email sudah dipakai' }); }
  });
  app.patch('/api/users/:email', requireAuth, requireAdmin, async (req, res) => {
    await updateUser(req.params.email, req.body); res.json({ ok: true });
  });
  app.delete('/api/users/:email', requireAuth, requireAdmin, async (req, res) => {
    if (req.params.email === req.user.email) return res.status(400).json({ error: 'tak bisa hapus diri sendiri' });
    await q('DELETE FROM users WHERE email=$1', [req.params.email]);
    await q('DELETE FROM sessions WHERE email=$1', [req.params.email]);
    res.json({ ok: true });
  });
}
