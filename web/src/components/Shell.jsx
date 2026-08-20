import React, { useState } from 'react';
import Dashboard from '../pages/Dashboard.jsx';
import Conversations from '../pages/Conversations.jsx';
import Contacts from '../pages/Contacts.jsx';
import Agents from '../pages/Agents.jsx';
import Settings from '../pages/Settings.jsx';

export default function Shell({ me, onLogout }) {
  const [nav, setNav] = useState('conversations');
  const [active, setActive] = useState(null); // wa_id percakapan terbuka

  const items = [
    ['dashboard', '📊', 'Dashboard'],
    ['conversations', '💬', 'Percakapan'],
    ['contacts', '👥', 'Kontak'],
    ...(me.is_admin ? [['agents', '🧑‍💼', 'Agen'], ['settings', '⚙️', 'Setting']] : []),
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
          <button className="link" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); onLogout(); }}>Keluar</button>
        </div>
      </aside>

      <main className="content">
        {nav === 'dashboard' && <Dashboard onOpen={openChat} setNav={setNav} />}
        {nav === 'conversations' && <Conversations me={me} active={active} setActive={setActive} />}
        {nav === 'contacts' && <Contacts onOpen={openChat} />}
        {nav === 'agents' && <Agents me={me} />}
        {nav === 'settings' && <Settings />}
      </main>
    </div>
  );
}
