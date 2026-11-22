import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ArrowRight,
  BookOpen,
  Building2,
  Car,
  CheckCircle2,
  Coffee,
  CreditCard,
  FileSpreadsheet,
  Layers,
  LogIn,
  Maximize2,
  Monitor,
  Package,
  Printer,
  ShieldCheck,
  Users,
  X
} from 'lucide-react'

const SCREENSHOT_SHOWCASE = [
  {
    id: 'pos-hybrid',
    tabLabel: 'POS Kasir Estafet',
    title: 'Split-Station POS (64:36) untuk Cafe, Carwash & Hybrid',
    description:
      'Satu layar kasir cepat untuk mencatat menu F&B sekaligus pendaftaran plat nomor cuci kendaraan, diskon, Split Payment, dan cetak struk Bluetooth.',
    image: '/screenshots/pos-hybrid.png',
    highlights: [
      'Smart Auto-Fill plat nomor & WhatsApp pelanggan lama otomatis',
      'Pembayaran Tunai, QRIS, Transfer, Split Payment, serta Open Bill',
      'Klaim reward loyalty cuci gratis & validasi tutup shift anti double-counting'
    ]
  },
  {
    id: 'carwash-queue',
    tabLabel: 'Antrean Carwash',
    title: 'Papan Kanban Antrean Kendaraan (Tunggu vs Tinggal)',
    description:
      'Pantau status pengerjaan cuci mobil secara real-time bersama alokasi Pencuci 1 & Pencuci 2 agar pelayanan pelanggan tetap rapi dan cepat.',
    image: '/screenshots/carwash-queue.png',
    highlights: [
      'Prioritas jelas antara pelanggan Tunggu dan Tinggal',
      'Status langsung tersinkron antara kasir dan pengawas area cuci',
      'Terhubung otomatis ke perhitungan komisi harian pencuci'
    ]
  },
  {
    id: 'executive-dashboard',
    tabLabel: 'Dashboard Eksekutif',
    title: 'Pusat Kendali Omzet, Laba Bersih & Kesehatan Stok',
    description:
      'Owner langsung melihat omzet harian/bulanan, estimasi margin bersih, saldo kas & rekening bank, serta peringatan stok kritis dalam satu layar.',
    image: '/screenshots/executive-dashboard.png',
    highlights: [
      'Pemisahan kinerja pendapatan divisi Cafe dan Carwash secara instan',
      'Operational Pulse: daftar bahan baku mendekati batas minimum stok',
      'Pintasan langsung ke laporan akuntansi resmi dan konsolidasi cabang'
    ]
  },
  {
    id: 'finance-reports',
    tabLabel: 'Laporan SAK EMKM',
    title: 'Buku Besar Double-Entry & Laporan Keuangan Siap Cetak',
    description:
      'Setiap checkout POS, potongan HPP resep, dan pengeluaran kasir otomatis mem-posting jurnal seimbang (Total Debit = Total Kredit).',
    image: '/screenshots/finance-reports.png',
    highlights: [
      'Laporan Laba Rugi, Neraca, dan Buku Besar standar SAK EMKM',
      'Rekonsiliasi real-time Laci Kasir Tunai dan Rekening Bank usaha',
      'Ekspor CSV aman dan mode cetak PDF bersih siap audit'
    ]
  },
  {
    id: 'crm-payroll',
    tabLabel: 'CRM & Payroll Kru',
    title: 'Loyalitas Pelanggan Plat Nomor & Rekap Komisi Cut-Off',
    description:
      'Bangun retensi pelanggan lewat stamp cuci gratis otomatis dan kelola gaji serta komisi pencuci periode cut-off tanggal 16-15 tanpa hitung manual.',
    image: '/screenshots/crm-payroll.png',
    highlights: [
      'Segmentasi VIP, Loyal, Baru, & At-Risk dengan tombol sapa WhatsApp',
      'Klaim reward cuci gratis terkunci atomik di database anti dobel-klaim',
      'Audit komisi harian kru cuci terhubung langsung ke kas keluar payroll'
    ]
  }
]

const BUSINESS_MODES = [
  {
    code: 'CAFE',
    name: 'Mode Cafe & Resto',
    icon: Coffee,
    accent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    description: 'Fokus operasional F&B, meja open bill, resep HPP (BOM), dan stok dapur.',
    items: ['POS Katalog Menu & Modifier', 'Open Bill Meja Bayar Nanti', 'Pemotongan Stok Bahan Resep Otomatis']
  },
  {
    code: 'CARWASH',
    name: 'Mode Carwash & Detailing',
    icon: Car,
    accent: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    description: 'Fokus layanan cuci kendaraan berdasarkan ukuran, antrean Kanban, dan komisi pencuci.',
    items: ['Matriks Tarif Small s.d. Extra Large', 'Antrean Kanban Tunggu vs Tinggal', 'Alokasi Komisi Kru & CRM Plat Nomor']
  },
  {
    code: 'HYBRID',
    name: 'Mode Hybrid Terpadu',
    icon: Layers,
    accent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    description: 'Gabungkan lini Carwash + Cafe dalam satu struk pelanggan dan satu pembukuan terpisah.',
    items: ['1 Struk Gabungan Cuci + Kopi/Makanan', 'Laporan Laba Rugi per Segmen Usaha', 'Konsolidasi Kas & Multi-Gudang Terpusat']
  }
]

const CORE_FEATURES = [
  {
    icon: Printer,
    title: 'Struk Bluetooth 58mm/80mm & WhatsApp',
    description:
      'Kustomisasi nama, alamat, dan footer struk tersimpan di database tenant; cetak via Web Bluetooth atau kirim nota langsung ke WhatsApp pelanggan.'
  },
  {
    icon: CreditCard,
    title: 'Split Payment & Tutup Shift Ter-Audit',
    description:
      'Terima tunai + QRIS/transfer sekaligus dalam satu transaksi dan lakukan rekonsiliasi fisik laci akhir shift tanpa menggandakan omzet.'
  },
  {
    icon: Package,
    title: 'Pemotongan Stok BOM & Kalkulator HPP',
    description:
      'Resep bahan baku otomatis berkurang setiap menu terjual lengkap dengan snapshot COGS (HPP) dan peringatan bahan baku menipis.'
  },
  {
    icon: Users,
    title: 'Pembagian Komisi Kru & Payroll Otomatis',
    description:
      'Sistem membagi jatah komisi Pencuci 1 & 2 secara otomatis dan merekap periode gaji cut-off 16-15 siap bayar.'
  },
  {
    icon: FileSpreadsheet,
    title: 'Jurnal Double-Entry & Laporan EMKM',
    description:
      'Invarian total debit = total kredit di setiap mutasi transaksi menghasilkan Laporan Laba Rugi dan Neraca yang konsisten.'
  },
  {
    icon: Building2,
    title: 'Multi-Outlet & Kontrol Akses RBAC',
    description:
      'Kelola banyak cabang dalam satu akun Owner dengan Row-Level Security di database serta pembatasan peran Kasir, Admin, dan Owner.'
  }
]

const METRICS_STRIP = [
  { label: 'Tata Letak Kasir', value: '64:36 Split-Station' },
  { label: 'Akuntansi Inti', value: '100% Double-Entry' },
  { label: 'Arsitektur Mode', value: '3 Tipe Bisnis' },
  { label: 'Printer Struk', value: '58mm / 80mm BT' }
]

const LandingPage = () => {
  const { user } = useAuth()
  const [selectedScreenshotId, setSelectedScreenshotId] = useState(SCREENSHOT_SHOWCASE[0].id)
  const [zoomedShot, setZoomedShot] = useState(null)

  const activeShot =
    SCREENSHOT_SHOWCASE.find((s) => s.id === selectedScreenshotId) || SCREENSHOT_SHOWCASE[0]

  return (
    <div className="min-h-screen bg-[#080C14] text-slate-100">
      {/* Sticky Navbar */}
      <header className="sticky top-0 z-40 h-14 bg-[#080C14]/95 border-b border-slate-800">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img
              src="/relaypos-logo.svg"
              alt="RelayPOS"
              className="w-7 h-7 rounded-lg border border-slate-700 bg-[#0F172A] p-0.5 object-contain"
            />
            <div className="leading-none">
              <span className="font-bold text-sm tracking-wide text-white uppercase">RelayPOS</span>
              <span className="hidden sm:block text-[10px] text-slate-400 mt-0.5">
                SaaS ERP &amp; Kasir Estafet
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-slate-400">
            <a href="#screenshots" className="hover:text-white transition-colors">
              Screenshot Aplikasi
            </a>
            <a href="#model-bisnis" className="hover:text-white transition-colors">
              Mode Bisnis
            </a>
            <a href="#fitur" className="hover:text-white transition-colors">
              Fitur Utama
            </a>
            <a href="#beta" className="hover:text-white transition-colors">
              Beta 30 Hari
            </a>
            <Link
              to="/panduan"
              className="inline-flex items-center gap-1.5 text-cyan-300 hover:text-cyan-200 transition-colors"
            >
              <BookOpen size={14} strokeWidth={1.75} />
              <span>Panduan Pengguna</span>
            </Link>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/panduan"
              className="md:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0F172A] border border-slate-800 text-xs font-semibold text-cyan-300"
            >
              <BookOpen size={13} strokeWidth={1.75} />
              <span>Panduan</span>
            </Link>
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold transition-all active:scale-[0.98]"
              >
                <span>Buka Aplikasi</span>
                <ArrowRight size={14} strokeWidth={2} />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 text-xs font-semibold text-white transition-all active:scale-[0.98]"
                >
                  <LogIn size={13} strokeWidth={1.75} />
                  <span>Masuk</span>
                </Link>
                <Link
                  to="/login?mode=register"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all active:scale-[0.98]"
                >
                  <span>Coba Gratis 30 Hari</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14 border-b border-slate-800">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Beta Publik Gratis 30 Hari • Tanpa Kartu Kredit</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
              Kasir Estafet &amp; ERP Akuntansi Real-Time untuk Bisnis Cafe, Carwash, dan Hybrid
            </h1>

            <p className="text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl">
              Satukan transaksi kasir, antrean kendaraan, pemotongan stok resep (BOM), pembagian komisi kru
              cuci, hingga laporan keuangan standar SAK EMKM dalam satu sistem multi-outlet yang cepat di tablet
              maupun desktop.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/login?mode=register"
                className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                <span>Mulai Uji Coba Gratis 30 Hari</span>
                <ArrowRight size={16} strokeWidth={2} />
              </Link>
              <Link
                to="/panduan"
                className="h-11 px-5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] border border-slate-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                <BookOpen size={16} strokeWidth={1.75} className="text-cyan-400" />
                <span>Baca User Manual &amp; SOP</span>
              </Link>
              <Link
                to="/login"
                className="h-11 px-4 rounded-xl text-slate-300 hover:text-white text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <span>Sudah punya akun? Masuk</span>
              </Link>
            </div>
          </div>

          {/* Key Specs Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {METRICS_STRIP.map((m) => (
              <div
                key={m.label}
                className="p-4 rounded-xl bg-[#0F172A] border border-slate-800 space-y-1"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {m.label}
                </span>
                <span className="block text-sm sm:text-base font-bold font-mono tabular-nums text-sky-400">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Application Screenshot Showcase */}
      <section id="screenshots" className="px-4 sm:px-6 py-14 border-b border-slate-800 bg-[#080C14]">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                Tampilan Asli Aplikasi
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Lihat Modul Operasional RelayPOS Sebelum Mendaftar
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                Pilih modul di bawah untuk melihat tangkapan layar antarmuka asli yang digunakan kasir,
                pengawas cuci, dan owner setiap hari.
              </p>
            </div>
            <Link
              to="/panduan"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200 shrink-0"
            >
              <span>Pelajari SOP di User Manual</span>
              <ArrowRight size={14} strokeWidth={1.75} />
            </Link>
          </div>

          {/* Tab Selector */}
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Galeri screenshot modul aplikasi">
            {SCREENSHOT_SHOWCASE.map((item) => {
              const active = item.id === activeShot.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedScreenshotId(item.id)}
                  className={`h-10 px-3.5 rounded-xl text-xs font-bold border transition-all active:scale-[0.98] cursor-pointer ${
                    active
                      ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                      : 'bg-[#0F172A] border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  {item.tabLabel}
                </button>
              )
            })}
          </div>

          {/* Frame Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 rounded-xl border border-slate-800 bg-[#0F172A] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 bg-[#0b1120]">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <Monitor size={14} strokeWidth={1.75} className="text-cyan-400" />
                  <span>{activeShot.tabLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomedShot(activeShot)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-white transition-all cursor-pointer"
                >
                  <Maximize2 size={12} strokeWidth={1.75} />
                  <span>Perbesar Preview</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setZoomedShot(activeShot)}
                className="block w-full text-left cursor-zoom-in"
                aria-label={`Perbesar screenshot ${activeShot.tabLabel}`}
              >
                <img
                  src={activeShot.image}
                  alt={activeShot.title}
                  className="w-full h-auto object-cover"
                />
              </button>
            </div>

            <div className="lg:col-span-4 bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-4">
              <span className="inline-block px-2.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                Detail Modul
              </span>
              <h3 className="text-lg font-bold text-white leading-snug">{activeShot.title}</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{activeShot.description}</p>

              <ul className="space-y-2.5 pt-1">
                {activeShot.highlights.map((hl) => (
                  <li key={hl} className="flex items-start gap-2.5 text-xs text-slate-200 leading-relaxed">
                    <CheckCircle2 size={15} strokeWidth={1.75} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{hl}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
                <Link
                  to="/login?mode=register"
                  className="w-full h-10 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                >
                  <span>Coba Modul Ini Gratis 30 Hari</span>
                  <ArrowRight size={14} strokeWidth={2} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Adaptive Business Modes */}
      <section id="model-bisnis" className="px-4 sm:px-6 py-14 border-b border-slate-800 bg-[#0b101b]">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="space-y-1.5 max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Menyesuaikan Jenis Usaha Anda
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Tiga Mode Operasional dalam Satu Platform
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Pilih tipe usaha saat pendaftaran. Menu kasir, antrean, gudang, dan starter data langsung
              menyesuaikan agar staf tidak melihat modul yang tidak dibutuhkan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BUSINESS_MODES.map((mode) => {
              const Icon = mode.icon
              return (
                <div
                  key={mode.code}
                  className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${mode.accent}`}>
                        <Icon size={18} strokeWidth={1.75} />
                      </div>
                      <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-[#080C14] border border-slate-800 text-slate-300">
                        {mode.code}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white">{mode.name}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{mode.description}</p>
                    <ul className="space-y-2 pt-1">
                      {mode.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-slate-200">
                          <CheckCircle2 size={14} strokeWidth={1.75} className="text-emerald-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 6 Core Capabilities */}
      <section id="fitur" className="px-4 sm:px-6 py-14 border-b border-slate-800">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="space-y-1.5 max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
              Arsitektur Pengendalian Internal
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Dirancang untuk Mencegah Kebocoran Kas &amp; Stok
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CORE_FEATURES.map((feat) => {
              const Icon = feat.icon
              return (
                <div
                  key={feat.title}
                  className="bg-[#0F172A] border border-slate-800 rounded-xl p-5 space-y-2.5"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#1E293B] border border-slate-700 flex items-center justify-center text-cyan-400">
                    <Icon size={17} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-sm font-bold text-white">{feat.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{feat.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Beta 30 Days + User Manual Banner */}
      <section id="beta" className="px-4 sm:px-6 py-14">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-[#0F172A] border border-emerald-500/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck size={16} strokeWidth={1.75} />
              <span>Program Beta Publik Terbuka</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Gratis Penuh 30 Hari + Tenggang 7 Hari untuk Outlet Pertama Anda
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Daftarkan bisnis Anda sekarang tanpa biaya setup. Gunakan seluruh fitur POS, antrean, gudang,
              payroll, dan laporan SAK EMKM selama 30 hari penuh, serta kirim masukan langsung dari dalam
              aplikasi.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/login?mode=register"
                className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs sm:text-sm font-bold inline-flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                <span>Daftar &amp; Mulai Beta Sekarang</span>
                <ArrowRight size={15} strokeWidth={2} />
              </Link>
              <Link
                to="/login"
                className="h-11 px-4 rounded-xl bg-[#1E293B] border border-slate-700 text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-2 hover:bg-slate-700"
              >
                <span>Masuk ke Akun</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <BookOpen size={18} strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-bold text-white">User Manual &amp; SOP Staf</h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Bingung alur kasir, split payment, klaim loyalty, atau tutup shift akhir hari? Baca panduan
                resmi 8 bab yang dapat difilter berdasarkan peran dan dicetak sebagai PDF untuk tim Anda.
              </p>
            </div>
            <Link
              to="/panduan"
              className="h-11 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/50 text-cyan-300 text-xs sm:text-sm font-bold inline-flex items-center justify-between transition-all active:scale-[0.98]"
            >
              <span>Buka Halaman User Manual (/panduan)</span>
              <ArrowRight size={15} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-4 sm:px-6 py-6 bg-[#080C14]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>&copy; 2026 RelayPOS Enterprise — Sistem Kasir Estafet &amp; ERP Akuntansi Multi-Tenant.</span>
          <div className="flex items-center gap-4 font-semibold text-slate-400">
            <Link to="/panduan" className="hover:text-white transition-colors">
              Panduan Pengguna
            </Link>
            <Link to="/login" className="hover:text-white transition-colors">
              Masuk
            </Link>
            <Link to="/login?mode=register" className="hover:text-emerald-400 transition-colors">
              Daftar Beta 30 Hari
            </Link>
          </div>
        </div>
      </footer>

      {/* Lightbox Modal untuk Perbesar Screenshot */}
      {zoomedShot && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${zoomedShot.tabLabel}`}
          onClick={() => setZoomedShot(null)}
        >
          <div
            className="w-full max-w-6xl bg-[#0F172A] border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">{zoomedShot.title}</p>
                <p className="text-xs text-slate-400">{zoomedShot.tabLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setZoomedShot(null)}
                aria-label="Tutup preview"
                className="p-1.5 rounded-lg bg-[#1E293B] border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <img src={zoomedShot.image} alt={zoomedShot.title} className="w-full h-auto max-h-[82dvh] object-contain bg-[#080C14]" />
          </div>
        </div>
      )}
    </div>
  )
}

export default LandingPage
