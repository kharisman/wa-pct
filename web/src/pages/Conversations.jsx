import React, { useEffect, useRef, useState } from 'react';
import { api, post } from '../api.js';
import Media from '../components/Media.jsx';
import ContactPanel from '../components/ContactPanel.jsx';
import SendTemplate from '../components/SendTemplate.jsx';

const dayLabel = (ts) => {
  const d = new Date(ts), today = new Date(), yst = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Hari ini';
  if (d.toDateString() === yst.toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export default function Conversations({ me, active, setActive }) {
  const [convs, setConvs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [showTpl, setShowTpl] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [quick, setQuick] = useState([]);
  const [showActions, setShowActions] = useState(false);
  useEffect(() => { api('/quick-replies').then(setQuick); }, []);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const msgsEl = useRef(null);
  const fileRef = useRef(null);

  const loadConvs = () => api('/conversations').then(setConvs);
  const loadUsers = () => api('/users').then(setUsers);
  useEffect(() => { loadConvs(); loadUsers(); }, []);

  const SLA_MIN = 15;
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 60000); return () => clearInterval(t); }, []);
  const needsReply = (c) => c.last_dir === 'in' && Date.now() - c.last_at > SLA_MIN * 60000;
  const mins = (c) => Math.floor((Date.now() - c.last_at) / 60000);

  const [qy, setQy] = useState('');
  const [limit, setLimit] = useState(25);
  const [fChan, setFChan] = useState('');
  const [fDate, setFDate] = useState('');
  const [channels, setChannels] = useState([]);
  useEffect(() => { api('/channels').then(setChannels); }, []);

  const dateCutoff = (preset) => {
    const now = new Date();
    if (preset === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (preset === '7d') return now.getTime() - 7 * 864e5;
    if (preset === '30d') return now.getTime() - 30 * 864e5;
    return 0;
  };
  const cutoff = dateCutoff(fDate);

  const shown = convs.filter((c) =>
    (filter === 'mine' ? c.assignee === me.email
      : filter === 'unassigned' ? !c.assignee
        : filter === 'unreplied' ? needsReply(c)
          : true)
    && (!qy || (c.name || '').toLowerCase().includes(qy.toLowerCase()) || c.wa_id.includes(qy))
    && (!fChan || String(c.channel_id) === fChan)
    && (!cutoff || (c.last_at && c.last_at >= cutoff)));
  useEffect(() => { setLimit(25); }, [filter, qy, fChan, fDate]);
  const rendered = shown.slice(0, limit);

  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    if (active) api('/messages/' + active).then((m) => { setMsgs(m); setHasMore(m.length === 10); });
    else { setMsgs([]); setHasMore(false); }
  }, [active]);

  const loadOlder = async () => {
    if (!msgs.length) return;
    const el = msgsEl.current;
    const prevH = el?.scrollHeight ?? 0; // jaga posisi baca: tinggi sebelum pesan lama disisipkan
    const older = await api('/messages/' + active + '?before=' + msgs[0].id);
    setMsgs((cur) => [...older, ...cur]);
    setHasMore(older.length === 10);
    if (el) requestAnimationFrame(() => { el.scrollTop += el.scrollHeight - prevH; });
  };

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

  const lastIdRef = useRef(null);
  useEffect(() => {
    const last = msgs[msgs.length - 1]?.id;
    if (last !== lastIdRef.current) { lastIdRef.current = last; bottom.current?.scrollIntoView(); } // scroll cuma saat pesan baru, bukan muat lama
  }, [msgs]);

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

  const [aiBusy, setAiBusy] = useState(false);
  const aiSuggest = async () => {
    if (!active) return;
    setAiBusy(true);
    try {
      const res = await post('/ai-suggest', { wa_id: active });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setText(d.text);
    } catch (e) { alert('AI gagal: ' + e.message); } finally { setAiBusy(false); }
  };

  const sendNote = async () => {
    if (!noteText.trim() || !active) return;
    const res = await post('/note', { wa_id: active, body: noteText });
    if (res.ok) { setNoteText(''); setShowNote(false); }
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
    <div className={'app' + (active ? ' has-active' : '')}>
      <div className="list">
        <div className="topbar">
          <div className="tabs">
            {[['all', 'Semua'], ['mine', 'Saya'], ['unassigned', 'Belum'], ['unreplied', 'Perlu dibalas']].map(([k, label]) => (
              <button key={k} className={filter === k ? 'tab active' : 'tab'} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="conv-search">
          <input placeholder="🔍 Cari nama / nomor…" value={qy} onChange={(e) => setQy(e.target.value)} />
          <div className="conv-filters">
            {channels.length > 1 && (
              <select value={fChan} onChange={(e) => setFChan(e.target.value)}>
                <option value="">Semua nomor</option>
                {channels.map((c) => <option key={c.id} value={c.id}>📱 {c.label}</option>)}
              </select>
            )}
            <select value={fDate} onChange={(e) => setFDate(e.target.value)}>
              <option value="">Semua waktu</option>
              <option value="today">Hari ini</option>
              <option value="7d">7 hari terakhir</option>
              <option value="30d">30 hari terakhir</option>
            </select>
            {(fChan || fDate || qy) && <button className="conv-reset" onClick={() => { setFChan(''); setFDate(''); setQy(''); }}>✕ reset</button>}
          </div>
        </div>
        {rendered.map((c) => (
          <div key={c.wa_id} className={'conv' + (c.wa_id === active ? ' active' : '') + (needsReply(c) ? ' needs-reply' : '')} onClick={() => setActive(c.wa_id)}>
            <div className="name">{c.name || c.wa_id}{c.assignee && <span className="who"> · {c.assignee === me.email ? 'saya' : c.assignee.split('@')[0]}</span>}
              {needsReply(c) && <span className="sla-badge">⏱ {mins(c)}m</span>}
            </div>
            {c.channel_label && <span className="chan-badge">📱 {c.channel_label}</span>}
            <div className="last">{c.last_body}</div>
            <div className="labels">{JSON.parse(c.labels || '[]').map((l) => <span key={l} className="chip mini">{l}</span>)}</div>
          </div>
        ))}
        {shown.length === 0 && <div style={{ padding: 14, color: '#999' }}>Tidak ada chat.</div>}
        {shown.length > limit && (
          <button className="conv-more" onClick={() => setLimit((l) => l + 25)}>Muat lebih banyak ({shown.length - limit})</button>
        )}
      </div>

      {active ? (
        <div className="thread">
          <div className="thread-head">
            <button className="back-btn" onClick={() => setActive(null)}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{convs.find((c) => c.wa_id === active)?.name || active}</b>
              <span className="num">{active}</span>
            </div>
            {(() => {
              const ac = convs.find((c) => c.wa_id === active);
              const off = ac?.ai_off;
              return (
                <button className={'ai-th' + (off ? ' off' : '')} title={off ? 'AI dimatikan untuk kontak ini — klik untuk aktifkan' : 'AI aktif — klik untuk ambil alih (matikan AI)'}
                  onClick={async () => { await post('/contact/' + active, { ai_off: off ? 0 : 1 }); loadConvs(); }}>
                  {off ? '🙋 Diambil alih' : '🤖 AI aktif'}
                </button>
              );
            })()}
          </div>
          <div className="msgs" ref={msgsEl}>
            {hasMore && <button type="button" className="load-older" onClick={loadOlder}>↑ Muat pesan lama</button>}
            {msgs.map((m, i) => (
              <React.Fragment key={m.id}>
              {(i === 0 || new Date(m.created_at).toDateString() !== new Date(msgs[i - 1].created_at).toDateString()) && (
                <div className="date-sep">{dayLabel(m.created_at)}</div>
              )}
              {m.direction === 'note' ? (
              <div className="note-msg">
                📝 {m.body}
                <div className="meta">catatan internal · {m.sent_by || '?'} · {new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ) : (
              <div className={'bubble ' + m.direction}>
                <Media m={m} />
                {m.body}
                <div className="meta">
                  {m.direction === 'out' && m.sent_by ? m.sent_by + ' · ' : ''}
                  {new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  {m.direction === 'out' && m.status ? ' · ' + m.status : ''}
                </div>
              </div>
            )}
              </React.Fragment>
            ))}
            <div ref={bottom} />
          </div>
          <form className="composer" onSubmit={send}>
            <input type="file" ref={fileRef} style={{ display: 'none' }} onChange={(e) => sendFile(e.target.files[0])} />
            <div className="quick-wrap">
              <button type="button" className="attach" title="Aksi" onClick={() => setShowActions((s) => !s)}>{showActions ? '✕' : '＋'}</button>
              {showActions && (
                <div className="quick-pop">
                  <div className="quick-item act" onClick={() => { setShowActions(false); fileRef.current?.click(); }}>📎 Lampirkan file</div>
                  <div className="quick-item act" onClick={() => { setShowActions(false); setShowTpl(true); }}>📋 Kirim template</div>
                  <div className="quick-item act" onClick={() => { setShowActions(false); setShowNote(true); }}>📝 Catatan internal</div>
                  <div className="quick-item act" onClick={() => { if (!aiBusy) { setShowActions(false); aiSuggest(); } }}>🤖 {aiBusy ? 'Menyusun…' : 'Balas dengan AI'}</div>
                  <div className="act-sep">Balasan cepat</div>
                  {quick.length === 0 && <div className="quick-empty">Belum ada balasan cepat.</div>}
                  {quick.map((q) => (
                    <div key={q.id} className="quick-item" onClick={() => { setText((t) => (t ? t + ' ' : '') + q.body); setShowActions(false); }}>
                      <b>{q.title}</b><span>{q.body}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik balasan…" />
            <button disabled={sending}>Kirim</button>
          </form>
        </div>
      ) : (
        <div className="empty">Pilih percakapan di kiri.</div>
      )}

      {active && <ContactPanel key={active} waId={active} users={users} onChange={loadConvs} />}
      {showTpl && active && <SendTemplate waId={active} onClose={() => setShowTpl(false)} onSent={loadConvs} />}
      {showNote && active && (
        <div className="modal-bg" onClick={() => setShowNote(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>📝 Catatan internal</h2>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Hanya dilihat tim — tidak dikirim ke pelanggan.</p>
            <textarea autoFocus rows={4} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Tulis catatan…" style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, font: 'inherit', resize: 'vertical' }} />
            <div className="modal-actions">
              <button className="link" onClick={() => setShowNote(false)}>Batal</button>
              <button disabled={!noteText.trim()} onClick={sendNote}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
