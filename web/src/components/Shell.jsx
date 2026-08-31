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

export default function Shell({ me, onLogout }) {
  const [nav, setNav] = useState('conversations');
  const [active, setActive] = useState(null); // wa_id percakapan terbuka
  const [menuOpen, setMenuOpen] = useState(false);
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
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

  const askNotif = async () => setNotif(await Notification.requestPermission());

  const items = [
    ['dashboard', '📊', 'Dashboard'],
    ['conversations', '💬', 'Percakapan'],
    ['contacts', '👥', 'Kontak'],
    ['pipeline', '🎯', 'Pipeline'],
    ['broadcast', '📢', 'Broadcast'],
    ...(me.is_admin ? [['reports', '📈', 'Laporan'], ['agents', '🧑‍💼', 'Agen'], ['templates', '📄', 'Template'], ['quick', '⚡', 'Balasan Cepat'], ['channels', '📱', 'Nomor'], ['settings', '⚙️', 'Setting']] : []),
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
          <button className="link" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); onLogout(); }}>Keluar</button>
        </div>
      </aside>

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
