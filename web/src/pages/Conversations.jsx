import React, { useEffect, useRef, useState } from 'react';
import { api, post } from '../api.js';
import Media from '../components/Media.jsx';
import ContactPanel from '../components/ContactPanel.jsx';
import Broadcast from '../components/Broadcast.jsx';
import SendTemplate from '../components/SendTemplate.jsx';

export default function Conversations({ me, active, setActive }) {
  const [convs, setConvs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showBc, setShowBc] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const fileRef = useRef(null);

  const loadConvs = () => api('/conversations').then(setConvs);
  const loadUsers = () => api('/users').then(setUsers);
  useEffect(() => { loadConvs(); loadUsers(); }, []);

  const shown = convs.filter((c) =>
    filter === 'all' ? true : filter === 'mine' ? c.assignee === me.email : !c.assignee);

  useEffect(() => { if (active) api('/messages/' + active).then(setMsgs); else setMsgs([]); }, [active]);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.kind === 'message') {
        loadConvs();
        setActive((cur) => {
          if (ev.wa_id === cur) setMsgs((m) => (m.some((x) => x.id === ev.message.id) ? m : [...m, ev.message]));
          return cur;
        });
      } else if (ev.kind === 'status') {
        setMsgs((m) => m.map((x) => (x.wa_msg_id === ev.wa_msg_id ? { ...x, status: ev.status } : x)));
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView(); }, [msgs]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    setSending(true);
    try {
      const res = await post('/send', { wa_id: active, body: text });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setText('');
    } catch (err) { alert('Gagal kirim: ' + err.message); } finally { setSending(false); }
  };

  const sendFile = async (file) => {
    if (!file || !active) return;
    if (file.size > 25 * 1024 * 1024) return alert('Maks 25MB');
    setSending(true);
    try {
      const data = await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result.split(',')[1]);
        r.readAsDataURL(file);
      });
      const res = await post('/send-media', { wa_id: active, mime: file.type, filename: file.name, data, caption: text || undefined });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setText('');
    } catch (err) { alert('Gagal kirim file: ' + err.message); } finally {
      setSending(false); if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="app">
      <div className="list">
        <div className="topbar">
          <div className="tabs">
            {[['all', 'Semua'], ['mine', 'Saya'], ['unassigned', 'Belum']].map(([k, label]) => (
              <button key={k} className={filter === k ? 'tab active' : 'tab'} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <button className="link" title="Broadcast" onClick={() => setShowBc(true)}>📢</button>
        </div>
        {shown.map((c) => (
          <div key={c.wa_id} className={'conv' + (c.wa_id === active ? ' active' : '')} onClick={() => setActive(c.wa_id)}>
            <div className="name">{c.name || c.wa_id}{c.assignee && <span className="who"> · {c.assignee === me.email ? 'saya' : c.assignee.split('@')[0]}</span>}</div>
            <div className="last">{c.last_body}</div>
            <div className="labels">{JSON.parse(c.labels || '[]').map((l) => <span key={l} className="chip mini">{l}</span>)}</div>
          </div>
        ))}
        {shown.length === 0 && <div style={{ padding: 14, color: '#999' }}>Tidak ada chat.</div>}
      </div>

      {active ? (
        <div className="thread">
          <div className="msgs">
            {msgs.map((m) => (
              <div key={m.id} className={'bubble ' + m.direction}>
                <Media m={m} />
                {m.body}
                <div className="meta">
                  {new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  {m.direction === 'out' && m.status ? ' · ' + m.status : ''}
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <form className="composer" onSubmit={send}>
            <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={(e) => sendFile(e.target.files[0])} />
            <button type="button" className="attach" title="Lampirkan file" disabled={sending} onClick={() => fileRef.current?.click()}>📎</button>
            <button type="button" className="attach" title="Kirim template" onClick={() => setShowTpl(true)}>📋</button>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik balasan…" />
            <button disabled={sending}>Kirim</button>
          </form>
        </div>
      ) : (
        <div className="empty">Pilih percakapan di kiri.</div>
      )}

      {active && <ContactPanel key={active} waId={active} users={users} onChange={loadConvs} />}
      {showBc && <Broadcast recipients={shown} onClose={() => setShowBc(false)} />}
      {showTpl && active && <SendTemplate waId={active} onClose={() => setShowTpl(false)} onSent={loadConvs} />}
    </div>
  );
}
