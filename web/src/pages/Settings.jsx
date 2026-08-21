import React, { useEffect, useState } from 'react';
import { api, patch, post } from '../api.js';

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  const [ar, setAr] = useState({ on: false, text: '' });
  const [arSaved, setArSaved] = useState(false);
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setCfg);
    api('/auto-reply').then(setAr);
  }, []);
  const saveAr = async (e) => { e.preventDefault(); await post('/auto-reply', ar); setArSaved(true); setTimeout(() => setArSaved(false), 1500); };

  const save = async (e) => {
    e.preventDefault();
    const res = await patch('/settings', form);
    setCfg(await res.json()); setForm({}); setSaved(true); setTimeout(() => setSaved(false), 1500);
  };

  const F = (k, label, hint) => (
    <div className="field">
      <label>{label}</label>
      <input placeholder={cfg?.[k] || ''} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      {hint && <small>{hint}</small>}
    </div>
  );

  return (
    <div className="page">
      <h1 className="page-title">Setting — Koneksi WhatsApp</h1>
      <div className="card">
        <p className="muted">Ubah kredensial di sini — tersimpan di database, tak perlu edit file server. Kosongkan field = tidak diubah.</p>
        {cfg === null ? <p>Memuat…</p> : (
          <form onSubmit={save}>
            {F('WA_TOKEN', 'Access Token', `sekarang: ${cfg.WA_TOKEN || '(kosong)'}`)}
            {F('WA_PHONE_ID', 'Phone Number ID')}
            {F('WA_WABA_ID', 'WhatsApp Business Account ID')}
            {F('WA_APP_ID', 'App ID (buat header media template)')}
            {F('WA_VERIFY_TOKEN', 'Verify Token (webhook)')}
            <div className="row">
              <button disabled={Object.keys(form).length === 0}>Simpan</button>
              {saved && <span className="saved">✓ tersimpan</span>}
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Balasan otomatis (greeting)</h2>
        <p className="muted">Dikirim otomatis saat pelanggan chat pertama kali.</p>
        <form onSubmit={saveAr}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={ar.on} onChange={(e) => setAr({ ...ar, on: e.target.checked })} /> <b>Aktifkan</b>
          </label>
          <div className="field"><label>Pesan</label>
            <textarea rows={3} value={ar.text} placeholder="Halo! Terima kasih sudah menghubungi PalComTech. Admin akan segera membalas 🙏" onChange={(e) => setAr({ ...ar, text: e.target.value })} /></div>
          <div className="row"><button>Simpan</button>{arSaved && <span className="saved">✓ tersimpan</span>}</div>
        </form>
      </div>
    </div>
  );
}
