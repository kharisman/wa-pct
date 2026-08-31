import React, { useEffect, useState } from 'react';
import { post } from '../api.js';

// Kirim template ke satu kontak (buka window 24 jam)
export default function SendTemplate({ waId, onClose, onSent }) {
  const [tpls, setTpls] = useState(null);
  const [sel, setSel] = useState(null);
  const [sources, setSources] = useState([]);
  const [btnSrc, setBtnSrc] = useState({ type: 'text', value: '' });
  const [hFile, setHFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { fetch('/api/templates?wa_id=' + waId).then((r) => r.json()).then((d) => setTpls(d.error ? [] : d)); }, [waId]);
  const pick = (t) => { setSel(t); setSources(Array.from({ length: t.params }, () => ({ type: 'text', value: '' }))); setHFile(null); };
  const sv = (s) => s.type === 'name' ? '(nama kontak)' : s.type === 'phone' ? waId : (s.value || '');
  const preview = sel ? sources.reduce((str, s, i) => str.replaceAll(`{{${i + 1}}}`, sv(s) || `{{${i + 1}}}`), sel.text) : '';
  const isImg = sel?.headerType === 'IMAGE';
  const needImg = isImg && !sel?.hasImage; // wajib upload cuma kalau belum ada default

  const send = async () => {
    if (needImg && !hFile) return setErr('Template ini pakai header gambar — pilih gambar dulu.');
    setBusy(true); setErr('');
    let headerMedia;
    if (needImg && hFile) {
      const data = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(hFile); });
      headerMedia = { mime: hFile.type, filename: hFile.name, data };
    }
    const body = { wa_id: waId, name: sel.name, language: sel.language, sources, text: sel.text, headerMedia };
    if (sel.btnUrlIndex != null) { body.buttonIndex = sel.btnUrlIndex; body.buttonSource = btnSrc; }
    const res = await post('/send-template', body);
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
            {isImg && (<>
              <label>Gambar header {sel?.hasImage ? '(opsional — default sudah tersimpan)' : ''}</label>
              <input type="file" accept="image/*" onChange={(e) => setHFile(e.target.files[0])} />
            </>)}
            {sel && sources.map((s, i) => (
              <div className="var-row" key={i}>
                <select value={s.type} onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}>
                  <option value="name">Nama kontak</option>
                  <option value="phone">Nomor kontak</option>
                  <option value="text">Teks manual</option>
                </select>
                {s.type === 'text' && <input placeholder={`isi {{${i + 1}}}`} value={s.value}
                  onChange={(e) => setSources(sources.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
              </div>
            ))}
            {sel?.btnUrlIndex != null && (
              <div className="var-row" title="Variabel di tombol link">
                🔗
                <select value={btnSrc.type} onChange={(e) => setBtnSrc({ ...btnSrc, type: e.target.value })}>
                  <option value="name">Nama kontak</option>
                  <option value="phone">Nomor kontak</option>
                  <option value="text">Teks manual</option>
                </select>
                {btnSrc.type === 'text' && <input placeholder="isi variabel link" value={btnSrc.value} onChange={(e) => setBtnSrc({ ...btnSrc, value: e.target.value })} />}
              </div>
            )}
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
