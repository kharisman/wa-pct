import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, post, patch } from '../api.js';

const TYPES = [['text', 'Teks singkat'], ['textarea', 'Paragraf'], ['number', 'Angka'], ['email', 'Email'], ['tel', 'No. HP'], ['date', 'Tanggal'], ['select', 'Pilihan'], ['header', '— Judul bagian —']];
const inputs = (fields) => fields.filter((x) => x.type !== 'header');
// Field bawaan yg terhubung ke data kontak (isian otomatis masuk ke kontak)
const CONTACT_FIELDS = [
  { map: 'name', label: 'Nama lengkap', type: 'text', required: true, tag: 'Nama' },
  { map: 'phone', label: 'No. WhatsApp', type: 'tel', required: true, tag: 'No. WhatsApp' },
  { map: 'label', label: 'Program yang diminati', type: 'select', required: false, options: [], tag: 'Label' },
  { map: 'notes', label: 'Pesan / pertanyaan', type: 'textarea', required: false, tag: 'Catatan' },
];
const MAP_TAG = Object.fromEntries(CONTACT_FIELDS.map((c) => [c.map, c.tag]));
const contactField = (map) => { const { tag, ...x } = CONTACT_FIELDS.find((c) => c.map === map); return { ...x }; };
const blank = () => ({ title: '', description: '', success_message: '', redirect_url: '', fields: [contactField('name'), contactField('phone')] });
let base = ''; // domain share form dari setting; kosong = domain CRM
const link = (slug) => `${base || location.origin}/f/${slug}`;
const fmtTime = (t) => new Date(Number(t)).toLocaleString('id-ID');

function QrModal({ form, onClose }) {
  const [src, setSrc] = useState('');
  useEffect(() => { QRCode.toDataURL(link(form.slug), { width: 600, margin: 2, color: { dark: '#152159' } }).then(setSrc); }, [form.slug]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal fm-qr" onClick={(e) => e.stopPropagation()}>
        <h2>QR Code · {form.title}</h2>
        {src ? <img src={src} alt={'QR ' + form.title} /> : <div className="empty">Membuat QR…</div>}
        <code>{link(form.slug)}</code>
        <div className="modal-actions">
          <button className="link" onClick={onClose}>Tutup</button>
          <a className="fm-btn primary" href={src} download={`QR - ${form.title}.png`}>Download PNG</a>
        </div>
      </div>
    </div>
  );
}

export default function Forms() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState(null); // form yang sedang diedit (tanpa id = baru)
  const [resp, setResp] = useState(null); // { form, rows }
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(null);
  const [err, setErr] = useState('');
  const [pipes, setPipes] = useState([]);
  const [drag, setDrag] = useState(null); // index field yg sedang di-drag (lewat handle ⠿)
  const [over, setOver] = useState(null);
  const [baseEdit, setBaseEdit] = useState(null); // null = tidak sedang edit domain
  const [, rerender] = useState(0);
  const load = () => api('/forms').then(setRows);
  useEffect(() => { load(); api('/pipelines').then(setPipes); api('/form-base').then((d) => { base = d.url; rerender((n) => n + 1); }); }, []);
  const saveBase = async () => {
    const res = await post('/form-base', { url: baseEdit });
    const d = await res.json();
    if (!res.ok) return alert(d.error);
    base = d.url; setBaseEdit(null);
  };

  const setField = (i, v) => setF({ ...f, fields: f.fields.map((x, j) => (j === i ? { ...x, ...v } : x)) });
  const moveTo = (from, to) => { const a = [...f.fields]; a.splice(to, 0, a.splice(from, 1)[0]); setF({ ...f, fields: a }); };

  const save = async (e) => {
    e.preventDefault();
    const res = f.id ? await patch('/forms/' + f.id, f) : await post('/forms', f);
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setF(null); setErr(''); load();
  };
  const del = async (id) => { if (confirm('Hapus form beserta semua jawabannya?')) { await fetch('/api/forms/' + id, { method: 'DELETE' }); load(); } };
  const share = (slug) => navigator.clipboard.writeText(link(slug)).then(() => { setCopied(slug); setTimeout(() => setCopied(null), 1500); });
  const openResp = async (form) => setResp({ form, rows: await api(`/forms/${form.id}/responses`) });
  const csv = () => {
    const { form, rows: rs } = resp;
    const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const lines = [['Waktu', ...inputs(form.fields).map((x) => x.label)].map(esc).join(','),
      ...rs.map((r) => [fmtTime(r.created_at), ...inputs(form.fields).map((x) => r.data[x.key])].map(esc).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
    a.download = `${form.title}.csv`; a.click();
  };

  /* ---------- Jawaban ---------- */
  if (resp) return (
    <div className="page">
      <div className="fm-head">
        <div><button className="fm-back" onClick={() => setResp(null)}>← Semua form</button><h1 className="page-title">{resp.form.title}</h1>
          <p className="muted">{resp.rows.length} jawaban</p></div>
        <button className="fm-btn primary" onClick={csv} disabled={!resp.rows.length}>⬇ Download CSV</button>
      </div>
      <div className="card fm-table">
        {resp.rows.length ? (
          <table>
            <thead><tr><th>Waktu</th>{inputs(resp.form.fields).map((x) => <th key={x.key}>{x.label}</th>)}</tr></thead>
            <tbody>{resp.rows.map((r) => (
              <tr key={r.id}><td className="fm-time">{fmtTime(r.created_at)}</td>{inputs(resp.form.fields).map((x) => <td key={x.key}>{r.data[x.key]}</td>)}</tr>
            ))}</tbody>
          </table>
        ) : <div className="fm-empty">📭<p>Belum ada jawaban. Bagikan link atau QR form-nya dulu.</p></div>}
      </div>
    </div>
  );

  /* ---------- Editor ---------- */
  if (f) return (
    <div className="page">
      <div className="fm-head">
        <div><button className="fm-back" onClick={() => { setF(null); setErr(''); }}>← Semua form</button>
          <h1 className="page-title">{f.id ? 'Edit Form' : 'Form Baru'}</h1></div>
      </div>
      <form onSubmit={save} className="fm-editor">
        <section className="card">
          <h2>Info form</h2>
          <div className="field"><label>Judul</label><input required value={f.title} placeholder="Pendaftaran Mahasiswa Baru" onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label>Deskripsi</label><textarea rows={2} value={f.description || ''} placeholder="Tampil di bawah judul form" onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="field"><label>Masukkan pengisi ke pipeline</label>
            <select value={f.pipeline_id || ''} onChange={(e) => setF({ ...f, pipeline_id: e.target.value })}>
              <option value="">— tidak —</option>{pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <small className="fm-hint">Pakai field kontak <b>No. WhatsApp</b> supaya pengisi otomatis jadi kontak (label "Form: judul", semua jawaban masuk catatan).</small>
          </div>
        </section>

        <section className="card">
          <h2>Field <small className="fm-hint">seret ⠿ untuk mengatur urutan</small></h2>
          <div className="fm-presets">
            <span>Field kontak:</span>
            {CONTACT_FIELDS.map((c) => {
              const has = f.fields.some((x) => x.map === c.map);
              return <button type="button" key={c.map} className="fm-chip" disabled={has} title={has ? 'Sudah dipakai' : 'Tambah field ' + c.tag}
                onClick={() => setF({ ...f, fields: [...f.fields, contactField(c.map)] })}>{has ? '✓' : '+'} {c.tag}</button>;
            })}
          </div>
          <div className="fm-fields">
            {f.fields.map((x, i) => (
              <div key={i} className={'fm-field' + (x.type === 'header' ? ' is-header' : '') + (over === i && drag !== null && drag !== i ? ' drop' : '')}
                draggable={drag === i}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', i); }}
                onDragOver={(e) => { e.preventDefault(); setOver(i); }}
                onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (from !== i) moveTo(from, i); setDrag(null); setOver(null); }}
                onDragEnd={() => { setDrag(null); setOver(null); }}>
                <span className="fm-grip" title="Seret untuk pindah posisi" onMouseDown={() => setDrag(i)} onMouseUp={() => setDrag(null)}>⠿</span>
                <div className="fm-field-body">
                  <div className="fm-field-row">
                    <input required placeholder={x.type === 'header' ? 'Judul bagian, mis. Data Orang Tua' : 'Label, mis. Nama lengkap'} value={x.label} onChange={(e) => setField(i, { label: e.target.value })} />
                    <select value={x.type} disabled={!!x.map} title={x.map ? 'Tipe field kontak tidak bisa diubah' : undefined} onChange={(e) => setField(i, { type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </div>
                  {x.map && <span className="fm-maptag">🔗 Masuk ke kontak: <b>{MAP_TAG[x.map]}</b>{x.map === 'label' && ' (pilihan pengisi jadi label kontak)'}</span>}
                  {x.type === 'select' && <textarea rows={3} placeholder={'Pilihan, satu per baris\nmis. Informatika\nSistem Informasi'} value={(x.options || []).join('\n')} onChange={(e) => setField(i, { options: e.target.value.split('\n') })} />}
                  <div className="fm-field-foot">
                    {x.type !== 'header' ? <label className="fm-check"><input type="checkbox" checked={x.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Wajib diisi</label> : <span />}
                    <span className="fm-field-tools">
                      <button type="button" className="link" title="Naik" disabled={!i} onClick={() => moveTo(i, i - 1)}>↑</button>
                      <button type="button" className="link" title="Turun" disabled={i === f.fields.length - 1} onClick={() => moveTo(i, i + 1)}>↓</button>
                      <button type="button" className="link fm-danger" onClick={() => setF({ ...f, fields: f.fields.filter((_, j) => j !== i) })}>Hapus</button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="fm-add">
            <button type="button" className="fm-btn" onClick={() => setF({ ...f, fields: [...f.fields, { label: '', type: 'text', required: false }] })}>+ Field</button>
            <button type="button" className="fm-btn" onClick={() => setF({ ...f, fields: [...f.fields, { label: '', type: 'header', required: false }] })}>+ Judul bagian</button>
          </div>
        </section>

        <section className="card">
          <h2>Halaman setelah submit</h2>
          <div className="field"><label>Pesan terima kasih</label>
            <textarea rows={3} value={f.success_message || ''} placeholder="Terima kasih, jawaban kamu sudah terkirim. Tim kami akan segera menghubungi via WhatsApp 🙏" onChange={(e) => setF({ ...f, success_message: e.target.value })} /></div>
          <div className="field"><label>Arahkan ke link (opsional)</label>
            <input type="url" value={f.redirect_url || ''} placeholder="https://palcomtech.ac.id" onChange={(e) => setF({ ...f, redirect_url: e.target.value })} />
            <small className="fm-hint">Kalau diisi, pengisi otomatis dibawa ke link ini 3 detik setelah pesan terima kasih tampil.</small></div>
        </section>

        <div className="fm-savebar">
          {err && <span className="err">{err}</span>}
          <button type="button" className="link" onClick={() => { setF(null); setErr(''); }}>Batal</button>
          <button className="fm-btn primary">Simpan form</button>
        </div>
      </form>
    </div>
  );

  /* ---------- Daftar ---------- */
  return (
    <div className="page">
      <div className="fm-head">
        <div><h1 className="page-title">Form</h1>
          <p className="muted">Buat form dengan field sendiri, lalu bagikan link atau QR-nya. Siapa pun bisa mengisi tanpa login.</p></div>
        <button className="fm-btn primary" onClick={() => setF(blank())}>+ Form baru</button>
      </div>
      <div className="fm-domain">
        <span>🌐 Domain link share:</span>
        {baseEdit === null ? (
          <><b>{base || location.origin}</b>{!base && <small>(domain CRM)</small>}
            <button className="link" onClick={() => setBaseEdit(base)}>ubah</button></>
        ) : (
          <><input autoFocus placeholder="https://form.palcomtech.ac.id (kosongkan = domain CRM)" value={baseEdit} onChange={(e) => setBaseEdit(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveBase()} />
            <button className="fm-mini" onClick={saveBase}>Simpan</button><button className="link" onClick={() => setBaseEdit(null)}>batal</button></>
        )}
      </div>
      {!rows.length ? (
        <div className="card fm-empty">📝<p>Belum ada form. Klik <b>+ Form baru</b> untuk mulai.</p></div>
      ) : (
        <div className="fm-grid">
          {rows.map((r) => (
            <div key={r.id} className="fm-card">
              <div className="fm-card-top">
                <h3>{r.title}</h3>
                {r.description && <p>{r.description}</p>}
                <div className="fm-stats">
                  <span><b>{inputs(r.fields).length}</b> field</span>
                  <span><b>{r.responses}</b> jawaban</span>
                </div>
              </div>
              <div className="fm-card-link">
                <code title={link(r.slug)}>{link(r.slug).replace(/^https?:\/\//, '')}</code>
                <button className="fm-mini" onClick={() => share(r.slug)}>{copied === r.slug ? '✓ Tersalin' : 'Salin'}</button>
              </div>
              <div className="fm-card-actions">
                <button className="fm-btn primary" onClick={() => openResp(r)}>Jawaban</button>
                <button className="fm-btn" onClick={() => setQr(r)}>QR</button>
                <a className="fm-btn" href={link(r.slug)} target="_blank" rel="noreferrer">Buka</a>
                <button className="fm-btn" onClick={() => setF(r)}>Edit</button>
                <button className="fm-btn fm-danger" title="Hapus" onClick={() => del(r.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {qr && <QrModal form={qr} onClose={() => setQr(null)} />}
    </div>
  );
}
