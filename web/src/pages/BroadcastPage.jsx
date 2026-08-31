import React, { useEffect, useMemo, useState } from 'react';
import { api, post } from '../api.js';

export default function BroadcastPage() {
  const [contacts, setContacts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [chId, setChId] = useState(''); // '' = semua nomor
  const [fLabel, setFLabel] = useState('');
  const [fStage, setFStage] = useState('');
  const [excluded, setExcluded] = useState(new Set());

  const [tpls, setTpls] = useState(null);
  const [sel, setSel] = useState(null);
  const [sources, setSources] = useState([]);
  const [btnSrc, setBtnSrc] = useState({ type: 'text', value: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api('/conversations').then(setContacts);
    api('/channels').then(setChannels);
  }, []);
  useEffect(() => {
    setSel(null); setSources([]);
    fetch('/api/templates' + (chId ? '?channel_id=' + chId : '')).then((r) => r.json()).then((d) => setTpls(d.error ? [] : d));
  }, [chId]);

  const labels = useMemo(() => [...new Set(contacts.flatMap((c) => JSON.parse(c.labels || '[]')))].sort(), [contacts]);
  const stages = useMemo(() => [...new Set(contacts.map((c) => c.stage).filter(Boolean))].sort(), [contacts]);

  const targets = contacts.filter((c) =>
    (!chId || String(c.channel_id) === String(chId))
    && (!fLabel || JSON.parse(c.labels || '[]').includes(fLabel))
    && (!fStage || c.stage === fStage));
  const finalTargets = targets.filter((c) => !excluded.has(c.wa_id));

  const pick = (t) => { setSel(t); setSources(Array.from({ length: t.params }, () => ({ type: 'text', value: '' }))); };
  const sample = finalTargets[0];
  const sampleVal = (s) => s.type === 'name' ? (sample?.name || 'Budi') : s.type === 'phone' ? (sample?.wa_id || '628xxx') : (s.value || '');
  const preview = sel ? sources.reduce((str, s, i) => str.replaceAll(`{{${i + 1}}}`, sampleVal(s) || `{{${i + 1}}}`), sel.text) : '';

  const send = async () => {
    setBusy(true);
    const body = { name: sel.name, language: sel.language, sources, text: sel.text, wa_ids: finalTargets.map((c) => c.wa_id) };
    if (sel.btnUrlIndex != null) { body.buttonIndex = sel.btnUrlIndex; body.buttonSource = btnSrc; }
    const res = await post('/broadcast', body);
    setResult(await res.json()); setBusy(false);
  };

  if (result) {
    return (
      <div className="page">
        <h1 className="page-title">Broadcast</h1>
        <div className="card">
          <h2>Selesai</h2>
          <p>✅ Terkirim: <b>{result.sent}</b> &nbsp; ❌ Gagal: <b>{result.failed?.length || 0}</b></p>
          {result.failed?.length > 0 && <div className="muted" style={{ fontSize: 12, maxHeight: 160, overflow: 'auto' }}>{result.failed.map((f) => <div key={f.wa_id}>{f.wa_id}: {f.error}</div>)}</div>}
          <div className="row"><button onClick={() => { setResult(null); setExcluded(new Set()); }}>Broadcast lagi</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page bc-page">
      <h1 className="page-title">Broadcast</h1>
      <div className="bc-grid">
        {/* Kiri: penerima */}
        <div className="card">
          <h2>1. Penerima <span className="bc-count">{finalTargets.length}</span></h2>
          <div className="bc-filters">
            {channels.length > 1 && (
              <label className="field"><span>Nomor</span>
                <select value={chId} onChange={(e) => setChId(e.target.value)}>
                  <option value="">Semua nomor</option>
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
            )}
            <label className="field"><span>Label</span>
              <select value={fLabel} onChange={(e) => setFLabel(e.target.value)}>
                <option value="">Semua label</option>
                {labels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="field"><span>Tahap</span>
              <select value={fStage} onChange={(e) => setFStage(e.target.value)}>
                <option value="">Semua tahap</option>
                {stages.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div className="bc-list">
            {targets.map((c) => {
              const off = excluded.has(c.wa_id);
              return (
                <label key={c.wa_id} className={'bc-item' + (off ? ' off' : '')}>
                  <input type="checkbox" checked={!off} onChange={() => setExcluded((s) => { const n = new Set(s); n.has(c.wa_id) ? n.delete(c.wa_id) : n.add(c.wa_id); return n; })} />
                  <span className="bc-name">{c.name || c.wa_id}</span>
                  <span className="bc-num">{c.wa_id}</span>
                </label>
              );
            })}
            {targets.length === 0 && <p className="muted" style={{ padding: 10 }}>Tidak ada kontak sesuai filter.</p>}
          </div>
        </div>

        {/* Kanan: template + preview */}
        <div className="card">
          <h2>2. Pesan (template)</h2>
          {tpls === null && <p className="muted">Memuat template…</p>}
          {tpls?.length === 0 && <p style={{ color: '#c0392b', fontSize: 13 }}>Tidak ada template APPROVED untuk nomor ini. Buat dulu di menu Template.</p>}
          {tpls?.length > 0 && (
            <>
              <div className="field"><label>Pilih template</label>
                <select value={sel?.name || ''} onChange={(e) => pick(tpls.find((t) => t.name === e.target.value))}>
                  <option value="">— pilih —</option>
                  {tpls.map((t) => <option key={t.name + t.language} value={t.name}>{t.name} ({t.language})</option>)}
                </select>
              </div>
              {sel && sources.map((s, i) => (
                <div className="field" key={i}><label>Variabel {`{{${i + 1}}}`}</label>
                  <div className="var-row">
                    <select value={s.type} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                      <option value="name">Nama kontak</option>
                      <option value="phone">Nomor kontak</option>
                      <option value="text">Teks manual</option>
                    </select>
                    {s.type === 'text' && <input placeholder="isi teks…" value={s.value} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
                  </div>
                </div>
              ))}
              {sel?.btnUrlIndex != null && (
                <div className="field"><label>Variabel di tombol link 🔗</label>
                  <div className="var-row">
                    <select value={btnSrc.type} onChange={(e) => setBtnSrc({ ...btnSrc, type: e.target.value })}>
                      <option value="name">Nama kontak</option>
                      <option value="phone">Nomor kontak</option>
                      <option value="text">Teks manual</option>
                    </select>
                    {btnSrc.type === 'text' && <input placeholder="isi variabel link…" value={btnSrc.value} onChange={(e) => setBtnSrc({ ...btnSrc, value: e.target.value })} />}
                  </div>
                </div>
              )}
              {sel && sources.length > 0 && <small className="muted">Preview memakai contoh dari penerima pertama. Tiap kontak dapat nilainya sendiri.</small>}
              {sel && (
                <div className="wa-preview" style={{ marginTop: 8 }}>
                  <div className="wa-bubble"><div className="wa-body">{preview}</div></div>
                </div>
              )}
              <div className="row" style={{ marginTop: 14 }}>
                <button disabled={!sel || busy || finalTargets.length === 0} onClick={send}>
                  {busy ? 'Mengirim…' : `Kirim ke ${finalTargets.length} kontak`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
