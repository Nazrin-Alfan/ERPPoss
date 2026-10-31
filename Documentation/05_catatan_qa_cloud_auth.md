# Catatan QA autentikasi cloud dan mock testing

## Mock yang sengaja dipertahankan

Sesuai keputusan pemilik proyek sebelum rilis, seluruh kode mock lokal tetap
dipertahankan untuk testing. `localDbEngine.auth.signInWithOAuth` menerima email
simulasi dan dapat memakai profil lokal yang sudah ada tanpa membuktikan identitas
Google. Ini **bukan OAuth nyata** dan tidak boleh dianggap sebagai bukti keamanan
autentikasi atau dipakai untuk melindungi data produksi. Akun demo dan sesi lokal
juga tetap tersedia. Tinjau kembali batasan ini sebelum rilis; jangan menghapusnya
sebagai bagian dari pekerjaan QA ini.

## Perubahan cloud

- Perubahan password memverifikasi akun aktif dan password lama sebelum meminta
  pembaruan ke Supabase. Kegagalan verifikasi menghentikan pembaruan.
- Pendaftaran Owner yang membutuhkan konfirmasi email tidak membuat sesi login
  semu atau mencoba membaca profil tanpa sesi yang sah.
- Migrasi `supabase/migrations/003_owner_auth_provisioning.sql` menyediakan
  provisioning tenant, cabang, dan profil secara atomik melalui trigger database.
  Metadata pengguna tidak boleh memberikan peran istimewa atau memilih tenant
  milik akun lain.

## Penerapan

Migrasi ditujukan untuk skema multi-tenant
`001_initial_relaypos_cloud_schema.sql`, bukan untuk diterapkan langsung pada
skema legacy `supabase/schema.sql` tanpa penyesuaian. Tinjau skema, trigger,
policy RLS yang sudah ada, dan akun lama di staging sebelum menerapkannya.
Jalankan migrasi menggunakan peran migrasi database; jangan memasukkan service
role key ke frontend. Migrasi tidak diterapkan otomatis ke Supabase produksi.

Pendaftaran staf ke tenant yang sudah ada memerlukan backend tepercaya yang
menggunakan Auth Admin API dan metadata aplikasi yang dikendalikan server.
Metadata pendaftaran publik bukan izin untuk menambahkan staf ke tenant lain.
Uji konfigurasi email, callback Google, sesi baru, dan onboarding pada Supabase
staging sebelum menyatakan integrasi cloud siap rilis. Pengujian adapter dengan
mock Supabase tidak membuktikan konfigurasi layanan tersebut sudah benar.

### Detail provisioning dan otorisasi

Migrasi mengganti `handle_new_user_profile` dan trigger
`trg_on_auth_user_created`. Signup Owner membuat tenant sendiri, cabang `MAIN`,
dan profil `Owner` dalam transaksi insert pengguna Auth yang sama; kegagalan
menggagalkan seluruh provisioning. Signup email wajib menyertakan nama toko;
signup Google memakai nama toko default ketika metadata formulir tidak tersedia.

Helper `current_tenant_id`, `current_branch_id`, dan `current_user_role` membaca
profil otoritatif berdasarkan `auth.uid()`, bukan metadata pengguna atau klaim
role JWT yang dapat kedaluwarsa. Helper memakai `SECURITY DEFINER` untuk
menghindari rekursi RLS profil dan harus dimiliki peran migrasi tepercaya yang
bisa melewati RLS profil. Tidak perlu custom JWT hook untuk helper ini.

Undangan staf tepercaya memakai `app_metadata.tenant_id`, `branch_id`, dan
`erp_role` (`Owner`, `Admin`, atau `Kasir`) melalui Auth Admin API. Trigger
memastikan cabang milik tenant yang ditentukan. Jalur browser
`registerKasir` saat ini belum menggantikan endpoint undangan berprivilege ini.

Sebelum deployment, tinjau seluruh policy RLS tabel aplikasi: migrasi baru hanya
menambahkan policy baca profil sendiri serta tenant dan cabang terkait. Cadangkan
database target dan verifikasi akun lama; migrasi tidak melakukan backfill akun
Auth lama yang belum mempunyai profil multi-tenant.

## Bukti pengujian PostgreSQL

Harness `supabase/tests/owner_auth_provisioning.sql` telah dijalankan pada
PostgreSQL 16 (`postgres:16-alpine`) dalam container lokal terisolasi tanpa port
publik. Harness memuat migrasi `001`, lalu menerapkan `003` **dua kali** untuk
memeriksa penerapan ulang. Semua kelompok pemeriksaan lulus:

- Tenant, cabang, dan profil Owner terbentuk dengan relasi yang sesuai.
- Metadata pengguna tidak dapat memilih tenant lain atau memperoleh Super Admin.
- Signup tidak valid dan kegagalan insert profil di tahap akhir membatalkan
  seluruh perubahan pengguna, tenant, serta cabang.
- Provisioning Owner Google dan undangan staf melalui metadata server berhasil;
  undangan cabang lintas tenant ditolak.
- Role `authenticated` hanya membaca tenant, cabang, dan profil sendiri;
  metadata JWT yang dipalsukan tidak mengganti profil otoritatif.

Untuk mengulangi pada PostgreSQL lokal, gunakan **database kosong sekali pakai**:

```sh
createdb erpposs_qa_owner
psql -v ON_ERROR_STOP=1 -d erpposs_qa_owner -f supabase/tests/owner_auth_provisioning.sql
dropdb erpposs_qa_owner
```

Lihat `supabase/tests/README.md` untuk penggunaan container. Hasil sukses berakhir
dengan `ALL OWNER AUTH SQL CHECKS PASSED`. Harness meniru tabel pengguna dan
helper JWT Supabase; hasil ini menguji SQL PostgreSQL dan RLS, bukan layanan
HTTP Supabase Auth, pengiriman email, atau callback OAuth nyata.
