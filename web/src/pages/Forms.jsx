import React, { useEffect, useState } from 'react';
import { api, post, patch } from '../api.js';

const TYPES = [['text', 'Teks singkat'], ['textarea', 'Paragraf'], ['number', 'Angka'], ['email', 'Email'], ['tel', 'No. HP'], ['date', 'Tanggal'], ['select', 'Pilihan'], ['header', '— Judul bagian —']];
const inputs = (fields) => fields.filter((x) => x.type !== 'header');
const blank = () => ({ title: '', description: '', fields: [{ label: '', type: 'text', required: false }] });
const link = (slug) => `${location.origin}/f/${slug}`;

export default function Forms() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null); // form yang sedang diedit (tanpa id = baru)
  const [resp, setResp] = useState(null); // { form, rows }
  const [err, setErr] = useState('');
  const [pipes, setPipes] = useState([]);
  const load = () => api('/forms').then(setRows);
  useEffect(() => { load(); api('/pipelines').then(setPipes); }, []);

  const setField = (i, v) => setF({ ...f, fields: f.fields.map((x, j) => (j === i ? { ...x, ...v } : x)) });
  const moveTo = (from, to) => { const a = [...f.fields]; a.splice(to, 0, a.splice(from, 1)[0]); setF({ ...f, fields: a }); };
  const move = (i, d) => moveTo(i, i + d);
  const [drag, setDrag] = useState(null); // index field yg sedang di-drag (drag lewat handle ⠿)

  const save = async (e) => {
    e.preventDefault();
    const res = f.id ? await patch('/forms/' + f.id, f) : await post('/forms', f);
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setF(null); setErr(''); load();
  };
  const del = async (id) => { if (confirm('Hapus form beserta semua jawabannya?')) { await fetch('/api/forms/' + id, { method: 'DELETE' }); load(); } };
  const share = (slug) => navigator.clipboard.writeText(link(slug)).then(() => alert('Link disalin:\n' + link(slug)));
  const openResp = async (form) => setResp({ form, rows: await api(`/forms/${form.id}/responses`) });
  const csv = () => {
    const { form, rows: rs } = resp;
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = [['Waktu', ...inputs(form.fields).map((x) => x.label)].map(esc).join(','),
      ...rs.map((r) => [new Date(Number(r.created_at)).toLocaleString('id-ID'), ...inputs(form.fields).map((x) => r.data[x.key])].map(esc).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
    a.download = `${form.title}.csv`; a.click();
  };

  if (resp) return (
    <div className="page">
      <h1 className="page-title">Jawaban: {resp.form.title}</h1>
      <div className="row"><button className="link" onClick={() => setResp(null)}>← kembali</button><button onClick={csv} disabled={!resp.rows.length}>Download CSV</button></div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Waktu</th>{inputs(resp.form.fields).map((x) => <th key={x.key}>{x.label}</th>)}</tr></thead>
          <tbody>{resp.rows.map((r) => (
            <tr key={r.id}><td>{new Date(Number(r.created_at)).toLocaleString('id-ID')}</td>{inputs(resp.form.fields).map((x) => <td key={x.key}>{r.data[x.key]}</td>)}</tr>
          ))}</tbody>
        </table>
        {!resp.rows.length && <p className="muted">Belum ada jawaban.</p>}
      </div>
    </div>
  );

  if (f) return (
    <div className="page">
      <h1 className="page-title">{f.id ? 'Edit Form' : 'Form Baru'}</h1>
      <form className="card" onSubmit={save}>
        <div className="field"><label>Judul</label><input required value={f.title} placeholder="Pendaftaran Mahasiswa Baru" onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="field"><label>Deskripsi</label><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="field"><label>Masukkan pengisi ke pipeline</label>
          <select value={f.pipeline_id || ''} onChange={(e) => setF({ ...f, pipeline_id: e.target.value })}>
            <option value="">— tidak —</option>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <small className="muted">Kalau form punya field bertipe <b>No. HP</b>, pengisi otomatis jadi kontak (label "Form: judul", jawaban masuk catatan). Field berlabel "Nama" dipakai sebagai nama kontak.</small>
        </div>
        <h3>Field</h3>
        {f.fields.map((x, i) => (
          <div key={i} className="card" draggable={drag === i}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (from !== i) moveTo(from, i); setDrag(null); }}
            onDragEnd={() => setDrag(null)}
            style={x.type === 'header' ? { background: 'var(--bg2, #f3f4f8)' } : undefined}>
            <div className="row">
              <span title="Geser untuk pindah posisi" style={{ cursor: 'grab', userSelect: 'none', fontSize: 18 }}
                onMouseDown={() => setDrag(i)} onMouseUp={() => setDrag(null)}>⠿</span>
              <input required placeholder={x.type === 'header' ? 'Judul bagian, mis. Data Orang Tua' : 'Label, mis. Nama lengkap'} value={x.label} onChange={(e) => setField(i, { label: e.target.value })} />
              <select value={x.type} onChange={(e) => setField(i, { type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {x.type !== 'header' && <label><input type="checkbox" checked={x.required} onChange={(e) => setField(i, { required: e.target.checked })} /> wajib</label>}
              <button type="button" className="link" disabled={!i} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="link" disabled={i === f.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="link" onClick={() => setF({ ...f, fields: f.fields.filter((_, j) => j !== i) })}>hapus</button>
            </div>
            {x.type === 'select' && <div className="field"><label>Pilihan (satu per baris)</label>
              <textarea rows={3} value={(x.options || []).join('\n')} onChange={(e) => setField(i, { options: e.target.value.split('\n') })} /></div>}
          </div>
        ))}
        <div className="row"><button type="button" className="link" onClick={() => setF({ ...f, fields: [...f.fields, { label: '', type: 'text', required: false }] })}>+ tambah field</button></div>
        <div className="row"><button>Simpan</button><button type="button" className="link" onClick={() => { setF(null); setErr(''); }}>batal</button>{err && <span className="err">{err}</span>}</div>
      </form>
    </div>
  );

  return (
    <div className="page">
      <h1 className="page-title">Form</h1>
      <p className="muted">Buat form dengan field sendiri, lalu bagikan link-nya. Siapa pun yang punya link bisa mengisi tanpa login.</p>
      <div className="card">
        <div className="userlist">
          {rows.map((r) => (
            <div key={r.id} className="userrow">
              <span><b>{r.title}</b> <small>{inputs(r.fields).length} field · {r.responses} jawaban</small></span>
              <span>
                <button className="link" onClick={() => share(r.slug)}>salin link</button>{' '}
                <a className="link" href={link(r.slug)} target="_blank" rel="noreferrer">buka</a>{' '}
                <button className="link" onClick={() => openResp(r)}>jawaban</button>{' '}
                <button className="link" onClick={() => setF(r)}>edit</button>{' '}
                <button className="link" onClick={() => del(r.id)}>hapus</button>
              </span>
            </div>
          ))}
          {!rows.length && <p className="muted">Belum ada form.</p>}
        </div>
        <button onClick={() => setF(blank())}>+ Form baru</button>
      </div>
    </div>
  );
}
