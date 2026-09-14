import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const PERIODS = [['today', 'Hari ini'], ['yesterday', 'Kemarin'], ['week', 'Minggu'], ['month', 'Bulan']];

const dur = (ms) => {
  if (ms == null) return '—';
  const sec = Math.round(Number(ms) / 1000);
  if (sec < 60) return sec + ' dtk';
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' mnt';
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (h < 24) return h + ' j ' + (m % 60) + ' m';
  return d + ' hr ' + (h % 24) + ' j';
};

export default function Dashboard({ onOpen, setNav }) {
  const [period, setPeriod] = useState('week');
  const [chan, setChan] = useState(''); // '' = semua nomor
  const [s, setS] = useState(null);
  const [recent, setRecent] = useState([]);
  const [pipes, setPipes] = useState([]);
  const [rows, setRows] = useState([]);
  const [channels, setChannels] = useState([]);

  useEffect(() => { setS(null); api('/stats?period=' + period + (chan ? '&channel=' + chan : '')).then(setS); }, [period, chan]);
  useEffect(() => {
    api('/conversations').then((c) => setRows(c));
    api('/pipelines').then(setPipes);
    api('/channels').then(setChannels);
  }, []);

  // Chat terbaru & funnel ikut filter nomor
  const scoped = useMemo(() => chan ? rows.filter((r) => String(r.channel_id) === chan) : rows, [rows, chan]);
  useEffect(() => { setRecent(scoped.slice(0, 8)); }, [scoped]);

  // Funnel: hitung jumlah kontak per tahap pipeline pertama (client-side)
  const funnel = useMemo(() => {
    const p = pipes[0];
    if (!p) return null;
    const firstId = pipes[0].id;
    const counts = p.stages.map((st) => ({
      stage: st,
      n: scoped.filter((r) => (r.pipeline_id || firstId) === p.id && (r.stage || p.stages[0]) === st).length,
    }));
    const max = Math.max(1, ...counts.map((c) => c.n));
    return { name: p.name, counts, max };
  }, [pipes, scoped]);

  const tiles = s ? [
    ['Pesan masuk', s.incoming, '📥', 'green'],
    ['Percakapan aktif', s.ongoing, '💬', 'purple'],
    ['Belum dibalas', s.unanswered, '⏳', 'purple'],
    ['Median balas', dur(s.reply_median_ms), '⏱️', 'green'],
    ['Rata² balas', dur(s.reply_avg_ms), '⚡', 'green'],
    ['Nunggu terlama', dur(s.longest_await_ms), '🔔', 'purple'],
    ['Belum di-assign', s.unassigned, '🕓', 'purple'],
    ['Tugas terbuka', s.tasks_open, '✅', 'purple'],
  ] : [];

  return (
    <div className="page dash">
      <div className="dash-head">
        <h1 className="page-title" style={{ margin: 0 }}>Dashboard</h1>
        <div className="dash-controls">
          <select className="ct-select" value={chan} onChange={(e) => setChan(e.target.value)}>
            <option value="">Semua nomor</option>
            {channels.map((c) => <option key={c.id} value={String(c.id)}>{c.phone_number || c.label || ('Nomor ' + c.id)}</option>)}
          </select>
          <div className="dash-tabs">
            {PERIODS.map(([k, label]) => (
              <button key={k} className={'dash-tab' + (period === k ? ' active' : '')} onClick={() => setPeriod(k)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {!s ? <p className="muted">Memuat…</p> : (
        <div className="dash-grid">
          {tiles.map(([label, val, ic, tone]) => (
            <div key={label} className={'dash-tile ' + tone}>
              <div className="dt-label">{ic} {label}</div>
              <div className="dt-val">{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className="dash-cols">
        {funnel && (
          <div className="dash-panel">
            <div className="dp-head"><h2>Pipeline · {funnel.name}</h2><button className="link" onClick={() => setNav('pipeline')}>buka →</button></div>
            {funnel.counts.map((c) => (
              <div key={c.stage} className="funnel-row">
                <span className="fr-name">{c.stage}</span>
                <div className="fr-bar"><div style={{ width: (c.n / funnel.max * 100) + '%' }} /></div>
                <span className="fr-n">{c.n}</span>
              </div>
            ))}
          </div>
        )}

        <div className="dash-panel">
          <div className="dp-head"><h2>Pesan masuk per nomor</h2></div>
          {(s?.by_channel || []).length === 0 && <p className="muted">Belum ada data.</p>}
          {(s?.by_channel || []).map((c, i) => (
            <div key={i} className="src-row"><span>{c.label || 'Tidak dikenal'}</span><b>{c.n}</b></div>
          ))}
        </div>

        <div className="dash-panel">
          <div className="dp-head"><h2>Chat terbaru</h2><button className="link" onClick={() => setNav('conversations')}>lihat semua →</button></div>
          {recent.map((c) => (
            <div key={c.wa_id} className="recent-row" onClick={() => onOpen(c.wa_id)}>
              <b>{c.name || c.wa_id}</b>
              <span className="last">{c.last_body}</span>
            </div>
          ))}
          {recent.length === 0 && <p className="muted">Belum ada percakapan.</p>}
        </div>
      </div>
    </div>
  );
}
