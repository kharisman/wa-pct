import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Contacts({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [qy, setQy] = useState('');
  useEffect(() => { api('/conversations').then(setRows); }, []);

  const f = rows.filter((c) =>
    (c.name || '').toLowerCase().includes(qy.toLowerCase()) || c.wa_id.includes(qy));

  return (
    <div className="page">
      <h1 className="page-title">Kontak <small>({rows.length})</small></h1>
      <input className="search" placeholder="Cari nama / nomor…" value={qy} onChange={(e) => setQy(e.target.value)} />
      <div className="card nopad">
        <table className="tbl">
          <thead><tr><th>Nama</th><th>Nomor</th><th>Label</th><th>Ditangani</th><th></th></tr></thead>
          <tbody>
            {f.map((c) => (
              <tr key={c.wa_id}>
                <td>{c.name || '—'}</td>
                <td className="mono">{c.wa_id}</td>
                <td>{JSON.parse(c.labels || '[]').map((l) => <span key={l} className="chip mini">{l}</span>)}</td>
                <td>{c.assignee ? c.assignee.split('@')[0] : <span className="muted">—</span>}</td>
                <td><button className="link" onClick={() => onOpen(c.wa_id)}>buka chat →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {f.length === 0 && <p className="muted" style={{ padding: 16 }}>Tidak ada kontak.</p>}
      </div>
    </div>
  );
}
