import React, { useEffect, useRef, useState } from 'react';

const api = (path, opts) => fetch('/api' + path, opts).then((r) => r.json());

export default function App() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=belum login
  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe);
  }, []);

  if (me === undefined) return <div className="empty">Memuat…</div>;
  if (!me) return <Login onLogin={setMe} />;
  return <Inbox me={me} onLogout={() => setMe(null)} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    onLogin(d);
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <h1>💬 WA CRM</h1>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button>Masuk</button>
        {err && <div className="err">{err}</div>}
      </form>
    </div>
  );
}

function Inbox({ me, onLogout }) {
  const [convs, setConvs] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all'); // all | mine | unassigned
  const [showBc, setShowBc] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const loadUsers = () => api('/users').then(setUsers);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const fileRef = useRef(null);

  const loadConvs = () => api('/conversations').then(setConvs);
  useEffect(() => { loadConvs(); loadUsers(); }, []);

  const shown = convs.filter((c) =>
    filter === 'all' ? true : filter === 'mine' ? c.assignee === me.email : !c.assignee);

  // buka percakapan
  useEffect(() => {
    if (active) api('/messages/' + active).then(setMsgs);
  }, [active]);

  // realtime SSE
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
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_id: active, body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setText('');
    } catch (err) {
      alert('Gagal kirim: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file) => {
    if (!file || !active) return;
    if (file.size > 25 * 1024 * 1024) return alert('Maks 25MB');
    setSending(true);
    try {
      const data = await new Promise((ok) => {
        const r = new FileReader();
        r.onload = () => ok(r.result.split(',')[1]); // buang prefix data:...;base64,
        r.readAsDataURL(file);
      });
      const res = await fetch('/api/send-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wa_id: active, mime: file.type, filename: file.name, data, caption: text || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setText('');
    } catch (err) {
      alert('Gagal kirim file: ' + err.message);
    } finally {
      setSending(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="app">
      <div className="list">
        <div className="topbar">
          <span>💬 {me.name}</span>
          <span>
            {me.is_admin ? <button className="link" onClick={() => setShowUsers(true)}>👤</button> : null}
            <button className="link" onClick={() => setShowBc(true)}>📢</button>
            <button className="link" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); onLogout(); }}>keluar</button>
          </span>
        </div>
        <div className="tabs">
          {[['all', 'Semua'], ['mine', 'Saya'], ['unassigned', 'Belum']].map(([k, label]) => (
            <button key={k} className={filter === k ? 'tab active' : 'tab'} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        {shown.map((c) => (
          <div key={c.wa_id} className={'conv' + (c.wa_id === active ? ' active' : '')} onClick={() => setActive(c.wa_id)}>
            <div className="name">{c.name || c.wa_id}{c.assignee && <span className="who"> · {c.assignee === me.email ? 'saya' : c.assignee.split('@')[0]}</span>}</div>
            <div className="last">{c.last_body}</div>
            <div className="labels">
              {JSON.parse(c.labels || '[]').map((l) => <span key={l} className="chip mini">{l}</span>)}
            </div>
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
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ketik balasan…" />
            <button disabled={sending}>Kirim</button>
          </form>
        </div>
      ) : (
        <div className="empty">Pilih percakapan di kiri.</div>
      )}

      {active && <ContactPanel key={active} waId={active} users={users} onChange={loadConvs} />}
      {showBc && <Broadcast recipients={shown} onClose={() => setShowBc(false)} />}
      {showUsers && <Users me={me} users={users} reload={loadUsers} onClose={() => setShowUsers(false)} />}
    </div>
  );
}

function Users({ me, users, reload, onClose }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const add = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
    });
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setF({ name: '', email: '', password: '' }); setErr(''); reload();
  };
  const del = async (email) => {
    if (!confirm('Hapus ' + email + '?')) return;
    await fetch('/api/users/' + encodeURIComponent(email), { method: 'DELETE' });
    reload();
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>👤 Kelola CS</h2>
        <div className="userlist">
          {users.map((u) => (
            <div key={u.email} className="userrow">
              <span>{u.name} <small>{u.email}</small>{u.is_admin ? ' 👑' : ''}</span>
              {u.email !== me.email && <button className="link" onClick={() => del(u.email)}>hapus</button>}
            </div>
          ))}
        </div>
        <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label>Tambah CS</label>
          <input placeholder="Nama" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input placeholder="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <div className="err" style={{ color: '#c0392b', fontSize: 12 }}>{err}</div>}
          <div className="modal-actions">
            <button className="link" type="button" onClick={onClose}>Tutup</button>
            <button>Tambah</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Broadcast({ recipients, onClose }) {
  const [tpls, setTpls] = useState(null);
  const [sel, setSel] = useState(null);      // template terpilih
  const [params, setParams] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/templates').then((r) => r.json()).then((d) => setTpls(d.error ? [] : d));
  }, []);

  const pick = (t) => { setSel(t); setParams(Array(t.params).fill('')); };
  const preview = sel ? params.reduce((s, p, i) => s.replaceAll(`{{${i + 1}}}`, p || `{{${i + 1}}}`), sel.text) : '';

  const send = async () => {
    setBusy(true);
    const res = await fetch('/api/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sel.name, language: sel.language, params, text: sel.text, wa_ids: recipients.map((c) => c.wa_id) }),
    });
    setResult(await res.json());
    setBusy(false);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>📢 Broadcast ke {recipients.length} kontak</h2>
        {tpls === null && <p>Memuat template…</p>}
        {tpls?.length === 0 && <p style={{ color: '#c0392b' }}>Tidak ada template APPROVED (cek WA_WABA_ID & approval di Meta).</p>}
        {!result && tpls?.length > 0 && (
          <>
            <label>Template</label>
            <select value={sel?.name || ''} onChange={(e) => pick(tpls.find((t) => t.name === e.target.value))}>
              <option value="">— pilih —</option>
              {tpls.map((t) => <option key={t.name + t.language} value={t.name}>{t.name} ({t.language})</option>)}
            </select>
            {sel && params.map((p, i) => (
              <input key={i} placeholder={`Isi {{${i + 1}}}`} value={p}
                onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
            {sel && <div className="preview">{preview}</div>}
            <div className="modal-actions">
              <button className="link" onClick={onClose}>Batal</button>
              <button disabled={!sel || busy} onClick={send}>{busy ? 'Mengirim…' : 'Kirim'}</button>
            </div>
          </>
        )}
        {result && (
          <>
            <p>✅ Terkirim: {result.sent} · ❌ Gagal: {result.failed?.length || 0}</p>
            <div className="modal-actions"><button onClick={onClose}>Tutup</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function Media({ m }) {
  if (!m.media_url) return null;
  const u = m.media_url;
  if (m.type === 'image' || m.type === 'sticker')
    return <a href={u} target="_blank" rel="noreferrer"><img src={u} className="media-img" alt="" /></a>;
  if (m.type === 'audio' || m.type === 'voice') return <audio src={u} controls className="media-audio" />;
  if (m.type === 'video') return <video src={u} controls className="media-img" />;
  return <a href={u} target="_blank" rel="noreferrer">📎 Unduh</a>;
}

function ContactPanel({ waId, users, onChange }) {
  const [c, setC] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tag, setTag] = useState('');

  useEffect(() => {
    fetch('/api/contact/' + waId).then((r) => r.json()).then((d) => setC({ labels: '[]', ...d }));
  }, [waId]);

  const save = async (patch) => {
    const res = await fetch('/api/contact/' + waId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setC({ labels: '[]', ...(await res.json()) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
    onChange();
  };

  if (!c) return <div className="panel" />;
  const labels = JSON.parse(c.labels || '[]');

  return (
    <div className="panel">
      <h2>{c.name || waId}</h2>
      <div className="wa">{waId}</div>

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
          <span key={l} className="chip">{l}
            <button onClick={() => save({ labels: labels.filter((x) => x !== l) })}>×</button>
          </span>
        ))}
      </div>
      <input
        style={{ marginTop: 6 }}
        placeholder="tambah label + Enter"
        value={tag}
        onChange={(e) => setTag(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && tag.trim() && !labels.includes(tag.trim())) {
            save({ labels: [...labels, tag.trim()] });
            setTag('');
          }
        }}
      />

      <label>Catatan</label>
      <textarea defaultValue={c.notes || ''} onBlur={(e) => e.target.value !== (c.notes || '') && save({ notes: e.target.value })} />

      {saved && <div className="saved">✓ tersimpan</div>}
    </div>
  );
}
