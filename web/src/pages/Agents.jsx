import React, { useEffect, useState } from 'react';
import { api, post } from '../api.js';

export default function Agents({ me }) {
  const [users, setUsers] = useState([]);
  const [nu, setNu] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(false);
  const load = () => api('/users').then(setUsers);
  useEffect(() => { load(); api('/auto-assign').then((d) => setAuto(d.on)); }, []);
  const toggleAuto = async () => { const on = !auto; setAuto(on); await post('/auto-assign', { on }); };

  const add = async (e) => {
    e.preventDefault();
    const res = await post('/users', nu);
    const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setNu({ name: '', email: '', password: '' }); setErr(''); load();
  };
  const del = async (email) => {
    if (!confirm('Hapus ' + email + '?')) return;
    await fetch('/api/users/' + encodeURIComponent(email), { method: 'DELETE' }); load();
  };

  return (
    <div className="page">
      <h1 className="page-title">Agen (CS / Office)</h1>
      <div className="card">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          <b>Auto-assign</b> <span className="muted">— chat baru dibagi rata ke agen (round-robin) otomatis.</span>
        </label>
      </div>
      <div className="card">
        <div className="userlist">
          {users.map((u) => (
            <div key={u.email} className="userrow">
              <span>{u.name} <small>{u.email}</small>{u.is_admin ? ' 👑' : ''}</span>
              {u.email !== me.email && <button className="link" onClick={() => del(u.email)}>hapus</button>}
            </div>
          ))}
        </div>
        <form onSubmit={add} className="addrow">
          <input placeholder="Nama" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <input placeholder="Email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input placeholder="Password" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
          <button>Tambah</button>
        </form>
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
