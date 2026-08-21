import React, { useEffect, useState } from 'react';
import { api, patch, post } from '../api.js';

export default function ContactPanel({ waId, users, onChange }) {
  const [c, setC] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tag, setTag] = useState('');
  const [pipes, setPipes] = useState([]);
  const [rem, setRem] = useState([]);
  const [rf, setRf] = useState({ at: '', note: '' });

  useEffect(() => {
    fetch('/api/contact/' + waId).then((r) => r.json()).then((d) => setC({ labels: '[]', ...d }));
    api('/reminders/' + waId).then(setRem);
  }, [waId]);
  useEffect(() => { api('/pipelines').then(setPipes); }, []);

  const addRem = async (e) => {
    e.preventDefault();
    if (!rf.at) return;
    await post('/reminders', { wa_id: waId, remind_at: new Date(rf.at).getTime(), note: rf.note });
    setRf({ at: '', note: '' }); api('/reminders/' + waId).then(setRem);
  };
  const delRem = async (id) => { await fetch('/api/reminders/' + id, { method: 'DELETE' }); api('/reminders/' + waId).then(setRem); };

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

      <label>Follow-up terjadwal</label>
      {rem.filter((r) => !r.done).map((r) => (
        <div key={r.id} className="rem-row">
          <span>⏰ {new Date(Number(r.remind_at)).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.note ? ' — ' + r.note : ''}</span>
          <button className="link" onClick={() => delRem(r.id)}>×</button>
        </div>
      ))}
      <form onSubmit={addRem} className="rem-form">
        <input type="datetime-local" value={rf.at} onChange={(e) => setRf({ ...rf, at: e.target.value })} />
        <input placeholder="catatan (opsional)" value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} />
        <button>Set pengingat</button>
      </form>

      {saved && <div className="saved">✓ tersimpan</div>}
    </div>
  );
}
