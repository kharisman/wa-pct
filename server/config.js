import { q } from './db.js';

// Key koneksi WA yang bisa diubah dari UI (bukan lagi dari .env)
export const KEYS = ['WA_TOKEN', 'WA_PHONE_ID', 'WA_WABA_ID', 'WA_VERIFY_TOKEN', 'WA_APP_ID', 'WA_APP_SECRET'];
const SECRET_KEYS = ['WA_TOKEN', 'WA_APP_SECRET'];
const cache = new Map();

export async function loadConfig() {
  await q('CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value text)');
  for (const r of (await q('SELECT key, value FROM settings')).rows) cache.set(r.key, r.value);
  // seed dari .env sekali kalau DB masih kosong
  for (const k of KEYS) {
    if (!cache.has(k) && process.env[k]) {
      await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [k, process.env[k]]);
      cache.set(k, process.env[k]);
    }
  }
}

// dipakai wa.js & webhook — DB dulu, fallback ke env
export const cfg = (k) => cache.get(k) ?? process.env[k];

export async function setConfig(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (!KEYS.includes(k) || v == null || v === '') continue; // skip kosong = jangan timpa
    await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [k, v]);
    cache.set(k, v);
  }
}

// buat UI: token disamarkan, sisanya tampil penuh
export const getConfigView = () => Object.fromEntries(KEYS.map((k) => {
  const v = cfg(k) || '';
  return [k, SECRET_KEYS.includes(k) && v ? `${v.slice(0, 6)}…${v.slice(-4)}` : v];
}));
