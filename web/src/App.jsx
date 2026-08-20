import React, { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';

export default function App() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=belum login
  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe);
  }, []);

  if (me === undefined) return <div className="empty">Memuat…</div>;
  if (!me) return <Login onLogin={setMe} />;
  return <Shell me={me} onLogout={() => setMe(null)} />;
}
