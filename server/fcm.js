// Push notif ke app Android via FCM HTTP v1.
// Butuh env FCM_SERVICE_ACCOUNT_JSON = isi service account JSON (Firebase Console >
// Project settings > Service accounts > Generate new private key). project_id diambil
// dari JSON itu. Kalau env kosong, notif Android nonaktif (fitur lain tetap jalan).
import { readFileSync, existsSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { q } from './db.js';

let auth = null;
let projectId = null;

export async function initFcm() {
  await q('CREATE TABLE IF NOT EXISTS fcm_tokens (token text PRIMARY KEY, email text, created_at bigint NOT NULL)');
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) { console.log('FCM: FCM_SERVICE_ACCOUNT_JSON belum diset — notif Android nonaktif'); return; }
  try {
    // Boleh isi JSON langsung, atau path ke file JSON service account
    const text = raw.trim().startsWith('{') ? raw : (existsSync(raw) ? readFileSync(raw, 'utf8') : raw);
    const cred = JSON.parse(text);
    projectId = cred.project_id;
    auth = new GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    console.log('FCM aktif untuk project', projectId);
  } catch (e) { console.error('FCM init gagal:', e.message); }
}

export const saveFcmToken = (token, email) =>
  q('INSERT INTO fcm_tokens(token,email,created_at) VALUES($1,$2,$3) ON CONFLICT(token) DO UPDATE SET email=EXCLUDED.email',
    [token, email, Date.now()]);
export const deleteFcmToken = (token) => q('DELETE FROM fcm_tokens WHERE token=$1', [token]);

// Kirim ke semua device yang terdaftar. ponytail: loop per-token (cukup utk skala tim);
// pakai firebase-admin sendEachForMulticast kalau token sudah ratusan.
export async function sendFcmToAll({ title, body, wa_id }) {
  if (!auth || !projectId) return;
  const tokens = (await q('SELECT token FROM fcm_tokens')).rows.map((r) => r.token);
  if (!tokens.length) return;
  const accessToken = (await (await auth.getClient()).getAccessToken()).token;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  for (const t of tokens) {
    const msg = { message: {
      token: t,
      notification: { title, body },
      data: { wa_id: String(wa_id || '') },
      android: { priority: 'HIGH' },
    } };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      if (res.status === 404 || res.status === 403) await deleteFcmToken(t); // token mati → buang
    } catch (e) { console.error('FCM send gagal', e.message); }
  }
}
