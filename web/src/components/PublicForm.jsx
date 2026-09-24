import React, { useEffect, useState } from 'react';

// Halaman publik /f/<slug>: tanpa login, jadi pakai /public (bukan /api yang butuh auth)
export default function PublicForm({ slug }) {
  const [form, setForm] = useState(undefined);
  const [v, setV] = useState({});
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [t0] = useState(Date.now()); // anti-bot: kiriman < 3 detik ditolak server
  useEffect(() => { fetch('/public/forms/' + slug).then((r) => (r.ok ? r.json() : null)).then(setForm); }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    const r = await fetch('/public/forms/' + slug, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, _t: t0 }) });
    if (!r.ok) return setErr((await r.json()).error || 'Gagal mengirim');
    setDone(true);
  };

  if (form === undefined) return <div className="empty">Memuat…</div>;
  if (!form) return <div className="empty">Form tidak ditemukan.</div>;
  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 className="page-title">{form.title}</h1>
      {form.description && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{form.description}</p>}
      {done ? <div className="card"><p>✅ Terima kasih, jawaban kamu sudah terkirim.</p></div> : (
        <form className="card" onSubmit={submit}>
          {/* honeypot: tak terlihat manusia, bot biasanya mengisi */}
          <input name="_hp" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999 }} onChange={(e) => setV({ ...v, _hp: e.target.value })} />
          {form.fields.map((x) => {
            if (x.type === 'header') return <h3 key={x.key} style={{ marginTop: 20 }}>{x.label}</h3>;
            const p = { id: x.key, required: x.required, value: v[x.key] || '', onChange: (e) => setV({ ...v, [x.key]: e.target.value }) };
            return (
              <div key={x.key} className="field">
                <label htmlFor={x.key}>{x.label}{x.required && ' *'}</label>
                {x.type === 'textarea' ? <textarea rows={3} {...p} />
                  : x.type === 'select' ? <select {...p}><option value="">— pilih —</option>{x.options.map((o) => <option key={o}>{o}</option>)}</select>
                    : <input type={x.type} {...p} />}
              </div>
            );
          })}
          <div className="row"><button>Kirim</button>{err && <span className="err">{err}</span>}</div>
        </form>
      )}
    </div>
  );
}
