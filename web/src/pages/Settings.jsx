import React, { useEffect, useState } from 'react';
import { api, patch, post } from '../api.js';

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  const [ar, setAr] = useState({ on: false, text: '' });
  const [arSaved, setArSaved] = useState(false);
  const [ai, setAi] = useState({ system: '', funnel: '', knowledge: '' });
  const [aiSaved, setAiSaved] = useState(false);
  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then(setCfg);
    api('/auto-reply').then(setAr);
    api('/ai-config').then((d) => setAi({ system: d.system || '', funnel: d.funnel || '', knowledge: d.knowledge || '' }));
  }, []);
  const saveAr = async (e) => { e.preventDefault(); await post('/auto-reply', ar); setArSaved(true); setTimeout(() => setArSaved(false), 1500); };
  const saveAi = async (e) => { e.preventDefault(); await post('/ai-config', ai); setAiSaved(true); setTimeout(() => setAiSaved(false), 1500); };
  const setFunnel = (f) => setAi((a) => ({ ...a, funnel: f }));
  const setKnow = (k) => setAi((a) => ({ ...a, knowledge: k }));
  const moveFunnel = (i, dir) => { const j = i + dir; if (j < 0 || j >= ai.funnel.length) return; const a = [...ai.funnel];[a[i], a[j]] = [a[j], a[i]]; setFunnel(a); };

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
            {F('WA_APP_SECRET', 'App Secret (keamanan webhook)', 'dari Meta App > Settings > Basic. Diisi = webhook diverifikasi tanda tangan.')}
            {F('WA_VERIFY_TOKEN', 'Verify Token (webhook)')}
            <div className="row">
              <button disabled={Object.keys(form).length === 0}>Simpan</button>
              {saved && <span className="saved">✓ tersimpan</span>}
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Balas dengan AI (DeepSeek)</h2>
        <p className="muted">Isi API key & atur peran/aturan AI. Agen klik 🤖 di kotak balas untuk minta draft — AI membaca riwayat percakapan (memori per chat).</p>
        {cfg && (
          <form onSubmit={save} style={{ marginBottom: 8 }}>
            {F('DEEPSEEK_KEY', 'DeepSeek API Key')}
            <div className="row"><button disabled={!form.DEEPSEEK_KEY}>Simpan key</button></div>
          </form>
        )}
        <form onSubmit={saveAi}>
          <div className="field"><label>Peran & gaya AI</label>
            <textarea rows={3} value={ai.system} placeholder="Kamu CS PalComTech yang ramah & sopan. Bahasa Indonesia santai." onChange={(e) => setAi({ ...ai, system: e.target.value })} /></div>

          <label style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>Funnel bertahap — kartu langkah (AI ikuti berurutan)</label>
          <div className="flow">
            {(ai.funnel || []).map((step, i) => (
              <div key={i}>
                <div className="fcard">
                  <span className="fnum">{i + 1}</span>
                  <textarea rows={2} value={step} placeholder={'Yang AI lakukan di langkah ini… (mis. tanya program studi)'}
                    onChange={(e) => setFunnel(ai.funnel.map((s, j) => (j === i ? e.target.value : s)))} />
                  <div className="fbtns">
                    <button type="button" onClick={() => moveFunnel(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" onClick={() => moveFunnel(i, 1)} disabled={i === ai.funnel.length - 1}>↓</button>
                    <button type="button" className="del" onClick={() => setFunnel(ai.funnel.filter((_, j) => j !== i))}>×</button>
                  </div>
                </div>
                {i < ai.funnel.length - 1 && <div className="fconn">↓</div>}
              </div>
            ))}
            <button type="button" className="add-card" onClick={() => setFunnel([...(ai.funnel || []), ''])}>＋ tambah langkah</button>
          </div>

          <label style={{ fontSize: 12, color: '#666', fontWeight: 600, marginTop: 18, display: 'block' }}>Knowledge — kartu fakta (AI hanya pakai ini)</label>
          <div className="kb-grid">
            {(ai.knowledge || []).map((k, i) => (
              <div key={i} className="kbcard">
                <input value={k.title} placeholder="Judul (mis. Biaya)" onChange={(e) => setKnow(ai.knowledge.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <textarea rows={3} value={k.body} placeholder="Fakta / data asli…" onChange={(e) => setKnow(ai.knowledge.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
                <button type="button" className="kb-del" onClick={() => setKnow(ai.knowledge.filter((_, j) => j !== i))}>× hapus</button>
              </div>
            ))}
            <button type="button" className="add-card" onClick={() => setKnow([...(ai.knowledge || []), { title: '', body: '' }])}>＋ tambah kartu fakta</button>
          </div>

          <div className="row" style={{ marginTop: 16 }}><button>Simpan pengaturan AI</button>{aiSaved && <span className="saved">✓ tersimpan</span>}</div>
        </form>
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
