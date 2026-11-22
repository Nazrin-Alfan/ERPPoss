import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Printer,
  Search,
  ShieldCheck,
  ShoppingCart,
  CreditCard,
  Receipt,
  Car,
  Boxes,
  FileSpreadsheet,
  Building2,
  CheckCircle2,
  AlertTriangle,
  LogIn,
  ChevronRight
} from 'lucide-react'

const ROLE_FILTERS = [
  { id: 'ALL', label: 'Semua Peran' },
  { id: 'OWNER', label: 'Owner / Pemilik' },
  { id: 'ADMIN', label: 'Admin & Keuangan' },
  { id: 'KASIR', label: 'Kasir & Operator' }
]

const ROLE_BADGE_STYLES = {
  OWNER: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  ADMIN: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  KASIR: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
}

const CHAPTERS = [
  {
    id: 'bab-1',
    number: '01',
    title: 'Bab 1: Pendaftaran Toko Baru, Onboarding Wizard & Beta Gratis 30 Hari',
    roles: ['OWNER'],
    icon: ShieldCheck,
    screenshot: '/screenshots/executive-dashboard.png',
    screenshotCaption: 'Tampilan Dashboard Eksekutif setelah aktivasi outlet dan onboarding awal.',
    summary:
      'Panduan awal bagi Owner mendaftarkan outlet baru, memilih mode bisnis (Cafe, Carwash, atau Hybrid), dan memulai masa uji coba beta 30 hari gratis.',
    steps: [
      'Buka halaman Daftar Toko Baru (/login?mode=register) melalui tombol "Coba Gratis 30 Hari" di beranda.',
      'Isi Nama Pemilik, Nama Toko/Outlet, Email aktif, dan Kata Sandi minimal 6 karakter, lalu pilih tipe bisnis: CAFE, CARWASH, atau HYBRID.',
      'Masuk pertama kali untuk menjalankan Onboarding Wizard: lengkapi alamat toko, nomor WhatsApp struk, serta pilih menu/paket starter sesuai tipe bisnis.',
      'Sistem otomatis menerbitkan lisensi Beta Uji Coba selama 30 hari penuh (ditambah masa tenggang 7 hari sebelum akses terkunci).',
      'Tambahkan akun Kasir dan Admin melalui menu Karyawan > Staf Kantor agar tiap petugas memiliki login dan log audit masing-masing.'
    ],
    callout:
      'Starter menu Cafe dan paket Carwash disaring otomatis berdasarkan tipe usaha tenant agar data outlet tetap bersih sejak hari pertama.'
  },
  {
    id: 'bab-2',
    number: '02',
    title: 'Bab 2: SOP Kasir — Buka Shift, Modal Awal, Transaksi Cafe & Smart Auto-Fill Carwash',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    icon: ShoppingCart,
    screenshot: '/screenshots/pos-hybrid.png',
    screenshotCaption: 'Layar Kasir Split-Station (64:36) dengan katalog produk di kiri dan dok tagihan di kanan.',
    summary:
      'Prosedur kasir dari membuka laci kas di awal shift hingga mencatat pesanan Cafe dan pendaftaran layanan Carwash dalam satu struk.',
    steps: [
      'Masuk ke menu Kasir POS (/pos) dan pastikan nama Kasir Bertugas serta tanggal shift sudah benar.',
      'Klik "Modal Awal" bila belum terisi hari itu, lalu masukkan nominal uang tunai pecahan kecil di laci kasir (tercatat otomatis ke kas shift).',
      'Untuk pesanan F&B (mode CAFE / HYBRID): pilih kategori atau cari menu, ketuk kartu menu, lalu atur jumlah (+/-) dan catatan item di keranjang kanan.',
      'Untuk layanan Carwash (mode CARWASH / HYBRID): masukkan Plat Nomor Kendaraan (minimal 4 karakter) untuk memicu Smart Auto-Fill data mobil & WhatsApp pelanggan lama.',
      'Pilih paket cuci, ukuran kendaraan (Small / Medium / Large / Extra Large), varian (Regular / Body Only), status tunggu, dan minimal 1 Pencuci (opsional Pencuci 2).'
    ],
    callout:
      'Pesanan Cafe dan Carwash dapat digabungkan dalam satu keranjang transaksi yang sama tanpa perlu membuat dua nota terpisah.'
  },
  {
    id: 'bab-3',
    number: '03',
    title: 'Bab 3: Pembayaran (Cash, QRIS, Transfer, Split Payment) & Klaim Loyalty Cuci Gratis Atomik',
    roles: ['KASIR', 'ADMIN'],
    icon: CreditCard,
    screenshot: '/screenshots/crm-payroll.png',
    screenshotCaption: 'Pelacakan stamp kunjungan pelanggan dan kelayakan klaim reward cuci gratis berbasis plat nomor.',
    summary:
      'Aturan menerima pembayaran tunggal maupun campuran (Split Payment) serta klaim stamp reward loyalty secara atomik.',
    steps: [
      'Periksa kembali total tagihan di dok kanan, lalu masukkan diskon atau promo bila ada.',
      'Jika pelanggan carwash memiliki kelayakan klaim reward (stamp mencukupi), aktifkan opsi Klaim Loyalty Reward sebelum checkout agar jatah stamp terpotong atomik dalam satu transaksi database.',
      'Pilih metode pembayaran: TUNAI (Cash), QRIS, TRANSFER, atau SPLIT PAYMENT (campuran tunai + QRIS/transfer).',
      'Untuk Tunai/Split, masukkan nominal uang yang diterima; sistem menghitung kembalian secara presisi dan menolak pembayaran kurang bayar.',
      'Klik tombol Bayar; stok bahan baku (BOM resep) serta jurnal kas/pendapatan langsung tercatat otomatis di belakang layar.'
    ],
    callout:
      'Jangan pernah memotong biaya loyalty secara manual jika fitur Klaim Loyalty aktif — sistem mengunci satu klaim per siklus agar tidak terjadi klaim ganda.'
  },
  {
    id: 'bab-4',
    number: '04',
    title: 'Bab 4: Open Bill (Bayar Nanti), Cetak Struk Bluetooth 58mm/80mm & WA, Void Ber-Audit & Tutup Shift (EOD)',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    icon: Receipt,
    screenshot: '/screenshots/pos-hybrid.png',
    screenshotCaption: 'Kontrol riwayat transaksi POS, pelunasan Open Bill, Void ber-alasan, dan rekap Tutup Shift kasir.',
    summary:
      'Menangani transaksi meja/cuci bayar nanti, mencetak struk thermal Bluetooth atau WhatsApp, pembatalan nota ber-alasan, hingga rekonsiliasi fisik kas akhir shift.',
    steps: [
      'Gunakan tombol "Simpan Open Bill / Pending" bila pelanggan membayar setelah makanan/cuci selesai, lalu lunasi lewat tab Riwayat / Pending saat pembayaran diterima.',
      'Setelah lunas, klik "Cetak Thermal" untuk printer Bluetooth 58mm atau 80mm (Web Bluetooth), atau klik "Kirim WhatsApp" untuk mengirim ringkasan nota digital.',
      'Jika terjadi kesalahan input setelah nota terbit, gunakan aksi "Void Transaksi" dan wajib isi Alasan Void; seluruh pembatalan tercatat pada audit trail serta membalik stok & jurnal.',
      'Di akhir shift, buka tombol "Tutup Shift (Closing Kasir)", hitung uang fisik di laci, lalu masukkan nominal kas fisik dan catatan selisih.',
      'Sistem menyimpan log tutup shift pada tabel audit cashier_shift_closings dan menampilkan selisih kas secara real-time tanpa menggandakan omzet penjualan.'
    ],
    callout:
      'Fitur Tutup Shift merekonsiliasi kas fisik terhadap Modal Awal + Penjualan Tunai - Pengeluaran Kasir secara terpisah sehingga omzet tidak tercatat dua kali di cashflow.'
  },
  {
    id: 'bab-5',
    number: '05',
    title: 'Bab 5: SOP Pengawas Cuci — Antrean Kanban Carwash (Tunggu vs Tinggal)',
    roles: ['KASIR', 'ADMIN', 'OWNER'],
    icon: Car,
    screenshot: '/screenshots/carwash-queue.png',
    screenshotCaption: 'Papan Antrean Carwash Kanban untuk memonitor kendaraan Antre, Dikerjakan, hingga Selesai.',
    summary:
      'Pengawasan unit kendaraan yang sedang antre atau dicuci agar prioritas pengerjaan antara pelanggan Tunggu dan Tinggal tetap terjaga.',
    steps: [
      'Buka halaman Antrean Carwash (/queue) dari sidebar pada perangkat pengawas cuci atau kasir.',
      'Pantau kartu kendaraan yang terbagi berdasarkan status pengerjaan: Antre, Sedang Dicuci, dan Selesai.',
      'Gunakan filter "Tunggu" untuk memprioritaskan pelanggan yang menunggu di area tunggu / cafe.',
      'Perbarui status kartu ketika kru mulai mencuci hingga selesai agar kasir tahu mobil siap diserahkan atau siap dilunasi bila statusnya Open Bill.',
      'Pastikan penugasan Pencuci 1 / Pencuci 2 sesuai kondisi lapangan sebelum shift ditutup karena data komisi gaji mengacu ke transaksi tersebut.'
    ],
    callout:
      'Untuk outlet bertipe CAFE murni, modul Antrean Carwash otomatis disembunyikan agar tampilan tetap fokus.'
  },
  {
    id: 'bab-6',
    number: '06',
    title: 'Bab 6: Manajemen Menu, Kalkulator Resep HPP (BOM) & Multi-Gudang Inventori',
    roles: ['ADMIN', 'OWNER'],
    icon: Boxes,
    screenshot: '/screenshots/executive-dashboard.png',
    screenshotCaption: 'Pemantauan stok menipis (Operational Pulse) terhubung langsung ke Gudang & Resep BOM.',
    summary:
      'Pengaturan katalog menu, bahan baku per gudang, kalkulasi HPP resep otomatis, dan pencatatan belanja stok barang masuk.',
    steps: [
      'Buka halaman Admin Settings (/admin) untuk menambah atau memperbarui Menu Cafe dan Paket Carwash beserta matriks tarif ukuran.',
      'Gunakan Kalkulator Resep & Margin HPP pada tiap menu untuk memetakan komposisi bahan baku (BOM) dan mengetahui estimasi margin kotor.',
      'Kelola stok bahan baku pada halaman Gudang (/gudang) dengan pemisahan gudang CAFE dan CARWASH serta ambang batas minimal stok.',
      'Catat pembelian bahan baku dari supplier lewat Barang Masuk atau pengeluaran stok kasir agar harga pokok rata-rata (Moving Average Cost) selalu terbarui.',
      'Setiap penjualan POS di menu yang memiliki resep akan otomatis mengurangi stok bahan baku terkait dan mencatat jurnal HPP.'
    ],
    callout:
      'Sistem mencegah penghapusan item stok yang masih direferensikan oleh resep aktif atau riwayat transaksi demi menjaga integritas laporan HPP.'
  },
  {
    id: 'bab-7',
    number: '07',
    title: 'Bab 7: Keuangan Operasional, Buku Besar Double-Entry, Laporan SAK EMKM & Payroll Komisi Kru',
    roles: ['ADMIN', 'OWNER'],
    icon: FileSpreadsheet,
    screenshot: '/screenshots/finance-reports.png',
    screenshotCaption: 'Laporan Keuangan Resmi SAK EMKM: Laba Rugi per divisi, Neraca, dan Buku Besar.',
    summary:
      'Audit mutasi kas/bank harian, laporan akuntansi resmi SAK EMKM, hingga rekap komisi kru pencuci dan gaji staf kantor.',
    steps: [
      'Di halaman Keuangan (/finance), periksa saldo real-time Kas Laci Kasir dan Rekening Bank, serta catat pengeluaran operasional atau penarikan prive Owner.',
      'Pastikan setiap transaksi penjualan, HPP, dan pengeluaran sudah menghasilkan jurnal seimbang (Total Debit = Total Kredit) di Buku Besar.',
      'Khusus Owner, buka Laporan Akuntansi (/reports) untuk melihat Laporan Laba Rugi (dipisah antara segmen Cafe dan Carwash), Neraca, serta ekspor CSV / Cetak PDF resmi.',
      'Di halaman Karyawan (/karyawan), cek tab Komisi & Gaji Kru Cuci sesuai periode cut-off (tanggal 16 s.d. 15) beserta rincian unit yang dikerjakan.',
      'Lakukan proses pembayaran gaji atau kasbon karyawan sehingga mutasi kas keluar dan beban gaji langsung tercatat rapi.'
    ],
    callout:
      'Setiap transaksi keuangan menjaga invarian Double-Entry: sistem memblokir mutasi jurnal apabila Total Debit tidak sama dengan Total Kredit.'
  },
  {
    id: 'bab-8',
    number: '08',
    title: 'Bab 8: Konsolidasi Multi-Outlet, Kustomisasi Struk, Lupa Kata Sandi & Kirim Masukan Beta',
    roles: ['OWNER', 'ADMIN', 'KASIR'],
    icon: Building2,
    screenshot: '/screenshots/crm-payroll.png',
    screenshotCaption: 'Kontrol Owner lintas outlet, pengaturan identitas struk permanen di database, dan saluran masukan beta.',
    summary:
      'Pengelolaan lebih dari satu cabang/outlet oleh Owner, sinkronisasi header struk ke database, pemulihan kata sandi, dan penyampaian feedback selama beta.',
    steps: [
      'Owner yang memiliki lebih dari satu outlet dapat mengakses Konsolidasi (/konsolidasi) untuk melihat omzet, pengeluaran, dan saldo kas seluruh outlet dalam satu layar, atau menambah outlet baru.',
      'Gunakan pemilih Outlet di Sidebar untuk berpindah outlet aktif secara aman; hak akses dan sesi server ikut berpindah ke outlet tujuan.',
      'Atur nama toko, alamat, nomor telepon, pesan footer, dan logo header struk di Admin > Pengaturan Struk (tersimpan permanen di database per tenant).',
      'Jika lupa kata sandi, klik "Lupa Kata Sandi?" di halaman /login (/forgot-password) untuk menerima tautan reset ke halaman /reset-password.',
      'Selama masa Beta 30 Hari, klik tombol "Beri Masukan" di bagian bawah Sidebar dari halaman mana saja untuk mengirim rating bintang (1-5) dan laporan bug/saran langsung ke tim pengembang.'
    ],
    callout:
      'Tombol "Beri Masukan" otomatis mencatat halaman aktif dan nama outlet Anda sehingga tim teknis dapat menindaklanjuti kendala lebih cepat.'
  }
]

const UserManualPage = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRole, setSelectedRole] = useState('ALL')

  const filteredChapters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return CHAPTERS.filter((ch) => {
      const roleMatch = selectedRole === 'ALL' || ch.roles.includes(selectedRole)
      if (!roleMatch) return false
      if (!q) return true
      const haystack = `${ch.title} ${ch.summary} ${ch.steps.join(' ')} ${ch.callout}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [searchQuery, selectedRole])

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100">
      {/* Topbar Publik (Tersembunyi saat print) */}
      <header className="sticky top-0 z-40 h-14 bg-[#080C14]/95 border-b border-slate-800 print:hidden">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg bg-[#0F172A] border border-slate-800 transition-all active:scale-[0.98]"
            >
              <ArrowLeft size={14} strokeWidth={1.75} />
              <span>Beranda</span>
            </Link>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#0F172A] border border-slate-800 flex items-center justify-center shrink-0">
                <BookOpen size={14} strokeWidth={1.75} className="text-[#00ffff]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white truncate">
                  User Manual &amp; SOP RelayPOS
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 text-xs font-semibold text-slate-200 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Printer size={14} strokeWidth={1.75} className="text-sky-400" />
              <span className="hidden sm:inline">Cetak / Simpan PDF</span>
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 text-xs font-semibold text-white transition-all active:scale-[0.98]"
            >
              <LogIn size={14} strokeWidth={1.75} />
              <span>Masuk</span>
            </Link>
            <Link
              to="/login?mode=register"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all active:scale-[0.98]"
            >
              <span>Uji Coba 30 Hari</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero & Search Filter Bar */}
      <section className="border-b border-slate-800 bg-[#0F172A]/60 py-8 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto space-y-5">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                Dokumentasi Operasional Resmi V3
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Panduan Penggunaan &amp; SOP Lengkap RelayPOS
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Pelajari alur kerja standar untuk Kasir, Pengawas Antrean, Admin Keuangan, dan Owner — mulai dari
                buka shift kasir hingga tutup buku laporan keuangan SAK EMKM.
              </p>
            </div>
            <div className="text-xs font-mono tabular-nums text-slate-400 bg-[#080C14] border border-slate-800 rounded-xl px-3.5 py-2.5 shrink-0">
              Total Modul SOP: <strong className="text-white">{CHAPTERS.length} Bab</strong>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-3 print:hidden">
            <div className="relative flex-1">
              <Search size={15} strokeWidth={1.75} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari topik SOP (misal: modal awal, split payment, komisi, bluetooth, void, loyalty)..."
                aria-label="Cari topik panduan pengguna"
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#080C14] border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter peran SOP">
              {ROLE_FILTERS.map((rf) => {
                const active = selectedRole === rf.id
                return (
                  <button
                    key={rf.id}
                    type="button"
                    onClick={() => setSelectedRole(rf.id)}
                    className={`h-11 px-3.5 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] cursor-pointer ${
                      active
                        ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                        : 'bg-[#080C14] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {rf.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content: Sticky TOC + Chapters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sticky Table of Contents */}
        <aside className="lg:col-span-4 xl:col-span-3 print:hidden">
          <div className="lg:sticky lg:top-20 bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Daftar Isi SOP
              </span>
              <span className="text-[11px] font-mono tabular-nums text-cyan-300">
                {filteredChapters.length}/{CHAPTERS.length}
              </span>
            </div>
            <nav className="space-y-1">
              {CHAPTERS.map((ch) => {
                const visible = filteredChapters.some((f) => f.id === ch.id)
                return (
                  <a
                    key={ch.id}
                    href={`#${ch.id}`}
                    className={`flex items-start gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                      visible
                        ? 'text-slate-300 hover:text-white hover:bg-[#1E293B]'
                        : 'text-slate-600 pointer-events-none opacity-50'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-bold text-cyan-400 pt-0.5 shrink-0">
                      {ch.number}
                    </span>
                    <span className="leading-snug">{ch.title.replace(/^Bab \d+:\s*/, '')}</span>
                  </a>
                )
              })}
            </nav>
          </div>
        </aside>

        {/* Chapters Body */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-6">
          {filteredChapters.length === 0 ? (
            <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-8 text-center space-y-3">
              <p className="text-sm font-bold text-white">Topik SOP tidak ditemukan</p>
              <p className="text-xs text-slate-400">
                Coba kata kunci lain atau reset filter peran ke &quot;Semua Peran&quot;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedRole('ALL')
                }}
                className="px-4 py-2 rounded-lg bg-[#1E293B] border border-slate-700 text-xs font-bold text-white hover:bg-slate-700 cursor-pointer"
              >
                Reset Pencarian
              </button>
            </div>
          ) : (
            filteredChapters.map((ch) => {
              const Icon = ch.icon
              return (
                <article
                  key={ch.id}
                  id={ch.id}
                  className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 sm:p-6 space-y-5 scroll-mt-20 break-inside-avoid"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-800 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#1E293B] border border-slate-700 flex items-center justify-center text-cyan-400 shrink-0">
                        <Icon size={18} strokeWidth={1.75} />
                      </div>
                      <div className="space-y-1">
                        <h2 className="text-base sm:text-lg font-bold text-white">{ch.title}</h2>
                        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{ch.summary}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      {ch.roles.map((r) => (
                        <span
                          key={r}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${ROLE_BADGE_STYLES[r]}`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Step-by-step SOP */}
                  <ol className="space-y-2.5">
                    {ch.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-200 leading-relaxed">
                        <span className="w-6 h-6 rounded-lg bg-[#080C14] border border-slate-700 text-cyan-300 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="flex items-start gap-2 pt-0.5">
                          <CheckCircle2 size={14} strokeWidth={1.75} className="text-emerald-400 shrink-0 mt-1" />
                          <span>{step}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  {/* Callout Operasional */}
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-200">
                    <AlertTriangle size={15} strokeWidth={1.75} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      <strong className="text-amber-300">Catatan Pengendalian:</strong> {ch.callout}
                    </p>
                  </div>

                  {/* Ilustrasi Screenshot Modul */}
                  <figure className="rounded-xl overflow-hidden border border-slate-800 bg-[#080C14]">
                    <img
                      src={ch.screenshot}
                      alt={ch.screenshotCaption}
                      loading="lazy"
                      className="w-full h-auto object-cover border-b border-slate-800"
                    />
                    <figcaption className="px-3.5 py-2 text-[11px] text-slate-400 flex items-center justify-between gap-2">
                      <span>{ch.screenshotCaption}</span>
                      <span className="font-mono text-[10px] text-slate-500 uppercase">Modul {ch.number}</span>
                    </figcaption>
                  </figure>
                </article>
              )
            })
          )}

          {/* Bottom Navigation Card */}
          <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
            <div>
              <h3 className="text-sm font-bold text-white">Siap Mencoba Langsung di Outlet Anda?</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Daftar akun Owner gratis selama 30 hari penuh atau masuk ke dashboard toko Anda.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link
                to="/"
                className="px-3.5 py-2 rounded-lg bg-[#1E293B] border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700 transition-all active:scale-[0.98]"
              >
                Kembali ke Beranda
              </Link>
              <Link
                to="/login?mode=register"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all active:scale-[0.98]"
              >
                <span>Daftar Beta 30 Hari</span>
                <ChevronRight size={14} strokeWidth={2} />
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default UserManualPage
