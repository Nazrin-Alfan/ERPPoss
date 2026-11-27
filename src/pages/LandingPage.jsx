import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import RelayLogo from '../components/brand/RelayLogo'
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
    accent: 'text-warning border-warning/30 bg-warning-bg',
    description: 'Fokus operasional F&B, meja open bill, resep HPP (BOM), dan stok dapur.',
    items: ['POS Katalog Menu & Modifier', 'Open Bill Meja Bayar Nanti', 'Pemotongan Stok Bahan Resep Otomatis']
  },
  {
    code: 'CARWASH',
    name: 'Mode Carwash & Detailing',
    icon: Car,
    accent: 'text-primary-soft-foreground border-primary/25 bg-primary-soft',
    description: 'Fokus layanan cuci kendaraan berdasarkan ukuran, antrean Kanban, dan komisi pencuci.',
    items: ['Matriks Tarif Small s.d. Extra Large', 'Antrean Kanban Tunggu vs Tinggal', 'Alokasi Komisi Kru & CRM Plat Nomor']
  },
  {
    code: 'HYBRID',
    name: 'Mode Hybrid Terpadu',
    icon: Layers,
    accent: 'text-success border-success/30 bg-success-bg',
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
    <div className="min-h-screen bg-canvas text-foreground">
      {/* Sticky Navbar */}
      <header className="sticky top-0 z-40 h-16 bg-surface/95 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <RelayLogo size="sm" />
            <div className="leading-none">
              <span className="font-bold text-sm tracking-wide text-foreground uppercase">RelayPOS</span>
              <span className="hidden sm:block text-[10px] text-muted mt-0.5">
                SaaS ERP &amp; Kasir Estafet
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-muted">
            <a href="#screenshots" className="hover:text-foreground transition-colors">
              Screenshot Aplikasi
            </a>
            <a href="#model-bisnis" className="hover:text-foreground transition-colors">
              Mode Bisnis
            </a>
            <a href="#fitur" className="hover:text-foreground transition-colors">
              Fitur Utama
            </a>
            <a href="#beta" className="hover:text-foreground transition-colors">
              Beta 30 Hari
            </a>
            <Link
              to="/panduan"
              className="inline-flex items-center gap-1.5 text-primary hover:underline transition-colors"
            >
              <BookOpen size={14} strokeWidth={1.75} />
              <span>Panduan Pengguna</span>
            </Link>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/panduan"
              className="md:hidden inline-flex items-center gap-1 min-h-[40px] px-3 py-1.5 rounded-full bg-subsurface border border-border text-xs font-semibold text-primary"
            >
              <BookOpen size={13} strokeWidth={1.75} />
              <span>Panduan</span>
            </Link>
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <span>Buka Aplikasi</span>
                <ArrowRight size={14} strokeWidth={2} />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-1.5 rounded-full bg-surface hover:bg-surface-hover border border-border text-xs font-semibold text-foreground transition-all active:scale-[0.98]"
                >
                  <LogIn size={13} strokeWidth={1.75} />
                  <span>Masuk</span>
                </Link>
                <Link
                  to="/login?mode=register"
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold transition-all active:scale-[0.98]"
                >
                  <span>Coba Gratis 30 Hari</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 sm:px-6 pt-12 pb-10 sm:pt-16 sm:pb-14 border-b border-border bg-canvas">
        <div className="max-w-7xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-soft border border-primary/25 text-[11px] font-bold uppercase tracking-wider text-primary-soft-foreground">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span>Beta Publik Gratis 30 Hari • Tanpa Kartu Kredit</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
              Kasir Estafet &amp; ERP Akuntansi Real-Time untuk Bisnis Cafe, Carwash, dan Hybrid
            </h1>

            <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl">
              Satukan transaksi kasir, antrean kendaraan, pemotongan stok resep (BOM), pembagian komisi kru
              cuci, hingga laporan keuangan standar SAK EMKM dalam satu sistem multi-outlet yang cepat di tablet
              maupun desktop.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/login?mode=register"
                className="min-h-[44px] px-6 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-[0.98] shadow-xs"
              >
                <span>Mulai Uji Coba Gratis 30 Hari</span>
                <ArrowRight size={16} strokeWidth={2} />
              </Link>
              <Link
                to="/panduan"
                className="min-h-[44px] px-5 rounded-full bg-surface hover:bg-surface-hover border border-border text-foreground text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                <BookOpen size={16} strokeWidth={1.75} className="text-primary" />
                <span>Baca User Manual &amp; SOP</span>
              </Link>
              <Link
                to="/login"
                className="min-h-[44px] px-4 rounded-full text-muted hover:text-foreground text-sm font-semibold inline-flex items-center gap-1.5"
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
                className="p-4 rounded-2xl bg-surface border border-border shadow-xs space-y-1"
              >
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted">
                  {m.label}
                </span>
                <span className="block text-sm sm:text-base font-bold font-mono tabular-nums text-primary">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Application Screenshot Showcase */}
      <section id="screenshots" className="px-4 sm:px-6 py-14 border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Tampilan Asli Aplikasi
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Lihat Modul Operasional RelayPOS Sebelum Mendaftar
              </h2>
              <p className="text-xs sm:text-sm text-muted max-w-2xl">
                Pilih modul di bawah untuk melihat tangkapan layar antarmuka asli yang digunakan kasir,
                pengawas cuci, dan owner setiap hari.
              </p>
            </div>
            <Link
              to="/panduan"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline shrink-0"
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
                  className={`min-h-[40px] px-4 rounded-full text-xs font-semibold border transition-all active:scale-[0.98] cursor-pointer ${
                    active
                      ? 'bg-selected-surface border-border-active text-primary-soft-foreground'
                      : 'bg-subsurface border-border text-muted hover:text-foreground hover:border-border-hover'
                  }`}
                >
                  {item.tabLabel}
                </button>
              )
            })}
          </div>

          {/* Frame Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 rounded-2xl border border-border bg-subsurface overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2 bg-surface">
                <div className="flex items-center gap-2 text-xs text-muted font-mono">
                  <Monitor size={14} strokeWidth={1.75} className="text-primary" />
                  <span>{activeShot.tabLabel}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomedShot(activeShot)}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1 rounded-full bg-subsurface hover:bg-surface-hover border border-border text-[11px] font-semibold text-foreground transition-all cursor-pointer"
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

            <div className="lg:col-span-4 bg-canvas border border-border rounded-2xl p-5 space-y-4 shadow-xs">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-primary-soft border border-primary/25 text-[10px] font-bold uppercase tracking-wider text-primary-soft-foreground">
                Detail Modul
              </span>
              <h3 className="text-lg font-bold text-foreground leading-snug">{activeShot.title}</h3>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">{activeShot.description}</p>

              <ul className="space-y-2.5 pt-1">
                {activeShot.highlights.map((hl) => (
                  <li key={hl} className="flex items-start gap-2.5 text-xs text-foreground leading-relaxed">
                    <CheckCircle2 size={15} strokeWidth={1.75} className="text-success shrink-0 mt-0.5" />
                    <span>{hl}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-3 border-t border-border flex flex-wrap gap-2">
                <Link
                  to="/login?mode=register"
                  className="w-full min-h-[44px] rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
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
      <section id="model-bisnis" className="px-4 sm:px-6 py-14 border-b border-border bg-canvas">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="space-y-1.5 max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Menyesuaikan Jenis Usaha Anda
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Tiga Mode Operasional dalam Satu Platform
            </h2>
            <p className="text-xs sm:text-sm text-muted">
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
                  className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${mode.accent}`}>
                        <Icon size={18} strokeWidth={1.75} />
                      </div>
                      <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-subsurface border border-border text-muted">
                        {mode.code}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">{mode.name}</h3>
                    <p className="text-xs text-muted leading-relaxed">{mode.description}</p>
                    <ul className="space-y-2 pt-1">
                      {mode.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-xs text-foreground">
                          <CheckCircle2 size={14} strokeWidth={1.75} className="text-success shrink-0 mt-0.5" />
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
      <section id="fitur" className="px-4 sm:px-6 py-14 border-b border-border bg-surface">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="space-y-1.5 max-w-2xl">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Arsitektur Pengendalian Internal
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Dirancang untuk Mencegah Kebocoran Kas &amp; Stok
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CORE_FEATURES.map((feat) => {
              const Icon = feat.icon
              return (
                <div
                  key={feat.title}
                  className="bg-canvas border border-border rounded-2xl p-5 space-y-2.5 shadow-xs"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary">
                    <Icon size={17} strokeWidth={1.75} />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{feat.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{feat.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Beta 30 Days + User Manual Banner */}
      <section id="beta" className="px-4 sm:px-6 py-14 bg-canvas">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-surface border border-primary/25 rounded-2xl p-6 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider">
              <ShieldCheck size={16} strokeWidth={1.75} />
              <span>Program Beta Publik Terbuka</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Gratis Penuh 30 Hari + Tenggang 7 Hari untuk Outlet Pertama Anda
            </h2>
            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              Daftarkan bisnis Anda sekarang tanpa biaya setup. Gunakan seluruh fitur POS, antrean, gudang,
              payroll, dan laporan SAK EMKM selama 30 hari penuh, serta kirim masukan langsung dari dalam
              aplikasi.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/login?mode=register"
                className="min-h-[44px] px-5 rounded-full bg-primary hover:bg-primary-hover text-primary-foreground text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-all active:scale-[0.98]"
              >
                <span>Daftar &amp; Mulai Beta Sekarang</span>
                <ArrowRight size={15} strokeWidth={2} />
              </Link>
              <Link
                to="/login"
                className="min-h-[44px] px-4 rounded-full bg-subsurface border border-border text-xs sm:text-sm font-semibold text-foreground inline-flex items-center gap-2 hover:bg-surface-hover"
              >
                <span>Masuk ke Akun</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 bg-surface border border-border rounded-2xl p-6 flex flex-col justify-between gap-4 shadow-xs">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary-soft border border-primary/25 flex items-center justify-center text-primary">
                <BookOpen size={18} strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-bold text-foreground">User Manual &amp; SOP Staf</h3>
              <p className="text-xs sm:text-sm text-muted leading-relaxed">
                Bingung alur kasir, split payment, klaim loyalty, atau tutup shift akhir hari? Baca panduan
                resmi 8 bab yang dapat difilter berdasarkan peran dan dicetak sebagai PDF untuk tim Anda.
              </p>
            </div>
            <Link
              to="/panduan"
              className="min-h-[44px] px-4 rounded-full bg-primary-soft hover:opacity-90 border border-primary/25 text-primary-soft-foreground text-xs sm:text-sm font-semibold inline-flex items-center justify-between transition-all active:scale-[0.98]"
            >
              <span>Buka Halaman User Manual (/panduan)</span>
              <ArrowRight size={15} strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 sm:px-6 py-6 bg-surface">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <RelayLogo size="xs" />
            <span>&copy; 2026 RelayPOS Enterprise — Sistem Kasir Estafet &amp; ERP Akuntansi Multi-Tenant.</span>
          </div>
          <div className="flex items-center gap-4 font-semibold text-muted">
            <Link to="/panduan" className="hover:text-foreground transition-colors">
              Panduan Pengguna
            </Link>
            <Link to="/login" className="hover:text-foreground transition-colors">
              Masuk
            </Link>
            <Link to="/login?mode=register" className="text-primary hover:underline transition-colors">
              Daftar Beta 30 Hari
            </Link>
          </div>
        </div>
      </footer>

      {/* Lightbox Modal untuk Perbesar Screenshot */}
      {zoomedShot && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${zoomedShot.tabLabel}`}
          onClick={() => setZoomedShot(null)}
        >
          <div
            className="w-full max-w-6xl bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">{zoomedShot.title}</p>
                <p className="text-xs text-muted">{zoomedShot.tabLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setZoomedShot(null)}
                aria-label="Tutup preview"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-subsurface border border-border text-muted hover:text-foreground cursor-pointer"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <img src={zoomedShot.image} alt={zoomedShot.title} className="w-full h-auto max-h-[82dvh] object-contain bg-subsurface" />
          </div>
        </div>
      )}
    </div>
  )
}

export default LandingPage
