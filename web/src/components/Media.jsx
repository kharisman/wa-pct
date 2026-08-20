import React from 'react';

export default function Media({ m }) {
  if (!m.media_url) return null;
  const u = m.media_url;
  if (m.type === 'image' || m.type === 'sticker')
    return <a href={u} target="_blank" rel="noreferrer"><img src={u} className="media-img" alt="" /></a>;
  if (m.type === 'audio' || m.type === 'voice') return <audio src={u} controls className="media-audio" />;
  if (m.type === 'video') return <video src={u} controls className="media-img" />;
  return <a href={u} target="_blank" rel="noreferrer">📎 Unduh</a>;
}
