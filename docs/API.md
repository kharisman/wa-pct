# API — Akses dengan API Key

Semua endpoint di bawah `/api` bisa diakses dari luar (mis. **app Android**) memakai
**API key**, tanpa perlu login cookie. Cocok untuk klien non-browser.

> **Dokumentasi interaktif (Scalar):** buka **`/docs`** di server
> (mis. `https://crm.palcomtech.ac.id/docs`) — bisa coba request langsung dari browser.
> Spec OpenAPI mentah ada di `/openapi.json`.

## 1. Buat key

Dashboard → **Pengaturan → 🔑 API Key** → isi nama (mis. `App Android`) → **Buat key**.
Key muncul di tabel dan bisa disalin. Buat sebanyak yang perlu; hapus kapan saja
(app yang memakai key itu langsung kehilangan akses).

> Key = **akses penuh** (setara admin). Simpan rahasia; jangan taruh di kode klien
> yang bisa dibongkar. Kalau bocor, hapus dan buat baru.

## 2. Dua cara autentikasi

Tanpa salah satu di bawah, semua endpoint balas **401**.

**A. Login user (disarankan untuk app yang tiap orang punya akun)**
POST `/login` dengan email+password → dapat `token`. Pakai token itu di header
request berikutnya. Akses mengikuti role user.

```bash
# 1) login
curl -X POST https://crm.palcomtech.ac.id/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@x.com","password":"rahasia"}'
# -> { "email": "...", "name": "...", "token": "abcd1234..." }

# 2) pakai token
curl -H "Authorization: Bearer abcd1234..." https://crm.palcomtech.ac.id/api/conversations
```

**B. API key statis (akses penuh, buat integrasi/mesin)**
```
X-API-Key: wak_xxxxxxxxxxxxxxxxxxxxxxxx
```

Base URL: `https://crm.palcomtech.ac.id/api`

## 3. Contoh

### curl
```bash
# daftar percakapan
curl -H "X-API-Key: wak_xxx" https://crm.palcomtech.ac.id/api/conversations

# kirim pesan (hanya dalam window 24 jam sejak pesan terakhir user)
curl -X POST https://crm.palcomtech.ac.id/api/send \
  -H "X-API-Key: wak_xxx" -H "Content-Type: application/json" \
  -d '{"wa_id":"628123456789","body":"Halo kak"}'
```

### Android (Kotlin + OkHttp)
```kotlin
val KEY = "wak_xxxxxxxxxxxxxxxxxxxxxxxx"   // ambil dari storage aman, jangan hardcode
val client = OkHttpClient()

// GET daftar percakapan
val req = Request.Builder()
    .url("https://crm.palcomtech.ac.id/api/conversations")
    .header("X-API-Key", KEY)
    .build()
client.newCall(req).execute().use { println(it.body?.string()) }

// POST kirim pesan
val json = """{"wa_id":"628123456789","body":"Halo kak"}"""
val post = Request.Builder()
    .url("https://crm.palcomtech.ac.id/api/send")
    .header("X-API-Key", KEY)
    .post(json.toRequestBody("application/json".toMediaType()))
    .build()
client.newCall(post).execute().use { println(it.body?.string()) }
```

## 4. Endpoint yang sering dipakai

| Method | Path | Keterangan |
|--------|------|-----------|
| POST | `/login` | Login → `{ token }`. Tanpa auth |
| POST | `/logout` | Hapus token aktif |
| GET  | `/me` | Profil user dari token |
| GET  | `/conversations` | Daftar chat + pesan terakhir |
| GET  | `/messages/:waId` | Pesan 1 chat (10 terbaru). `?before=<id>` untuk muat lama |
| POST | `/send` | Kirim teks. Body: `{ wa_id, body }` |
| POST | `/note` | Catatan internal (tak dikirim ke WA). Body: `{ wa_id, body }` |
| POST | `/send-media` | Kirim media |
| GET  | `/contact/:waId` | Detail kontak |
| PATCH| `/contact/:waId` | Ubah kontak (label, assignee, stage, dll) |
| POST | `/ai-suggest` | Minta draft balasan AI. Body: `{ wa_id }` |
| GET  | `/stats` | Ringkasan angka |
| GET  | `/templates` | Daftar template WA |
| POST | `/send-template` | Kirim template (untuk di luar window 24 jam) |

Balasan selalu JSON. Kode status: `401` key salah/tidak ada, `403` akses ditolak,
`400` body kurang, `502` gagal ke WhatsApp.

## 5. Kelola key via API (khusus admin, butuh login/cookie admin)

| Method | Path | |
|--------|------|--|
| GET    | `/keys` | daftar key |
| POST   | `/keys` | buat, body `{ label }` → `{ key }` |
| DELETE | `/keys/:key` | hapus |

## Catatan

- **Realtime**: web pakai `GET /api/stream` (SSE). Untuk Android, polling
  `/conversations` / `/messages/:waId` sudah cukup; push realtime via SSE bisa
  ditambah nanti kalau perlu.
- **Window 24 jam**: `/send` teks bebas hanya jalan ≤24 jam sejak pesan terakhir
  pelanggan (aturan WhatsApp). Di luar itu pakai `/send-template`.
