# Persiapan staging dan pemisahan sandbox

Pekerjaan ini menyiapkan konfigurasi dan guard aplikasi; belum membuat proyek
Supabase, menerapkan migrasi ke layanan eksternal, memublikasikan environment,
atau men-deploy aplikasi. Mock dan seed sengaja tetap tersedia untuk testing.

## Mode aplikasi

| Tujuan | Konfigurasi | Perilaku |
|---|---|---|
| Development/test lokal | `VITE_BACKEND_PROVIDER=local` | Mock dan akun demo tetap tersedia. |
| Build demo lokal | Provider local + `VITE_ALLOW_LOCAL_SANDBOX=true` | Opt-in eksplisit; bukan rilis produksi. |
| Staging/produksi | Provider cloud + URL HTTPS dan public key sah | Konfigurasi gagal menghentikan build/initialisasi; tidak fallback ke demo. |

Build tanpa konfigurasi secara default menuntut cloud. Contoh sandbox:

```sh
VITE_BACKEND_PROVIDER=local VITE_ALLOW_LOCAL_SANDBOX=true npm run build
```

Build staging setelah konfigurasi disiapkan:

```sh
npm run build -- --mode staging
```

`JB.env`/`JB_dev.env` hanya menjadi fallback development, bukan build. Tombol
akun demo disembunyikan dalam mode cloud. Mock masih dapat terdapat dalam bundle
karena impor modul yang sudah ada; guard mencegah pemilihannya sebagai fallback,
bukan mengklaim seluruh byte kode mock sudah dibuang. Error bootstrap bukan
layar error kustom yang didesain untuk pengguna.

## Konfigurasi staging yang dibutuhkan

Belum ditemukan binding Supabase atau berkas env aktual dalam lingkungan ini.
Buat proyek Supabase khusus staging yang terpisah dari produksi dan gunakan
akun/data sintetis. Salin `.env.staging.example` menjadi `.env.staging.local`
yang diabaikan Git, atau gunakan pengaturan build CI yang ekuivalen.

Isi URL origin proyek dan PUBLIC publishable key/anon key. Nilai VITE_* masuk
ke JavaScript browser. Jangan gunakan service-role key, sb_secret_, password
DB, atau kredensial administrator pada frontend. Jangan kirim secret di chat.
Validator memeriksa struktur key/role; itu bukan verifikasi signature, izin,
atau konektivitas proyek Supabase.

Tetapkan origin HTTPS staging untuk Auth Site URL dan callback allowlist.
Konfigurasikan konfirmasi email/SMTP serta Google OAuth memakai akun testing.
Batasi redirect URL ke origin staging yang disetujui. Jangan menyalin pengguna
atau data produksi sebagai fixture.

## Database dan kesiapan backend

Tinjau skema sebelum menerapkan migrasi: `supabase/schema.sql` legacy bukan
pengganti langsung skema multi-tenant `001_initial_relaypos_cloud_schema.sql`.
`003_owner_auth_provisioning.sql` mengasumsikan skema multi-tenant dan fungsi
Supabase Auth tersedia. Migrasi 002 memiliki dua berkas bernomor sama dengan
sasaran berbeda; jangan menjalankan glob seluruh SQL tanpa meninjau dependency.

Periksa RLS setiap tabel, grants, trigger yang sudah ada, kepemilikan helper
SECURITY DEFINER dan kebutuhan backfill akun lama. Jangan menganggap provisioning
Owner yang lulus PostgreSQL stub membuktikan seluruh schema ERP siap cloud.
Endpoint undangan staf tepercaya dan klaim reward atomik masih merupakan
prasyarat tersendiri. Lihat dokumen 05 dan 09.

Setelah staging dikonfigurasi, jalankan dua tenant independen, Owner/Admin/Kasir,
dan akun platform yang dibuat lewat jalur administratif tepercaya. Uji:

1. Registrasi dan konfirmasi email, login/logout/refresh, Google callback.
2. Profil hilang atau tidak dapat dibaca tidak menjadi Owner/demo tenant.
3. Akses ID tenant lain melalui baca/ubah/hapus/ekspor ditolak oleh database.
4. Buka shift, transaksi, kas/stok/komisi, void dan rekonsiliasi laporan.
5. Retry dan mutasi paralel, rollback, backup serta pemulihan.

## Docker

Docker memakai Node 24 dan memasang optional native dependencies yang dibutuhkan
Vite/Tailwind. Nginx menyajikan bundle statis. `VITE_*` diteruskan sebagai build
arguments; environment variable pada container Nginx tidak mengubah bundle.

```sh
docker compose --env-file .env.staging.local build
docker compose --env-file .env.staging.local up -d
```

Compose mengikat port ke loopback host pada port 8080 secara default; untuk
akses staging, siapkan reverse proxy HTTPS dengan kebijakan akses yang sesuai.
Tidak ada URL publik yang dibuat oleh perubahan ini. Rebuild image jika nilai
VITE_* berubah. Berkas env/kredensial dan artefak lokal dikecualikan dari context.

Pada managed cloud dengan TLS proxy, berikan CA melalui BuildKit secret
`proxy_ca`; jangan menonaktifkan TLS atau menyalin sertifikat sesi ke image.
Perintah manual menggunakan `docker build --secret id=proxy_ca,src=<CA-path>`
dan build args publik. Pada mesin tanpa proxy, secret CA tidak diperlukan.

## Hasil dan batas verifikasi

Bukti matriks build dan pengujian container disimpan bersama dokumen ini setelah
pemeriksaan selesai. Build dengan key sintetis hanya memverifikasi jalur build,
bukan koneksi/Auth Supabase nyata. Tidak ada uji cloud end-to-end karena proyek
staging belum dikonfigurasi.

`npm audit` pada lockfile saat ini melaporkan 4 advisory: 2 high dan 2 moderate,
terkait Vite, Vitest/@vitest/mocker, dan source-map-js. Advisory berasal dari
pemeriksaan nyata, tetapi exploitability produksi belum diuji. Image Nginx final
tidak menjalankan dev/test server Node. Tinjau/update dependensi dan ulangi tes
sebelum rilis; jangan memakai npm audit fix secara buta atau membuka dev server
ke publik sebagai pengganti deployment staging.

Instruksi install/start environment disimpan sebagai draf agar refresh setup
memakai sandbox opt-in eksplisit. Draf belum dipublikasikan oleh agen. Menyimpan
draf tidak menerapkan konfigurasi ke Supabase atau melakukan deployment.

## Bukti pemeriksaan sesi ini

- 60 berkas / **381 tes lulus**; build sandbox eksplisit berhasil.
- Matriks enam build: semua hasil sesuai ekspektasi (termasuk penolakan konfigurasi salah).
- Browser cloud sintetis tanpa sesi: route finance kembali ke login, kontrol demo tidak ada, refresh tidak otomatis menjadi Owner; request Supabase diblokir pada tes.
- Container sandbox: build, nginx -t, login demo, dashboard, deep-link HTTP 200 dan healthcheck lulus.
- Nginx diperbaiki dari token gzip tidak valid no-proto menjadi no-store.
- Bootstrap/login/getMe/registrasi cloud memerlukan profil otoritatif; error query tidak membentuk tenant demo. Hasil async lama setelah logout tidak memasang ulang identitas.
- Mock engine dan seed tidak berubah. Tidak ada commit/push/deployment dalam pekerjaan ini.

Bukti terstruktur: `qa/2026-10-31-staging/`. Integrasi Supabase nyata tetap terblokir sampai proyek staging dan konfigurasi akses tersedia.
