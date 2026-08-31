import React, { useEffect, useState } from 'react';
import { api, post, patch } from '../api.js';

const CAPS = [
  ['reports', 'Laporan'], ['pipeline_admin', 'Kelola Pipeline'], ['quick', 'Balasan Cepat'],
  ['templates', 'Template'], ['channels', 'Nomor'], ['agents', 'Kelola Agen & Role'], ['settings', 'Pengaturan/AI'],
];

export default function Agents({ me }) {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [nu, setNu] = useState({ name: '', email: '', password: '', role: 'agen', division: '', jabatan: '' });
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(false);
  const [nr, setNr] = useState({ name: '', label: '' });
  const [divisi, setDivisi] = useState([]);
  const [jabatan, setJabatan] = useState([]);
  const [newDiv, setNewDiv] = useState('');
  const [newJab, setNewJab] = useState('');

  const loadMasters = () => { api('/masters/division').then(setDivisi); api('/masters/jabatan').then(setJabatan); };
  const load = () => { api('/users').then(setUsers); api('/roles').then(setRoles); loadMasters(); };
  const addMaster = async (type, name, clear) => { if (!name.trim()) return; await post('/masters', { type, name }); clear(); loadMasters(); };
  const delMaster = async (type, name) => { await fetch('/api/masters/' + type + '/' + encodeURIComponent(name), { method: 'DELETE' }); loadMasters(); };
  useEffect(() => { load(); api('/auto-assign').then((d) => setAuto(d.on)); }, []);
  const toggleAuto = async () => { const on = !auto; setAuto(on); await post('/auto-assign', { on }); };

  const addUser = async (e) => {
    e.preventDefault();
    const res = await post('/users', nu); const d = await res.json();
    if (!res.ok) return setErr(d.error);
    setNu({ name: '', email: '', password: '', role: 'agen', division: '', jabatan: '' }); setErr(''); load();
  };
  const delUser = async (email) => { if (confirm('Hapus ' + email + '?')) { await fetch('/api/users/' + encodeURIComponent(email), { method: 'DELETE' }); load(); } };
  const updUser = async (email, body) => { await patch('/users/' + encodeURIComponent(email), body); load(); };

  // roles
  const roleHas = (r, cap) => r.perms.includes('all') || r.perms.includes(cap);
  const toggleCap = async (r, cap) => {
    if (r.name === 'admin') return; // admin selalu penuh
    const perms = roleHas(r, cap) ? r.perms.filter((p) => p !== cap) : [...r.perms.filter((p) => p !== 'all'), cap];
    await post('/roles', { name: r.name, label: r.label, perms }); load();
  };
  const addRole = async (e) => {
    e.preventDefault();
    const name = nr.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!name) return;
    await post('/roles', { name, label: nr.label || name, perms: [] });
    setNr({ name: '', label: '' }); load();
  };
  const delRole = async (name) => { if (confirm('Hapus role ' + name + '?')) { await fetch('/api/roles/' + name, { method: 'DELETE' }); load(); } };

  return (
    <div className="page">
      <h1 className="page-title">Agen, Role & Divisi</h1>

      <div className="card">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          <b>Auto-assign</b> <span className="muted">— chat baru dibagi rata ke agen otomatis.</span>
        </label>
      </div>

      {/* Daftar agen */}
      <div className="card nopad">
        <table className="tbl">
          <thead><tr><th>Nama</th><th>Role</th><th>Divisi</th><th>Jabatan</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td><b>{u.name}</b><br /><small className="muted">{u.email}</small></td>
                <td>{u.email === me.email ? <span className="role-badge">{u.role || 'admin'}</span> : (
                  <select value={u.role || 'agen'} onChange={(e) => updUser(u.email, { role: e.target.value })} className="mini-select">
                    {roles.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
                  </select>
                )}</td>
                <td>
                  <select className="mini-select" value={u.division || ''} onChange={(e) => updUser(u.email, { division: e.target.value })}>
                    <option value="">—</option>
                    {divisi.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td>
                  <select className="mini-select" value={u.jabatan || ''} onChange={(e) => updUser(u.email, { jabatan: e.target.value })}>
                    <option value="">—</option>
                    {jabatan.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </td>
                <td>{u.email !== me.email && <button className="link" onClick={() => delUser(u.email)}>hapus</button>}</td>
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
            {roles.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
          </select>
          <select value={nu.division} onChange={(e) => setNu({ ...nu, division: e.target.value })}>
            <option value="">Divisi…</option>
            {divisi.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={nu.jabatan} onChange={(e) => setNu({ ...nu, jabatan: e.target.value })}>
            <option value="">Jabatan…</option>
            {jabatan.map((j) => <option key={j} value={j}>{j}</option>)}
          </select>
          <button onClick={addUser}>Tambah</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>

      {/* Master divisi & jabatan */}
      <div className="master-grid">
        <div className="card">
          <h2>Master Divisi</h2>
          <div className="master-list">
            {divisi.map((d) => <span key={d} className="master-chip">{d}<button onClick={() => delMaster('division', d)}>×</button></span>)}
            {divisi.length === 0 && <span className="muted">Belum ada.</span>}
          </div>
          <form className="addrow" onSubmit={(e) => { e.preventDefault(); addMaster('division', newDiv, () => setNewDiv('')); }}>
            <input placeholder="mis. Sales" value={newDiv} onChange={(e) => setNewDiv(e.target.value)} />
            <button>Tambah</button>
          </form>
        </div>
        <div className="card">
          <h2>Master Jabatan</h2>
          <div className="master-list">
            {jabatan.map((j) => <span key={j} className="master-chip">{j}<button onClick={() => delMaster('jabatan', j)}>×</button></span>)}
            {jabatan.length === 0 && <span className="muted">Belum ada.</span>}
          </div>
          <form className="addrow" onSubmit={(e) => { e.preventDefault(); addMaster('jabatan', newJab, () => setNewJab('')); }}>
            <input placeholder="mis. Manager" value={newJab} onChange={(e) => setNewJab(e.target.value)} />
            <button>Tambah</button>
          </form>
        </div>
      </div>

      {/* Kelola role & hak akses */}
      <div className="card nopad">
        <div className="card-head" style={{ padding: '14px 16px 0' }}><h2>Role & Hak Akses</h2></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Role</th>{CAPS.map(([, l]) => <th key={l} style={{ fontSize: 10 }}>{l}</th>)}<th></th></tr></thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.name}>
                  <td><b>{r.label}</b><br /><small className="muted">{r.name}{r.perms.includes('all') ? ' · penuh' : ''}</small></td>
                  {CAPS.map(([cap]) => (
                    <td key={cap} style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={roleHas(r, cap)} disabled={r.name === 'admin'} onChange={() => toggleCap(r, cap)} />
                    </td>
                  ))}
                  <td>{!['admin', 'agen'].includes(r.name) && <button className="link" onClick={() => delRole(r.name)}>hapus</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={addRole} className="addrow" style={{ padding: 14 }}>
          <input placeholder="Nama role (mis. sales)" value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} />
          <input placeholder="Label (mis. Tim Sales)" value={nr.label} onChange={(e) => setNr({ ...nr, label: e.target.value })} />
          <button>Tambah role</button>
        </form>
        <p className="muted" style={{ padding: '0 14px 14px', fontSize: 12 }}>Centang menu yang boleh diakses role. Role <b>admin</b> selalu penuh. Semua role tetap bisa akses Percakapan/Kontak/Pipeline/Broadcast.</p>
      </div>
    </div>
  );
}
