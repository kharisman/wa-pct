import express from 'express';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  upsertContact, insertMessage, updateStatus,
  listConversations, listMessages, getContact, updateContact, initDb, stats,
} from './db.js';
import { sendText, downloadMedia, uploadMedia, sendMedia, saveMediaFile, listTemplates, sendTemplate } from './wa.js';
import { mountAuth, requireAuth, requireAdmin, initAuth } from './auth.js';
import { loadConfig, cfg, setConfig, getConfigView } from './config.js';

try { process.loadEnvFile(); } catch { /* no .env, use real env */ }

const app = express();
app.use(express.json({ limit: '30mb' })); // ponytail: base64 media inline, cukup buat gambar/dok CRM
mountAuth(app);

/* ---- SSE: push pesan baru ke frontend realtime ---- */
const clients = new Set();
const broadcast = (event) => {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
};
app.get('/api/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

/* ---- Webhook verify (Meta manggil sekali saat setup) ---- */
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === cfg('WA_VERIFY_TOKEN')) return res.send(challenge);
  res.sendStatus(403);
});

/* ---- Webhook receive: pesan masuk + update status ---- */
app.post('/webhook', (req, res) => {
  res.sendStatus(200); // balas cepat, proses setelahnya
  (async () => {
    for (const entry of req.body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const profileName = v.contacts?.[0]?.profile?.name;
        for (const m of v.messages ?? []) {
          await upsertContact(m.from, profileName);
          const media = m[m.type]; // image/audio/video/document/sticker: {id, mime_type, caption?, filename?}
          let body = m.text?.body ?? media?.caption ?? media?.filename ?? `[${m.type}]`;
          let mediaUrl = null;
          if (media?.id) {
            try { mediaUrl = await downloadMedia(media.id, media.mime_type); }
            catch (e) { console.error('media gagal', e.message); body += ' (media gagal diunduh)'; }
          }
          const id = await insertMessage({ waId: m.from, direction: 'in', type: m.type, body, waMsgId: m.id, mediaUrl });
          broadcast({ kind: 'message', wa_id: m.from, message: { id, direction: 'in', body, type: m.type, media_url: mediaUrl, created_at: Date.now() } });
        }
        for (const s of v.statuses ?? []) {
          if (s.status === 'failed') console.error('SEND FAILED:', JSON.stringify(s.errors));
          await updateStatus(s.id, s.status);
          broadcast({ kind: 'status', wa_msg_id: s.id, status: s.status });
        }
      }
    }
  })().catch((e) => console.error('webhook error', e));
});

/* ---- API buat frontend ---- */
app.use('/api', requireAuth); // semua /api di bawah ini butuh login

app.get('/api/stats', async (_req, res) => res.json(await stats()));
app.get('/api/conversations', async (_req, res) => res.json(await listConversations()));
app.get('/api/messages/:waId', async (req, res) => res.json(await listMessages(req.params.waId)));

app.get('/api/contact/:waId', async (req, res) => res.json((await getContact(req.params.waId)) || {}));
app.patch('/api/contact/:waId', async (req, res) => {
  const c = await updateContact(req.params.waId, req.body);
  broadcast({ kind: 'contact', wa_id: req.params.waId });
  res.json(c);
});

app.post('/api/send', async (req, res) => {
  const { wa_id, body } = req.body;
  if (!wa_id || !body) return res.status(400).json({ error: 'wa_id & body wajib' });
  try {
    // ponytail: hanya jalan dalam window 24 jam sejak pesan terakhir user.
    // Di luar itu WA wajib pakai approved template — tambah saat butuh outbound.
    const waMsgId = await sendText(wa_id, body);
    const id = await insertMessage({ waId: wa_id, direction: 'out', body, waMsgId, status: 'sent' });
    const message = { id, direction: 'out', body, type: 'text', status: 'sent', created_at: Date.now() };
    broadcast({ kind: 'message', wa_id, message });
    res.json(message);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const mediaType = (mime) =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio'
    : mime.startsWith('video/') ? 'video' : 'document';

app.post('/api/send-media', async (req, res) => {
  const { wa_id, mime, filename, data, caption } = req.body; // data = base64
  if (!wa_id || !mime || !data) return res.status(400).json({ error: 'wa_id, mime, data wajib' });
  try {
    const buf = Buffer.from(data, 'base64');
    const type = mediaType(mime);
    const mediaId = await uploadMedia(buf, mime, filename);
    const waMsgId = await sendMedia(wa_id, type, mediaId, { caption, filename });
    const ext = (filename?.split('.').pop() || mime.split('/')[1] || 'bin').slice(0, 5);
    const mediaUrl = await saveMediaFile(buf, `out-${waMsgId}.${ext}`);
    const body = caption || filename || `[${type}]`;
    const id = await insertMessage({ waId: wa_id, direction: 'out', type, body, waMsgId, status: 'sent', mediaUrl });
    const message = { id, direction: 'out', type, body, media_url: mediaUrl, status: 'sent', created_at: Date.now() };
    broadcast({ kind: 'message', wa_id, message });
    res.json(message);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Setting koneksi WA (admin) — ubah key tanpa sentuh .env
app.get('/api/settings', requireAdmin, (_req, res) => res.json(getConfigView()));
app.patch('/api/settings', requireAdmin, async (req, res) => {
  await setConfig(req.body);
  res.json(getConfigView());
});

app.get('/api/templates', async (_req, res) => {
  try { res.json(await listTemplates()); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

// Broadcast: kirim 1 template ke banyak kontak. params sama untuk semua (personalisasi nyusul).
app.post('/api/broadcast', async (req, res) => {
  const { name, language, params = [], wa_ids = [] } = req.body;
  if (!name || !language || wa_ids.length === 0)
    return res.status(400).json({ error: 'name, language, wa_ids wajib' });
  const preview = params.reduce((t, p, i) => t.replaceAll(`{{${i + 1}}}`, p), req.body.text || `[template: ${name}]`);
  let sent = 0; const failed = [];
  // ponytail: sequential — aman dari rate limit dasar. Pakai queue kalau ribuan kontak.
  for (const wa_id of wa_ids) {
    try {
      const waMsgId = await sendTemplate(wa_id, name, language, params);
      const id = await insertMessage({ waId: wa_id, direction: 'out', body: preview, waMsgId, status: 'sent' });
      broadcast({ kind: 'message', wa_id, message: { id, direction: 'out', body: preview, type: 'text', status: 'sent', created_at: Date.now() } });
      sent++;
    } catch (e) { failed.push({ wa_id, error: e.message }); }
  }
  res.json({ sent, failed });
});

/* ---- File media yang diunduh dari WhatsApp ---- */
app.use('/media', express.static(fileURLToPath(new URL('../media', import.meta.url))));

/* ---- Serve React build kalau sudah di-build ---- */
const dist = fileURLToPath(new URL('../web/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`));
}

const port = process.env.PORT || 3000;
await initDb();
await initAuth();
await loadConfig();
app.listen(port, () => console.log(`WA CRM (Postgres/Supabase) di http://localhost:${port}`));
