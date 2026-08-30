import express from 'express';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  upsertContact, insertMessage, updateStatus,
  listConversations, listMessages, getContact, updateContact, initDb, stats, agentReport, pipelineFunnel,
  initTplMedia, setTplMedia, getTplMedia,
  initChannels, listChannels, getChannel, getChannelByPhone, createChannel, deleteChannel, setChannelAi,
  setContactChannel, q,
  initPipelines, listPipelines, createPipeline, updatePipeline, deletePipeline,
  initQuickReplies, listQuickReplies, createQuickReply, deleteQuickReply,
  getSetting, setSetting, assignRoundRobin,
  initReminders, createReminder, listReminders, dueReminders, markReminderDone, deleteReminder,
} from './db.js';
import { sendText, downloadMedia, uploadMedia, sendMedia, saveMediaFile, listTemplates, sendTemplate, listAllTemplates, createTemplate, uploadSampleMedia } from './wa.js';
import { mountAuth, requireAuth, requireAdmin, initAuth } from './auth.js';
import { loadConfig, cfg, setConfig, getConfigView } from './config.js';
import { readMedia, storeMedia } from './store.js';
import { aiReply } from './ai.js';

try { process.loadEnvFile(); } catch { /* no .env, use real env */ }

const app = express();
app.use(express.json({ limit: '30mb', verify: (req, _res, buf) => { req.rawBody = buf; } })); // simpan raw buat verifikasi signature
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
  // Verifikasi tanda tangan Meta (x-hub-signature-256) — tolak request palsu
  const secret = cfg('WA_APP_SECRET');
  if (secret) {
    const sig = req.headers['x-hub-signature-256'] || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.from('')).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return res.sendStatus(401);
    }
  }
  res.sendStatus(200); // balas cepat, proses setelahnya
  (async () => {
    for (const entry of req.body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const profileName = v.contacts?.[0]?.profile?.name;
        const ch = await getChannelByPhone(v.metadata?.phone_number_id); // nomor mana yg nerima
        const channelId = ch?.id ?? null;
        const autoAssign = (await getSetting('AUTO_ASSIGN')) === '1';
        const autoReply = (await getSetting('AUTO_REPLY')) === '1';
        const autoReplyText = await getSetting('AUTO_REPLY_TEXT');
        for (const m of v.messages ?? []) {
          const before = await getContact(m.from); // ada sebelumnya? (buat deteksi kontak baru)
          await upsertContact(m.from, profileName, channelId);
          if (autoAssign && !before?.assignee) await assignRoundRobin(m.from);
          // greeting otomatis: cuma sekali, saat kontak pertama kali chat (skip kalau AI aktif)
          if (autoReply && autoReplyText && !before && !ch?.ai_enabled) {
            try {
              const wid = await sendText(ch, m.from, autoReplyText);
              const aid = await insertMessage({ waId: m.from, direction: 'out', body: autoReplyText, waMsgId: wid, status: 'sent', sentBy: 'Auto', channelId });
              broadcast({ kind: 'message', wa_id: m.from, message: { id: aid, direction: 'out', body: autoReplyText, type: 'text', status: 'sent', sent_by: 'Auto', created_at: Date.now() } });
            } catch (e) { console.error('auto-reply gagal', e.message); }
          }
          const media = m[m.type]; // image/audio/video/document/sticker: {id, mime_type, caption?, filename?}
          let body = m.text?.body ?? media?.caption ?? media?.filename ?? `[${m.type}]`;
          let mediaUrl = null;
          if (media?.id) {
            try { mediaUrl = await downloadMedia(ch, media.id, media.mime_type); }
            catch (e) { console.error('media gagal', e.message); body += ' (media gagal diunduh)'; }
          }
          const id = await insertMessage({ waId: m.from, direction: 'in', type: m.type, body, waMsgId: m.id, mediaUrl, channelId });
          broadcast({ kind: 'message', wa_id: m.from, name: profileName, message: { id, direction: 'in', body, type: m.type, media_url: mediaUrl, created_at: Date.now() } });
          // AI otomatis balas kalau nomor ini AI-nya aktif (cuma pesan teks)
          if (ch?.ai_enabled && m.type === 'text') {
            try {
              const hist = (await listMessages(m.from)).filter((x) => x.direction !== 'note').slice(-20)
                .map((x) => ({ role: x.direction === 'in' ? 'user' : 'assistant', content: x.body || '' }));
              const reply = await aiReply(await aiSystem(), hist);
              if (reply) {
                const wid = await sendText(ch, m.from, reply);
                const rid = await insertMessage({ waId: m.from, direction: 'out', body: reply, waMsgId: wid, status: 'sent', sentBy: 'AI', channelId });
                broadcast({ kind: 'message', wa_id: m.from, message: { id: rid, direction: 'out', body: reply, type: 'text', status: 'sent', sent_by: 'AI', created_at: Date.now() } });
              }
            } catch (e) { console.error('AI auto-reply gagal', e.message); }
          }
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
app.get('/api/reports/agents', requireAdmin, async (_req, res) => res.json(await agentReport()));
app.get('/api/reports/pipeline', requireAdmin, async (_req, res) => res.json(await pipelineFunnel()));
app.get('/api/conversations', async (_req, res) => res.json(await listConversations()));
app.get('/api/messages/:waId', async (req, res) => res.json(await listMessages(req.params.waId, req.query.before)));

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
    const ch = await chanOf(wa_id);
    const waMsgId = await sendText(ch, wa_id, body);
    const id = await insertMessage({ waId: wa_id, direction: 'out', body, waMsgId, status: 'sent', sentBy: req.user.name, channelId: ch?.id });
    const message = { id, direction: 'out', body, type: 'text', status: 'sent', sent_by: req.user.name, created_at: Date.now() };
    broadcast({ kind: 'message', wa_id, message });
    res.json(message);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Catatan internal (tidak dikirim ke WhatsApp, cuma buat tim)
app.post('/api/note', async (req, res) => {
  const { wa_id, body } = req.body;
  if (!wa_id || !body) return res.status(400).json({ error: 'wa_id & body wajib' });
  const id = await insertMessage({ waId: wa_id, direction: 'note', body, sentBy: req.user.name });
  const message = { id, direction: 'note', body, type: 'text', sent_by: req.user.name, created_at: Date.now() };
  broadcast({ kind: 'message', wa_id, message });
  res.json(message);
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
    const ch = await chanOf(wa_id);
    const mediaId = await uploadMedia(ch, buf, mime, filename);
    const waMsgId = await sendMedia(ch, wa_id, type, mediaId, { caption, filename });
    const ext = (filename?.split('.').pop() || mime.split('/')[1] || 'bin').slice(0, 5);
    const mediaUrl = await saveMediaFile(buf, `out-${waMsgId}.${ext}`, mime);
    const body = caption || filename || `[${type}]`;
    const id = await insertMessage({ waId: wa_id, direction: 'out', type, body, waMsgId, status: 'sent', mediaUrl, sentBy: req.user.name, channelId: ch?.id });
    const message = { id, direction: 'out', type, body, media_url: mediaUrl, status: 'sent', sent_by: req.user.name, created_at: Date.now() };
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

// ===== Follow-up terjadwal =====
app.get('/api/reminders/:waId', async (req, res) => res.json(await listReminders(req.params.waId)));
app.post('/api/reminders', async (req, res) => {
  const { wa_id, remind_at, note } = req.body;
  if (!wa_id || !remind_at) return res.status(400).json({ error: 'wa_id & waktu wajib' });
  res.json({ id: await createReminder(wa_id, remind_at, note || '', req.user.name) });
});
app.delete('/api/reminders/:id', async (req, res) => { await deleteReminder(req.params.id); res.json({ ok: true }); });

// scheduler: cek reminder jatuh tempo tiap menit
setInterval(async () => {
  try {
    for (const r of await dueReminders()) {
      broadcast({ kind: 'reminder', wa_id: r.wa_id, note: r.note, by: r.created_by });
      await markReminderDone(r.id);
    }
  } catch (e) { console.error('reminder tick', e.message); }
}, 60000);

// ===== Auto-assign toggle =====
app.get('/api/auto-assign', async (_req, res) => res.json({ on: (await getSetting('AUTO_ASSIGN')) === '1' }));
app.post('/api/auto-assign', requireAdmin, async (req, res) => { await setSetting('AUTO_ASSIGN', req.body.on ? '1' : '0'); res.json({ on: !!req.body.on }); });

// ===== AI (DeepSeek) =====
// funnel = array of string (langkah). knowledge = array of {title, body}. (kompat teks lama)
const parseFunnel = (v) => { try { const j = JSON.parse(v); return Array.isArray(j) ? j : (v ? [v] : []); } catch { return v ? [v] : []; } };
const parseKnow = (v) => { try { const j = JSON.parse(v); return Array.isArray(j) ? j : (v ? [{ title: 'Umum', body: v }] : []); } catch { return v ? [{ title: 'Umum', body: v }] : []; } };

// Rangkai system prompt dari peran + funnel bertahap + knowledge (fakta presisi)
async function aiSystem() {
  const persona = (await getSetting('AI_SYSTEM')) || '';
  const funnel = parseFunnel(await getSetting('AI_FUNNEL')).map((s) => (s || '').trim()).filter(Boolean);
  const know = parseKnow(await getSetting('AI_KNOWLEDGE')).filter((k) => (k.body || '').trim());
  let s = persona;
  if (funnel.length) s += '\n\nIKUTI ALUR PERCAKAPAN BERTAHAP ini urut. Kerjakan SATU langkah dulu, tanyakan info yang belum diketahui sebelum lanjut ke langkah berikutnya. Jangan langsung menjawab semua di awal:\n' + funnel.map((t, i) => `Langkah ${i + 1}: ${t}`).join('\n');
  if (know.length) s += '\n\nGUNAKAN HANYA FAKTA di bawah untuk jawaban spesifik (harga, program, syarat, jadwal). Kalau tidak ada di sini, JANGAN mengarang — bilang akan dicek/diteruskan ke admin:\n' + know.map((k) => `• ${k.title ? k.title + ': ' : ''}${k.body}`).join('\n');
  return s;
}

app.post('/api/ai-suggest', async (req, res) => {
  const { wa_id } = req.body;
  if (!wa_id) return res.status(400).json({ error: 'wa_id wajib' });
  try {
    const msgs = (await listMessages(wa_id)).filter((m) => m.direction !== 'note').slice(-20); // memori per percakapan
    const history = msgs.map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body || '' }));
    res.json({ text: await aiReply(await aiSystem(), history) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/ai-config', requireAdmin, async (_req, res) => res.json({
  system: (await getSetting('AI_SYSTEM')) || '',
  funnel: parseFunnel(await getSetting('AI_FUNNEL')),          // array of string
  knowledge: parseKnow(await getSetting('AI_KNOWLEDGE')),      // array of {title, body}
}));
app.post('/api/ai-config', requireAdmin, async (req, res) => {
  if (req.body.system !== undefined) await setSetting('AI_SYSTEM', req.body.system);
  if (req.body.funnel !== undefined) await setSetting('AI_FUNNEL', JSON.stringify(req.body.funnel));
  if (req.body.knowledge !== undefined) await setSetting('AI_KNOWLEDGE', JSON.stringify(req.body.knowledge));
  res.json({ ok: true });
});

// ===== Auto-reply (greeting) =====
app.get('/api/auto-reply', async (_req, res) => res.json({ on: (await getSetting('AUTO_REPLY')) === '1', text: (await getSetting('AUTO_REPLY_TEXT')) || '' }));
app.post('/api/auto-reply', requireAdmin, async (req, res) => {
  await setSetting('AUTO_REPLY', req.body.on ? '1' : '0');
  if (req.body.text !== undefined) await setSetting('AUTO_REPLY_TEXT', req.body.text);
  res.json({ ok: true });
});

// ===== Balasan cepat =====
app.get('/api/quick-replies', async (_req, res) => res.json(await listQuickReplies()));
app.post('/api/quick-replies', requireAdmin, async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'judul & isi wajib' });
  res.json({ id: await createQuickReply(title, body) });
});
app.delete('/api/quick-replies/:id', requireAdmin, async (req, res) => {
  await deleteQuickReply(req.params.id); res.json({ ok: true });
});

// ===== Pipeline (multi, custom) =====
app.get('/api/pipelines', async (_req, res) => res.json(await listPipelines()));
app.post('/api/pipelines', requireAdmin, async (req, res) => {
  const { name, stages } = req.body;
  if (!name || !Array.isArray(stages) || !stages.length) return res.status(400).json({ error: 'name & stages wajib' });
  res.json({ id: await createPipeline(name, stages) });
});
app.patch('/api/pipelines/:id', requireAdmin, async (req, res) => {
  await updatePipeline(req.params.id, req.body.name, req.body.stages); res.json({ ok: true });
});
app.delete('/api/pipelines/:id', requireAdmin, async (req, res) => {
  await deletePipeline(req.params.id); res.json({ ok: true });
});

// ===== Kelola nomor (channels) =====
app.get('/api/channels', async (_req, res) => {
  const rows = await listChannels();
  res.json(rows.map((c) => ({ id: c.id, label: c.label, phone_id: c.phone_id, waba_id: c.waba_id, hasToken: !!c.token, ai_enabled: !!c.ai_enabled })));
});
app.post('/api/channels', requireAdmin, async (req, res) => {
  const { label, phone_id, waba_id, token } = req.body;
  if (!label || !phone_id || !waba_id) return res.status(400).json({ error: 'label, phone_id, waba_id wajib' });
  try { const id = await createChannel({ label, phone_id, waba_id, token }); res.json({ id }); }
  catch { res.status(409).json({ error: 'phone_id sudah terdaftar' }); }
});
app.delete('/api/channels/:id', requireAdmin, async (req, res) => {
  await deleteChannel(req.params.id); res.json({ ok: true });
});
app.post('/api/channels/:id/ai', requireAdmin, async (req, res) => {
  await setChannelAi(req.params.id, req.body.on); res.json({ on: !!req.body.on });
});

app.get('/api/templates', async (req, res) => {
  try {
    const ch = await pickChannel({ channel_id: req.query.channel_id, wa_id: req.query.wa_id });
    const tpls = await listTemplates(ch);
    for (const t of tpls) if (t.headerType === 'IMAGE') t.hasImage = !!(await getTplMedia(t.name));
    res.json(tpls);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Kelola template (admin): lihat semua status + bikin baru
app.get('/api/templates/all', requireAdmin, async (req, res) => {
  try { res.json(await listAllTemplates(await pickChannel({ channel_id: req.query.channel_id }))); }
  catch (e) { res.status(502).json({ error: e.message }); }
});
app.post('/api/templates', requireAdmin, async (req, res) => {
  try {
    // target: satu channel, atau semua WABA berbeda (all_channels)
    let targets;
    if (req.body.all_channels) {
      const seen = new Set();
      targets = (await listChannels()).filter((c) => (seen.has(c.waba_id) ? false : seen.add(c.waba_id)));
    } else {
      targets = [await pickChannel({ channel_id: req.body.channel_id })];
    }

    const md = req.body.headerMedia;
    const buf = md?.data ? Buffer.from(md.data, 'base64') : null;
    const type = md ? (md.mime.startsWith('image/') ? 'IMAGE' : md.mime.startsWith('video/') ? 'VIDEO' : 'DOCUMENT') : null;

    // simpan gambar default sekali (dipakai lintas nomor saat kirim)
    if (buf && type === 'IMAGE') {
      const ext = (md.mime.split('/')[1] || 'jpg').slice(0, 5);
      await storeMedia(`tpl-${req.body.name}.${ext}`, buf, md.mime);
      await setTplMedia(req.body.name, `tpl-${req.body.name}.${ext}`, md.mime);
    }

    const results = [];
    for (const t of targets) {
      try {
        let header = req.body.header;
        if (buf) header = { type, handle: await uploadSampleMedia(t, buf, md.mime) };
        await createTemplate(t, { ...req.body, header });
        results.push({ channel: t.label, ok: true });
      } catch (e) { results.push({ channel: t.label, ok: false, error: e.message }); }
    }
    const okAll = results.every((r) => r.ok);
    res.status(okAll ? 200 : 207).json({ results, error: okAll ? undefined : results.filter((r) => !r.ok).map((r) => `${r.channel}: ${r.error}`).join('; ') });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Kirim template ke satu kontak (buat buka window 24 jam / re-engage)
app.post('/api/send-template', async (req, res) => {
  const { wa_id, name, language, params = [], preview, headerMedia } = req.body;
  if (!wa_id || !name || !language) return res.status(400).json({ error: 'wa_id, name, language wajib' });
  try {
    const ch = await chanOf(wa_id);
    let headerImageId;
    if (headerMedia?.data) {
      const buf = Buffer.from(headerMedia.data, 'base64');
      headerImageId = await uploadMedia(ch, buf, headerMedia.mime, headerMedia.filename);
    } else {
      const def = await getTplMedia(name);
      if (def) {
        const { buffer, contentType } = await readMedia(def.path.replace(/^\/media\//, ''));
        headerImageId = await uploadMedia(ch, buffer, contentType || def.mime, 'header');
      }
    }
    await upsertContact(wa_id, null, ch?.id);
    const waMsgId = await sendTemplate(ch, wa_id, name, language, params, headerImageId);
    const body = preview || `[template: ${name}]`;
    const id = await insertMessage({ waId: wa_id, direction: 'out', body, waMsgId, status: 'sent', sentBy: req.user.name, channelId: ch?.id });
    const message = { id, direction: 'out', body, type: 'text', status: 'sent', sent_by: req.user.name, created_at: Date.now() };
    broadcast({ kind: 'message', wa_id, message });
    res.json(message);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Broadcast: kirim 1 template ke banyak kontak. params sama untuk semua (personalisasi nyusul).
app.post('/api/broadcast', async (req, res) => {
  const { name, language, params = [], wa_ids = [] } = req.body;
  if (!name || !language || wa_ids.length === 0)
    return res.status(400).json({ error: 'name, language, wa_ids wajib' });
  const preview = params.reduce((t, p, i) => t.replaceAll(`{{${i + 1}}}`, p), req.body.text || `[template: ${name}]`);
  let sent = 0; const failed = [];
  const def = await getTplMedia(name); // gambar default template (kalau ada)
  const hdrCache = new Map(); // channelId -> media id (upload sekali per channel)
  // ponytail: sequential — aman dari rate limit dasar. Pakai queue kalau ribuan kontak.
  for (const wa_id of wa_ids) {
    try {
      const ch = await chanOf(wa_id);
      let headerImageId;
      if (def) {
        const key = ch?.id || 0;
        if (!hdrCache.has(key)) {
          try { const { buffer, contentType } = await readMedia(def.path.replace(/^\/media\//, '')); hdrCache.set(key, await uploadMedia(ch, buffer, contentType || def.mime, 'header')); }
          catch { hdrCache.set(key, null); }
        }
        headerImageId = hdrCache.get(key);
      }
      const waMsgId = await sendTemplate(ch, wa_id, name, language, params, headerImageId);
      const id = await insertMessage({ waId: wa_id, direction: 'out', body: preview, waMsgId, status: 'sent', sentBy: req.user.name, channelId: ch?.id });
      broadcast({ kind: 'message', wa_id, message: { id, direction: 'out', body: preview, type: 'text', status: 'sent', sent_by: req.user.name, created_at: Date.now() } });
      sent++;
    } catch (e) { failed.push({ wa_id, error: e.message }); }
  }
  res.json({ sent, failed });
});

/* ---- File media (S3 atau lokal) ---- */
app.get('/media/:name', async (req, res) => {
  const name = req.params.name;
  if (name.includes('/') || name.includes('..') || name.includes('\\')) return res.sendStatus(400); // anti path traversal
  try {
    const { buffer, contentType } = await readMedia(name);
    res.set('Content-Type', contentType).set('Cache-Control', 'public, max-age=31536000').send(buffer);
  } catch { res.sendStatus(404); }
});

/* ---- Serve React build kalau sudah di-build ---- */
const dist = fileURLToPath(new URL('../web/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(`${dist}/index.html`));
}

const port = process.env.PORT || 3000;
await initDb();
await initTplMedia();
await initChannels();
await initPipelines();
await initQuickReplies();
await initReminders();
await initAuth();
await loadConfig();
if ((await listPipelines()).length === 0) {
  const pid = await createPipeline('Umum', ['Baru', 'Dihubungi', 'Tertarik', 'Negosiasi', 'Deal', 'Batal']);
  await q('UPDATE contacts SET pipeline_id=$1 WHERE pipeline_id IS NULL', [pid]);
  await q("UPDATE contacts SET stage='Baru' WHERE stage IS NULL");
  console.log('Pipeline default dibuat:', pid);
}
// seed channel pertama dari setting global (migrasi single -> multi)
if ((await listChannels()).length === 0 && cfg('WA_PHONE_ID')) {
  await createChannel({ label: 'Nomor utama', phone_id: cfg('WA_PHONE_ID'), waba_id: cfg('WA_WABA_ID'), token: cfg('WA_TOKEN') });
  const ch = await getChannelByPhone(cfg('WA_PHONE_ID'));
  await q('UPDATE contacts SET channel_id=$1 WHERE channel_id IS NULL', [ch.id]);
  await q('UPDATE messages SET channel_id=$1 WHERE channel_id IS NULL', [ch.id]);
  console.log('Channel pertama dibuat dari setting global:', ch.id);
}
// resolve channel dari kontak (buat kirim balik lewat nomor yg benar)
async function chanOf(waId) {
  const c = await getContact(waId);
  return c?.channel_id ? await getChannel(c.channel_id) : null;
}
async function pickChannel({ channel_id, wa_id } = {}) {
  if (channel_id) return await getChannel(channel_id);
  if (wa_id) return await chanOf(wa_id);
  return (await listChannels())[0] || null;
}
app.listen(port, () => console.log(`WA CRM (Postgres/Supabase) di http://localhost:${port}`));
