import React, { useEffect, useRef, useState } from 'react';
import Dashboard from '../pages/Dashboard.jsx';
import Conversations from '../pages/Conversations.jsx';
import Contacts from '../pages/Contacts.jsx';
import Pipeline from '../pages/Pipeline.jsx';
import BroadcastPage from '../pages/BroadcastPage.jsx';
import Agents from '../pages/Agents.jsx';
import Templates from '../pages/Templates.jsx';
import QuickReplies from '../pages/QuickReplies.jsx';
import Reports from '../pages/Reports.jsx';
import Channels from '../pages/Channels.jsx';
import Settings from '../pages/Settings.jsx';
import { api, post } from '../api.js';

// VAPID public key: base64url -> Uint8Array (format yang diminta pushManager.subscribe)
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Shell({ me, onLogout }) {
  const [nav, setNav] = useState('conversations');
  const [active, setActive] = useState(null); // wa_id percakapan terbuka
  const [menuOpen, setMenuOpen] = useState(false);
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [showPw, setShowPw] = useState(false);
  const [pw, setPw] = useState({ old_password: '', new_password: '' });
  const [pwMsg, setPwMsg] = useState('');
  const changePw = async (e) => {
    e.preventDefault();
    const res = await post('/change-password', pw);
    const d = await res.json();
    if (!res.ok) return setPwMsg(d.error);
    setPwMsg('✓ Password diganti'); setPw({ old_password: '', new_password: '' });
    setTimeout(() => { setShowPw(false); setPwMsg(''); }, 1200);
  };
  const activeRef = useRef(active);
  activeRef.current = active;

  // Notifikasi browser saat ada pesan masuk (tab tersembunyi ATAU chat itu tidak sedang dibuka)
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.kind === 'reminder') {
        const open = () => { window.focus(); setActive(ev.wa_id); setNav('conversations'); };
        if (Notification.permission === 'granted') {
          const n = new Notification('⏰ Follow-up: ' + ev.wa_id, { body: ev.note || 'Waktunya hubungi kontak ini', tag: 'rem' + ev.wa_id });
          n.onclick = () => { open(); n.close(); };
        } else alert('⏰ Follow-up: ' + ev.wa_id + (ev.note ? ' — ' + ev.note : ''));
        return;
      }
      if (ev.kind === 'handover') {
        if (Notification.permission === 'granted') {
          const n = new Notification('🙋 Minta admin: ' + (ev.name || ev.wa_id), { body: 'Pelanggan minta bicara ke agen. AI dimatikan untuk chat ini.', tag: 'ho' + ev.wa_id });
          n.onclick = () => { window.focus(); setActive(ev.wa_id); setNav('conversations'); n.close(); };
        }
        return;
      }
      if (ev.kind !== 'message' || ev.message.direction !== 'in') return;
      if (Notification.permission !== 'granted') return;
      if (!document.hidden && ev.wa_id === activeRef.current) return; // lagi buka chat itu → skip
      const n = new Notification('💬 ' + (ev.name || ev.wa_id), { body: ev.message.body, tag: ev.wa_id });
      n.onclick = () => { window.focus(); setActive(ev.wa_id); setNav('conversations'); n.close(); };
    };
    return () => es.close();
  }, []);

  // Registrasi token FCM app Android (native inject token lewat AndroidApp.fcmToken())
  useEffect(() => {
    window.__registerFcm = (token) => { if (token) post('/fcm/register', { token }); };
    try {
      const t = window.AndroidApp && window.AndroidApp.fcmToken && window.AndroidApp.fcmToken();
      if (t) post('/fcm/register', { token: t });
    } catch { /* bukan app Android */ }
    return () => { delete window.__registerFcm; };
  }, []);

  const askNotif = async () => {
    const perm = await Notification.requestPermission();
    setNotif(perm);
    if (perm === 'granted' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          const { key } = await api('/push/vapid-key');
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
        }
        await post('/push/subscribe', sub.toJSON());
      } catch (e) { console.error('push subscribe gagal', e); }
    }
  };

  const can = (c) => me.perms?.includes('all') || me.perms?.includes(c);
  const items = [
    ['dashboard', '📊', 'Dashboard'],
    ['conversations', '💬', 'Percakapan'],
    ['contacts', '👥', 'Kontak'],
    ['pipeline', '🎯', 'Pipeline'],
    ['broadcast', '📢', 'Broadcast'],
    ...(can('reports') ? [['reports', '📈', 'Laporan']] : []),
    ...(can('agents') ? [['agents', '🧑‍💼', 'Agen']] : []),
    ...(can('templates') ? [['templates', '📄', 'Template']] : []),
    ...(can('quick') ? [['quick', '⚡', 'Balasan Cepat']] : []),
    ...(can('channels') ? [['channels', '📱', 'Nomor']] : []),
    ...(can('settings') ? [['settings', '⚙️', 'Setting']] : []),
  ];

  const openChat = (wa) => { setActive(wa); setNav('conversations'); };

  return (
    <div className="shell">
      {!(nav === 'conversations' && active) && <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Menu">☰</button>}
      {menuOpen && <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <div className="brand">💬 WA CRM</div>
        <nav>
          {items.map(([k, icon, label]) => (
            <button key={k} className={'navitem' + (nav === k ? ' active' : '')} onClick={() => { setNav(k); setMenuOpen(false); }}>
              <span className="ic">{icon}</span> {label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">{me.name}{me.is_admin ? ' 👑' : ''}</div>
          {notif !== 'granted' && notif !== 'unsupported' && (
            <button className="link" onClick={askNotif} style={{ display: 'block', marginBottom: 6 }}>🔔 Aktifkan notifikasi</button>
          )}
          <button className="link" onClick={() => { setShowPw(true); setPwMsg(''); }} style={{ display: 'block', marginBottom: 6 }}>🔑 Ganti password</button>
          <button className="link" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); onLogout(); }}>Keluar</button>
        </div>
      </aside>

      {showPw && (
        <div className="modal-bg" onClick={() => setShowPw(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={changePw}>
            <h2>🔑 Ganti password</h2>
            <input type="password" required placeholder="Password lama" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }} />
            <input type="password" required minLength={6} placeholder="Password baru (min 6)" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }} />
            {pwMsg && <div className={pwMsg.startsWith('✓') ? 'saved' : 'err'}>{pwMsg}</div>}
            <div className="modal-actions">
              <button type="button" className="link" onClick={() => setShowPw(false)}>Batal</button>
              <button>Simpan</button>
            </div>
          </form>
        </div>
      )}

      <main className="content">
        {nav === 'dashboard' && <Dashboard onOpen={openChat} setNav={setNav} />}
        {nav === 'conversations' && <Conversations me={me} active={active} setActive={setActive} />}
        {nav === 'contacts' && <Contacts onOpen={openChat} />}
        {nav === 'pipeline' && <Pipeline me={me} onOpen={openChat} />}
        {nav === 'broadcast' && <BroadcastPage />}
        {nav === 'reports' && <Reports />}
        {nav === 'agents' && <Agents me={me} />}
        {nav === 'templates' && <Templates />}
        {nav === 'quick' && <QuickReplies />}
        {nav === 'channels' && <Channels />}
        {nav === 'settings' && <Settings />}
      </main>
    </div>
  );
}
