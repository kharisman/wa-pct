import React, { useEffect, useState } from 'react';
import { api, post, patch } from '../api.js';

export const STAGES = ['Baru', 'Dihubungi', 'Tertarik', 'Negosiasi', 'Deal', 'Batal']; // fallback

export default function Pipeline({ me, onOpen }) {
  const [pipes, setPipes] = useState([]);
  const [sel, setSel] = useState(null);
  const [rows, setRows] = useState([]);
  const [drag, setDrag] = useState(null);

  const loadPipes = () => api('/pipelines').then((p) => { setPipes(p); setSel((s) => s || p[0]?.id || null); });
  useEffect(() => { loadPipes(); api('/conversations').then(setRows); }, []);

  const firstId = pipes[0]?.id;
  const current = pipes.find((p) => p.id === sel);
  const stages = current?.stages || STAGES;

  const move = async (waId, stage) => {
    setRows((rs) => rs.map((r) => (r.wa_id === waId ? { ...r, stage, pipeline_id: sel } : r)));
    await patch('/contact/' + waId, { stage, pipeline_id: sel });
  };

  const addPipe = async () => {
    const name = prompt('Nama pipeline baru:'); if (!name) return;
    const st = prompt('Tahap (pisah koma):', 'Baru, Proses, Selesai'); if (!st) return;
    const res = await post('/pipelines', { name, stages: st.split(',').map((x) => x.trim()).filter(Boolean) });
    const d = await res.json(); if (res.ok) { await loadPipes(); setSel(d.id); }
  };
  const editStages = async () => {
    const st = prompt('Ubah tahap (pisah koma):', stages.join(', ')); if (!st) return;
    await patch('/pipelines/' + sel, { stages: st.split(',').map((x) => x.trim()).filter(Boolean) });
    loadPipes();
  };
  const delPipe = async () => {
    if (!confirm('Hapus pipeline "' + current.name + '"? Kontaknya tetap ada.')) return;
    await fetch('/api/pipelines/' + sel, { method: 'DELETE' });
    setSel(null); loadPipes();
  };

  return (
    <div className="page pipeline-page">
      <div className="pipe-bar">
        <h1 className="page-title" style={{ margin: 0 }}>Pipeline</h1>
        <select value={sel || ''} onChange={(e) => setSel(Number(e.target.value))}>
          {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {me?.is_admin && <>
          <button className="link" onClick={addPipe}>＋ Pipeline</button>
          {current && <button className="link" onClick={editStages}>Kelola tahap</button>}
          {current && pipes.length > 1 && <button className="link" onClick={delPipe}>Hapus</button>}
        </>}
      </div>

      <div className="kanban">
        {stages.map((st) => {
          const items = rows.filter((r) => (r.pipeline_id || firstId) === sel && (r.stage || stages[0]) === st);
          return (
            <div className="kcol" key={st}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag) move(drag, st); setDrag(null); }}>
              <div className="kcol-head">{st}<span className="kcount">{items.length}</span></div>
              <div className="kbody">
                {items.map((c) => (
                  <div key={c.wa_id} className="kcard" draggable
                    onDragStart={() => setDrag(c.wa_id)} onClick={() => onOpen(c.wa_id)}>
                    <b>{c.name || c.wa_id}</b>
                    <div className="kcard-last">{c.last_body}</div>
                    <div className="kcard-foot">
                      {JSON.parse(c.labels || '[]').slice(0, 2).map((l) => <span key={l} className="chip mini">{l}</span>)}
                      {c.assignee && <span className="who">{c.assignee.split('@')[0]}</span>}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="kempty">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
