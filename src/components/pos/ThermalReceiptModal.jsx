import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { 
  Printer, 
  Send, 
  X, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Car, 
  Coffee, 
  Smartphone,
  Copy,
  Check,
  Bluetooth,
  Zap,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { formatRupiahReceipt, generateWhatsAppReceiptMessage, getReceiptConfig } from '../../utils/receiptHelpers'
import { 
  isWebBluetoothSupported, 
  printReceiptViaBluetooth,
  getConnectedPrinterName 
} from '../../utils/bluetoothPrinter'

/**
 * ThermalReceiptModal Component
 * Menampilkan struk kasir dalam format thermal receipt (58mm/80mm)
 * Menjamin cetak tepat 1 halaman tanpa lembar kedua kosong
 * Mendukung Direct Web Bluetooth ESC/POS Printing (100% Bebas Watermark)
 */
export default function ThermalReceiptModal({ 
  receiptData, 
  onClose 
}) {
  if (!receiptData) return null

  const [phoneInput, setPhoneInput] = useState(receiptData.noTelepon || '')
  const [copied, setCopied] = useState(false)
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState(false)
  const [btStatusMsg, setBtStatusMsg] = useState(null) // { type: 'success' | 'error', text: string }

  const isDropOff = receiptData.type === 'ORDER_DROP_OFF'
  const isKitchenSlip = receiptData.type === 'KITCHEN_TICKET'
  const waInfo = generateWhatsAppReceiptMessage(receiptData, phoneInput)
  const config = getReceiptConfig()
  const hasBtSupport = isWebBluetoothSupported()

  // State untuk mode cetak dapur/bar
  const [showKitchenSlip, setShowKitchenSlip] = useState(false)
  const hasCafeItems = receiptData.items?.some(it => it.type === 'CAFE' || !it.type)

  // Pasang class ke body saat modal terbuka agar CSS print dapat mematikan display:none pada #root
  useEffect(() => {
    document.body.classList.add('has-thermal-receipt')
    return () => {
      document.body.classList.remove('has-thermal-receipt')
    }
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const handleBluetoothPrint = async () => {
    setIsBluetoothPrinting(true)
    setBtStatusMsg(null)
    try {
      const result = await printReceiptViaBluetooth(receiptData, config.paperWidth || '58mm')
      setBtStatusMsg({
        type: 'success',
        text: `Tercetak ke ${result.printerName || 'Printer Bluetooth'}!`
      })
      setTimeout(() => {
        setBtStatusMsg(null)
      }, 4000)
    } catch (err) {
      console.warn('Bluetooth Print error:', err)
      let userFriendlyMsg = err.message || 'Gagal mencetak via Bluetooth'
      if (err.name === 'NotFoundError' || err.message?.includes('User cancelled')) {
        userFriendlyMsg = 'Pemilihan printer Bluetooth dibatalkan'
      }
      setBtStatusMsg({
        type: 'error',
        text: userFriendlyMsg
      })
      setTimeout(() => {
        setBtStatusMsg(null)
      }, 5000)
    } finally {
      setIsBluetoothPrinting(false)
    }
  }

  const handleSendWhatsApp = () => {
    window.open(waInfo.url, '_blank', 'noopener,noreferrer')
  }

  const handleCopyText = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(waInfo.message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Komponen isi struk yang digunakan baik untuk pratinjau layar maupun cetak fisik
  const renderReceiptContent = (isPrintVersion = false) => (
    <div 
      className={`w-full max-w-[340px] bg-white text-slate-950 font-mono text-[11px] leading-relaxed p-4 rounded-lg ${
        isPrintVersion ? 'border-0 p-0 shadow-none' : 'shadow-md border border-slate-200'
      }`}
    >
      {/* Store Branding Header */}
      <div className="text-center pb-2.5 border-b border-dashed border-slate-400">
        <h4 className="font-black text-xs sm:text-sm tracking-wider uppercase leading-tight">{receiptData.storeName}</h4>
        {receiptData.storeTagline && (
          <p className="text-[9px] text-slate-600 font-sans tracking-wide mt-0.5">{receiptData.storeTagline}</p>
        )}
        {receiptData.showStoreAddress && receiptData.storeAddress && (
          <p className="text-[8.5px] text-slate-500 font-sans mt-0.5 leading-snug">{receiptData.storeAddress}</p>
        )}
        {receiptData.showStorePhone && receiptData.storePhone && (
          <p className="text-[8.5px] text-slate-500 font-sans">Telp/WA: {receiptData.storePhone}</p>
        )}
        
        {receiptData.nomorMejaAntrean && (
          <div className="bg-slate-100 p-2 rounded-lg border border-slate-300 text-center my-1.5 shadow-xs">
            <div className="text-[8.5px] font-black uppercase tracking-wider text-slate-500">MEJA / NO. ANTREAN</div>
            <div className="text-base font-black font-mono tracking-wider text-slate-900">{receiptData.nomorMejaAntrean}</div>
            <span className="inline-block mt-0.5 px-2 py-0.2 rounded text-[8px] font-black uppercase bg-slate-200 text-slate-700">
              {receiptData.tipePesanan || 'DINE IN'}
            </span>
          </div>
        )}

        <div className="mt-1.5 inline-block px-2 py-0.5 border border-slate-800 font-bold text-[9px] uppercase tracking-wider rounded">
          {showKitchenSlip ? 'TIKET PESANAN DAPUR / BAR' : receiptData.title}
        </div>
      </div>

      {/* Metadata (Order info, Plate, Date, Cashier) */}
      <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
        <div className="flex justify-between">
          <span className="text-slate-600">No. Order:</span>
          <span className="font-bold">{showKitchenSlip ? `KTC-${(receiptData.orderNumber || '').replace('ORD-', '')}` : receiptData.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Waktu:</span>
          <span>{receiptData.tanggal}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Kasir:</span>
          <span className="font-bold">{receiptData.kasir}</span>
        </div>
        {!showKitchenSlip && (
          <>
            {(receiptData.hasCarwash || (receiptData.plat && receiptData.plat !== '-')) ? (
              <>
                <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-300 font-bold text-[11px]">
                  <span>No. Polisi:</span>
                  <span className="bg-slate-100 px-1 rounded border border-slate-300">{receiptData.plat}</span>
                </div>
                {receiptData.model && receiptData.model !== '-' && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-600">Kendaraan:</span>
                    <span>{receiptData.model}</span>
                  </div>
                )}
                {receiptData.kehadiran && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-600">Kehadiran:</span>
                    <span className={`font-black ${isDropOff ? 'text-amber-800' : 'text-slate-900'}`}>
                      {receiptData.kehadiran}
                    </span>
                  </div>
                )}
              </>
            ) : (
              (receiptData.nomorMejaAntrean || receiptData.tipePesanan) && (
                <div className="flex justify-between items-center pt-1 border-t border-dotted border-slate-300 font-bold text-[10px]">
                  <span className="text-slate-600">Meja / Pesanan:</span>
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 text-slate-800">
                    {receiptData.nomorMejaAntrean || receiptData.tipePesanan}
                  </span>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Item Breakdown */}
      <div className="py-2 border-b border-dashed border-slate-400 space-y-1.5">
        <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
          {showKitchenSlip ? 'Pesanan yang Harus Disiapkan:' : 'Rincian Layanan & Pesanan'}
        </div>
        {(showKitchenSlip 
          ? receiptData.items.filter(it => it.type === 'CAFE' || !it.type) 
          : receiptData.items
        ).map((item, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="flex justify-between">
              <span className={`font-semibold ${showKitchenSlip ? 'text-xs font-bold text-black' : ''}`}>
                {showKitchenSlip ? `${item.qty}x ` : ''}{item.name}
              </span>
              {!showKitchenSlip && (
                <span className="font-bold">{formatRupiahReceipt(item.subtotal)}</span>
              )}
            </div>
            {!showKitchenSlip && item.qty > 1 && (
              <div className="text-[9px] text-slate-500 pl-2">
                {item.qty} x {formatRupiahReceipt(item.price)}
              </div>
            )}
            {item.detail && (
              <div className={`pl-2 ${showKitchenSlip ? 'text-[10px] font-black text-slate-900 bg-amber-100 px-1 py-0.5 rounded border border-amber-300 inline-block mt-0.5' : 'text-[9px] text-slate-500 italic'}`}>
                {item.detail}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Financial Summary (Only if NOT Kitchen Slip) */}
      {!showKitchenSlip && (
        <div className="py-2 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span>{formatRupiahReceipt(receiptData.subtotal || receiptData.items?.reduce((acc, i) => acc + (Number(i.subtotal) || 0), 0) || receiptData.totalTagihan)}</span>
          </div>
          {receiptData.diskonCarwash > 0 && (
            <div className="flex justify-between text-rose-700">
              <span>Diskon Carwash:</span>
              <span>-{formatRupiahReceipt(receiptData.diskonCarwash)}</span>
            </div>
          )}
          {receiptData.diskonCafe > 0 && (
            <div className="flex justify-between text-rose-700">
              <span>Diskon Cafe:</span>
              <span>-{formatRupiahReceipt(receiptData.diskonCafe)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-xs font-black pt-1 border-t border-slate-300">
            <span>{isDropOff ? 'TOTAL ESTIMASI:' : 'TOTAL TAGIHAN:'}</span>
            <span>{formatRupiahReceipt(receiptData.totalTagihan || receiptData.total)}</span>
          </div>

          {receiptData.isPaid ? (
            <>
              <div className="flex justify-between pt-1 text-slate-700">
                <span>Metode Bayar:</span>
                <span className="font-bold">{receiptData.metodeBayar}</span>
              </div>
              {receiptData.metodeBayar === 'CASH' && (
                <>
                  <div className="flex justify-between text-slate-700">
                    <span>Uang Diterima:</span>
                    <span>{formatRupiahReceipt(receiptData.uangDiterima)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold">
                    <span>Kembalian:</span>
                    <span>{formatRupiahReceipt(receiptData.kembalian)}</span>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-1 bg-amber-50 rounded border border-amber-200 text-amber-900 font-extrabold text-[9px] mt-1">
              STATUS: BELUM DIBAYAR (PENDING)
            </div>
          )}
        </div>
      )}

      {/* Kitchen Slip Footer Notice */}
      {showKitchenSlip && (
        <div className="py-2.5 text-center text-[9px] text-slate-700 font-bold border-b border-dashed border-slate-400">
          *** SEGERA SIAPKAN &amp; SAJIKAN KE MEJA/ANTREAN ***
        </div>
      )}

      {/* Footer Disclaimer & Note */}
      {(receiptData.disclaimer || receiptData.footerText) && (
        <div className="pt-2.5 text-center space-y-1 text-[9px] text-slate-600">
          {receiptData.disclaimer && (
            <p className="leading-snug">{receiptData.disclaimer}</p>
          )}
          {receiptData.footerText && (
            <div className="pt-1.5 border-t border-dotted border-slate-300 font-sans text-[8px] text-slate-400">
              {receiptData.footerText}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* 1. ON-SCREEN MODAL PREVIEW (Disembunyikan saat print via CSS) */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in no-print">
        <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
          
          {/* Modal Header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                isDropOff 
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                  : 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20'
              }`}>
                {isDropOff ? <Clock size={18} /> : <CheckCircle2 size={18} />}
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span>{receiptData.title}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                    isDropOff 
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                      : 'bg-brand-emerald/20 text-brand-emerald border border-brand-emerald/30'
                  }`}>
                    {isDropOff ? 'DITINGGAL' : 'LUNAS'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isDropOff 
                    ? 'Struk tanda terima saat mobil ditinggal pelanggan' 
                    : 'Struk resmi pelunasan kasir'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Body: Thermal Paper Preview */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-slate-950/40 flex flex-col items-center">
            {renderReceiptContent(false)}

            {/* Quick WhatsApp Input Field */}
            <div className="w-full max-w-[340px] mt-4 p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <label className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Smartphone size={12} className="text-brand-emerald" />
                <span>Nomor WhatsApp Pelanggan:</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Contoh: 08123456789"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-brand-emerald"
                />
                <button
                  type="button"
                  onClick={handleCopyText}
                  title="Salin Teks Struk"
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                >
                  {copied ? <Check size={12} className="text-brand-emerald" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          </div>

          {/* Modal Actions Footer */}
          <div className="px-5 py-4 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-3">
            {/* Status Alert for Bluetooth Action */}
            {btStatusMsg && (
              <div className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-fade-in ${
                btStatusMsg.type === 'success' 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {btStatusMsg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{btStatusMsg.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  Tutup
                </button>

                {hasCafeItems && (
                  <button
                    type="button"
                    onClick={() => setShowKitchenSlip(!showKitchenSlip)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                      showKitchenSlip
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Ganti ke format Tiket Dapur / Bar (tanpa harga)"
                  >
                    <span>{showKitchenSlip ? '🧾 Lihat Struk Kasir' : '🍜 Format Tiket Dapur'}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!showKitchenSlip && (
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    className="px-3.5 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                  >
                    <Send size={14} />
                    <span>Kirim WA</span>
                  </button>
                )}

                {/* Direct Web Bluetooth Fast Print (100% Zero Watermark) - Always Rendered */}
                <button
                  type="button"
                  onClick={handleBluetoothPrint}
                  disabled={isBluetoothPrinting}
                  className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(59,130,246,0.35)] active:scale-95 disabled:opacity-50"
                  title="Cetak instan langsung ke printer thermal Bluetooth (Bebas Watermark & Tanpa RawBT)"
                >
                  {isBluetoothPrinting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Bluetooth size={14} className="text-cyan-300" />
                  )}
                  <span>{isBluetoothPrinting ? 'Mencetak...' : (showKitchenSlip ? '⚡ Cetak Tiket Dapur' : '⚡ Cetak Bluetooth')}</span>
                </button>

                {/* Standard Browser / PDF Print */}
                <button
                  type="button"
                  onClick={handlePrint}
                  className={`px-3.5 py-2 text-slate-950 font-extrabold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md active:scale-95 ${
                    showKitchenSlip
                      ? 'bg-amber-400 hover:bg-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                      : isDropOff 
                        ? 'bg-amber-400 hover:bg-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]' 
                        : 'bg-brand-emerald hover:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  }`}
                  title="Cetak via dialog browser / PDF"
                >
                  <Printer size={14} />
                  <span>{showKitchenSlip ? 'Cetak Tiket Dapur' : 'Cetak Browser'}</span>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 2. DEDICATED BODY PORTAL FOR PRINT ONLY (Menjamin tepat 1 halaman, 0 ghost height) */}
      {createPortal(
        <div id="thermal-receipt-print-wrapper" className="thermal-print-only">
          {renderReceiptContent(true)}
        </div>,
        document.body
      )}
    </>
  )
}
