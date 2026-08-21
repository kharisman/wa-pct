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
  const [params, setParams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api('/conversations').then(setContacts);
    api('/channels').then(setChannels);
  }, []);
  useEffect(() => {
    setSel(null); setParams([]);
    fetch('/api/templates' + (chId ? '?channel_id=' + chId : '')).then((r) => r.json()).then((d) => setTpls(d.error ? [] : d));
  }, [chId]);

  const labels = useMemo(() => [...new Set(contacts.flatMap((c) => JSON.parse(c.labels || '[]')))].sort(), [contacts]);
  const stages = useMemo(() => [...new Set(contacts.map((c) => c.stage).filter(Boolean))].sort(), [contacts]);

  const targets = contacts.filter((c) =>
    (!chId || String(c.channel_id) === String(chId))
    && (!fLabel || JSON.parse(c.labels || '[]').includes(fLabel))
    && (!fStage || c.stage === fStage));
  const finalTargets = targets.filter((c) => !excluded.has(c.wa_id));

  const pick = (t) => { setSel(t); setParams(Array(t.params).fill('')); };
  const preview = sel ? params.reduce((s, p, i) => s.replaceAll(`{{${i + 1}}}`, p || `{{${i + 1}}}`), sel.text) : '';

  const send = async () => {
    setBusy(true);
    const res = await post('/broadcast', { name: sel.name, language: sel.language, params, text: sel.text, wa_ids: finalTargets.map((c) => c.wa_id) });
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
              {sel && params.map((p, i) => (
                <div className="field" key={i}><label>Isi {`{{${i + 1}}}`}</label>
                  <input value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} /></div>
              ))}
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
