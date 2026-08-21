import { cfg } from './config.js';

const DEFAULT_SYSTEM = 'Kamu customer service yang ramah dan membantu di PalComTech. Jawab dalam Bahasa Indonesia.';
// Aturan gaya WhatsApp — selalu ditambahkan biar jawaban tidak terlihat seperti AI.
const STYLE = ' PENTING soal gaya: balas seperti chat WhatsApp biasa dari manusia. JANGAN pakai markdown atau simbol format apa pun: tanpa #, ##, ###, tanpa **, tanpa garis "---"/"—", tanpa heading, dan JANGAN PERNAH pakai tabel atau tanda "|". Kalau menyebut daftar harga/rincian, tulis dalam kalimat atau baris pendek biasa (contoh: "Pendaftaran Rp 500.000, SPP Rp 7.000.000/semester"). Untuk penekanan boleh sesekali pakai satu bintang seperti *ini*. Tulis ringkas, hangat, dan langsung ke intinya.';

// Rapikan output: buang sisa markdown/tabel kalau model masih pakai. (per-baris = aman)
function toWhatsapp(t) {
  let s = t
    .replace(/\*\*(.+?)\*\*/g, '*$1*') // **tebal** -> *tebal*
    .replace(/__(.+?)__/g, '*$1*')
    .replace(/`{1,3}/g, '');           // backticks
  s = s.split('\n').map((line) => {
    if (/^\s*#{1,6}\s*/.test(line)) return line.replace(/^\s*#{1,6}\s*/, '');   // heading
    if (line.includes('|') && /^[\s|:-]+$/.test(line)) return '';               // pemisah tabel |---|
    if (/^\s*\|.*\|\s*$/.test(line)) return line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim()).filter(Boolean).join(' — '); // baris tabel
    if (/^\s*[-–—]{2,}\s*$/.test(line)) return '';                               // garis pemisah ---
    return line;
  }).join('\n');
  return s.replace(/\n{3,}/g, '\n\n').trim();
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
