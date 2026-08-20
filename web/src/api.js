// helper fetch kecil dipakai semua komponen
export const api = (path, opts) => fetch('/api' + path, opts).then((r) => r.json());

export const post = (path, body) =>
  fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const patch = (path, body) =>
  fetch('/api' + path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
