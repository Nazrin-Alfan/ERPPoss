import React, { useState, useEffect } from 'react'
import {
  Store,
  User,
  UserCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Printer,
  Phone,
  MapPin,
  KeyRound,
  Plus,
  Trash2,
  Coffee,
  Car,
  Boxes,
  SkipForward
} from 'lucide-react'
import { saveReceiptConfig } from '../../utils/receiptHelpers'
import { createCleanTenantPayload } from '../../utils/superAdminHelpers'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'

const EMPTY_CARWASH_ROW = () => ({ nama_paket: '', tarif: '' })
const EMPTY_CAFE_ROW = () => ({ nama_menu: '', kategori: 'Minuman', harga: '' })
const EMPTY_STOCK_ROW = (gudang = 'CAFE') => ({
  nama_barang: '',
  satuan: 'pcs',
  stok: '',
  harga_satuan: '',
  min_stok: '5',
  gudang,
})

export default function OnboardingWizardModal({
  isOpen,
  onClose,
  ownerUser,
  existingTenant = null,
  onCompleted,
}) {
  const { profile, registerKasir } = useAuth()
  const isGuidedExisting = Boolean(existingTenant?.id)

  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Owner & Store Profile
  const [ownerName, setOwnerName] = useState('')
  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [storePhone, setStorePhone] = useState('')
  const [printerWidth, setPrinterWidth] = useState('58mm')
  const [businessModel, setBusinessModel] = useState('HYBRID')

  // Step 2: Initial Menus, Carwash Packages & Raw Materials
  const [clearStarterSamples, setClearStarterSamples] = useState(false)
  const [carwashRows, setCarwashRows] = useState([EMPTY_CARWASH_ROW()])
  const [cafeRows, setCafeRows] = useState([EMPTY_CAFE_ROW()])
  const [stockRows, setStockRows] = useState([EMPTY_STOCK_ROW('CAFE')])

  // Step 3: First Cashier Account
  const [cashierName, setCashierName] = useState('')
  const [cashierUsername, setCashierUsername] = useState('')
  const [cashierPin, setCashierPin] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setCurrentStep(1)
    setError('')
    const resolvedOwnerName =
      profile?.nama ||
      ownerUser?.user_metadata?.nama ||
      ownerUser?.user_metadata?.full_name ||
      ownerUser?.email?.split('@')[0] ||
      ''
    setOwnerName(resolvedOwnerName)
    setStoreName(existingTenant?.nama || '')
    setBusinessModel(existingTenant?.business_type || 'HYBRID')
    setStorePhone(existingTenant?.telepon || '')
    setStoreAddress(existingTenant?.alamat || '')
    setClearStarterSamples(false)
    setCarwashRows([EMPTY_CARWASH_ROW()])
    setCafeRows([EMPTY_CAFE_ROW()])
    setStockRows([
      EMPTY_STOCK_ROW(existingTenant?.business_type === 'CARWASH' ? 'CARWASH' : 'CAFE'),
    ])
    if (!isGuidedExisting) {
      setCashierName('Kasir Doni')
      setCashierUsername('kasir1')
      setCashierPin('123456')
    } else {
      setCashierName('')
      setCashierUsername('')
      setCashierPin('')
    }
  }, [isOpen, existingTenant, profile, ownerUser, isGuidedExisting])

  if (!isOpen) return null

  const showCarwash = businessModel === 'HYBRID' || businessModel === 'CARWASH'
  const showCafe = businessModel === 'HYBRID' || businessModel === 'CAFE'

  const handleNext = () => {
    setError('')
    if (currentStep === 1) {
      if (!ownerName.trim()) {
        return setError('Nama Pemilik wajib diisi.')
      }
      if (!storeName.trim()) {
        return setError('Nama Usaha / Outlet wajib diisi.')
      }
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setError('')
    setCurrentStep((prev) => prev - 1)
  }

  const handleSkipGuidedSetup = async () => {
    if (!isGuidedExisting) {
      onClose()
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: rpcErr } = await supabase.rpc('fn_complete_store_setup', {
        p_tenant_id: existingTenant.id,
        p_payload: { skip: true },
      })
      if (rpcErr) throw rpcErr
      if (onCompleted) {
        await onCompleted({ ...existingTenant, onboarding_completed: true }, null)
      }
      onClose()
    } catch (err) {
      setError(err.message || 'Gagal melewati konfigurasi awal.')
    } finally {
      setLoading(false)
    }
  }

  const updateRow = (setter, idx, field, val) => {
    setter((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: val } : row)))
  }

  const removeRow = (setter, idx) => {
    setter((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const wantsCashier = Boolean(cashierUsername.trim() || cashierPin.trim())
    if (!isGuidedExisting && (!cashierUsername.trim() || !cashierPin.trim())) {
      return setError('Username dan kata sandi kasir pertama wajib diisi.')
    }
    if (wantsCashier && cashierPin.trim().length < 6) {
      return setError('Kata sandi / PIN kasir minimal 6 karakter.')
    }

    setLoading(true)
    try {
      const validPackages = carwashRows
        .filter((r) => r.nama_paket.trim())
        .map((r) => ({ nama_paket: r.nama_paket.trim(), tarif: parseFloat(r.tarif) || 0 }))

      const validMenus = cafeRows
        .filter((r) => r.nama_menu.trim())
        .map((r) => ({
          nama_menu: r.nama_menu.trim(),
          kategori: r.kategori || 'Minuman',
          harga: parseFloat(r.harga) || 0,
        }))

      const validStocks = stockRows
        .filter((r) => r.nama_barang.trim())
        .map((r) => ({
          nama_barang: r.nama_barang.trim(),
          satuan: r.satuan || 'pcs',
          stok: parseFloat(r.stok) || 0,
          harga_satuan: parseFloat(r.harga_satuan) || 0,
          min_stok: parseFloat(r.min_stok) || 5,
          gudang: r.gudang || (businessModel === 'CARWASH' ? 'CARWASH' : 'CAFE'),
        }))

      if (isGuidedExisting) {
        const { error: rpcErr } = await supabase.rpc('fn_complete_store_setup', {
          p_tenant_id: existingTenant.id,
          p_payload: {
            owner_name: ownerName.trim(),
            store_name: storeName.trim(),
            business_type: businessModel,
            telepon: storePhone.trim(),
            alamat: storeAddress.trim(),
            clear_starter_samples: clearStarterSamples,
            carwash_packages: showCarwash ? validPackages : [],
            cafe_menus: showCafe ? validMenus : [],
            stock_items: validStocks,
          },
        })
        if (rpcErr) throw rpcErr

        let createdCashier = null
        if (wantsCashier && registerKasir) {
          const kasirRes = await registerKasir(
            cashierUsername.trim(),
            cashierPin.trim(),
            cashierName.trim() || 'Kasir 1',
            'Kasir',
            existingTenant.id
          )
          if (!kasirRes?.success) {
            throw new Error(kasirRes?.error || 'Toko tersimpan, namun gagal membuat akun kasir.')
          }
          createdCashier = kasirRes.user
        }

        saveReceiptConfig({
          storeName: storeName.trim(),
          storeAddress: storeAddress.trim(),
          storePhone: storePhone.trim(),
          paperWidth: printerWidth,
        })

        if (onCompleted) {
          await onCompleted(
            {
              ...existingTenant,
              nama: storeName.trim(),
              business_type: businessModel,
              onboarding_completed: true,
            },
            createdCashier
          )
        }
        onClose()
        return
      }

      // Mode Tambah Outlet Baru dari Konsolidasi
      const payload = createCleanTenantPayload({
        storeName: storeName.trim(),
        ownerEmail: ownerUser?.email || 'owner@relaypos.com',
        ownerName: ownerName.trim() || 'Owner Baru',
        telepon: storePhone.trim(),
        alamat: storeAddress.trim(),
        tier: 'PRO_ANNUAL',
        licenseDurationMonths: 12,
        businessType: businessModel,
      })
      payload.tenant.onboarding_completed = true

      await supabase.from('tenants').insert(payload.tenant)
      await supabase.from('branches').insert(payload.branch)
      await supabase.from('tenant_licenses').insert(payload.license)
      if (payload.initialBalances?.length > 0) {
        await supabase.from('pos_balances').insert(payload.initialBalances)
      }
      if (payload.initialPackages?.length > 0) {
        await supabase.from('carwash_packages').insert(payload.initialPackages)
      }

      const newCashierProfile = {
        id: `usr_${payload.tenant.slug}_cashier_${Date.now()}`,
        tenant_id: payload.tenant.id,
        branch_id: payload.branch.id,
        nama: cashierName.trim() || 'Kasir 1',
        email: `${cashierUsername.trim().toLowerCase()}@${payload.tenant.slug}.local`,
        role: 'Kasir',
        pin: cashierPin.trim(),
        created_at: new Date().toISOString(),
      }
      await supabase.from('profiles').insert(newCashierProfile)

      saveReceiptConfig({
        storeName: storeName.trim(),
        storeAddress: storeAddress.trim(),
        storePhone: storePhone.trim(),
        paperWidth: printerWidth,
      })

      if (onCompleted) {
        await onCompleted(payload.tenant, newCashierProfile)
      }
      onClose()
    } catch (err) {
      console.error('Error completing onboarding wizard:', err)
      setError(err.message || 'Gagal menyelesaikan konfigurasi toko.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-2xl glass-panel border border-slate-800 rounded-3xl shadow-2xl relative flex flex-col max-h-[92dvh] overflow-hidden my-auto bg-[#0b101b]">
        {/* Pinned Header Steps */}
        <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-slate-800/80 shrink-0 bg-slate-900/60">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-emerald/15 border border-brand-emerald/30 text-brand-emerald text-[11px] font-bold uppercase tracking-wider">
              <Sparkles size={13} />
              <span>{isGuidedExisting ? 'Setup Awal Toko' : 'Setup Outlet Baru'}</span>
            </div>
            {isGuidedExisting && (
              <button
                type="button"
                onClick={handleSkipGuidedSetup}
                disabled={loading}
                className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <span>Lewati &amp; Pakai Template</span>
                <SkipForward size={13} />
              </button>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Konfigurasi Toko Anda
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Langkah {currentStep} dari 3:{' '}
            {currentStep === 1
              ? 'Profil Pemilik, Alamat & Printer Struk'
              : currentStep === 2
              ? 'Menu, Paket Layanan & Bahan Baku Awal'
              : 'Akun Kasir Pertama (Opsional)'}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className={`h-1.5 rounded-full transition-all ${currentStep >= 1 ? 'bg-brand-emerald' : 'bg-slate-800'}`}></div>
            <div className={`h-1.5 rounded-full transition-all ${currentStep >= 2 ? 'bg-brand-emerald' : 'bg-slate-800'}`}></div>
            <div className={`h-1.5 rounded-full transition-all ${currentStep >= 3 ? 'bg-brand-emerald' : 'bg-slate-800'}`}></div>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="px-6 sm:px-8 py-5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {error && (
            <div role="alert" className="mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: PROFIL PEMILIK, ALAMAT & PRINTER */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nama Lengkap Pemilik <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Contoh: Budi Santoso"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nama Usaha / Toko <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Store size={16} className="absolute left-3.5 top-3 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Contoh: Berkah Carwash & Cafe"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Model Operasional Toko
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'HYBRID', label: 'Hybrid (Cuci + Cafe)', icon: Sparkles },
                    { id: 'CARWASH', label: 'Carwash Saja', icon: Car },
                    { id: 'CAFE', label: 'Cafe / Resto Saja', icon: Coffee },
                  ].map((opt) => {
                    const Icon = opt.icon
                    const active = businessModel === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setBusinessModel(opt.id)}
                        className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          active
                            ? 'bg-brand-emerald/15 border-brand-emerald text-white'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <Icon size={16} className={active ? 'text-brand-emerald shrink-0' : 'text-slate-500 shrink-0'} />
                        <span className="text-xs font-bold leading-tight">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Nomor WhatsApp Toko
                  </label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-3 text-slate-500" />
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
                    Ukuran Kertas Printer Thermal
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['58mm', '80mm'].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setPrinterWidth(w)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          printerWidth === w
                            ? 'bg-brand-emerald/15 border-brand-emerald text-white'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Printer size={14} className={printerWidth === w ? 'text-brand-emerald' : 'text-slate-500'} />
                        <span>{w}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Alamat Fisik Toko (Tampil di Struk)
                </label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3.5 top-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Jl. Ringroad No. 88, Medan"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MENU, PAKET LAYANAN & BAHAN BAKU */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-fade-in">
              {isGuidedExisting && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setClearStarterSamples(false)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      !clearStarterSamples
                        ? 'bg-brand-emerald/15 border-brand-emerald text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Pertahankan Data Contoh</span>
                      {!clearStarterSamples && <CheckCircle2 size={14} className="text-brand-emerald" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Menu &amp; paket contoh tetap ada plus item baru Anda.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setClearStarterSamples(true)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      clearStarterSamples
                        ? 'bg-brand-emerald/15 border-brand-emerald text-white'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Mulai Bersih (Data Sendiri)</span>
                      {clearStarterSamples && <CheckCircle2 size={14} className="text-brand-emerald" />}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Hapus semua item contoh dan pakai daftar di bawah ini.
                    </p>
                  </button>
                </div>
              )}

              {showCarwash && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Car size={14} className="text-brand-emerald" />
                      <span>Paket Layanan Cuci</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCarwashRows((prev) => [...prev, EMPTY_CARWASH_ROW()])}
                      className="text-[11px] font-bold text-brand-emerald hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={13} /> Tambah Paket
                    </button>
                  </div>
                  {carwashRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Nama paket (mis: Cuci Salju)"
                        value={row.nama_paket}
                        onChange={(e) => updateRow(setCarwashRows, idx, 'nama_paket', e.target.value)}
                        className="col-span-7 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-brand-emerald"
                      />
                      <input
                        type="number"
                        placeholder="Tarif (Rp)"
                        value={row.tarif}
                        onChange={(e) => updateRow(setCarwashRows, idx, 'tarif', e.target.value)}
                        className="col-span-4 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-brand-emerald"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(setCarwashRows, idx)}
                        className="col-span-1 p-2 text-slate-500 hover:text-rose-400 cursor-pointer"
                        aria-label="Hapus baris paket"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {showCafe && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Coffee size={14} className="text-brand-emerald" />
                      <span>Menu Cafe / Produk Jual</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCafeRows((prev) => [...prev, EMPTY_CAFE_ROW()])}
                      className="text-[11px] font-bold text-brand-emerald hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={13} /> Tambah Menu
                    </button>
                  </div>
                  {cafeRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Nama menu (mis: Es Kopi Susu)"
                        value={row.nama_menu}
                        onChange={(e) => updateRow(setCafeRows, idx, 'nama_menu', e.target.value)}
                        className="col-span-5 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-brand-emerald"
                      />
                      <select
                        value={row.kategori}
                        onChange={(e) => updateRow(setCafeRows, idx, 'kategori', e.target.value)}
                        className="col-span-3 px-2 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-brand-emerald"
                      >
                        <option value="Minuman">Minuman</option>
                        <option value="Makanan">Makanan</option>
                        <option value="Snack">Snack</option>
                        <option value="Merchandise">Merchandise</option>
                      </select>
                      <input
                        type="number"
                        placeholder="Harga (Rp)"
                        value={row.harga}
                        onChange={(e) => updateRow(setCafeRows, idx, 'harga', e.target.value)}
                        className="col-span-3 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-brand-emerald"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(setCafeRows, idx)}
                        className="col-span-1 p-2 text-slate-500 hover:text-rose-400 cursor-pointer"
                        aria-label="Hapus baris menu"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Boxes size={14} className="text-brand-emerald" />
                    <span>Bahan Baku &amp; Stok Gudang Awal</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStockRows((prev) => [
                        ...prev,
                        EMPTY_STOCK_ROW(businessModel === 'CARWASH' ? 'CARWASH' : 'CAFE'),
                      ])
                    }
                    className="text-[11px] font-bold text-brand-emerald hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={13} /> Tambah Bahan
                  </button>
                </div>
                {stockRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Nama bahan (mis: Biji Kopi / Shampo)"
                      value={row.nama_barang}
                      onChange={(e) => updateRow(setStockRows, idx, 'nama_barang', e.target.value)}
                      className="col-span-4 px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-brand-emerald"
                    />
                    <input
                      type="number"
                      placeholder="Stok"
                      value={row.stok}
                      onChange={(e) => updateRow(setStockRows, idx, 'stok', e.target.value)}
                      className="col-span-2 px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-brand-emerald"
                    />
                    <select
                      value={row.satuan}
                      onChange={(e) => updateRow(setStockRows, idx, 'satuan', e.target.value)}
                      className="col-span-2 px-2 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-brand-emerald"
                    >
                      <option value="pcs">pcs</option>
                      <option value="kg">kg</option>
                      <option value="gram">gram</option>
                      <option value="liter">liter</option>
                      <option value="botol">botol</option>
                    </select>
                    <input
                      type="number"
                      placeholder="HPP/unit"
                      value={row.harga_satuan}
                      onChange={(e) => updateRow(setStockRows, idx, 'harga_satuan', e.target.value)}
                      className="col-span-3 px-2.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs font-mono focus:outline-none focus:border-brand-emerald"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(setStockRows, idx)}
                      className="col-span-1 p-2 text-slate-500 hover:text-rose-400 cursor-pointer"
                      aria-label="Hapus baris bahan"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500">
                  Semua baris di langkah ini opsional — Anda dapat menambah atau mengedit resep BOM kapan saja di menu Admin &amp; Gudang.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: AKUN KASIR PERTAMA */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 rounded-2xl bg-brand-emerald/10 border border-brand-emerald/20 text-xs text-slate-300">
                <span className="font-bold text-brand-emerald block mb-0.5">
                  Akun Kasir Meja Toko {isGuidedExisting ? '(Opsional)' : ''}
                </span>
                Staf kasir tidak membutuhkan akun Google. Buat username dan kata sandi (min. 6 karakter) jika Anda memiliki staf kasir, atau biarkan kosong untuk langsung masuk menggunakan akun Owner.
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Username Kasir {!isGuidedExisting && <span className="text-rose-400">*</span>}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-500 text-sm">@</span>
                    <input
                      type="text"
                      placeholder="kasir1"
                      value={cashierUsername}
                      onChange={(e) => setCashierUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Kata Sandi / PIN (Min. 6) {!isGuidedExisting && <span className="text-rose-400">*</span>}
                  </label>
                  <div className="relative">
                    <KeyRound size={15} className="absolute left-3 top-3 text-slate-500" />
                    <input
                      type="password"
                      placeholder="••••••"
                      value={cashierPin}
                      onChange={(e) => setCashierPin(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-brand-emerald font-mono tracking-widest"
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
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
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
              <span>{loading ? 'Menyiapkan Toko...' : 'Selesai & Buka Toko'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
