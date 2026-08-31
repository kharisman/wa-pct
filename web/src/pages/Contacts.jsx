import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const PAGE = 20;

export default function Contacts({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [qy, setQy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => { api('/conversations').then(setRows); }, []);

  const cFrom = from ? new Date(from).setHours(0, 0, 0, 0) : 0;
  const cTo = to ? new Date(to).setHours(23, 59, 59, 999) : Infinity;

  const filtered = useMemo(() => rows.filter((c) =>
    ((c.name || '').toLowerCase().includes(qy.toLowerCase()) || c.wa_id.includes(qy))
    && (!c.last_at || (c.last_at >= cFrom && c.last_at <= cTo))
  ), [rows, qy, cFrom, cTo]);

  useEffect(() => { setPage(0); }, [qy, from, to]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const exportCsv = () => {
    const head = ['Nama', 'Nomor', 'Label', 'Ditangani', 'Tahap', 'Chat terakhir'];
    const lines = filtered.map((c) => [
      c.name || '', c.wa_id, JSON.parse(c.labels || '[]').join('|'), c.assignee || '', c.stage || '',
      c.last_at ? new Date(c.last_at).toLocaleString('id-ID') : '',
    ]);
    const csv = [head, ...lines].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kontak-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Kontak <small>({filtered.length})</small></h1>
        <button onClick={exportCsv}>⬇ Export CSV</button>
      </div>

      <div className="ct-filters">
        <input className="search" placeholder="🔍 Cari nama / nomor…" value={qy} onChange={(e) => setQy(e.target.value)} />
        <div className="ct-period">
          <label>Periode</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span>–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {(from || to) && <button className="link" onClick={() => { setFrom(''); setTo(''); }}>✕</button>}
        </div>
      </div>

      <div className="card nopad">
        <table className="tbl">
          <thead><tr><th>Nama</th><th>Nomor</th><th>Label</th><th>Tahap</th><th>Ditangani</th><th></th></tr></thead>
          <tbody>
            {view.map((c) => (
              <tr key={c.wa_id}>
                <td>{c.name || '—'}</td>
                <td className="mono">{c.wa_id}</td>
                <td>{JSON.parse(c.labels || '[]').map((l) => <span key={l} className="chip mini">{l}</span>)}</td>
                <td>{c.stage ? <span className="chip mini">{c.stage}</span> : <span className="muted">—</span>}</td>
                <td>{c.assignee ? c.assignee.split('@')[0] : <span className="muted">—</span>}</td>
                <td><button className="link" onClick={() => onOpen(c.wa_id)}>buka chat →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted" style={{ padding: 16 }}>Tidak ada kontak.</p>}
      </div>

      {pages > 1 && (
        <div className="pager">
          <button className="link" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Sebelumnya</button>
          <span>Halaman {page + 1} dari {pages}</span>
          <button className="link" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Berikutnya →</button>
        </div>
      )}
    </div>
  );
}
