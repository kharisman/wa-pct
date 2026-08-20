import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard({ onOpen, setNav }) {
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    api('/stats').then(setS);
    api('/conversations').then((c) => setRecent(c.slice(0, 8)));
  }, []);

  const cards = s ? [
    ['Total Kontak', s.contacts, '👥'],
    ['Total Pesan', s.messages, '✉️'],
    ['Masuk 24 jam', s.in24, '⬅️'],
    ['Keluar 24 jam', s.out24, '➡️'],
    ['Belum di-assign', s.unassigned, '🕓'],
  ] : [];

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>
      <div className="stat-grid">
        {cards.map(([label, val, ic]) => (
          <div key={label} className="stat-card">
            <div className="ic">{ic}</div>
            <div className="val">{val}</div>
            <div className="lbl">{label}</div>
          </div>
        ))}
        {!s && <p>Memuat…</p>}
      </div>
      <div className="card">
        <div className="card-head"><h2>Chat terbaru</h2><button className="link" onClick={() => setNav('conversations')}>lihat semua →</button></div>
        {recent.map((c) => (
          <div key={c.wa_id} className="recent-row" onClick={() => onOpen(c.wa_id)}>
            <b>{c.name || c.wa_id}</b>
            <span className="last">{c.last_body}</span>
          </div>
        ))}
        {recent.length === 0 && <p className="muted">Belum ada percakapan.</p>}
      </div>
    </div>
  );
}
