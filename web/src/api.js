// ===== Indikator loading global: hitung request /api yang sedang jalan =====
let active = 0;
const subs = new Set();
export const onLoading = (fn) => { subs.add(fn); fn(active > 0); return () => subs.delete(fn); };
if (typeof window !== 'undefined' && !window.__fetchWrapped) {
  window.__fetchWrapped = true;
  const orig = window.fetch.bind(window);
  window.fetch = (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const track = url.includes('/api/') && !url.includes('/api/stream');
    if (track) { active++; subs.forEach((f) => f(true)); }
    return orig(...args).finally(() => { if (track) { active--; if (active <= 0) subs.forEach((f) => f(false)); } });
  };
}

// helper fetch kecil dipakai semua komponen
export const api = (path, opts) => fetch('/api' + path, opts).then((r) => r.json());

export const post = (path, body) =>
  fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const patch = (path, body) =>
  fetch('/api' + path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
