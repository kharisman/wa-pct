import React, { useEffect, useState } from 'react';
import { api, post } from '../api.js';

const CATS = ['UTILITY', 'MARKETING', 'AUTHENTICATION'];
const badge = { APPROVED: '#1a8a4f', PENDING: '#b5651d', REJECTED: '#b23b3b' };

export default function Templates() {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ name: '', category: 'UTILITY', language: 'id', body: '', footer: '' });
  const [examples, setExamples] = useState([]);
  const [buttons, setButtons] = useState([]);
  const [hType, setHType] = useState('NONE'); // NONE | TEXT | IMAGE
  const [hText, setHText] = useState('');
  const [hFile, setHFile] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api('/templates/all').then((d) => setList(d.error ? [] : d));
  useEffect(() => { load(); }, []);

  // jumlah variabel {{1}}.. di body
  const nVars = (f.body.match(/\{\{\d+\}\}/g) || []).length;
  useEffect(() => { setExamples((e) => Array.from({ length: nVars }, (_, i) => e[i] || '')); }, [nVars]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const payload = { ...f, examples, buttons };
    if (hType === 'TEXT' && hText) payload.header = { type: 'TEXT', text: hText };
    if (hType === 'IMAGE' && hFile) {
      const data = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(hFile); });
      payload.headerMedia = { mime: hFile.type, data };
    }
    const res = await post('/templates', payload);
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg({ err: d.error });
    setMsg({ ok: 'Template dikirim ke Meta — status PENDING, tunggu approval.' });
    setF({ name: '', category: 'UTILITY', language: 'id', body: '', footer: '' });
    setExamples([]); setButtons([]); setHType('NONE'); setHText(''); setHFile(null);
    load();
  };

  return (
    <div className="page">
      <h1 className="page-title">Template Pesan</h1>

      <div className="card">
        <h2>Buat template baru</h2>
        <p className="muted">Dikirim ke Meta untuk approval. Nama huruf kecil & garis bawah (mis. <code>promo_diskon</code>). Pakai <code>{'{{1}}'}</code>, <code>{'{{2}}'}</code> untuk isian dinamis.</p>
        <form onSubmit={submit}>
          <div className="field"><label>Nama</label>
            <input value={f.name} placeholder="promo_diskon" onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></div>
          <div className="grid2">
            <div className="field"><label>Kategori</label>
              <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div className="field"><label>Bahasa</label>
              <input value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} placeholder="id / en_US" /></div>
          </div>
          <div className="field">
            <label>Header (opsional)</label>
            <select value={hType} onChange={(e) => setHType(e.target.value)}>
              <option value="NONE">Tanpa header</option>
              <option value="TEXT">Teks</option>
              <option value="IMAGE">Gambar</option>
            </select>
            {hType === 'TEXT' && <input style={{ marginTop: 6, width: '100%' }} placeholder="Judul header" value={hText} onChange={(e) => setHText(e.target.value)} />}
            {hType === 'IMAGE' && <input style={{ marginTop: 6 }} type="file" accept="image/*" onChange={(e) => setHFile(e.target.files[0])} />}
          </div>

          <div className="field"><label>Isi pesan (Body)</label>
            <textarea value={f.body} rows={4} placeholder="Halo {{1}}, ada promo spesial untukmu!" onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
          {examples.map((ex, i) => (
            <div className="field" key={i}><label>Contoh isi {`{{${i + 1}}}`}</label>
              <input value={ex} placeholder={`contoh untuk {{${i + 1}}}`} onChange={(e) => setExamples(examples.map((x, j) => (j === i ? e.target.value : x)))} /></div>
          ))}
          <div className="field"><label>Footer (opsional)</label>
            <input value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} placeholder="PalComTech" /></div>

          <div className="field">
            <label>Tombol (opsional, maks 3)</label>
            {buttons.map((b, i) => (
              <div key={i} className="btnrow">
                <select value={b.type} onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}>
                  <option value="QUICK_REPLY">Balas cepat</option>
                  <option value="URL">Link</option>
                  <option value="PHONE_NUMBER">Telepon</option>
                </select>
                <input placeholder="Teks tombol" value={b.text} onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                {b.type === 'URL' && <input placeholder="https://…" value={b.url || ''} onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />}
                {b.type === 'PHONE_NUMBER' && <input placeholder="+62…" value={b.phone_number || ''} onChange={(e) => setButtons(buttons.map((x, j) => j === i ? { ...x, phone_number: e.target.value } : x))} />}
                <button type="button" className="link" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {buttons.length < 3 && <button type="button" className="link" onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}>+ tambah tombol</button>}
          </div>
          <div className="row">
            <button disabled={busy || !f.name || !f.body}>{busy ? 'Mengirim…' : 'Buat template'}</button>
            {msg?.ok && <span className="saved">✓ {msg.ok}</span>}
            {msg?.err && <span className="err">{msg.err}</span>}
          </div>
        </form>
      </div>

      <div className="card nopad">
        <table className="tbl">
          <thead><tr><th>Nama</th><th>Bahasa</th><th>Kategori</th><th>Status</th><th>Isi</th></tr></thead>
          <tbody>
            {(list || []).map((t) => (
              <tr key={t.name + t.language}>
                <td className="mono">{t.name}</td>
                <td>{t.language}</td>
                <td>{t.category}</td>
                <td><span className="tstat" style={{ background: (badge[t.status] || '#888') + '22', color: badge[t.status] || '#888' }}>{t.status}</span></td>
                <td className="tbody">{t.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list === null && <p className="muted" style={{ padding: 16 }}>Memuat…</p>}
        {list?.length === 0 && <p className="muted" style={{ padding: 16 }}>Belum ada template.</p>}
      </div>
    </div>
  );
}
