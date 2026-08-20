# WA CRM (WhatsApp Cloud API)

Inbox real-time: chat masuk lewat webhook Meta, balas langsung dari UI.

## Arsitektur
- `server/` — Express + SQLite bawaan Node (tanpa ORM). Webhook + API + SSE realtime.
- `web/` — React (Vite). Satu halaman: daftar chat, thread, kotak balas.

## Setup

1. **Kredensial Meta.** Buat app di [developers.facebook.com](https://developers.facebook.com) → tambah produk **WhatsApp**. Salin `WA_TOKEN` (System User token permanen) & `WA_PHONE_ID`.
   ```bash
   cp .env.example .env   # isi WA_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN
   ```

2. **Jalankan.**
   ```bash
   npm install && npm run dev        # backend :3000
   cd web && npm install && npm run dev   # frontend :5173
   ```

3. **Daftarkan webhook.** Meta perlu URL publik. Saat dev pakai tunnel:
   ```bash
   npx localtunnel --port 3000   # atau ngrok/cloudflared
   ```
   Di Meta Dashboard → WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<tunnel>/webhook`
   - Verify token: sama dengan `WA_VERIFY_TOKEN`
   - Subscribe field: **messages**

4. Kirim WA ke nomor bisnis → muncul di inbox → balas.

## Produksi
`cd web && npm run build`, lalu `npm start` — backend otomatis serve `web/dist`.

## Sudah ada
- Inbox realtime + balas (SSE), dedup & status pesan.
- Panel kontak: nama, label/tag, catatan per kontak.
- Media inbound: gambar/voice/video/dokumen diunduh & tampil di thread.
- Login multi-agent (sesi cookie) + assign chat ke CS, filter Semua/Saya/Belum.
- Balas pakai media: tombol 📎 kirim gambar/dokumen/video (maks 25MB).
- Broadcast: tombol 📢 kirim approved template ke kontak (isi param, preview, hasil sent/gagal).
- Kelola user: admin (user pertama) tambah/hapus CS lewat tombol 👤. Non-admin tak bisa.

## User / login
Buat **user pertama** (otomatis jadi admin) lewat CLI:
```bash
node server/seed.js admin@kantor.com "Admin" passwordkuat
```
Login pakai email+password itu. Setelah itu tambah CS lain langsung dari UI (tombol 👤).

## Belum dibuat (nyusul saat butuh)
- Broadcast personalisasi (sekarang param sama untuk semua penerima).
- Laporan/statistik & pipeline deal.
- Multi-agent + login, assignment, pipeline, broadcast, laporan.

Cek logika inti: `node server/selfcheck.js`.
