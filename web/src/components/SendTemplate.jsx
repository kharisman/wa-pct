import React, { useEffect, useState } from 'react';
import { post } from '../api.js';

// Kirim template ke satu kontak (buka window 24 jam)
export default function SendTemplate({ waId, onClose, onSent }) {
  const [tpls, setTpls] = useState(null);
  const [sel, setSel] = useState(null);
  const [params, setParams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { fetch('/api/templates').then((r) => r.json()).then((d) => setTpls(d.error ? [] : d)); }, []);
  const pick = (t) => { setSel(t); setParams(Array(t.params).fill('')); };
  const preview = sel ? params.reduce((s, p, i) => s.replaceAll(`{{${i + 1}}}`, p || `{{${i + 1}}}`), sel.text) : '';

  const send = async () => {
    setBusy(true); setErr('');
    const res = await post('/send-template', { wa_id: waId, name: sel.name, language: sel.language, params, preview });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(d.error);
    onSent?.(); onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📋 Kirim template</h2>
        {tpls === null && <p>Memuat template…</p>}
        {tpls?.length === 0 && <p style={{ color: '#c0392b' }}>Tidak ada template APPROVED. Buat dulu di menu Template.</p>}
        {tpls?.length > 0 && (
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
            {err && <div className="err">{err}</div>}
            <div className="modal-actions">
              <button className="link" onClick={onClose}>Batal</button>
              <button disabled={!sel || busy} onClick={send}>{busy ? 'Mengirim…' : 'Kirim'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
