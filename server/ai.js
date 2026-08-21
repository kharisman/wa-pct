import { cfg } from './config.js';

const DEFAULT_SYSTEM = 'Kamu adalah customer service yang ramah dan membantu. Jawab singkat, sopan, dalam Bahasa Indonesia.';

// Buat draft balasan dari DeepSeek berdasarkan riwayat percakapan (memori per chat).
export async function aiReply(system, history) {
  const key = cfg('DEEPSEEK_KEY');
  if (!key) throw new Error('DEEPSEEK_KEY belum diisi (Setting → AI)');
  const messages = [{ role: 'system', content: system || DEFAULT_SYSTEM }, ...history];
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.6, max_tokens: 500 }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d?.error?.message || 'AI gagal');
  return d.choices?.[0]?.message?.content?.trim() || '';
}
