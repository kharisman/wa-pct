import { cfg } from './config.js';

const DEFAULT_SYSTEM = 'Kamu customer service yang ramah dan membantu di PalComTech. Jawab dalam Bahasa Indonesia.';
// Aturan gaya WhatsApp — selalu ditambahkan biar jawaban tidak terlihat seperti AI.
const STYLE = ' PENTING soal gaya: balas seperti chat WhatsApp biasa dari manusia. JANGAN pakai markdown atau simbol format apa pun: tanpa #, ##, ###, tanpa **, tanpa garis "---" atau "—" sebagai pemisah, tanpa heading. Hindari daftar bernomor/bullet kecuali benar-benar perlu; kalau perlu cukup pakai baris baris pendek. Untuk penekanan boleh sesekali pakai satu bintang seperti *ini*. Tulis ringkas, hangat, dan langsung ke intinya.';

// Rapikan output: buang sisa markdown kalau model masih pakai.
function toWhatsapp(t) {
  return t
    .replace(/^#{1,6}\s*/gm, '')          // hapus heading ###
    .replace(/\*\*(.+?)\*\*/g, '*$1*')    // **tebal** -> *tebal*
    .replace(/__(.+?)__/g, '*$1*')
    .replace(/`{1,3}/g, '')               // backticks
    .replace(/^\s*[-–—]{1,}\s*$/gm, '')   // baris pemisah "---" / "—"
    .replace(/\n{3,}/g, '\n\n')           // rapikan baris kosong berlebih
    .trim();
}

// Buat draft balasan dari DeepSeek berdasarkan riwayat percakapan (memori per chat).
export async function aiReply(system, history) {
  const key = cfg('DEEPSEEK_KEY');
  if (!key) throw new Error('DEEPSEEK_KEY belum diisi (Setting → AI)');
  const messages = [{ role: 'system', content: (system || DEFAULT_SYSTEM) + STYLE }, ...history];
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.6, max_tokens: 500 }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'AI gagal');
  return toWhatsapp(d.choices?.[0]?.message?.content?.trim() || '');
}
