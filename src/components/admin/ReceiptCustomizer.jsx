import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { 
  Printer, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  Eye, 
  FileText, 
  Store, 
  ShieldCheck, 
  Receipt, 
  Smartphone, 
  MapPin, 
  Phone, 
  AtSign, 
  Info, 
  Sparkles,
  MessageSquare,
  Layers,
  ChevronRight,
  Lock,
  Bluetooth,
  Zap,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { 
  DEFAULT_RECEIPT_CONFIG, 
  PERMANENT_RELAYPOS_FOOTER,
  getReceiptConfig, 
  saveReceiptConfig,
  formatRupiahReceipt
} from '../../utils/receiptHelpers'
import { 
  isWebBluetoothSupported, 
  getBluetoothDiagnosticInfo,
  printReceiptViaBluetooth,
  testPrintViaBluetooth,
  getConnectedPrinterName 
} from '../../utils/bluetoothPrinter'

export default function ReceiptCustomizer() {
  const [config, setConfig] = useState(DEFAULT_RECEIPT_CONFIG)
  const [activeSubSection, setActiveSubSection] = useState('hardware') // Default fokus langsung ke Hardware & Bluetooth!
  const [previewType, setPreviewType] = useState('PAYMENT') // 'ORDER' | 'PAYMENT'
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isTestPrinting, setIsTestPrinting] = useState(false)
  const [isBtTesting, setIsBtTesting] = useState(false)
  const [btTestStatus, setBtTestStatus] = useState(null) // { type: 'success' | 'error', text: string }

  const btDiag = getBluetoothDiagnosticInfo()
  const hasBtSupport = btDiag.isSupported

  useEffect(() => {
    const loaded = getReceiptConfig()
    setConfig(loaded)
  }, [])

  const handleChange = (field, value) => {
    setConfig(prev => {
      const updated = {
        ...prev,
        [field]: value
      }
      saveReceiptConfig(updated)
      return updated
    })
  }

  const handleSave = () => {
    saveReceiptConfig(config)
    setSaveSuccess(true)
    setTimeout(() => {
      setSaveSuccess(false)
    }, 3000)
  }

  const handleReset = () => {
    if (window.confirm('Kembalikan seluruh template struk ke pengaturan awal standar sistem?')) {
      setConfig(DEFAULT_RECEIPT_CONFIG)
      saveReceiptConfig(DEFAULT_RECEIPT_CONFIG)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  }

  // Quick Preset Helper for Kalimat Penutup
  const applyPaymentClosingPreset = (text) => {
    handleChange('paymentDisclaimer', text)
  }

  const applyOrderClosingPreset = (text) => {
    handleChange('orderDisclaimer', text)
  }

  const handleTestPrint = () => {
    setIsTestPrinting(true)
    document.body.classList.add('has-thermal-receipt')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('has-thermal-receipt')
      setIsTestPrinting(false)
    }, 150)
  }

  // Sample data for realistic preview & 1:1 test print
  const sampleItems = [
    { type: 'CARWASH', name: 'PAKET CUCI BESAR (SUV/MPV)', qty: 1, price: 65000, subtotal: 65000 },
    { type: 'CAFE', name: 'Signature Kopi Aren Cold', qty: 2, price: 22000, subtotal: 44000 }
  ]
  const sampleSubtotal = 109000
  const sampleTotal = 109000
  const sampleCash = 150000
  const sampleKembalian = 41000

  // Derived preview data
  const isDropOff = previewType === 'ORDER'
  const previewTitle = isDropOff 
    ? (config.orderReceiptTitle || 'BUKTI PENERIMAAN KENDARAAN')
    : (config.paymentReceiptTitle || 'STRUK BUKTI PEMBAYARAN')
  const previewSubtitle = isDropOff
    ? (config.orderReceiptSubtitle || 'Tanda Terima Drop-Off / Penitipan')
    : (config.paymentReceiptSubtitle || 'Struk Resmi Transaksi Lunas')
  const previewClosingNote = isDropOff 
    ? config.orderDisclaimer 
    : config.paymentDisclaimer

  const handleBluetoothTestPrint = async () => {
    setIsBtTesting(true)
    setBtTestStatus(null)
    try {
      const previewReceiptData = {
        storeName: config.storeName || 'RELAYPOS CARWASH & CAFE',
        storeTagline: config.storeTagline || '',
        storeAddress: config.storeAddress || '',
        storePhone: config.storePhone || '',
        showStoreAddress: config.showStoreAddress !== false,
        showStorePhone: config.showStorePhone !== false,
        title: previewTitle,
        orderNumber: 'ORD-B8F231A9',
        tanggal: '20/09/2026, 14:30 WIB',
        kasir: 'KASIR UTAMA',
        plat: 'B 1234 ABC',
        model: 'Fortuner GR (Hitam)',
        kehadiran: isDropOff ? 'DITINGGAL' : 'DITUNGGU',
        items: sampleItems,
        subtotal: sampleSubtotal,
        total: sampleTotal,
        metodeBayar: 'CASH (TUNAI)',
        bayarNominal: sampleCash,
        kembalianNominal: sampleKembalian,
        type: isDropOff ? 'ORDER_DROP_OFF' : 'PAYMENT_RECEIPT',
        disclaimer: previewClosingNote,
        footerText: config.footerText || PERMANENT_RELAYPOS_FOOTER
      }

      const res = await printReceiptViaBluetooth(previewReceiptData, config.paperWidth || '58mm')
      setBtTestStatus({
        type: 'success',
        text: `Sukses cetak ke ${res.printerName || 'Printer Bluetooth'}! Format 1:1 persis preview layar.`
      })
      setTimeout(() => setBtTestStatus(null), 5000)
    } catch (err) {
      console.warn('BT Test print error:', err)
      let msg = err.message || 'Gagal tes cetak Bluetooth'
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        msg = 'Pemilihan printer Bluetooth dibatalkan'
      }
      setBtTestStatus({
        type: 'error',
        text: msg
      })
      setTimeout(() => setBtTestStatus(null), 5000)
    } finally {
      setIsBtTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="glass-panel p-5 sm:p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
              PRINTER THERMAL & WHATSAPP
            </span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400">POS Customizer Engine</span>
          </div>
          <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Printer className="text-cyan-400" size={22} />
            Kustomisasi Format & Teks Struk Kasir
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Atur nama toko, nomor kontak, judul tanda terima, kalimat penutup/ucapan terima kasih, dan teks footer agar sesuai identitas usaha Anda.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
            title="Reset ke Template Default"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
          
          {/* Direct Web Bluetooth Test Button - Always rendered */}
          <button
            type="button"
            onClick={handleBluetoothTestPrint}
            disabled={isBtTesting}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all disabled:opacity-50 active:scale-95"
            title="Tes cetak instan langsung ke printer thermal Bluetooth (Bebas Watermark & Tanpa RawBT)"
          >
            {isBtTesting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Bluetooth size={14} className="text-cyan-300" />
            )}
            <span>{isBtTesting ? 'Mencetak...' : '⚡ Tes Bluetooth Direct'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestPrint}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 shadow-sm transition-all"
            title="Uji Cetak Hasil ke Printer Fisik via Browser Dialog"
          >
            <Printer size={14} className="text-cyan-400" />
            <span>Tes Cetak Browser</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-cyan-400/20 transition-all uppercase tracking-wider"
          >
            <Save size={15} />
            <span>Simpan</span>
          </button>
        </div>
      </div>

      {/* Bluetooth Test Status Banner */}
      {btTestStatus && (
        <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between animate-fade-in shadow-sm ${
          btTestStatus.type === 'success' 
            ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300' 
            : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {btTestStatus.type === 'success' ? (
              <CheckCircle2 size={16} className="text-blue-400 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
            )}
            <span>{btTestStatus.text}</span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
            btTestStatus.type === 'success' ? 'bg-blue-500/20 text-blue-300' : 'bg-rose-500/20 text-rose-300'
          }`}>
            {btTestStatus.type === 'success' ? 'Bluetooth Ready' : 'Gagal'}
          </span>
        </div>
      )}

      {/* Success Notification Alert */}
      {saveSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>Pengaturan dan teks kustomisasi struk kasir berhasil disimpan secara permanen!</span>
          </div>
          <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">Tersimpan</span>
        </div>
      )}

      {/* Main Grid: Form Customizer (Left) vs Real-Time Interactive Thermal Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Configuration Form */}
        <div className="lg:col-span-7 space-y-4">
          {/* Sub-Section Navigation Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveSubSection('hardware')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubSection === 'hardware'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'text-blue-400 hover:text-blue-300 hover:bg-slate-800/60'
              }`}
            >
              <Bluetooth size={13} />
              <span>⚡ Printer Bluetooth & Tes</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('closing')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubSection === 'closing'
                  ? 'bg-amber-400 text-slate-950 shadow-md'
                  : 'text-amber-400/90 hover:text-amber-300 hover:bg-slate-800/60'
              }`}
            >
              <MessageSquare size={13} />
              <span>1. Kalimat Penutup & Footer</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('store')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubSection === 'store'
                  ? 'bg-cyan-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Store size={13} />
              <span>2. Identitas Toko</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('titles')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubSection === 'titles'
                  ? 'bg-cyan-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FileText size={13} />
              <span>3. Judul & Header Struk</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('paper')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubSection === 'paper'
                  ? 'bg-cyan-400 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Printer size={13} />
              <span>4. Ukuran Kertas</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubSection('all')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeSubSection === 'all'
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-indigo-400 hover:text-indigo-300 hover:bg-slate-800/60'
              }`}
            >
              <Layers size={13} />
              <span>Tampilkan Semua Seksi</span>
            </button>
          </div>

          {/* ============================================================== */}
          {/* SEKSI 0: HARDWARE PRINTER BLUETOOTH & TES CETAK DIRECT */}
          {/* ============================================================== */}
          {(activeSubSection === 'hardware' || activeSubSection === 'all') && (
            <div className="glass-panel p-5 rounded-2xl border border-blue-500/30 space-y-4 bg-gradient-to-b from-blue-500/10 to-transparent animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    <Bluetooth size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      Pengaturan Hardware & Koneksi Printer Bluetooth
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Cetak langsung dari browser via Web Bluetooth ESC/POS (100% Bebas Watermark RawBT).
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  hasBtSupport 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {hasBtSupport ? 'Web Bluetooth Siap' : 'Perlu Chrome / HTTPS'}
                </span>
              </div>

              {/* Diagnostic Box if Not Supported */}
              {!hasBtSupport && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-amber-400">
                    <AlertCircle size={16} />
                    <span>Perhatian: Web Bluetooth Belum Aktif di Browser Ini</span>
                  </div>
                  {btDiag.reason && <p className="leading-relaxed">{btDiag.reason}</p>}
                  {btDiag.fixSuggestion && (
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-amber-500/20 text-slate-300 font-mono text-[11px] leading-relaxed">
                      💡 <strong>Solusi Cepat:</strong> {btDiag.fixSuggestion}
                    </div>
                  )}
                </div>
              )}

              {/* Status Box */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Zap size={14} className="text-cyan-400" />
                      <span>Metode Direct ESC/POS Web Bluetooth</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Mengirim sinyal biner langsung ke printer tanpa melalui Android Print Spooler atau aplikasi pihak ketiga seperti RawBT.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBluetoothTestPrint}
                    disabled={isBtTesting}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {isBtTesting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Bluetooth size={14} className="text-cyan-300" />
                    )}
                    <span>{isBtTesting ? 'Sedang Mencetak...' : '⚡ Sambungkan & Tes Cetak'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                    <Info size={12} className="text-blue-400" />
                    <span>Petunjuk Penggunaan:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[10.5px]">
                    <li>Nyalakan printer thermal Bluetooth Anda sebelum menekan tombol tes di atas.</li>
                    <li>Saat dialog browser muncul, pilih nama printer (misal: <em>POS-58, RPP02N, PT-210</em>), lalu klik <strong>Pair</strong>.</li>
                    <li>Setelah terhubung, kasir dapat mencetak langsung dari modal transaksi tanpa watermark pihak ketiga.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SEKSI 1: KALIMAT PENUTUP & FOOTER (FOKUS UTAMA USER) */}
          {/* ============================================================== */}
          {(activeSubSection === 'closing' || activeSubSection === 'all') && (
            <div className="glass-panel p-5 rounded-2xl border border-amber-400/30 space-y-5 bg-gradient-to-b from-amber-400/5 to-transparent animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-400/10 text-amber-400">
                    <MessageSquare size={17} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      Field Kustomisasi Kalimat Penutup & Catatan Kaki
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Teks yang dicetak di baris paling bawah sebelum akhir struk dipotong printer.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold">
                  Bebas Edit
                </span>
              </div>

              {/* 1A. Kalimat Penutup Struk Bukti Pembayaran (LUNAS) */}
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/60 border border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Receipt size={14} />
                    <span>Kalimat Penutup: Struk Bukti Pembayaran (Lunas)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPreviewType('PAYMENT')}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <Eye size={11} />
                    Lihat di Preview
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Dicetak saat kasir menerima pembayaran lunas. Cocok untuk ucapan terima kasih, doa perjalanan, atau info garansi.
                </p>
                <textarea
                  rows={3}
                  value={config.paymentDisclaimer || ''}
                  onChange={(e) => handleChange('paymentDisclaimer', e.target.value)}
                  placeholder="Contoh: Terima kasih atas kepercayaan Anda..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-400 leading-relaxed resize-none"
                />
                
                {/* Preset Chips */}
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 font-medium">Contoh Preset Cepat:</span>
                  <button
                    type="button"
                    onClick={() => applyPaymentClosingPreset('Terima kasih atas kepercayaan Anda. Harap periksa kembali kendaraan dan barang bawaan Anda sebelum meninggalkan area RelayPOS.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPaymentClosingPreset('Terima kasih banyak atas kunjungan Anda! Hati-hati di jalan dan semoga selamat sampai tujuan.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Doa Perjalanan
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPaymentClosingPreset('Garansi cuci 1x24 Jam bila terkena hujan! Cukup tunjukkan lembar struk ini ke kasir kami.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Garansi Hujan 24 Jam
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPaymentClosingPreset('Kepuasan Anda kebanggaan kami. Kritik & saran hubungi WhatsApp kami.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Kritik & Saran
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPaymentClosingPreset('')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
                  >
                    Hapus / Kosongkan
                  </button>
                </div>
              </div>

              {/* 1B. Kalimat Penutup Struk Bukti Order (DITINGGAL / PENDING) */}
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/60 border border-amber-500/20">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    <span>Kalimat Penutup: Struk Bukti Order (Drop-Off Ditinggal)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPreviewType('ORDER')}
                    className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <Eye size={11} />
                    Lihat di Preview
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Dicetak saat mobil ditinggal oleh pelanggan. Cocok untuk peringatan barang berharga dan syarat klaim unit.
                </p>
                <textarea
                  rows={3}
                  value={config.orderDisclaimer || ''}
                  onChange={(e) => handleChange('orderDisclaimer', e.target.value)}
                  placeholder="Contoh: Simpan bukti ini sebagai tanda terima sah..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 leading-relaxed resize-none"
                />

                {/* Preset Chips */}
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 font-medium">Contoh Preset Cepat:</span>
                  <button
                    type="button"
                    onClick={() => applyOrderClosingPreset('Simpan bukti ini sebagai tanda terima sah saat pengambilan kendaraan. Mohon tidak meninggalkan barang berharga di dalam kendaraan.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Default
                  </button>
                  <button
                    type="button"
                    onClick={() => applyOrderClosingPreset('Wajib membawa lembar bukti order fisik ini saat mengambil kunci kendaraan di kasir.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Wajib Bukti Fisik
                  </button>
                  <button
                    type="button"
                    onClick={() => applyOrderClosingPreset('Status pengerjaan unit mobil Anda akan diinfokan otomatis melalui notifikasi WhatsApp.')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                  >
                    Notifikasi WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => applyOrderClosingPreset('')}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
                  >
                    Hapus / Kosongkan
                  </button>
                </div>
              </div>

              {/* 1C. Teks Catatan Kaki Paling Bawah (Footer Note) - TERKUNCI BRANDING RELAYPOS */}
              <div className="space-y-2.5 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Lock size={13} className="text-amber-400" />
                    <span>Catatan Kaki Bawah: Media Promosi & Lisensi RelayPOS</span>
                  </label>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
                    Otomatis Sistem
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Bagian ini dicetak permanen di paling bawah struk fisik dan bukti WhatsApp sebagai media verifikasi sistem cloud resmi dan pengiklan layanan RelayPOS.
                </p>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300">
                  <Sparkles size={14} className="text-cyan-400 shrink-0" />
                  <span className="font-semibold">{PERMANENT_RELAYPOS_FOOTER}</span>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SEKSI 2: IDENTITAS TOKO & HEADER */}
          {/* ============================================================== */}
          {(activeSubSection === 'store' || activeSubSection === 'all') && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Store size={18} className="text-cyan-400" />
                <h4 className="text-sm font-bold text-white">Identitas Usaha & Header Struk</h4>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Nama Usaha / Outlet (Huruf Kapital Tebal)
                  </label>
                  <input
                    type="text"
                    value={config.storeName}
                    onChange={(e) => handleChange('storeName', e.target.value)}
                    placeholder="Contoh: RELAYPOS CARWASH & CAFE"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-bold focus:outline-none focus:border-cyan-400 uppercase tracking-wide"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Slogan / Sub-Header Usaha
                  </label>
                  <input
                    type="text"
                    value={config.storeTagline}
                    onChange={(e) => handleChange('storeTagline', e.target.value)}
                    placeholder="Contoh: Professional Car Wash, Detailing & Cafe"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        No. Kontak / WhatsApp
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.showStorePhone}
                          onChange={(e) => handleChange('showStorePhone', e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-cyan-400 focus:ring-0"
                        />
                        <span>Cetak di Struk</span>
                      </label>
                    </div>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={config.storePhone}
                        onChange={(e) => handleChange('storePhone', e.target.value)}
                        placeholder="Contoh: 0812-3456-7890"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Instagram / Media Sosial
                    </label>
                    <div className="relative">
                      <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={config.storeSocial}
                        onChange={(e) => handleChange('storeSocial', e.target.value)}
                        placeholder="Contoh: @relaypos.id"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Alamat Fisik Outlet
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.showStoreAddress}
                        onChange={(e) => handleChange('showStoreAddress', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-cyan-400 focus:ring-0"
                      />
                      <span>Cetak di Struk</span>
                    </label>
                  </div>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-3 text-slate-500" />
                    <textarea
                      rows={2}
                      value={config.storeAddress}
                      onChange={(e) => handleChange('storeAddress', e.target.value)}
                      placeholder="Contoh: Jl. Boulevard Raya Blok A No. 12, Jakarta"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SEKSI 3: JUDUL & FORMAT HEADER STRUK */}
          {/* ============================================================== */}
          {(activeSubSection === 'titles' || activeSubSection === 'all') && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <FileText size={18} className="text-cyan-400" />
                <h4 className="text-sm font-bold text-white">Format Judul Struk Order & Pembayaran</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Format Struk Order */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <span className="text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-400/10 uppercase">
                    Struk Bukti Order
                  </span>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Judul Utama</label>
                    <input
                      type="text"
                      value={config.orderReceiptTitle}
                      onChange={(e) => handleChange('orderReceiptTitle', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Subjudul</label>
                    <input
                      type="text"
                      value={config.orderReceiptSubtitle}
                      onChange={(e) => handleChange('orderReceiptSubtitle', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                    />
                  </div>
                </div>

                {/* Format Struk Pembayaran */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                  <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-400/10 uppercase">
                    Struk Bukti Pembayaran
                  </span>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Judul Utama</label>
                    <input
                      type="text"
                      value={config.paymentReceiptTitle}
                      onChange={(e) => handleChange('paymentReceiptTitle', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Subjudul</label>
                    <input
                      type="text"
                      value={config.paymentReceiptSubtitle}
                      onChange={(e) => handleChange('paymentReceiptSubtitle', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SEKSI 4: UKURAN KERTAS PRINTER */}
          {/* ============================================================== */}
          {(activeSubSection === 'paper' || activeSubSection === 'all') && (
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Printer size={18} className="text-cyan-400" />
                <h4 className="text-sm font-bold text-white">Preferensi Lebar Kertas Printer Kasir</h4>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleChange('paperWidth', '58mm')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    config.paperWidth === '58mm'
                      ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-300 ring-1 ring-cyan-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">58 mm (Kompak)</div>
                  <div className="text-[10px] text-slate-500 mt-1">Printer Bluetooth mini kasir portable</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleChange('paperWidth', '72mm')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    config.paperWidth === '72mm' || config.paperWidth === '80mm'
                      ? 'bg-cyan-400/10 border-cyan-400/40 text-cyan-300 ring-1 ring-cyan-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-xs">72 mm / 80 mm (Standar POS)</div>
                  <div className="text-[10px] text-slate-500 mt-1">Printer thermal USB desktop kasir umum</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Real-Time Interactive Thermal Receipt Preview */}
        <div className="lg:col-span-5 sticky top-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Eye size={15} className="text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Live Struk Preview</span>
            </div>
            
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-900 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setPreviewType('PAYMENT')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  previewType === 'PAYMENT'
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bukti Bayar
              </button>
              <button
                type="button"
                onClick={() => setPreviewType('ORDER')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  previewType === 'ORDER'
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bukti Order
              </button>
            </div>
          </div>

          {/* The Physical Simulated Thermal Receipt Paper */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex justify-center shadow-inner">
            <div 
              style={{ width: config.paperWidth === '58mm' ? '250px' : '310px' }}
              className="bg-white text-black p-4 font-mono shadow-2xl rounded text-[11px] leading-snug border border-dashed border-slate-300 transition-all select-none"
            >
              {/* Header Branding */}
              <div className="text-center pb-2 border-b border-dashed border-slate-400">
                <h4 className="font-black text-xs uppercase tracking-wider leading-tight">
                  {config.storeName || 'NAMA OUTLET'}
                </h4>
                {config.storeTagline && (
                  <p className="text-[9px] text-slate-600 font-sans mt-0.5">{config.storeTagline}</p>
                )}
                {config.showStoreAddress && config.storeAddress && (
                  <p className="text-[8.5px] text-slate-500 font-sans mt-0.5 leading-snug">{config.storeAddress}</p>
                )}
                {config.showStorePhone && config.storePhone && (
                  <p className="text-[8.5px] text-slate-500 font-sans">Telp/WA: {config.storePhone}</p>
                )}
                
                <div className="mt-1.5 inline-block px-2 py-0.5 border border-slate-800 font-bold text-[9px] uppercase tracking-wider rounded">
                  {previewTitle}
                </div>
              </div>

              {/* Metadata */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">No. Order:</span>
                  <span className="font-bold">ORD-B8F231A9</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Waktu:</span>
                  <span>20/09/2026, 14:30 WIB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kasir:</span>
                  <span className="font-bold">KASIR UTAMA</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-300 font-bold text-[11px]">
                  <span>No. Polisi:</span>
                  <span className="bg-slate-100 px-1 rounded border border-slate-300">B 1234 ABC</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">Kendaraan:</span>
                  <span>Fortuner GR (Hitam)</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-500">Kehadiran:</span>
                  <span className={`font-black ${isDropOff ? 'text-amber-700' : 'text-slate-900'}`}>
                    {isDropOff ? 'DITINGGAL' : 'DITUNGGU'}
                  </span>
                </div>
              </div>

              {/* Item Breakdown */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-1.5">
                <div className="font-bold text-[10px] text-slate-500 uppercase tracking-wider">
                  Rincian Pesanan:
                </div>
                {sampleItems.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="font-bold text-[10px]">{item.name}</div>
                    <div className="flex justify-between text-[10px] text-slate-700">
                      <span>{item.qty} x {formatRupiahReceipt(item.price)}</span>
                      <span className="font-mono text-right font-bold">{formatRupiahReceipt(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Financial Totals */}
              <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono">{formatRupiahReceipt(sampleSubtotal)}</span>
                </div>
                <div className="flex justify-between font-black text-[12px] pt-1 border-t border-dotted border-slate-300">
                  <span>{isDropOff ? 'ESTIMASI TOTAL:' : 'TOTAL AKHIR:'}</span>
                  <span className="font-mono">{formatRupiahReceipt(sampleTotal)}</span>
                </div>

                {!isDropOff && (
                  <>
                    <div className="flex justify-between pt-1 text-slate-700 text-[10px]">
                      <span>Metode Bayar:</span>
                      <span className="font-bold uppercase">CASH (TUNAI)</span>
                    </div>
                    <div className="flex justify-between text-slate-700 text-[10px]">
                      <span>Uang Diterima:</span>
                      <span className="font-mono">{formatRupiahReceipt(sampleCash)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 text-[10px]">
                      <span>Kembalian:</span>
                      <span className="font-mono">{formatRupiahReceipt(sampleKembalian)}</span>
                    </div>
                    <div className="mt-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-center font-bold text-[9px] rounded border border-emerald-300">
                      STATUS: LUNAS
                    </div>
                  </>
                )}

                {isDropOff && (
                  <div className="mt-1.5 py-0.5 bg-amber-100 text-amber-800 text-center font-bold text-[9px] rounded border border-amber-300">
                    STATUS: BELUM DIBAYAR (PENDING)
                  </div>
                )}
              </div>

              {/* Closing Sentence & Permanent RelayPOS Branding Footer */}
              <div className="pt-2 text-center space-y-1 text-[9px] text-slate-600">
                {previewClosingNote && (
                  <p className="leading-snug italic font-sans font-medium text-slate-700">
                    "{previewClosingNote}"
                  </p>
                )}
                <div className="pt-1.5 border-t border-dotted border-slate-300 font-sans text-[8px] text-slate-400">
                  {PERMANENT_RELAYPOS_FOOTER}
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Sparkles size={14} className="text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Tampilan kertas struk di atas merespons langsung setiap ketikan Anda dan dicetak tepat 1 halaman tanpa kertas terbuang.
            </span>
          </div>
        </div>
      </div>

      {/* Hidden container for Test Print */}
      {isTestPrinting && typeof document !== 'undefined' && createPortal(
        <div className="thermal-print-only">
          <div 
            style={{ width: config.paperWidth === '58mm' ? '54mm' : '72mm', margin: '0 auto' }}
            className="bg-white text-black font-mono text-[11px] leading-snug select-none"
          >
            {/* Header Branding */}
            <div className="text-center pb-2 border-b border-dashed border-slate-400">
              <h4 className="font-black text-xs uppercase tracking-wider leading-tight">
                {config.storeName || 'NAMA OUTLET'}
              </h4>
              {config.storeTagline && (
                <p className="text-[9px] text-slate-600 font-sans mt-0.5">{config.storeTagline}</p>
              )}
              {config.showStoreAddress && config.storeAddress && (
                <p className="text-[8.5px] text-slate-500 font-sans mt-0.5 leading-snug">{config.storeAddress}</p>
              )}
              {config.showStorePhone && config.storePhone && (
                <p className="text-[8.5px] text-slate-500 font-sans">Telp/WA: {config.storePhone}</p>
              )}
              
              <div className="mt-1.5 inline-block px-2 py-0.5 border border-slate-800 font-bold text-[9px] uppercase tracking-wider rounded">
                {previewTitle}
              </div>
            </div>

            {/* Metadata */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">No. Order:</span>
                <span className="font-bold">ORD-B8F231A9</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Waktu:</span>
                <span>20/09/2026, 14:30 WIB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kasir:</span>
                <span className="font-bold">KASIR UTAMA</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-300 font-bold text-[11px]">
                <span>No. Polisi:</span>
                <span className="bg-slate-100 px-1 rounded border border-slate-300">B 1234 ABC</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Kendaraan:</span>
                <span>Fortuner GR (Hitam)</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">Kehadiran:</span>
                <span className={`font-black ${isDropOff ? 'text-amber-700' : 'text-slate-900'}`}>
                  {isDropOff ? 'DITINGGAL' : 'DITUNGGU'}
                </span>
              </div>
            </div>

            {/* Item Breakdown */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1.5">
              <div className="font-bold text-[10px] text-slate-500 uppercase tracking-wider">
                Rincian Pesanan:
              </div>
              {sampleItems.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-[10px]">{item.name}</div>
                  <div className="flex justify-between text-[10px] text-slate-700">
                    <span>{item.qty} x {formatRupiahReceipt(item.price)}</span>
                    <span className="font-mono text-right font-bold">{formatRupiahReceipt(item.subtotal)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Financial Totals */}
            <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-mono">{formatRupiahReceipt(sampleSubtotal)}</span>
              </div>
              <div className="flex justify-between font-black text-[12px] pt-1 border-t border-dotted border-slate-300">
                <span>{isDropOff ? 'ESTIMASI TOTAL:' : 'TOTAL AKHIR:'}</span>
                <span className="font-mono">{formatRupiahReceipt(sampleTotal)}</span>
              </div>

              {!isDropOff && (
                <>
                  <div className="flex justify-between pt-1 text-slate-700 text-[10px]">
                    <span>Metode Bayar:</span>
                    <span className="font-bold uppercase">CASH (TUNAI)</span>
                  </div>
                  <div className="flex justify-between text-slate-700 text-[10px]">
                    <span>Uang Diterima:</span>
                    <span className="font-mono">{formatRupiahReceipt(sampleCash)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 text-[10px]">
                    <span>Kembalian:</span>
                    <span className="font-mono">{formatRupiahReceipt(sampleKembalian)}</span>
                  </div>
                  <div className="mt-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-center font-bold text-[9px] rounded border border-emerald-300">
                    STATUS: LUNAS
                  </div>
                </>
              )}

              {isDropOff && (
                <div className="mt-1.5 py-0.5 bg-amber-100 text-amber-800 text-center font-bold text-[9px] rounded border border-amber-300">
                  STATUS: BELUM DIBAYAR (PENDING)
                </div>
              )}
            </div>

            {/* Closing Sentence & Permanent RelayPOS Branding Footer */}
            <div className="pt-2 text-center space-y-1 text-[9px] text-slate-600">
              {previewClosingNote && (
                <p className="leading-snug italic font-sans font-medium text-slate-700">
                  "{previewClosingNote}"
                </p>
              )}
              <div className="pt-1.5 border-t border-dotted border-slate-300 font-sans text-[8px] text-slate-400">
                {PERMANENT_RELAYPOS_FOOTER}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
