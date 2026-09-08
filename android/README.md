# App Android — PalComTech CRM (WebView)

App tipis yang memuat `https://crm.palcomtech.ac.id` di dalam WebView. UI ikut web
otomatis (web sudah PWA responsif), jadi tak perlu bangun ulang layar native.

Fitur wrapper:
- Cookie & `localStorage` aktif → login tetap tersimpan.
- Tombol **Back** = mundur di riwayat halaman dulu.
- Upload file (`<input type=file>`) untuk lampiran gambar/dokumen.
- `tel:` / `mailto:` dibuka aplikasi lain.

## Build lokal
Butuh Android Studio (atau JDK 17 + Android SDK 34).
```bash
cd android
./gradlew assembleDebug        # hasil: app/build/outputs/apk/debug/app-debug.apk
```
Ganti URL server di `app/src/main/res/values/strings.xml` (`crm_url`).

## CircleCI (build APK debug otomatis)
Config: [`.circleci/config.yml`](../.circleci/config.yml).

Aktifkan sekali:
1. Buka https://app.circleci.com → **Projects** → pilih repo `kharisman/wa-pct` → **Set Up Project**.
2. Pilih *"Fastest — use the .circleci/config.yml in my repo"* → branch `main`.
3. Tiap push, job **build-debug-apk** jalan. APK ada di tab **Artifacts** (`app-debug.apk`) — bisa langsung di-download & install ke HP (aktifkan "Install unknown apps").

## Notifikasi pesan masuk (FCM) — setup Firebase
Notif tetap masuk walau app ditutup, dipicu dari webhook WhatsApp di server.

**1. Buat project Firebase** → https://console.firebase.google.com → Add app → **Android**
- Package name: `id.ac.palcomtech.crm`
- Download **`google-services.json`**.

**2. Taruh `google-services.json`**
- Build lokal: simpan di `android/app/google-services.json` (file ini di-.gitignore, jangan commit).
- CircleCI: `base64 -w0 google-services.json` → simpan hasilnya sebagai env var
  **`GOOGLE_SERVICES_JSON_BASE64`** di Project Settings → Environment Variables.
  CI otomatis menuliskannya sebelum build.

**3. Service account buat server kirim FCM**
- Firebase Console → ⚙️ Project settings → **Service accounts** → *Generate new private key* → download JSON.
- Di server, set env **`FCM_SERVICE_ACCOUNT_JSON`** = seluruh isi JSON itu (satu baris), lalu restart:
  ```
  pm2 restart wa-crm
  ```
- Server akan aktif otomatis: log `FCM aktif untuk project ...`.

Alur: app minta izin notifikasi → simpan FCM token → web (setelah login) daftarkan token
lewat `POST /api/fcm/register` → saat webhook pesan masuk, server kirim FCM ke semua device.

## Belum termasuk
- **APK release + signing** — sekarang cuma debug. Untuk distribusi butuh keystore.
- Deep-link tap notif langsung ke chat terkait (sekarang tap = buka app).
