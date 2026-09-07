import { cfg } from './config.js';

export async function sendTelegram(text) {
  const token = cfg('TELEGRAM_BOT_TOKEN');
  const chatId = cfg('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) console.error('telegram gagal', res.status, await res.text());
  } catch (e) { console.error('telegram gagal', e.message); }
}
