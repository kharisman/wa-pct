import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email      TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    pass       TEXT NOT NULL,        -- salt:hash (scrypt)
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

if (!new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)).has('is_admin'))
  db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');

const WEEK = 7 * 24 * 3600 * 1000;
db.prepare('DELETE FROM sessions WHERE created_at < ?').run(Date.now() - WEEK); // buang sesi kedaluwarsa

const hash = (pw, salt = randomBytes(16).toString('hex')) =>
  `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;

export function createUser(email, name, pw, isAdmin) {
  // user pertama otomatis admin
  const first = db.prepare('SELECT COUNT(*) n FROM users').get().n === 0;
  db.prepare('INSERT INTO users(email,name,pass,is_admin,created_at) VALUES(?,?,?,?,?)')
    .run(email.toLowerCase(), name, hash(pw), (isAdmin ?? first) ? 1 : 0, Date.now());
}

export const listUsers = () => db.prepare('SELECT email, name, is_admin FROM users ORDER BY created_at').all();

function verify(email, pw) {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
  if (!u) return null;
  const [salt, h] = u.pass.split(':');
  const a = Buffer.from(h, 'hex');
  const b = scryptSync(pw, salt, 32);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { email: u.email, name: u.name };
}

const parseCookie = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter((p) => p[0]));

export function requireAuth(req, res, next) {
  const token = parseCookie(req.headers.cookie).sid;
  const s = token && db.prepare('SELECT email FROM sessions WHERE token=?').get(token);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  req.user = db.prepare('SELECT email, name, is_admin FROM users WHERE email=?').get(s.email);
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'khusus admin' });
  next();
}

export function mountAuth(app) {
  app.post('/api/login', (req, res) => {
    const user = verify(req.body.email || '', req.body.password || '');
    if (!user) return res.status(401).json({ error: 'Email atau password salah' });
    const token = randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions(token,email,name,created_at) VALUES(?,?,?,?)')
      .run(token, user.email, user.name, Date.now());
    res.set('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
    res.json(user);
  });
  app.post('/api/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token=?').run(parseCookie(req.headers.cookie).sid || '');
    res.set('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0').json({ ok: true });
  });
  app.get('/api/me', requireAuth, (req, res) => res.json(req.user));
  app.get('/api/users', requireAuth, (_req, res) => res.json(listUsers()));

  app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !name || !password) return res.status(400).json({ error: 'email, nama, password wajib' });
    try { createUser(email, name, password, false); res.json({ ok: true }); }
    catch { res.status(409).json({ error: 'email sudah dipakai' }); }
  });
  app.delete('/api/users/:email', requireAuth, requireAdmin, (req, res) => {
    if (req.params.email === req.user.email) return res.status(400).json({ error: 'tak bisa hapus diri sendiri' });
    db.prepare('DELETE FROM users WHERE email=?').run(req.params.email);
    db.prepare('DELETE FROM sessions WHERE email=?').run(req.params.email);
    res.json({ ok: true });
  });
}
