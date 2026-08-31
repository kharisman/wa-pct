# WA CRM — WhatsApp CRM (PalComTech)

CRM WhatsApp resmi berbasis **WhatsApp Cloud API**. Terima & balas chat dari banyak nomor dalam satu inbox, dengan pipeline, broadcast, AI, laporan, dan manajemen tim.

**Live:** https://crm.palcomtech.ac.id

---

## Fitur

### Percakapan
- Inbox realtime (SSE) — terima chat, balas manual (teks, gambar, voice, video, dokumen).
- **Multi-nomor** — chat masuk dirouting ke nomor yang menerima; balasan otomatis lewat nomor yang benar.
- Pencarian + filter (tab, nomor, tanggal) + muat lebih banyak.
- **SLA timer** — chat belum dibalas >15 menit ditandai + filter "Perlu dibalas".
- Catatan internal (tidak terkirim ke pelanggan) & jejak pengirim (agen/AI).
- Pagination pesan (muat 50 + muat lama).

### AI (Asisten)
- Balas draft dengan tombol 🤖 atau **AI otomatis per nomor** (bot 24 jam).
- **Peran**, **Funnel bertahap** (kartu langkah), dan **Knowledge** (kartu fakta) — jawaban presisi, tidak mengarang.
- **Handover** — kalau pelanggan minta admin, AI kirim pesan alih & berhenti; tombol balikin AI di header chat.
- Output dirapikan gaya WhatsApp (tanpa markdown/tabel).

### Template & Broadcast
- Buat template (body, footer, tombol Quick Reply/URL/Telepon, header teks/gambar) — kirim ke Meta untuk approval.
- **Variabel dinamis** `{{n}}` di body & tombol URL — sumber nilai: Nama kontak / Nomor / teks manual (per penerima).
- Gambar header default tersimpan → otomatis ikut saat kirim.
- **Broadcast** (menu sendiri): filter penerima (nomor/label/tahap), pilih/kecualikan kontak, preview, kirim.
- Buat template untuk semua nomor sekaligus.

### Pipeline
- Kanban multi-pipeline custom (nama + tahap sendiri), drag antar tahap.
- Tahap kontak juga bisa diatur dari panel kontak.

### Kontak
- Tabel + pencarian + filter periode tanggal + pagination + **export CSV**.
- Label, catatan, assignee, follow-up terjadwal (pengingat + notifikasi).

### Tim & Hak Akses
- **Role custom** — centang menu yang boleh diakses tiap role (Admin/Supervisor/Agen + role buatan sendiri).
- **Master Divisi & Jabatan** — dipilih via dropdown.
- Auto-assign round-robin chat baru ke agen.

### Laporan
- Kinerja agen (balasan 24 jam/total, kontak dipegang) + corong pipeline per tahap.

### Lain-lain
- Notifikasi browser saat pesan masuk / handover / follow-up jatuh tempo.
- Indikator loading global, desain responsif (drawer di HP), tema PalComTech (navy + kuning).
- Pengaturan per-tab: Koneksi / Asisten AI / Otomatis.

---

## Arsitektur

- **Backend:** Node.js + Express (`server/`). Webhook Cloud API, REST API, SSE realtime.
- **Frontend:** React + Vite (`web/`), komponen per file (`web/src/components`, `web/src/pages`).
- **Database:** Supabase (PostgreSQL) via `pg`.
- **Media:** AWS S3 (fallback disk lokal) — `server/store.js`.
- **AI:** DeepSeek Chat API — `server/ai.js`.
- Kredensial WA & AI disimpan di DB (tabel `settings`), diubah dari UI (menu Setting/Nomor) tanpa edit file.

### Struktur
```
server/  index.js (API+webhook) · db.js · auth.js · config.js · wa.js · store.js · ai.js
web/     src/App.jsx · components/ · pages/
```

---

## Setup lokal

```bash
cp .env.example .env    # isi DATABASE_URL, PORT (WA/AI keys via UI/DB)
npm install && npm run dev          # backend :3000
cd web && npm install && npm run dev  # frontend :5173
node server/seed.js admin@x.com "Admin" password   # buat admin pertama
```

`.env` minimal (produksi): `DATABASE_URL` (Supabase **pooler** IPv4), `PORT`, dan kredensial AWS S3 bila dipakai. Kredensial WA & AI diisi lewat menu **Setting** / **Nomor** (tersimpan di DB).

## Deploy (EC2 + Caddy)

```bash
git clone https://github.com/kharisman/wa-pct.git ~/wa-crm && cd ~/wa-crm
npm install && cd web && npm install && npm run build && cd ..
# set .env (DATABASE_URL pooler, PORT, AWS_*)
pm2 start server/index.js --name wa-crm && pm2 save
# Caddy: reverse_proxy localhost:3000 dengan domain (auto-SSL)
```
Update: `git pull && npm install && cd web && npm run build && cd .. && pm2 restart wa-crm`.

Webhook Meta → Callback URL `https://<domain>/webhook`, subscribe field **messages**. Isi **App Secret** di Setting untuk verifikasi tanda tangan webhook.

---

## Keamanan
- Verifikasi tanda tangan webhook (`x-hub-signature-256`) via App Secret.
- Semua endpoint di belakang login; endpoint sensitif dijaga per-capability (role).
- Query parameterized, password scrypt, sesi httpOnly, media anti path-traversal, secret dimask di UI.

## Catatan WhatsApp
- Kirim teks bebas hanya dalam 24 jam sejak pelanggan chat; di luar itu pakai **template** (aturan Meta).
- Template/marketing butuh **payment method** aktif di WABA — tanpa itu pesan "accepted" tapi tidak terkirim.
