import React, { useEffect, useState } from 'react';
import { onLoading } from '../api.js';

// Bar tipis di atas + spinner kecil di pojok saat ada proses berjalan.
export default function GlobalLoader() {
  const [loading, setLoading] = useState(false);
  useEffect(() => onLoading(setLoading), []);
  if (!loading) return null;
  return (
    <>
      <div className="gloader-bar" />
      <div className="gloader-spin"><span className="spinner" /> memproses…</div>
    </>
  );
}
