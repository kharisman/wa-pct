import React, { useEffect, useState } from 'react';

// Halaman publik /f/<slug>: tanpa login, jadi pakai /public (bukan /api yang butuh auth)
export default function PublicForm({ slug }) {
  const [form, setForm] = useState(undefined);
  const [v, setV] = useState({});
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false); // false | { score?, max? }
  const [t0] = useState(Date.now()); // anti-bot: kiriman < 3 detik ditolak server
  useEffect(() => { fetch('/public/forms/' + slug).then((r) => (r.ok ? r.json() : null)).then(setForm); }, [slug]);
  useEffect(() => { if (form?.title) document.title = form.title; }, [form]);
  useEffect(() => {
    if (!done || !form.redirect_url) return;
    const t = setTimeout(() => { location.href = form.redirect_url; }, 3000);
    return () => clearTimeout(t);
  }, [done, form]);

  const submit = async (e) => {
    e.preventDefault();
    const miss = form.fields.find((x) => x.type === 'rating' && x.required && !v[x.key]); // rating = tombol, tak bisa pakai required bawaan
    if (miss) return setErr(`${miss.label} wajib diisi`);
    setSending(true); setErr('');
    const r = await fetch('/public/forms/' + slug, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, _t: t0 }) }).catch(() => null);
    setSending(false);
    if (!r?.ok) return setErr((await r?.json().catch(() => null))?.error || 'Gagal mengirim, coba lagi');
    setDone(await r.json()); scrollTo(0, 0);
  };

  if (form === undefined) return <div className="pf"><div className="pf-card pf-msg">Memuat…</div></div>;
  if (!form) return <div className="pf"><div className="pf-card pf-msg">😕<h2>Form tidak ditemukan</h2><p>Link mungkin salah atau form sudah dihapus.</p></div></div>;
  return (
    <div className="pf">
      <div className="pf-card">
        <div className="pf-top">
          <h1>{form.title}</h1>
          {form.description && <p>{form.description}</p>}
        </div>
        {done ? (
          <div className="pf-done">
            <div className="pf-check">✓</div>
            {done.max > 0 && <div className="pf-score"><small>Skor kamu</small><b>{done.score}</b><span>dari {done.max}</span></div>}
            <p>{form.success_message || 'Terima kasih, jawaban kamu sudah terkirim.'}</p>
            {form.redirect_url && <small>Mengalihkan… <a href={form.redirect_url}>klik di sini</a> kalau tidak otomatis.</small>}
          </div>
        ) : (
          <form className="pf-body" onSubmit={submit}>
            {/* honeypot: tak terlihat manusia, bot biasanya mengisi */}
            <input name="_hp" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999 }} onChange={(e) => setV({ ...v, _hp: e.target.value })} />
            {form.fields.map((x) => {
              if (x.type === 'header') return <h2 key={x.key} className="pf-section">{x.label}</h2>;
              const p = { id: x.key, required: x.required, value: v[x.key] || '', onChange: (e) => setV({ ...v, [x.key]: e.target.value }) };
              return (
                <div key={x.key} className="pf-field">
                  <label htmlFor={x.key}>{x.label}{x.required && <span className="pf-req"> *</span>}</label>
                  {x.type === 'radio' ? (
                    <div className="pf-radios">{x.options.map((o) => (
                      <label key={o} className={'pf-radio' + (v[x.key] === o ? ' on' : '')}>
                        <input type="radio" name={x.key} value={o} required={x.required} checked={v[x.key] === o} onChange={() => setV({ ...v, [x.key]: o })} />{o}
                      </label>))}</div>
                  ) : x.type === 'rating' ? (
                    <div className="pf-stars" role="radiogroup" aria-label={x.label}>{[1, 2, 3, 4, 5].map((n) => (
                      <button type="button" key={n} role="radio" aria-checked={v[x.key] === String(n)} aria-label={`${n} bintang`}
                        className={Number(v[x.key]) >= n ? 'on' : ''} onClick={() => setV({ ...v, [x.key]: String(n) })}>★</button>))}</div>
                  ) : x.type === 'textarea' ? <textarea rows={4} {...p} />
                    : x.type === 'select' ? <select {...p}><option value="">— pilih —</option>{x.options.map((o) => <option key={o}>{o}</option>)}</select>
                      : <input type={x.type} inputMode={x.type === 'tel' ? 'tel' : undefined} placeholder={x.type === 'tel' ? '08xxxxxxxxxx' : undefined} {...p} />}
                </div>
              );
            })}
            {err && <div className="pf-err">{err}</div>}
            <button className="pf-submit" disabled={sending}>{sending ? 'Mengirim…' : 'Kirim'}</button>
          </form>
        )}
      </div>
      <div className="pf-foot">PalComTech</div>
    </div>
  );
}
