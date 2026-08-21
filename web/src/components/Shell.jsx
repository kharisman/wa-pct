import React, { useEffect, useState } from 'react';
import Dashboard from '../pages/Dashboard.jsx';
import Conversations from '../pages/Conversations.jsx';
import Contacts from '../pages/Contacts.jsx';
import Agents from '../pages/Agents.jsx';
import Templates from '../pages/Templates.jsx';
import Settings from '../pages/Settings.jsx';

export default function Shell({ me, onLogout }) {
  const [nav, setNav] = useState('conversations');
  const [active, setActive] = useState(null); // wa_id percakapan terbuka
  const [notif, setNotif] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  // Notifikasi browser saat ada pesan masuk (tab tidak aktif)
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.kind === 'message' && ev.message.direction === 'in' && document.hidden && Notification.permission === 'granted') {
        const n = new Notification('💬 ' + (ev.name || ev.wa_id), { body: ev.message.body, tag: ev.wa_id });
        n.onclick = () => window.focus();
      }
    };
    return () => es.close();
  }, []);

  const askNotif = async () => setNotif(await Notification.requestPermission());

  const items = [
    ['dashboard', '📊', 'Dashboard'],
    ['conversations', '💬', 'Percakapan'],
    ['contacts', '👥', 'Kontak'],
    ...(me.is_admin ? [['agents', '🧑‍💼', 'Agen'], ['templates', '📄', 'Template'], ['settings', '⚙️', 'Setting']] : []),
  ];

  const openChat = (wa) => { setActive(wa); setNav('conversations'); };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">💬 WA CRM</div>
        <nav>
          {items.map(([k, icon, label]) => (
            <button key={k} className={'navitem' + (nav === k ? ' active' : '')} onClick={() => setNav(k)}>
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
        {nav === 'agents' && <Agents me={me} />}
        {nav === 'templates' && <Templates />}
        {nav === 'settings' && <Settings />}
      </main>
    </div>
  );
}
