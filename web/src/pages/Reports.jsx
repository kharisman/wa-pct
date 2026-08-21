import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Reports() {
  const [agents, setAgents] = useState([]);
  const [funnel, setFunnel] = useState([]);
  useEffect(() => {
    api('/reports/agents').then(setAgents);
    api('/reports/pipeline').then(setFunnel);
  }, []);

  const maxCount = (stages) => Math.max(1, ...stages.map((s) => s.count));

  return (
    <div className="page">
      <h1 className="page-title">Laporan</h1>

      <div className="card nopad">
        <div className="card-head" style={{ padding: '14px 16px 0' }}><h2>Kinerja Agen</h2></div>
        <table className="tbl">
          <thead><tr><th>Agen</th><th>Balas (24 jam)</th><th>Total balas</th><th>Kontak dipegang</th></tr></thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.email}>
                <td><b>{a.name}</b>{a.is_admin ? ' 👑' : ''} <small className="muted">{a.email}</small></td>
                <td style={{ fontWeight: 700 }}>{a.sent24}</td>
                <td>{a.sent}</td>
                <td>{a.assigned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {funnel.map((p) => (
        <div className="card" key={p.name}>
          <h2>Corong: {p.name}</h2>
          {p.stages.map((s) => (
            <div key={s.stage} className="funnel-row">
              <span className="funnel-label">{s.stage}</span>
              <div className="funnel-bar"><div style={{ width: (s.count / maxCount(p.stages) * 100) + '%' }} /></div>
              <span className="funnel-count">{s.count}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
