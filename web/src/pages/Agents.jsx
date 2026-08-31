import React, { useEffect, useState } from 'react';
import { api, post, patch } from '../api.js';

const ROLES = [['admin', 'Admin'], ['supervisor', 'Supervisor'], ['agen', 'Agen']];

export default function Agents({ me }) {
  const [users, setUsers] = useState([]);
  const [nu, setNu] = useState({ name: '', email: '', password: '', role: 'agen', division: '', jabatan: '' });
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
    setNu({ name: '', email: '', password: '', role: 'agen', division: '', jabatan: '' }); setErr(''); load();
  };
  const del = async (email) => { if (confirm('Hapus ' + email + '?')) { await fetch('/api/users/' + encodeURIComponent(email), { method: 'DELETE' }); load(); } };
  const upd = async (email, patchBody) => { await patch('/users/' + encodeURIComponent(email), patchBody); load(); };

  return (
    <div className="page">
      <h1 className="page-title">Agen & Divisi</h1>

      <div className="card">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          <b>Auto-assign</b> <span className="muted">— chat baru dibagi rata ke agen (round-robin) otomatis.</span>
        </label>
      </div>

      <div className="card nopad">
        <table className="tbl">
          <thead><tr><th>Nama</th><th>Role</th><th>Divisi</th><th>Jabatan</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td><b>{u.name}</b><br /><small className="muted">{u.email}</small></td>
                <td>
                  {u.email === me.email ? <span className="role-badge">{u.role || 'admin'}</span> : (
                    <select value={u.role || 'agen'} onChange={(e) => upd(u.email, { role: e.target.value })} className="mini-select">
                      {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                </td>
                <td><input className="mini-input" defaultValue={u.division || ''} placeholder="—" onBlur={(e) => e.target.value !== (u.division || '') && upd(u.email, { division: e.target.value })} /></td>
                <td><input className="mini-input" defaultValue={u.jabatan || ''} placeholder="—" onBlur={(e) => e.target.value !== (u.jabatan || '') && upd(u.email, { jabatan: e.target.value })} /></td>
                <td>{u.email !== me.email && <button className="link" onClick={() => del(u.email)}>hapus</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Tambah agen</h2>
        <div className="addrow">
          <input placeholder="Nama" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
          <input placeholder="Email" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
          <input placeholder="Password" type="password" value={nu.password} onChange={(e) => setNu({ ...nu, password: e.target.value })} />
        </div>
        <div className="addrow" style={{ marginTop: 8 }}>
          <select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}>
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="Divisi (mis. Sales)" value={nu.division} onChange={(e) => setNu({ ...nu, division: e.target.value })} />
          <input placeholder="Jabatan (mis. Staff)" value={nu.jabatan} onChange={(e) => setNu({ ...nu, jabatan: e.target.value })} />
          <button onClick={add}>Tambah</button>
        </div>
        {err && <div className="err">{err}</div>}
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Role <b>Admin</b> = akses penuh (semua menu). <b>Supervisor</b> & <b>Agen</b> = akses percakapan/kontak/pipeline. Divisi & jabatan untuk pengelompokan tim.</p>
      </div>
    </div>
  );
}
