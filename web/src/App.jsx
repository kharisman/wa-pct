import React, { useEffect, useState } from 'react';
import Login from './components/Login.jsx';
import Shell from './components/Shell.jsx';
import GlobalLoader from './components/GlobalLoader.jsx';
import PublicForm from './components/PublicForm.jsx';

const formSlug = location.pathname.match(/^\/f\/([\w-]+)/)?.[1];

export default function App() {
  if (formSlug) return <PublicForm slug={formSlug} />;
  return <Main />;
}

function Main() {
  const [me, setMe] = useState(undefined); // undefined=loading, null=belum login
  useEffect(() => {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then(setMe);
  }, []);

  return (
    <>
      <GlobalLoader />
      {me === undefined ? <div className="empty">Memuat…</div>
        : !me ? <Login onLogin={setMe} />
          : <Shell me={me} onLogout={() => setMe(null)} />}
    </>
  );
}
