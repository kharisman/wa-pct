import React, { useEffect, useState } from 'react';
import { api, post } from '../api.js';

export default function QuickReplies() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ title: '', body: '' });
  const [err, setErr] = useState('');
  const load = () => api('/quick-replies').then(setRows);
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    const res = await post('/quick-replies', f);
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setF({ title: '', body: '' }); setErr(''); load();
  };
  const del = async (id) => { if (confirm('Hapus?')) { await fetch('/api/quick-replies/' + id, { method: 'DELETE' }); load(); } };

  return (
    <div className="page">
      <h1 className="page-title">Balasan Cepat</h1>
      <p className="muted">Jawaban singkat yang sering dipakai — agen tinggal klik ⚡ di kotak balas untuk menyisipkannya.</p>
      <div className="card">
        <div className="userlist">
          {rows.map((r) => (
            <div key={r.id} className="userrow">
              <span><b>{r.title}</b> <small>{r.body}</small></span>
              <button className="link" onClick={() => del(r.id)}>hapus</button>
            </div>
          ))}
          {rows.length === 0 && <p className="muted">Belum ada.</p>}
        </div>
        <form onSubmit={add}>
          <div className="field"><label>Judul</label><input value={f.title} placeholder="Salam pembuka" onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="field"><label>Isi</label><textarea rows={2} value={f.body} placeholder="Halo, terima kasih sudah menghubungi PalComTech 🙏" onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
          <div className="row"><button>Tambah</button>{err && <span className="err">{err}</span>}</div>
        </form>
      </div>
    </div>
  );
}
