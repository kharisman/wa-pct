import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://graph.facebook.com/v20.0';
const MEDIA_DIR = fileURLToPath(new URL('../media/', import.meta.url));

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };

// Upload buffer ke WA -> return media id. Lalu kirim sebagai pesan.
// List approved templates dari WABA.
export async function listTemplates() {
  const { WA_TOKEN, WA_WABA_ID } = process.env;
  if (!WA_WABA_ID) throw new Error('WA_WABA_ID belum diisi');
  const res = await fetch(`${API}/${WA_WABA_ID}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'gagal ambil template');
  // sederhanakan: nama, bahasa, jumlah param di body
  return (d.data || []).filter((t) => t.status === 'APPROVED').map((t) => {
    const body = t.components?.find((c) => c.type === 'BODY');
    const params = (body?.text?.match(/\{\{\d+\}\}/g) || []).length;
    return { name: t.name, language: t.language, text: body?.text || '', params };
  });
}

export async function sendTemplate(to, name, language, bodyParams = []) {
  const { WA_TOKEN, WA_PHONE_ID } = process.env;
  const components = bodyParams.length
    ? [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }]
    : undefined;
  const res = await fetch(`${API}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name, language: { code: language }, ...(components && { components }) },
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'kirim template gagal');
  return d.messages?.[0]?.id;
}

// Simpan buffer ke folder media lokal (biar tampil di thread). Return path publik.
export async function saveMediaFile(buffer, filename) {
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(MEDIA_DIR + filename, buffer);
  return '/media/' + filename;
}

export async function uploadMedia(buffer, mime, filename) {
  const { WA_TOKEN, WA_PHONE_ID } = process.env;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buffer], { type: mime }), filename || 'file');
  const res = await fetch(`${API}/${WA_PHONE_ID}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}` }, body: form,
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'upload media gagal');
  return d.id;
}

export async function sendMedia(to, type, mediaId, { caption, filename } = {}) {
  const { WA_TOKEN, WA_PHONE_ID } = process.env;
  const obj = { id: mediaId };
  if (caption && type !== 'audio') obj.caption = caption;
  if (type === 'document' && filename) obj.filename = filename;
  const res = await fetch(`${API}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type, [type]: obj }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'kirim media gagal');
  return d.messages?.[0]?.id;
}

// Download media Cloud API: id -> URL sementara -> file. Return path publik `/media/xxx`.
export async function downloadMedia(mediaId, mime) {
  const { WA_TOKEN } = process.env;
  const auth = { Authorization: `Bearer ${WA_TOKEN}` };
  const meta = await (await fetch(`${API}/${mediaId}`, { headers: auth })).json();
  if (!meta.url) throw new Error('media url tak ada: ' + JSON.stringify(meta));
  const buf = Buffer.from(await (await fetch(meta.url, { headers: auth })).arrayBuffer());
  const ext = EXT[mime || meta.mime_type] || 'bin';
  const file = `${mediaId}.${ext}`;
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(MEDIA_DIR + file, buf);
  return '/media/' + file;
}

export async function sendText(to, body) {
  const { WA_TOKEN, WA_PHONE_ID } = process.env;
  const res = await fetch(`${API}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `WA send failed (${res.status})`);
  return data.messages?.[0]?.id; // wa_msg_id
}
