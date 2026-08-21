import { cfg } from './config.js';
import { storeMedia } from './store.js';

const API = 'https://graph.facebook.com/v20.0';

// resolve kredensial per-channel, fallback ke setting global (single-nomor / template default)
const tok = (ch) => (ch && ch.token) || cfg('WA_TOKEN');
const phone = (ch) => (ch && ch.phone_id) || cfg('WA_PHONE_ID');
const waba = (ch) => (ch && ch.waba_id) || cfg('WA_WABA_ID');

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };

// List approved templates dari WABA channel.
export async function listTemplates(ch) {
  const WA_WABA_ID = waba(ch);
  if (!WA_WABA_ID) throw new Error('WABA belum diisi');
  const res = await fetch(`${API}/${WA_WABA_ID}/message_templates?limit=100`, { headers: { Authorization: `Bearer ${tok(ch)}` } });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'gagal ambil template');
  return (d.data || []).filter((t) => t.status === 'APPROVED').map((t) => {
    const body = t.components?.find((c) => c.type === 'BODY');
    const header = t.components?.find((c) => c.type === 'HEADER');
    const params = (body?.text?.match(/\{\{\d+\}\}/g) || []).length;
    return { name: t.name, language: t.language, text: body?.text || '', params, headerType: header?.format || null };
  });
}

export async function listAllTemplates(ch) {
  const WA_WABA_ID = waba(ch);
  if (!WA_WABA_ID) throw new Error('WABA belum diisi');
  const res = await fetch(`${API}/${WA_WABA_ID}/message_templates?limit=100`, { headers: { Authorization: `Bearer ${tok(ch)}` } });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'gagal ambil template');
  return (d.data || []).map((t) => ({
    name: t.name, language: t.language, category: t.category, status: t.status,
    body: t.components?.find((c) => c.type === 'BODY')?.text || '',
  }));
}

// Upload sample media ke Meta (resumable) -> handle buat HEADER template
export async function uploadSampleMedia(ch, buffer, mime) {
  const token = tok(ch), appId = cfg('WA_APP_ID');
  if (!appId) throw new Error('WA_APP_ID belum diisi (Setting) — perlu buat header media');
  const s = await fetch(`${API}/${appId}/uploads?file_length=${buffer.length}&file_type=${encodeURIComponent(mime)}`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const sd = await s.json();
  if (!s.ok) throw new Error(sd?.error?.message || 'gagal buka sesi upload');
  const u = await fetch(`${API}/${sd.id}`, { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_offset: '0' }, body: buffer });
  const ud = await u.json();
  if (!u.ok || !ud.h) throw new Error(ud?.error?.message || 'gagal upload sample');
  return ud.h;
}

export async function createTemplate(ch, { name, category, language, body, examples = [], footer, buttons = [], header }) {
  const WA_WABA_ID = waba(ch);
  if (!WA_WABA_ID) throw new Error('WABA belum diisi');
  const components = [];
  if (header?.type === 'TEXT' && header.text) components.push({ type: 'HEADER', format: 'TEXT', text: header.text });
  else if (header?.handle) components.push({ type: 'HEADER', format: header.type, example: { header_handle: [header.handle] } });
  const bodyComp = { type: 'BODY', text: body };
  if (examples.length) bodyComp.example = { body_text: [examples] };
  components.push(bodyComp);
  if (footer) components.push({ type: 'FOOTER', text: footer });
  const btns = buttons.filter((b) => b.text).map((b) =>
    b.type === 'URL' ? { type: 'URL', text: b.text, url: b.url }
      : b.type === 'PHONE_NUMBER' ? { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number }
        : { type: 'QUICK_REPLY', text: b.text });
  if (btns.length) components.push({ type: 'BUTTONS', buttons: btns });
  const res = await fetch(`${API}/${WA_WABA_ID}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok(ch)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, language, components }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.error_user_msg || d?.error?.message || 'gagal buat template');
  return d;
}

export async function sendTemplate(ch, to, name, language, bodyParams = [], headerImageId) {
  const components = [];
  if (headerImageId) components.push({ type: 'header', parameters: [{ type: 'image', image: { id: headerImageId } }] });
  if (bodyParams.length) components.push({ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) });
  const res = await fetch(`${API}/${phone(ch)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok(ch)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name, language: { code: language }, ...(components.length && { components }) },
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'kirim template gagal');
  return d.messages?.[0]?.id;
}

// Simpan buffer (S3 / lokal via store.js). Return path publik.
export async function saveMediaFile(buffer, filename, contentType) {
  return storeMedia(filename, buffer, contentType);
}

export async function uploadMedia(ch, buffer, mime, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: mime }), filename || 'file');
  const res = await fetch(`${API}/${phone(ch)}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok(ch)}` }, body: form,
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'upload media gagal');
  return d.id;
}

export async function sendMedia(ch, to, type, mediaId, { caption, filename } = {}) {
  const obj = { id: mediaId };
  if (caption && type !== 'audio') obj.caption = caption;
  if (type === 'document' && filename) obj.filename = filename;
  const res = await fetch(`${API}/${phone(ch)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok(ch)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type, [type]: obj }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'kirim media gagal');
  return d.messages?.[0]?.id;
}

// Download media Cloud API: id -> URL sementara -> file. Return path publik `/media/xxx`.
export async function downloadMedia(ch, mediaId, mime) {
  const auth = { Authorization: `Bearer ${tok(ch)}` };
  const meta = await (await fetch(`${API}/${mediaId}`, { headers: auth })).json();
  if (!meta.url) throw new Error('media url tak ada: ' + JSON.stringify(meta));
  const buf = Buffer.from(await (await fetch(meta.url, { headers: auth })).arrayBuffer());
  const ext = EXT[mime || meta.mime_type] || 'bin';
  return storeMedia(`${mediaId}.${ext}`, buf, mime || meta.mime_type);
}

export async function sendText(ch, to, body) {
  const res = await fetch(`${API}/${phone(ch)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok(ch)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `WA send failed (${res.status})`);
  return data.messages?.[0]?.id;
}
