# Prasyarat endpoint klaim reward cloud

`crmService.redeemCustomerReward` menggunakan RPC `redeem_customer_reward`
untuk klien non-lokal. Repositori ini belum menyediakan implementasi/migrasi RPC
tersebut dan tidak mendefinisikan skema CRM cloud yang lengkap. Ketiadaannya
merupakan blocker untuk klaim reward cloud, bukan alasan memasukkan service-role
key atau menulis klaim langsung dari browser.

Parameter: `p_tenant_id`, `p_plat` (huruf besar, tanpa whitespace),
`p_reward_title`, `p_notes`, `p_nama_pelanggan`, `p_reward_type`, `p_id_struk`.
Respons sukses harus berisi `redemption_id` non-kosong dari transaksi yang sudah
commit, sebagai objek atau baris pertama array. Respons kosong/error ditolak.

Implementasi server wajib:

1. Memverifikasi identitas, izin role, keanggotaan tenant dan cabang dari sumber
   tepercaya; tenant dari parameter bukan izin akses.
2. Mengunci entitlement berdasarkan tenant dan plat di database, membaca ulang
   program aktif, kunjungan lunas/tidak dibatalkan, serta klaim terdahulu dalam
   transaksi yang sama. Normalisasi plat identik pada pencarian dan penguncian.
3. Memeriksa jumlah reward tersedia dan membuat tepat satu konsumsi; ulang/retry
   request atau konkurensi tidak boleh memakai entitlement yang sama dua kali.
   Tetapkan kontrak idempotency dan unique constraint saat skema cloud disiapkan.
4. Menolak error baca, target tidak valid, program nonaktif, dan saldo stamp tidak
   cukup tanpa membuat log. Audit harus mempertahankan referensi transaksi.
5. Membatasi jalur INSERT/UPDATE langsung pada log sehingga RPC tidak dapat
   dilewati melalui REST/table API. Uji RLS dan rollback dengan dua tenant.

Checkout yang memakai reward memerlukan endpoint gabungan atomik: simpan nota,
item, efek kas/stok, dan konsumsi entitlement dalam transaksi yang sama. Selama
endpoint itu belum tersedia, UI/handler checkout reward sengaja diblokir; RPC
klaim terpisah saja tidak cukup untuk mengaktifkannya kembali.

Pengujian wajib di staging: entitlement nol/satu/lebih, klaim berulang,
permintaan paralel, kegagalan sebelum commit, ID tenant/nota palsu, void/refund,
serta respons sukses yang konsisten dengan keadaan database. Kebijakan untuk
kunjungan historis tanpa ID nota harus diputuskan sebelum migrasi produksi;
mode lokal mempertahankan dukungan impor historis tersebut untuk testing.
