import React, { useState } from 'react'
import { Wallet, ArrowDownRight, CheckCircle2, AlertCircle, X, ShieldAlert } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { formatRupiah } from '../../utils/helpers'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../../constants/erpConfig'

export default function OwnerWithdrawalModal({ isOpen, onClose, onSuccess, currentBalances = [] }) {
  const { profile, activeTenant } = useAuth()
  const [nominal, setNominal] = useState('')
  const [sumberDana, setSumberDana] = useState('SALDO CASH') // 'SALDO CASH' | 'SALDO REKENING OPERASIONAL'
  const [keterangan, setKeterangan] = useState('Penarikan Prive Pemilik Toko')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleWithdraw = async (e) => {
    e.preventDefault()
    setError('')
    const amount = parseFloat(nominal)
    if (isNaN(amount) || amount <= 0) {
      return setError('Nominal penarikan saldo harus lebih besar dari Rp 0.')
    }

    setLoading(true)
    try {
      const todayDate = new Date().toLocaleDateString('en-CA')
      const tenantId = activeTenant?.id || profile?.tenant_id || DEFAULT_TENANT_ID
      const branchId = profile?.branch_id || DEFAULT_BRANCH_ID
      const creditAccount = sumberDana === 'SALDO CASH' ? 'acc_1001' : 'acc_1002'

      // 1. Catat ke Cashflow
      const cashflowEntry = {
        id_cashflow: `cf_prive_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenant_id: tenantId,
        branch_id: branchId,
        tanggal: todayDate,
        keterangan_transaksi: `Prive Pemilik (${profile?.nama || 'Owner'}): ${keterangan.trim()}`,
        jenis: 'Mutasi Internal',
        kategori: 'Prive / Penarikan Owner',
        pemasukan: 0.0,
        pengeluaran: amount,
        pos: sumberDana,
        created_at: new Date().toISOString()
      }

      const { error: cfErr } = await supabase.from('cashflow').insert(cashflowEntry)
      if (cfErr) throw cfErr

      // 2. Post Journal Entry Akuntansi Double-Entry
      // Debit: acc_3002 (Prive / Penarikan Owner - Ekuitas)
      // Kredit: acc_1001 / acc_1002 (Kas atau Bank - Aset)
      if (supabase.localDb?.store?.postJournalEntry) {
        supabase.localDb.store.postJournalEntry({
          tenant_id: tenantId,
          branch_id: branchId,
          date: todayDate,
          memo: `Penarikan Prive Pemilik: ${keterangan.trim()}`,
          source_type: 'prive',
          source_id: cashflowEntry.id_cashflow,
          lines: [
            { account_id: 'acc_3002', debit: amount, credit: 0, memo: 'Penarikan Ekuitas Prive Pemilik' },
            { account_id: creditAccount, debit: 0, credit: amount, memo: `Pengeluaran Saldo dari ${sumberDana}` }
          ]
        })
      }

      if (onSuccess) {
        await onSuccess(cashflowEntry)
      }
      onClose()
    } catch (err) {
      console.error('Error recording owner withdrawal:', err)
      setError(err.message || 'Gagal memproses penarikan saldo prive.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md glass-panel border border-brand-emerald/30 rounded-3xl p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-emerald/15 border border-brand-emerald/30 flex items-center justify-center text-brand-emerald">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Tarik Saldo / Prive Pemilik</h3>
              <p className="text-[10px] text-slate-400">
                Penarikan Pribadi Owner Tanpa Merusak Laba Bersih
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info Banner Akuntansi */}
        <div className="my-3.5 p-3 rounded-2xl bg-brand-emerald/10 border border-brand-emerald/20 text-xs text-slate-300">
          <span className="font-bold text-brand-emerald block mb-0.5">ℹ️ Integritas Laporan Akuntansi:</span>
          Penarikan ini dicatat pada akun <strong className="text-white">Prive [3002]</strong> (Ekuitas Pemilik), sehingga kas riil berkurang namun laba operasional toko tetap akurat 100%.
        </div>

        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/20 text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleWithdraw} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Sumber Dana Penarikan <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSumberDana('SALDO CASH')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  sumberDana === 'SALDO CASH'
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold">Kas Laci Kasir</div>
                <div className="text-[10px] text-slate-500 font-mono">Uang Tunai Fisik</div>
              </button>
              <button
                type="button"
                onClick={() => setSumberDana('SALDO REKENING OPERASIONAL')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  sumberDana === 'SALDO REKENING OPERASIONAL'
                    ? 'bg-blue-500/15 border-blue-500 text-white shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-bold">Rekening Bank</div>
                <div className="text-[10px] text-slate-500 font-mono">QRIS / Transfer</div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Jumlah Nominal Penarikan (Rp) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">Rp</span>
              <input
                type="number"
                placeholder="0"
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-base font-mono font-bold focus:outline-none focus:border-brand-emerald"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Keterangan Penarikan
            </label>
            <input
              type="text"
              placeholder="Contoh: Keperluan pribadi Pak Budi"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:border-brand-emerald"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-brand-emerald hover:bg-emerald-500 active:bg-emerald-600 text-slate-950 text-xs font-black shadow-lg shadow-brand-emerald/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <ArrowDownRight size={14} />
              <span>{loading ? 'Memproses...' : 'Tarik Saldo Sekarang'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
