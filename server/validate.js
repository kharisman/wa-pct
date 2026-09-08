// Validasi input ringan buat endpoint API. Balikin pesan error (string) atau null.
// Dipakai: const err = validate(req.body, { email: [required, email], ... }); if (err) return res.status(400).json({ error: err });

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

export const required = (label) => (v) => (isBlank(v) ? `${label} wajib diisi` : null);
export const email = (label = 'Email') => (v) =>
  isBlank(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? null : `${label} tidak valid`;
export const minLen = (n, label) => (v) => (!isBlank(v) && String(v).length < n ? `${label} minimal ${n} karakter` : null);
export const digits = (label) => (v) => (isBlank(v) || /^\d+$/.test(String(v).trim()) ? null : `${label} harus berupa angka`);

export function validate(body, rules) {
  for (const [field, checks] of Object.entries(rules)) {
    for (const check of checks) {
      const msg = check(body?.[field]);
      if (msg) return msg;
    }
  }
  return null;
}

// demo: node server/validate.js
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bad = validate({ email: 'x', password: '123' }, { email: [required('Email'), email()], password: [required('Password'), minLen(6, 'Password')] });
  const ok = validate({ email: 'a@b.com', password: '123456' }, { email: [required('Email'), email()], password: [required('Password'), minLen(6, 'Password')] });
  console.assert(bad === 'Email tidak valid', 'harusnya tolak email jelek:', bad);
  console.assert(ok === null, 'harusnya lolos:', ok);
  console.assert(validate({}, { wa_id: [required('wa_id')] }) === 'wa_id wajib diisi', 'harusnya wajib');
  console.log('validate.js OK');
}
