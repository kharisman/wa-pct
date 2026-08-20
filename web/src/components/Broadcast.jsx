import React, { useEffect, useState } from 'react';
import { post } from '../api.js';

export default function Broadcast({ recipients, onClose }) {
  const [tpls, setTpls] = useState(null);
  const [sel, setSel] = useState(null);
  const [params, setParams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { fetch('/api/templates').then((r) => r.json()).then((d) => setTpls(d.error ? [] : d)); }, []);

  const pick = (t) => { setSel(t); setParams(Array(t.params).fill('')); };
  const preview = sel ? params.reduce((s, p, i) => s.replaceAll(`{{${i + 1}}}`, p || `{{${i + 1}}}`), sel.text) : '';

  const send = async () => {
    setBusy(true);
    const res = await post('/broadcast', { name: sel.name, language: sel.language, params, text: sel.text, wa_ids: recipients.map((c) => c.wa_id) });
    setResult(await res.json()); setBusy(false);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📢 Broadcast ke {recipients.length} kontak</h2>
        {tpls === null && <p>Memuat template…</p>}
        {tpls?.length === 0 && <p style={{ color: '#c0392b' }}>Tidak ada template APPROVED.</p>}
        {!result && tpls?.length > 0 && (
          <>
            <label>Template</label>
            <select value={sel?.name || ''} onChange={(e) => pick(tpls.find((t) => t.name === e.target.value))}>
              <option value="">— pilih —</option>
              {tpls.map((t) => <option key={t.name + t.language} value={t.name}>{t.name} ({t.language})</option>)}
            </select>
            {sel && params.map((p, i) => (
              <input key={i} placeholder={`Isi {{${i + 1}}}`} value={p}
                onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
            {sel && <div className="preview">{preview}</div>}
            <div className="modal-actions">
              <button className="link" onClick={onClose}>Batal</button>
              <button disabled={!sel || busy} onClick={send}>{busy ? 'Mengirim…' : 'Kirim'}</button>
            </div>
          </>
        )}
        {result && (
          <>
            <p>✅ Terkirim: {result.sent} · ❌ Gagal: {result.failed?.length || 0}</p>
            <div className="modal-actions"><button onClick={onClose}>Tutup</button></div>
          </>
        )}
      </div>
    </div>
  );
}
