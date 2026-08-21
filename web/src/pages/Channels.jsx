import React, { useEffect, useState } from 'react';
import { api, post } from '../api.js';

export default function Channels() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ label: '', phone_id: '', waba_id: '', token: '' });
  const [err, setErr] = useState('');
  const load = () => api('/channels').then(setRows);
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    const res = await post('/channels', f);
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setF({ label: '', phone_id: '', waba_id: '', token: '' }); setErr(''); load();
  };
  const del = async (id) => {
    if (!confirm('Hapus nomor ini? Chat lamanya tetap ada tapi tak bisa balas via nomor ini.')) return;
    await fetch('/api/channels/' + id, { method: 'DELETE' }); load();
  };
  const toggleAi = async (c) => { await post('/channels/' + c.id + '/ai', { on: !c.ai_enabled }); load(); };

  return (
    <div className="page">
      <h1 className="page-title">Nomor WhatsApp <small>({rows.length})</small></h1>
      <div className="card nopad">
        <table className="tbl">
          <thead><tr><th>Label</th><th>Phone ID</th><th>Token</th><th>AI otomatis</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><b>{c.label}</b></td>
                <td className="mono">{c.phone_id}</td>
                <td>{c.hasToken ? '✓ sendiri' : 'global'}</td>
                <td>
                  <label className="ai-toggle">
                    <input type="checkbox" checked={c.ai_enabled} onChange={() => toggleAi(c)} />
                    <span>{c.ai_enabled ? '🤖 ON' : 'OFF'}</span>
                  </label>
                </td>
                <td><button className="link" onClick={() => del(c.id)}>hapus</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted" style={{ padding: 16 }}>Belum ada nomor.</p>}
      </div>

      <div className="card">
        <h2>Tambah nomor</h2>
        <p className="muted">Nomor harus sudah terdaftar di WhatsApp Manager & app ter-subscribe ke WABA-nya. Token dikosongkan = pakai token global (Setting).</p>
        <form onSubmit={add}>
          <div className="field"><label>Label</label><input value={f.label} placeholder="CS Sales" onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
          <div className="field"><label>Phone Number ID</label><input value={f.phone_id} onChange={(e) => setF({ ...f, phone_id: e.target.value })} /></div>
          <div className="field"><label>WhatsApp Business Account ID</label><input value={f.waba_id} onChange={(e) => setF({ ...f, waba_id: e.target.value })} /></div>
          <div className="field"><label>Access Token (opsional)</label><input value={f.token} placeholder="kosong = token global" onChange={(e) => setF({ ...f, token: e.target.value })} /></div>
          <div className="row"><button>Tambah nomor</button>{err && <span className="err">{err}</span>}</div>
        </form>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>💡 Webhook Meta cukup satu (URL sama) — semua nomor masuk ke sini. Pastikan tiap WABA ter-subscribe ke app.</p>
      <p className="muted" style={{ fontSize: 13 }}>🤖 <b>AI otomatis ON</b> = chat masuk ke nomor itu dibalas AI otomatis (pakai peran AI di Setting). OFF = manual (agen tetap bisa pakai tombol 🤖 buat draft).</p>
    </div>
  );
}
