import React, { useState } from 'react'
import {
  Sparkles,
  Plus,
  Edit3,
  Trash2,
  CheckCircle,
  AlertCircle,
  Car,
  X,
  Tag,
  DollarSign,
  FlaskConical,
  Package
} from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'

const SIZES = ['Small', 'Medium', 'Large', 'Extra Large']
const VARIANTS = ['Regular', 'Body only']
export const MAX_CARWASH_PACKAGE_NAME_LENGTH = 32

export const isUniformCarwashTarif = (tarif) => {
  if (!tarif || typeof tarif !== 'object') return false
  const values = []
  for (const s of SIZES) {
    for (const v of VARIANTS) {
      values.push(Number(tarif?.[s]?.[v] ?? 0))
    }
  }
  return values.length === SIZES.length * VARIANTS.length && values.every((val) => val === values[0])
}

const buildFlatTarifMatrix = (amount) => {
  const numeric = Math.max(0, Number(amount) || 0)
  const matrix = {}
  for (const s of SIZES) {
    matrix[s] = { Regular: numeric, 'Body only': numeric }
  }
  return matrix
}

const CarwashPackageManager = ({
  packages = [],
  resepList = [],
  stokBahan = [],
  onSavePackage,
  onDeletePackage,
  onToggleActive,
  loading = false
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [isFlatRate, setIsFlatRate] = useState(false)
  const [formData, setFormData] = useState({
    nama_paket: '',
    keterangan: '',
    komisi_skema: 'TIERED',
    komisi_value: 0,
    is_active: true,
    tarif: {
      Small: { Regular: 50000, 'Body only': 35000 },
      Medium: { Regular: 55000, 'Body only': 40000 },
      Large: { Regular: 60000, 'Body only': 45000 },
      'Extra Large': { Regular: 80000, 'Body only': 80000 }
    },
    resep_bahan: []
  })

  // Filter bahan kimia dari gudang carwash atau seluruh bahan baku cair
  const carwashChemicals = stokBahan.filter(b => 
    b.gudang === 'CARWASH' || 
    b.sector === 'CARWASH' ||
    b.kategori === 'Bahan Cuci Mobil' || 
    String(b.kategori || '').toLowerCase().includes('cuci') ||
    (b.nama_bahan && (
      b.nama_bahan.toLowerCase().includes('shampo') ||
      b.nama_bahan.toLowerCase().includes('semir') ||
      b.nama_bahan.toLowerCase().includes('wax') ||
      b.nama_bahan.toLowerCase().includes('degreaser') ||
      b.nama_bahan.toLowerCase().includes('sabun') ||
      b.nama_bahan.toLowerCase().includes('obat')
    ))
  )

  const openNewModal = () => {
    setEditingId(null)
    setIsFlatRate(false)
    setFormData({
      nama_paket: '',
      keterangan: '',
      komisi_skema: 'TIERED',
      komisi_value: 0,
      is_active: true,
      tarif: {
        Small: { Regular: 50000, 'Body only': 35000 },
        Medium: { Regular: 55000, 'Body only': 40000 },
        Large: { Regular: 60000, 'Body only': 45000 },
        'Extra Large': { Regular: 80000, 'Body only': 80000 }
      },
      resep_bahan: [
        {
          id_bahan_baku: 'CW-01',
          nama_bahan: 'Shampo Snow Foam Carwash',
          jumlah: 0.1,
          satuan: 'Liter'
        },
        {
          id_bahan_baku: 'CW-02',
          nama_bahan: 'Semir Ban Silikon Curah',
          jumlah: 0.05,
          satuan: 'Liter'
        }
      ]
    })
    setIsModalOpen(true)
  }

  const openEditModal = (pkg) => {
    setEditingId(pkg.id)

    // Cari resep bahan kimia yang tersimpan untuk paket ini (utamakan carwash_package_id)
    const existingRecipes = (resepList || [])
      .filter(r =>
        (pkg.id && r.carwash_package_id === pkg.id) ||
        (!r.carwash_package_id && (r.nama_menu === pkg.nama_paket || r.nama_menu?.toLowerCase() === pkg.nama_paket?.toLowerCase()))
      )
      .map(r => {
        const matchedBahan = (stokBahan || []).find(
          b => (r.stok_barang_id && b.id === r.stok_barang_id) ||
               b.nama_bahan === r.nama_bahan ||
               b.nama_produk === r.nama_bahan ||
               b.nama_barang === r.nama_bahan
        )
        return {
          stok_barang_id: r.stok_barang_id || matchedBahan?.id || null,
          id_bahan_baku: r.id_bahan_baku || matchedBahan?.id_bahan_baku || '',
          nama_bahan: r.nama_bahan,
          jumlah: parseFloat(r.jumlah_dibutuhkan || r.jumlah) || 0.1,
          satuan: r.satuan || 'Liter'
        }
      })

    const normalizedTarif = {
      Small: {
        Regular: pkg.tarif?.Small?.Regular ?? 50000,
        'Body only': pkg.tarif?.Small?.['Body only'] ?? 35000
      },
      Medium: {
        Regular: pkg.tarif?.Medium?.Regular ?? 55000,
        'Body only': pkg.tarif?.Medium?.['Body only'] ?? 40000
      },
      Large: {
        Regular: pkg.tarif?.Large?.Regular ?? 60000,
        'Body only': pkg.tarif?.Large?.['Body only'] ?? 45000
      },
      'Extra Large': {
        Regular: pkg.tarif?.['Extra Large']?.Regular ?? 80000,
        'Body only': pkg.tarif?.['Extra Large']?.['Body only'] ?? 80000
      }
    }
    setIsFlatRate(isUniformCarwashTarif(normalizedTarif))

    setFormData({
      nama_paket: pkg.nama_paket || '',
      keterangan: pkg.keterangan || '',
      komisi_skema: pkg.komisi_skema || 'TIERED',
      komisi_value: pkg.komisi_value || 0,
      is_active: pkg.is_active !== false,
      tarif: normalizedTarif,
      resep_bahan: existingRecipes.length > 0 ? existingRecipes : [
        {
          id_bahan_baku: 'CW-01',
          nama_bahan: 'Shampo Snow Foam Carwash',
          jumlah: 0.1,
          satuan: 'Liter'
        },
        {
          id_bahan_baku: 'CW-02',
          nama_bahan: 'Semir Ban Silikon Curah',
          jumlah: 0.05,
          satuan: 'Liter'
        }
      ]
    })
    setIsModalOpen(true)
  }

  const handlePriceChange = (size, variant, val) => {
    const numeric = parseInt(val.replace(/\D/g, ''), 10) || 0
    setFormData(prev => ({
      ...prev,
      tarif: {
        ...prev.tarif,
        [size]: {
          ...prev.tarif?.[size],
          [variant]: numeric
        }
      }
    }))
  }

  const handleFlatPriceChange = (val) => {
    const numeric = parseInt(String(val).replace(/\D/g, ''), 10) || 0
    setFormData(prev => ({
      ...prev,
      tarif: buildFlatTarifMatrix(numeric)
    }))
  }

  const handleSwitchTarifMode = (flat) => {
    setIsFlatRate(flat)
    if (flat) {
      const baseAmount = formData.tarif?.Small?.Regular || 50000
      setFormData(prev => ({
        ...prev,
        tarif: buildFlatTarifMatrix(baseAmount)
      }))
    }
  }

  const handleAddResepRow = () => {
    setFormData(prev => ({
      ...prev,
      resep_bahan: [
        ...prev.resep_bahan,
        {
          id_bahan_baku: '',
          nama_bahan: '',
          jumlah: 0.1,
          satuan: 'Liter'
        }
      ]
    }))
  }

  const handleRemoveResepRow = (idx) => {
    setFormData(prev => ({
      ...prev,
      resep_bahan: prev.resep_bahan.filter((_, i) => i !== idx)
    }))
  }

  const handleResepChange = (idx, field, val) => {
    setFormData(prev => {
      const updated = [...prev.resep_bahan]
      if (field === 'nama_bahan') {
        const found = (stokBahan || []).find(b => b.nama_bahan === val || b.nama_produk === val || b.nama_barang === val)
        updated[idx] = {
          ...updated[idx],
          nama_bahan: val,
          stok_barang_id: found?.id || null,
          id_bahan_baku: found ? (found.id_bahan_baku || found.id_barang || '') : updated[idx].id_bahan_baku,
          satuan: found ? (found.satuan || 'Liter') : updated[idx].satuan
        }
      } else {
        updated[idx] = {
          ...updated[idx],
          [field]: val
        }
      }
      return { ...prev, resep_bahan: updated }
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.nama_paket.trim()) return

    onSavePackage({
      id: editingId,
      ...formData,
      nama_paket: formData.nama_paket.trim().slice(0, MAX_CARWASH_PACKAGE_NAME_LENGTH).toUpperCase(),
      keterangan: formData.keterangan.trim(),
      komisi_value: parseFloat(formData.komisi_value) || 0,
      resep_bahan: formData.resep_bahan.filter(r => r.nama_bahan && parseFloat(r.jumlah) > 0)
    })
    setIsModalOpen(false)
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-5 rounded-2xl border border-border">
        <div>
          <h3 className="text-base sm:text-lg font-black text-foreground flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary-soft text-primary-soft-foreground border border-primary/30">
              <Sparkles size={18} />
            </div>
            <span>Master Paket & Tarif Cuci Mobil</span>
          </h3>
          <p className="text-xs text-muted mt-1">
            Konfigurasi nama layanan, matriks tarif kendaraan, pemotongan stok bahan kimia (BOM), dan komisi kru.
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="bg-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-primary-foreground font-black text-xs shadow-lg shadow-sm transition-all cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>Tambah Paket Baru</span>
        </button>
      </div>

      {/* Package Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {packages.map((pkg) => {
          const isActive = pkg.is_active !== false
          const pkgRecipes = (resepList || []).filter(
            r => r.nama_menu === pkg.nama_paket || r.nama_menu?.toLowerCase() === pkg.nama_paket?.toLowerCase()
          )

          return (
            <div
              key={pkg.id || pkg.nama_paket}
              className={`p-5 rounded-2xl border transition-all ${
                isActive
                  ? 'bg-surface border-border hover:border-border-hover'
                  : 'bg-surface border-slate-900/80 opacity-60'
              }`}
            >
              {/* Header card */}
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-foreground tracking-wide uppercase break-words min-w-0">
                      {pkg.nama_paket}
                    </h4>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                        isActive
                          ? 'bg-success-bg text-success border-success/30'
                          : 'bg-subsurface text-muted border-border'
                      }`}
                    >
                      {isActive ? 'AKTIF' : 'NON-AKTIF'}
                    </span>
                  </div>
                  {pkg.keterangan && (
                    <p className="text-xs text-muted mt-1 line-clamp-1">{pkg.keterangan}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEditModal(pkg)}
                    className="p-1.5 rounded-lg bg-subsurface text-muted hover:text-primary hover:bg-surface-hover transition-colors"
                    title="Edit Paket & Resep Bahan Cuci"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => onDeletePackage(pkg.id)}
                    className="p-1.5 rounded-lg bg-subsurface text-muted hover:text-destructive hover:bg-surface-hover transition-colors"
                    title="Hapus Paket"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Takaran Bahan Kimia Cuci (BOM) */}
              <div className="mt-3 p-2.5 rounded-xl bg-subsurface border border-border">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-primary mb-1">
                  <FlaskConical size={13} />
                  <span>Stok Bahan Kimia Digunakan (per Mobil):</span>
                </div>
                {pkgRecipes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {pkgRecipes.map((r, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-surface border border-border text-muted">
                        {r.nama_bahan}: <strong className="text-primary">{r.jumlah_dibutuhkan || r.jumlah} {r.satuan}</strong>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-dark italic">
                    Belum diset bahan kimia (klik edit untuk memasukkan takaran shampo/semir).
                  </p>
                )}
              </div>

              {/* Komisi Badge */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border text-xs">
                <span className="text-muted">Komisi Kru:</span>
                <span className="font-bold text-warning">
                  {pkg.komisi_skema === 'PERCENT'
                    ? `${pkg.komisi_value}% dari tarif`
                    : pkg.komisi_skema === 'FIXED'
                    ? formatRupiah(pkg.komisi_value)
                    : 'Tiered (Sistem Multi-Kru 100%/50%)'}
                </span>
              </div>

              {/* Matriks Tarif Table / Flat Summary */}
              {isUniformCarwashTarif(pkg.tarif) ? (
                <div className="mt-3 p-3 rounded-xl bg-subsurface border border-primary/25 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-foreground block">
                      Tarif Flat Semua Kendaraan
                    </span>
                    <span className="text-[10px] text-muted">
                      Berlaku sama untuk semua ukuran &amp; varian
                    </span>
                  </div>
                  <span className="text-sm font-black font-mono tabular-nums text-success">
                    {formatRupiah(pkg.tarif?.Small?.Regular ?? 0)}
                  </span>
                </div>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="text-muted border-b border-border text-[10px] uppercase">
                        <th className="py-1 font-semibold">Ukuran</th>
                        <th className="py-1 text-right font-semibold">Reguler</th>
                        <th className="py-1 text-right font-semibold">Body Only</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-muted">
                      {SIZES.map(s => {
                        const regPrice = pkg.tarif?.[s]?.Regular ?? 0
                        const bodyPrice = pkg.tarif?.[s]?.['Body only'] ?? 0
                        return (
                          <tr key={s} className="hover:bg-surface-hover">
                            <td className="py-1 text-muted font-medium">{s}</td>
                            <td className="py-1 text-right font-mono font-bold text-success">
                              {formatRupiah(regPrice)}
                            </td>
                            <td className="py-1 text-right font-mono text-muted">
                              {formatRupiah(bodyPrice)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-y-0 right-0 left-[var(--app-sidebar-offset,0px)] transition-[left] duration-200 z-50 flex items-center justify-center p-4 bg-[var(--overlay-backdrop)] backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="bg-surface border border-border shadow-sm w-full max-w-xl p-6 rounded-2xl my-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Car size={18} className="text-primary" />
                <h3 className="text-base font-black text-foreground uppercase">
                  {editingId ? 'Edit Paket Cuci' : 'Tambah Paket Cuci Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-muted hover:text-foreground rounded-lg hover:bg-surface-hover transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* Nama Paket */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-bold text-muted uppercase tracking-wider">
                    Nama Paket Cuci *
                  </label>
                  <span
                    className={`text-[11px] font-mono tabular-nums font-semibold ${
                      formData.nama_paket.length > MAX_CARWASH_PACKAGE_NAME_LENGTH
                        ? 'text-destructive'
                        : formData.nama_paket.length >= MAX_CARWASH_PACKAGE_NAME_LENGTH - 4
                          ? 'text-warning'
                          : 'text-muted'
                    }`}
                  >
                    {formData.nama_paket.length}/{MAX_CARWASH_PACKAGE_NAME_LENGTH}
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={MAX_CARWASH_PACKAGE_NAME_LENGTH}
                  placeholder="Contoh: PAKET CUCI SALJU REGULER"
                  value={formData.nama_paket}
                  onChange={e => setFormData(prev => ({ ...prev, nama_paket: e.target.value.slice(0, MAX_CARWASH_PACKAGE_NAME_LENGTH) }))}
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground uppercase focus:outline-none focus:border-ring"
                />
                <p className="text-[10px] text-muted mt-1">
                  Maks. {MAX_CARWASH_PACKAGE_NAME_LENGTH} karakter agar rapi di kartu antrean &amp; struk. Detail layanan tulis di Keterangan.
                </p>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1">
                  Keterangan / Deskripsi Singkat
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Cuci bodi luar + semir ban + vakum interior"
                  value={formData.keterangan}
                  onChange={e => setFormData(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground focus:outline-none focus:border-ring"
                />
              </div>

              {/* 🧪 STANDAR PENGGUNAAN BAHAN KIMIA (BOM CUCI) */}
              <div className="p-4 rounded-xl bg-subsurface border border-primary/30 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-xs font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <FlaskConical size={14} />
                      Takaran Bahan Kimia per Mobil (BOM)
                    </label>
                    <p className="text-[11px] text-muted">
                      Stok di Gudang Carwash otomatis terpotong saat mobil selesai dicuci.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddResepRow}
                    className="px-2 py-1 rounded-lg bg-primary-soft border border-primary/30 text-primary-soft-foreground hover:bg-primary-hover text-[11px] font-bold transition-all"
                  >
                    + Tambah Bahan
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.resep_bahan.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-surface p-2 rounded-lg border border-border">
                      {/* Dropdown Bahan Kimia */}
                      <div className="flex-1">
                        <input
                          type="text"
                          list="chemical-options"
                          placeholder="Pilih atau ketik bahan (misal: Shampo Snow Foam)"
                          value={item.nama_bahan}
                          onChange={(e) => handleResepChange(idx, 'nama_bahan', e.target.value)}
                          className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring"
                        />
                        <datalist id="chemical-options">
                          {carwashChemicals.map((c, i) => (
                            <option key={i} value={c.nama_bahan || c.nama_barang} />
                          ))}
                          <option value="Shampo Snow Foam Carwash" />
                          <option value="Semir Ban Silikon Curah" />
                          <option value="Degreaser Mesin & Velg" />
                          <option value="Wax Pengkilap Bodi Cair" />
                          <option value="Obat Jamur Kaca Mobil" />
                        </datalist>
                      </div>

                      {/* Input Takaran per Mobil */}
                      <div className="w-24">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Jumlah"
                          value={item.jumlah}
                          onChange={(e) => handleResepChange(idx, 'jumlah', e.target.value)}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-primary font-mono text-center focus:outline-none focus:border-ring"
                        />
                      </div>

                      {/* Satuan */}
                      <div className="w-20">
                        <select
                          value={item.satuan || 'Liter'}
                          onChange={(e) => handleResepChange(idx, 'satuan', e.target.value)}
                          className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-xs text-muted focus:outline-none focus:border-ring"
                        >
                          <option value="Liter">Liter</option>
                          <option value="ml">ml</option>
                          <option value="botol">botol</option>
                          <option value="pcs">pcs</option>
                        </select>
                      </div>

                      {/* Delete Row Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveResepRow(idx)}
                        className="p-1.5 text-muted-dark hover:text-destructive rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skema Komisi Kru */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted uppercase tracking-wider">
                  Skema Komisi Kru Cuci
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'TIERED', label: 'Tiered Multi-Kru (100%/50%)' },
                    { id: 'FIXED', label: 'Nominal Tetap (Rp)' },
                    { id: 'PERCENT', label: 'Persentase (%)' }
                  ].map(scheme => (
                    <button
                      key={scheme.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, komisi_skema: scheme.id }))}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        formData.komisi_skema === scheme.id
                          ? 'bg-primary-soft border-primary/30 text-primary-soft-foreground'
                          : 'bg-surface border-border text-muted hover:text-foreground'
                      }`}
                    >
                      {scheme.label}
                    </button>
                  ))}
                </div>

                {formData.komisi_skema !== 'TIERED' && (
                  <div className="mt-2">
                    <label className="block text-[10px] text-muted mb-1">
                      {formData.komisi_skema === 'PERCENT' ? 'Persentase Komisi (%)' : 'Nominal Komisi (Rp)'}
                    </label>
                    <input
                      type="number"
                      value={formData.komisi_value}
                      onChange={e => setFormData(prev => ({ ...prev, komisi_value: e.target.value }))}
                      className="w-full bg-surface border border-border rounded-xl px-3.5 py-2 text-xs text-foreground font-mono focus:outline-none focus:border-ring"
                    />
                  </div>
                )}
              </div>

              {/* Matriks Tarif per Ukuran / Flat */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted uppercase tracking-wider">
                  Matriks Tarif Kendaraan (Rp) *
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-subsurface rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => handleSwitchTarifMode(false)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !isFlatRate
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    Tarif Per Ukuran (Matriks)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchTarifMode(true)}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isFlatRate
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    Tarif Sama Semua Kendaraan (Flat)
                  </button>
                </div>

                {isFlatRate ? (
                  <div className="bg-subsurface p-4 rounded-xl border border-primary/30 space-y-2">
                    <label className="block text-xs font-bold text-foreground">
                      Tarif Flat Semua Kendaraan &amp; Varian (Rp) *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label="Tarif Flat Semua Kendaraan"
                      placeholder="Contoh: 50000"
                      value={formData.tarif?.Small?.Regular || ''}
                      onChange={e => handleFlatPriceChange(e.target.value)}
                      className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-success font-mono tabular-nums font-bold focus:outline-none focus:border-ring"
                    />
                    <p className="text-[11px] text-muted">
                      Nominal ini otomatis berlaku sama untuk ukuran Small, Medium, Large, dan Extra Large (Reguler maupun Body Only).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-subsurface p-4 rounded-xl border border-border">
                    {SIZES.map(s => (
                      <div key={s} className="p-3 bg-surface rounded-xl border border-border space-y-2">
                        <div className="text-xs font-bold text-primary uppercase">{s}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Reguler</label>
                            <input
                              type="text"
                              value={formData.tarif?.[s]?.Regular || ''}
                              onChange={e => handlePriceChange(s, 'Regular', e.target.value)}
                              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-success font-mono focus:outline-none focus:border-ring"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Body Only</label>
                            <input
                              type="text"
                              value={formData.tarif?.[s]?.['Body only'] || ''}
                              onChange={e => handlePriceChange(s, 'Body only', e.target.value)}
                              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted font-mono focus:outline-none focus:border-ring"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end items-center gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-border text-muted hover:text-foreground hover:bg-surface-hover text-xs font-bold cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-primary px-5 py-2.5 rounded-xl text-primary-foreground text-xs font-black shadow-lg shadow-sm cursor-pointer transition-all disabled:opacity-50"
                >
                  {loading ? 'Menyimpan...' : 'Simpan Paket & Resep Bahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CarwashPackageManager
