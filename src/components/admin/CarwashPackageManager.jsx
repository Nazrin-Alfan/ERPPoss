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
    b.kategori === 'Bahan Cuci Mobil' || 
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

    // Cari resep bahan kimia yang tersimpan untuk paket ini
    const existingRecipes = (resepList || [])
      .filter(r => r.nama_menu === pkg.nama_paket || r.nama_menu?.toLowerCase() === pkg.nama_paket?.toLowerCase())
      .map(r => ({
        id_bahan_baku: r.id_bahan_baku || '',
        nama_bahan: r.nama_bahan,
        jumlah: parseFloat(r.jumlah_dibutuhkan || r.jumlah) || 0.1,
        satuan: r.satuan || 'Liter'
      }))

    setFormData({
      nama_paket: pkg.nama_paket || '',
      keterangan: pkg.keterangan || '',
      komisi_skema: pkg.komisi_skema || 'TIERED',
      komisi_value: pkg.komisi_value || 0,
      is_active: pkg.is_active !== false,
      tarif: {
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
      },
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
        const found = (stokBahan || []).find(b => b.nama_bahan === val || b.nama_barang === val)
        updated[idx] = {
          ...updated[idx],
          nama_bahan: val,
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
      nama_paket: formData.nama_paket.trim().toUpperCase(),
      keterangan: formData.keterangan.trim(),
      komisi_value: parseFloat(formData.komisi_value) || 0,
      resep_bahan: formData.resep_bahan.filter(r => r.nama_bahan && parseFloat(r.jumlah) > 0)
    })
    setIsModalOpen(false)
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sparkles size={18} />
            </div>
            <span>Master Paket & Tarif Cuci Mobil</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi nama layanan, matriks tarif kendaraan, pemotongan stok bahan kimia (BOM), dan komisi kru.
          </p>
        </div>
        <button
          onClick={openNewModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer shrink-0"
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
                  ? 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                  : 'bg-slate-950/40 border-slate-900/80 opacity-60'
              }`}
            >
              {/* Header card */}
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-black text-white tracking-wide uppercase">
                      {pkg.nama_paket}
                    </h4>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {isActive ? 'AKTIF' : 'NON-AKTIF'}
                    </span>
                  </div>
                  {pkg.keterangan && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{pkg.keterangan}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEditModal(pkg)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 transition-colors"
                    title="Edit Paket & Resep Bahan Cuci"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => onDeletePackage(pkg.id)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-rose-400 hover:bg-slate-700 transition-colors"
                    title="Hapus Paket"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Takaran Bahan Kimia Cuci (BOM) */}
              <div className="mt-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-400 mb-1">
                  <FlaskConical size={13} />
                  <span>Stok Bahan Kimia Digunakan (per Mobil):</span>
                </div>
                {pkgRecipes.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {pkgRecipes.map((r, i) => (
                      <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-slate-300">
                        {r.nama_bahan}: <strong className="text-cyan-300">{r.jumlah_dibutuhkan || r.jumlah} {r.satuan}</strong>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">
                    Belum diset bahan kimia (klik edit untuk memasukkan takaran shampo/semir).
                  </p>
                )}
              </div>

              {/* Komisi Badge */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/60 text-xs">
                <span className="text-slate-400">Komisi Kru:</span>
                <span className="font-bold text-amber-400">
                  {pkg.komisi_skema === 'PERCENT'
                    ? `${pkg.komisi_value}% dari tarif`
                    : pkg.komisi_skema === 'FIXED'
                    ? formatRupiah(pkg.komisi_value)
                    : 'Tiered (Sistem Multi-Kru 100%/50%)'}
                </span>
              </div>

              {/* Matriks Tarif Table */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800/60 text-[10px] uppercase">
                      <th className="py-1 font-semibold">Ukuran</th>
                      <th className="py-1 text-right font-semibold">Reguler</th>
                      <th className="py-1 text-right font-semibold">Body Only</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {SIZES.map(s => {
                      const regPrice = pkg.tarif?.[s]?.Regular ?? 0
                      const bodyPrice = pkg.tarif?.[s]?.['Body only'] ?? 0
                      return (
                        <tr key={s} className="hover:bg-slate-800/30">
                          <td className="py-1 text-slate-400 font-medium">{s}</td>
                          <td className="py-1 text-right font-mono font-bold text-emerald-400">
                            {formatRupiah(regPrice)}
                          </td>
                          <td className="py-1 text-right font-mono text-slate-300">
                            {formatRupiah(bodyPrice)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="glass-panel w-full max-w-xl p-6 rounded-2xl border border-slate-800 bg-slate-900 my-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Car size={18} className="text-cyan-400" />
                <h3 className="text-base font-black text-white uppercase">
                  {editingId ? 'Edit Paket Cuci' : 'Tambah Paket Cuci Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {/* Nama Paket */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Nama Paket Cuci *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: PAKET CUCI SALJU REGULER"
                  value={formData.nama_paket}
                  onChange={e => setFormData(prev => ({ ...prev, nama_paket: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white uppercase focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Keterangan / Deskripsi Singkat
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Cuci bodi luar + semir ban + vakum interior"
                  value={formData.keterangan}
                  onChange={e => setFormData(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* 🧪 STANDAR PENGGUNAAN BAHAN KIMIA (BOM CUCI) */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-xs font-black text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <FlaskConical size={14} />
                      Takaran Bahan Kimia per Mobil (BOM)
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Stok di Gudang Carwash otomatis terpotong saat mobil selesai dicuci.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddResepRow}
                    className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 text-[11px] font-bold transition-all"
                  >
                    + Tambah Bahan
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.resep_bahan.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                      {/* Dropdown Bahan Kimia */}
                      <div className="flex-1">
                        <input
                          type="text"
                          list="chemical-options"
                          placeholder="Pilih atau ketik bahan (misal: Shampo Snow Foam)"
                          value={item.nama_bahan}
                          onChange={(e) => handleResepChange(idx, 'nama_bahan', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
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
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-cyan-300 font-mono text-center focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      {/* Satuan */}
                      <div className="w-20">
                        <select
                          value={item.satuan || 'Liter'}
                          onChange={(e) => handleResepChange(idx, 'satuan', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
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
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skema Komisi Kru */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
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
                          ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {scheme.label}
                    </button>
                  ))}
                </div>

                {formData.komisi_skema !== 'TIERED' && (
                  <div className="mt-2">
                    <label className="block text-[10px] text-slate-400 mb-1">
                      {formData.komisi_skema === 'PERCENT' ? 'Persentase Komisi (%)' : 'Nominal Komisi (Rp)'}
                    </label>
                    <input
                      type="number"
                      value={formData.komisi_value}
                      onChange={e => setFormData(prev => ({ ...prev, komisi_value: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}
              </div>

              {/* Matriks Tarif per Ukuran */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Matriks Tarif Kendaraan (Rp) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  {SIZES.map(s => (
                    <div key={s} className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80 space-y-2">
                      <div className="text-xs font-bold text-cyan-300 uppercase">{s}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Reguler</label>
                          <input
                            type="text"
                            value={formData.tarif?.[s]?.Regular || ''}
                            onChange={e => handlePriceChange(s, 'Regular', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-mono focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">Body Only</label>
                          <input
                            type="text"
                            value={formData.tarif?.[s]?.['Body only'] || ''}
                            onChange={e => handlePriceChange(s, 'Body only', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-black shadow-lg shadow-cyan-500/20 cursor-pointer transition-all disabled:opacity-50"
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
