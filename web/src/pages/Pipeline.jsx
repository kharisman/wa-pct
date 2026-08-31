import React, { useEffect, useState } from 'react';
import { api, post, patch } from '../api.js';

export const STAGES = ['Baru', 'Dihubungi', 'Tertarik', 'Negosiasi', 'Deal', 'Batal']; // fallback

function PipelineForm({ mode, initial, onSave, onClose }) {
  const [name, setName] = useState(initial.name || '');
  const [stages, setStages] = useState(initial.stages?.length ? initial.stages : ['Baru']);
  const setStage = (i, v) => setStages(stages.map((s, j) => (j === i ? v : s)));
  const addStage = () => setStages([...stages, '']);
  const delStage = (i) => setStages(stages.filter((_, j) => j !== i));
  const moveStage = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= stages.length) return;
    const a = [...stages];[a[i], a[j]] = [a[j], a[i]]; setStages(a);
  };
  const submit = (e) => {
    e.preventDefault();
    const clean = stages.map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || clean.length === 0) return;
    onSave({ name: name.trim(), stages: clean });
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{mode === 'new' ? 'Pipeline baru' : 'Kelola pipeline'}</h2>
        <div className="field"><label>Nama pipeline</label>
          <input autoFocus value={name} placeholder="mis. Pendaftaran" onChange={(e) => setName(e.target.value)} /></div>
        <label style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Tahap</label>
        <div className="stage-edit">
          {stages.map((s, i) => (
            <div key={i} className="stage-row">
              <span className="stage-num">{i + 1}</span>
              <input value={s} placeholder={'Tahap ' + (i + 1)} onChange={(e) => setStage(i, e.target.value)} />
              <button type="button" className="sbtn" onClick={() => moveStage(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="sbtn" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1}>↓</button>
              <button type="button" className="sbtn del" onClick={() => delStage(i)} disabled={stages.length === 1}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="link" onClick={addStage} style={{ alignSelf: 'flex-start' }}>＋ tambah tahap</button>
        <div className="modal-actions">
          <button type="button" className="link" onClick={onClose}>Batal</button>
          <button>Simpan</button>
        </div>
      </form>
    </div>
  );
}

export default function Pipeline({ me, onOpen }) {
  const [pipes, setPipes] = useState([]);
  const [sel, setSel] = useState(null);
  const [rows, setRows] = useState([]);
  const [drag, setDrag] = useState(null);
  const [form, setForm] = useState(null); // {mode:'new'|'edit'}
  const [confirmDel, setConfirmDel] = useState(false);

  const loadPipes = () => api('/pipelines').then((p) => { setPipes(p); setSel((s) => s || p[0]?.id || null); });
  useEffect(() => { loadPipes(); api('/conversations').then(setRows); }, []);

  const firstId = pipes[0]?.id;
  const current = pipes.find((p) => p.id === sel);
  const stages = current?.stages || STAGES;

  const move = async (waId, stage) => {
    setRows((rs) => rs.map((r) => (r.wa_id === waId ? { ...r, stage, pipeline_id: sel } : r)));
    await patch('/contact/' + waId, { stage, pipeline_id: sel });
  };

  const savePipe = async ({ name, stages: st }) => {
    if (form.mode === 'new') {
      const res = await post('/pipelines', { name, stages: st });
      const d = await res.json(); if (res.ok) { await loadPipes(); setSel(d.id); }
    } else {
      await patch('/pipelines/' + sel, { name, stages: st }); await loadPipes();
    }
    setForm(null);
  };
  const delPipe = async () => {
    await fetch('/api/pipelines/' + sel, { method: 'DELETE' });
    setConfirmDel(false); setSel(null); loadPipes();
  };

  return (
    <div className="page pipeline-page">
      <div className="pipe-bar">
        <h1 className="page-title" style={{ margin: 0 }}>Pipeline</h1>
        <select value={sel || ''} onChange={(e) => setSel(Number(e.target.value))}>
          {pipes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {(me?.perms?.includes('all') || me?.perms?.includes('pipeline_admin')) && <>
          <button className="link" onClick={() => setForm({ mode: 'new' })}>＋ Pipeline</button>
          {current && <button className="link" onClick={() => setForm({ mode: 'edit' })}>Kelola tahap</button>}
          {current && pipes.length > 1 && <button className="link" onClick={() => setConfirmDel(true)}>Hapus</button>}
        </>}
      </div>

      {form && <PipelineForm mode={form.mode} initial={form.mode === 'edit' ? current : { name: '', stages: ['Baru', 'Proses', 'Selesai'] }} onSave={savePipe} onClose={() => setForm(null)} />}
      {confirmDel && current && (
        <div className="modal-bg" onClick={() => setConfirmDel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Hapus pipeline?</h2>
            <p className="muted" style={{ margin: 0 }}>Pipeline <b>{current.name}</b> akan dihapus. Kontaknya tetap ada.</p>
            <div className="modal-actions">
              <button className="link" onClick={() => setConfirmDel(false)}>Batal</button>
              <button style={{ background: '#dc2626' }} onClick={delPipe}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      <div className="kanban" style={{ display: 'flex', flexWrap: 'nowrap', gap: 14, overflowX: 'auto', alignItems: 'flex-start' }}>
        {stages.map((st) => {
          const items = rows.filter((r) => (r.pipeline_id || firstId) === sel && (r.stage || stages[0]) === st);
          return (
            <div className="kcol" key={st} style={{ flex: '0 0 272px', width: 272 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (drag) move(drag, st); setDrag(null); }}>
              <div className="kcol-head">{st}<span className="kcount">{items.length}</span></div>
              <div className="kbody">
                {items.map((c) => (
                  <div key={c.wa_id} className="kcard" draggable
                    onDragStart={() => setDrag(c.wa_id)} onClick={() => onOpen(c.wa_id)}>
                    <div className="kcard-top">
                      <span className="kava">{(c.name || c.wa_id).trim()[0]?.toUpperCase() || '?'}</span>
                      <b>{c.name || c.wa_id}</b>
                    </div>
                    <div className="kcard-last">{c.last_body || '—'}</div>
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
