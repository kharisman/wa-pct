import React, { useEffect, useState } from 'react';
import { api, patch } from '../api.js';

export const STAGES = ['Baru', 'Dihubungi', 'Tertarik', 'Negosiasi', 'Deal', 'Batal'];

export default function Pipeline({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [drag, setDrag] = useState(null);
  useEffect(() => { api('/conversations').then(setRows); }, []);

  const move = async (waId, stage) => {
    setRows((rs) => rs.map((r) => (r.wa_id === waId ? { ...r, stage } : r)));
    await patch('/contact/' + waId, { stage });
  };

  return (
    <div className="page pipeline-page">
      <h1 className="page-title">Pipeline</h1>
      <div className="kanban">
        {STAGES.map((st) => {
          const items = rows.filter((r) => (r.stage || 'Baru') === st);
          return (
            <div className="kcol" key={st}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag) move(drag, st); setDrag(null); }}>
              <div className="kcol-head">{st}<span className="kcount">{items.length}</span></div>
              <div className="kbody">
                {items.map((c) => (
                  <div key={c.wa_id} className="kcard" draggable
                    onDragStart={() => setDrag(c.wa_id)}
                    onClick={() => onOpen(c.wa_id)}>
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
