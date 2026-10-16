import React, { useEffect, useState } from 'react';
import { api, post } from '../api.js';

export default function ChatBuilder() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/chat-widget').then(setF); }, []);
  if (!f) return <div className="page">Memuat…</div>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const snippet = `<script src="${location.origin}/chat.js" async></script>`;
  const save = async (e) => {
    e.preventDefault();
    const r = await post('/chat-widget', f);
    setMsg(r.ok ? '✓ Tersimpan' : (await r.json()).error);
  };

  return (
    <div className="page">
      <h1 className="page-title">Chat Builder</h1>
      <p className="muted">Floating chat untuk dipasang di website. Pesan pengunjung masuk ke menu Percakapan (label "Web chat"), balasan agen muncul di widget.</p>
      <div className="card">
        <form onSubmit={save}>
          <div className="field"><label>Judul chat</label><input required value={f.title} onChange={set('title')} /></div>
          <div className="field"><label>Nama agen yang menerima</label><input required value={f.agent} onChange={set('agent')} /></div>
          <div className="field"><label>Sapaan awal</label><input value={f.greeting} placeholder="(kosong = tanpa sapaan)" onChange={set('greeting')} /></div>
          <div className="field"><label>Warna header</label><input type="color" value={f.color} onChange={set('color')} /></div>
          <div className="row"><button>Simpan</button>{msg && <span className={msg.startsWith('✓') ? 'saved' : 'err'}>{msg}</span>}</div>
        </form>
      </div>

      <div className="card">
        <h3>Preview</h3>
        <div style={{ width: 300, borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.15)' }}>
          <div style={{ background: f.color, color: '#fff', padding: '14px 16px' }}>
            <b style={{ display: 'block' }}>{f.title}</b><small>{f.agent}</small>
          </div>
          <div style={{ background: '#f4f5f7', padding: 12, minHeight: 80 }}>
            {f.greeting && <div style={{ background: '#fff', padding: '8px 11px', borderRadius: 12, display: 'inline-block', fontSize: 14 }}>{f.greeting}</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Kode embed</h3>
        <p className="muted">Tempel sebelum <code>&lt;/body&gt;</code> di website. Perubahan warna/judul langsung berlaku tanpa ganti kode.</p>
        <textarea readOnly rows={2} value={snippet} onFocus={(e) => e.target.select()} style={{ width: '100%', fontFamily: 'monospace' }} />
        <div className="row"><button type="button" onClick={() => { navigator.clipboard.writeText(snippet); setMsg('✓ Kode disalin'); }}>Salin kode</button></div>
      </div>
    </div>
  );
}
