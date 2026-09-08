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

## Belum termasuk (tambah kalau perlu)
- **Push notification native (FCM)** — WebView tak jalankan Web Push. Perlu integrasi
  Firebase + endpoint kirim FCM. Sekarang notif hanya jalan saat app/web dibuka.
- **APK release + signing** — sekarang cuma debug. Untuk distribusi butuh keystore.
