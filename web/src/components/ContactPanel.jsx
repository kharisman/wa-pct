import React, { useEffect, useState } from 'react';
import { api, patch } from '../api.js';

export default function ContactPanel({ waId, users, onChange }) {
  const [c, setC] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tag, setTag] = useState('');
  const [pipes, setPipes] = useState([]);

  useEffect(() => {
    fetch('/api/contact/' + waId).then((r) => r.json()).then((d) => setC({ labels: '[]', ...d }));
  }, [waId]);
  useEffect(() => { api('/pipelines').then(setPipes); }, []);

  const save = async (body) => {
    const res = await patch('/contact/' + waId, body);
    setC({ labels: '[]', ...(await res.json()) });
    setSaved(true); setTimeout(() => setSaved(false), 1200); onChange();
  };

  if (!c) return <div className="panel" />;
  const labels = JSON.parse(c.labels || '[]');

  return (
    <div className="panel">
      <h2>{c.name || waId}</h2>
      <div className="wa">{waId}</div>

      <label>Pipeline</label>
      <select value={c.pipeline_id || (pipes[0]?.id ?? '')} onChange={(e) => save({ pipeline_id: Number(e.target.value) })}>
        {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <label>Tahap</label>
      <select value={c.stage || ''} onChange={(e) => save({ stage: e.target.value })}>
        {(pipes.find((p) => p.id === (c.pipeline_id || pipes[0]?.id))?.stages || []).map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <label>Ditangani</label>
      <select value={c.assignee || ''} onChange={(e) => save({ assignee: e.target.value })}>
        <option value="">— belum di-assign —</option>
        {users.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
      </select>

      <label>Nama</label>
      <input defaultValue={c.name || ''} onBlur={(e) => e.target.value !== (c.name || '') && save({ name: e.target.value })} />

      <label>Label</label>
      <div className="chips">
        {labels.map((l) => (
          <span key={l} className="chip">{l}<button onClick={() => save({ labels: labels.filter((x) => x !== l) })}>×</button></span>
        ))}
      </div>
      <input style={{ marginTop: 6 }} placeholder="tambah label + Enter" value={tag}
        onChange={(e) => setTag(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && tag.trim() && !labels.includes(tag.trim())) { save({ labels: [...labels, tag.trim()] }); setTag(''); }
        }} />

      <label>Catatan</label>
      <textarea defaultValue={c.notes || ''} onBlur={(e) => e.target.value !== (c.notes || '') && save({ notes: e.target.value })} />

      {saved && <div className="saved">✓ tersimpan</div>}
    </div>
  );
}
