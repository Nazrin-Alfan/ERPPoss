import React, { useState } from 'react'
import { 
  Building2, 
  Store, 
  Car, 
  Coffee, 
  UserCheck, 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Printer, 
  Phone, 
  MapPin, 
  KeyRound, 
  ShieldCheck,
  X
} from 'lucide-react'
import { saveReceiptConfig } from '../../utils/receiptHelpers'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers'
import { supabase } from '../../supabaseClient'

export default function OnboardingWizardModal({ isOpen, onClose, ownerUser, onCompleted }) {
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form States
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [printerWidth, setPrinterWidth] = useState('58mm')
  const [businessModel, setBusinessModel] = useState('HYBRID') // 'HYBRID' | 'CARWASH' | 'CAFE'
  const [cashierName, setCashierName] = useState('Kasir Doni')
  const [cashierUsername, setCashierUsername] = useState('kasir1')
  const [cashierPin, setCashierPin] = useState('1234')

  if (!isOpen) return null

  const handleNext = () => {
    setError('')
    if (currentStep === 1) {
      if (!storeName.trim()) {
        return setError('Nama Usaha / Outlet wajib diisi.')
      }
    } else if (currentStep === 2) {
      if (!businessModel) {
        return setError('Pilih salah satu model bisnis toko Anda.')
      }
    }
    setCurrentStep(prev => prev + 1)
  }

  const handleBack = () => {
    setError('')
    setCurrentStep(prev => prev - 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!cashierUsername.trim() || !cashierPin.trim()) {
      return setError('Username dan PIN kasir pertama wajib diisi.')
    }

    setLoading(true)
    try {
      // 1. Buat payload tenant bersih
      const payload = createCleanTenantPayload({
        storeName: storeName.trim(),
        ownerEmail: ownerUser?.email || 'owner@relaypos.com',
        ownerName: ownerUser?.user_metadata?.nama || ownerUser?.email || 'Owner Baru',
        telepon: storePhone.trim(),
        alamat: storeAddress.trim(),
        tier: 'PRO_ANNUAL',
        licenseDurationMonths: 12,
        businessType: businessModel // 'HYBRID' | 'CARWASH' | 'CAFE'
      })

      // 2. Simpan Tenant, Branch, License ke Database
      await supabase.from('tenants').insert(payload.tenant)
      await supabase.from('branches').insert(payload.branch)
      await supabase.from('tenant_licenses').insert(payload.license)
      if (payload.initialBalances?.length > 0) {
        await supabase.from('pos_balances').insert(payload.initialBalances)
      }
      if (payload.initialPackages?.length > 0) {
        await supabase.from('carwash_packages').insert(payload.initialPackages)
      }

      // 3. Daftarkan Akun Kasir Pertama
      const newCashierProfile = {
        id: `usr_${payload.tenant.slug}_cashier_${Date.now()}`,
        tenant_id: payload.tenant.id,
        branch_id: payload.branch.id,
        nama: cashierName.trim() || 'Kasir 1',
        email: `${cashierUsername.trim().toLowerCase()}@${payload.tenant.slug}.local`,
        role: 'Kasir',
        pin: cashierPin.trim(),
        created_at: new Date().toISOString()
      }
      await supabase.from('profiles').insert(newCashierProfile)

      // 4. Perbarui Konfigurasi Struk Toko (Receipt Customizer)
      saveReceiptConfig({
        storeName: storeName.trim(),
        storeAddress: storeAddress.trim(),
        storePhone: storePhone.trim(),
        paperWidth: printerWidth
      })

      // 5. Callback Selesai
      if (onCompleted) {
        await onCompleted(payload.tenant, newCashierProfile)
      }
      onClose()
    } catch (err) {
      console.error('Error completing onboarding wizard:', err)
      setError(err.message || 'Gagal menyelesaikan konfigurasi toko baru.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-lg glass-panel border border-slate-800 rounded-3xl shadow-2xl relative flex flex-col max-h-[92dvh] overflow-hidden my-auto">
        {/* Pinned Header Steps */}
        <div className="text-center px-6 sm:px-8 pt-6 pb-4 border-b border-slate-800/80 shrink-0 bg-slate-900/60">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-emerald/15 border border-brand-emerald/30 text-brand-emerald text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles size={13} />
            <span>Wizard Setup Outlet Baru</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Konfigurasi Toko Anda
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Langkah {currentStep} dari 3: {
              currentStep === 1 ? 'Identitas & Printer Struk' :
              currentStep === 2 ? 'Pilih Model Operasional' :
              'Akun Kasir Pertama Toko'
            }
          </p>

          {/* Stepper Bar */}
          <div className="grid grid-cols-3 gap-2 mt-3 max-w-xs mx-auto">
            <div className={`h-1.5 rounded-full transition-all ${currentStep >= 1 ? 'bg-brand-emerald' : 'bg-slate-800'}`}></div>
            <div className={`h-1.5 rounded-full transition-all ${currentStep >= 2 ? 'bg-brand-emerald' : 'bg-slate-800'}`}></div>
            <div className={`h-1.5 rounded-full transition-all ${currentStep >= 3 ? 'bg-brand-emerald' : 'bg-slate-800'}`}></div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="px-6 sm:px-8 py-5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
              <span className="shrink-0 font-bold">⚠️</span>
              <span>{error}</span>
            </div>
          )}

        {/* STEP 1: IDENTITAS & PRINTER STRUK */}
        {currentStep === 1 && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nama Usaha / Outlet <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Store size={16} className="absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Contoh: Berkah Carwash & Cafe"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nomor WhatsApp Toko
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="0812-3456-7890"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Alamat Fisik Toko
              </label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Jl. Ringroad No. 88, Medan"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Format Kertas Printer Thermal Kasir
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPrinterWidth('58mm')}
                  className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                    printerWidth === '58mm'
                      ? 'bg-brand-emerald/15 border-brand-emerald text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Printer size={18} className={printerWidth === '58mm' ? 'text-brand-emerald' : 'text-slate-500'} />
                  <div>
                    <div className="text-xs font-bold">58mm Thermal</div>
                    <div className="text-[10px] text-slate-500">Mobile Bluetooth</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPrinterWidth('80mm')}
                  className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${
                    printerWidth === '80mm'
                      ? 'bg-brand-emerald/15 border-brand-emerald text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Printer size={18} className={printerWidth === '80mm' ? 'text-brand-emerald' : 'text-slate-500'} />
                  <div>
                    <div className="text-xs font-bold">80mm Thermal</div>
                    <div className="text-[10px] text-slate-500">Desktop / USB POS</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: MODEL OPERASIONAL BISNIS */}
        {currentStep === 2 && (
          <div className="space-y-3 animate-fade-in">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Pilih Layanan yang Disediakan Toko:
            </label>

            <button
              type="button"
              onClick={() => setBusinessModel('HYBRID')}
              className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                businessModel === 'HYBRID'
                  ? 'bg-brand-emerald/15 border-brand-emerald text-white shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-bold shrink-0 shadow-md">
                ✨
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Carwash + Cafe F&B (Rekomendasi)</span>
                  {businessModel === 'HYBRID' && <CheckCircle2 size={16} className="text-brand-emerald" />}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Layanan estafet terpadu: kasir cuci mobil + pesanan kopi/makanan dalam satu struk pembayaran gabungan.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setBusinessModel('CARWASH')}
              className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                businessModel === 'CARWASH'
                  ? 'bg-blue-500/15 border-blue-400 text-white shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Car size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Carwash & Auto Detailing Saja</span>
                  {businessModel === 'CARWASH' && <CheckCircle2 size={16} className="text-blue-400" />}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fokus murni layanan cuci mobil, alur estafet pengerjaan slot bay, dan pembagian komisi kru pencuci.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setBusinessModel('CAFE')}
              className={`w-full p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all cursor-pointer ${
                businessModel === 'CAFE'
                  ? 'bg-purple-500/15 border-purple-400 text-white shadow-lg'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                <Coffee size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">Cafe & Resto F&B Saja</span>
                  {businessModel === 'CAFE' && <CheckCircle2 size={16} className="text-purple-400" />}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Kasir F&B lengkap dengan perakitan resep bahan baku (BOM) dan pemotongan stok otomatis saat checkout.
                </p>
              </div>
            </button>
          </div>
        )}

        {/* STEP 3: AKUN KASIR PERTAMA */}
        {currentStep === 3 && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-3.5 rounded-2xl bg-brand-emerald/10 border border-brand-emerald/20 text-xs text-slate-300">
              <span className="font-bold text-brand-emerald block mb-0.5">💡 Akun Kasir Meja Toko</span>
              Staf kasir tidak membutuhkan akun Google. Buatkan username dan PIN cepat (4 digit) agar kasir bisa langsung melayani transaksi di tablet toko.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nama Kasir
              </label>
              <div className="relative">
                <UserCheck size={16} className="absolute left-3.5 top-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Misal: Doni"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Username Kasir <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 text-sm">@</span>
                  <input
                    type="text"
                    placeholder="kasir1"
                    value={cashierUsername}
                    onChange={(e) => setCashierUsername(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  PIN Kasir <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-3 text-slate-500" />
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="1234"
                    value={cashierPin}
                    onChange={(e) => setCashierPin(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald font-mono tracking-widest"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        </div>

        {/* Pinned Footer Actions */}
        <div className="px-6 sm:px-8 py-4 border-t border-slate-800/80 bg-slate-900/90 shrink-0 flex items-center justify-between">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Kembali</span>
            </button>
          ) : (
            <div></div>
          )}

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2.5 rounded-xl bg-brand-emerald hover:bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-brand-emerald/20 transition-all cursor-pointer ml-auto"
            >
              <span>Lanjut</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-brand-emerald hover:bg-emerald-500 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-brand-emerald/20 transition-all cursor-pointer ml-auto disabled:opacity-50"
            >
              <span>{loading ? 'Menyiapkan Toko...' : 'Selesai & Buka Toko 🎉'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
