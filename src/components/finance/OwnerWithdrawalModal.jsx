import React, { useState } from 'react'
import { Wallet, ArrowDownRight, CheckCircle2, AlertCircle, X, ShieldAlert, Check } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { formatRupiah } from '../../utils/helpers'
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/financeHelpers'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_TENANT_ID, DEFAULT_BRANCH_ID } from '../../constants/erpConfig'
import { isValidUUID } from '../../utils/staffHelpers'

export default function OwnerWithdrawalModal({ isOpen, onClose, onSuccess, currentBalances = [] }) {
  const { profile, activeTenant } = useAuth()
  const [nominal, setNominal] = useState('')
  const activePockets = (currentBalances || []).filter(b => b.is_active !== false)
  const [sumberDana, setSumberDana] = useState(() => activePockets[0]?.pos || 'SALDO CASH')
  const [keterangan, setKeterangan] = useState('Penarikan Prive Pemilik Toko')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedPocket = (() => {
    if (activePockets.length === 0) return null
    return (
      activePockets.find(b => b.pos === sumberDana) ||
      (sumberDana === 'SALDO CASH'
        ? activePockets.find(b => b.pos === 'SALDO CASH' || b.type === 'CASH' || b.tipe === 'CASH')
        : activePockets.find(b => b.type === 'BANK' || b.tipe === 'BANK')) ||
      activePockets[0]
    )
  })()

  const selectedBalance = selectedPocket ? (selectedPocket.currentBalance ?? selectedPocket.current_balance ?? selectedPocket.saldo ?? 0) : null

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
      const rawTenantId = activeTenant?.id || profile?.tenant_id || DEFAULT_TENANT_ID
      const rawBranchId = profile?.branch_id || DEFAULT_BRANCH_ID

      // On Cloud Supabase, avoid sending mock string IDs (like 'branch_medan_main') to UUID columns
      const tenantId = (!supabase.isLocal && !isValidUUID(rawTenantId)) ? null : rawTenantId
      const branchId = (!supabase.isLocal && !isValidUUID(rawBranchId)) ? null : rawBranchId
      const resolvedPos = selectedPocket?.pos || sumberDana
      const isCashPocket = selectedPocket ? (selectedPocket.tipe === 'CASH' || selectedPocket.type === 'CASH') : resolvedPos === 'SALDO CASH'
      const creditAccount = isCashPocket ? 'acc_1001' : 'acc_1002'

      // 1. Catat ke Cashflow
      const cashflowEntry = {
        id_cashflow: `cf_prive_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tanggal: todayDate,
        keterangan_transaksi: `Prive Pemilik (${profile?.nama || 'Owner'}): ${keterangan.trim()}`,
        jenis: 'Mutasi Internal',
        kategori: 'Prive / Penarikan Owner',
        pemasukan: 0.0,
        pengeluaran: amount,
        pos: resolvedPos,
        ...(selectedPocket?.id && (supabase.isLocal || isValidUUID(selectedPocket.id)) ? { pocket_id: selectedPocket.id } : {}),
        created_at: new Date().toISOString()
      }
      if (tenantId) cashflowEntry.tenant_id = tenantId
      if (branchId) cashflowEntry.branch_id = branchId

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[var(--overlay-backdrop)] backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="w-full max-w-md bg-surface border border-border shadow-sm border-success/30 rounded-3xl shadow-2xl relative flex flex-col max-h-[92dvh] overflow-hidden my-auto">
        {/* Pinned Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-success-bg border border-success/30 flex items-center justify-center text-success">
              <Wallet size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Tarik Saldo / Prive Pemilik</h3>
              <p className="text-[10px] text-muted">
                Penarikan Pribadi Owner Tanpa Merusak Laba Bersih
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleWithdraw} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-4 overscroll-contain">
            {/* Info Banner Akuntansi */}
            <div className="p-3 rounded-2xl bg-success-bg border border-success/30 text-xs text-muted">
              <span className="font-bold text-success block mb-0.5">ℹ️ Integritas Laporan Akuntansi:</span>
              Penarikan ini dicatat pada akun <strong className="text-foreground">Prive [3002]</strong> (Ekuitas Pemilik), sehingga kas riil berkurang namun laba operasional toko tetap akurat 100%.
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-destructive-bg text-destructive text-xs font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Sumber Dana Penarikan <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {activePockets.length > 0 ? (
                  activePockets.map((acc) => {
                    const isSelected = (selectedPocket?.pos || sumberDana) === acc.pos
                    const isCash = acc.tipe === 'CASH' || acc.type === 'CASH'
                    const pocketLabel = acc.label || (isCash ? 'Kas Laci Kasir' : 'Rekening Bank')
                    return (
                      <button
                        key={acc.id || acc.pos}
                        type="button"
                        onClick={() => setSumberDana(acc.pos)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? (isCash ? 'bg-success-bg border-success/30 text-foreground shadow-sm' : 'bg-primary-soft border-primary/30 text-foreground shadow-sm')
                            : 'bg-surface border-border text-muted hover:text-foreground'
                        }`}
                      >
                        <div className="text-xs font-bold truncate">{pocketLabel}</div>
                        <div className="text-[10px] text-muted font-mono tabular-nums mt-0.5">
                          {formatRupiah(acc.currentBalance ?? acc.current_balance ?? 0)}
                        </div>
                      </button>
                    )
                  })
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSumberDana('SALDO CASH')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        sumberDana === 'SALDO CASH'
                          ? 'bg-success-bg border-success/30 text-foreground shadow-sm'
                          : 'bg-surface border-border text-muted hover:text-foreground'
                      }`}
                    >
                      <div className="text-xs font-bold">Kas Laci Kasir</div>
                      <div className="text-[10px] text-muted-dark font-mono">Uang Tunai Fisik</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSumberDana('SALDO REKENING Y')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        sumberDana !== 'SALDO CASH'
                          ? 'bg-primary-soft border-primary/30 text-foreground shadow-sm'
                          : 'bg-surface border-border text-muted hover:text-foreground'
                      }`}
                    >
                      <div className="text-xs font-bold">Rekening Bank</div>
                      <div className="text-[10px] text-muted-dark font-mono">QRIS / Transfer</div>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Jumlah Nominal Penarikan (Rp) <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={formatCurrencyInput(nominal)}
                onChange={(e) => setNominal(parseCurrencyInput(e.target.value))}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-foreground text-base font-mono font-bold focus:outline-none focus:border-ring"
                required
                autoFocus
              />
              {parseFloat(nominal || 0) > 0 && (
                <div className="flex items-center justify-between text-xs mt-1.5 font-medium">
                  <div className="flex items-center gap-1.5 text-success">
                    <Check size={14} />
                    <span>Terbaca: {formatRupiah(nominal)}</span>
                  </div>
                  {selectedBalance !== null && (
                    <span className={selectedBalance - parseFloat(nominal) < 0 ? 'text-destructive font-bold' : 'text-muted'}>
                      Sisa Saldo: {formatRupiah(selectedBalance - parseFloat(nominal))}
                      {selectedBalance - parseFloat(nominal) < 0 ? ' (⚠️ Saldo Kurang)' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                Keterangan Penarikan
              </label>
              <input
                type="text"
                placeholder="Contoh: Keperluan pribadi Pak Budi"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-surface border border-border rounded-xl text-foreground text-xs focus:outline-none focus:border-ring"
              />
            </div>
          </div>

          {/* Pinned Footer Actions */}
          <div className="px-6 py-4 border-t border-border bg-surface shrink-0 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-hover text-muted text-xs font-semibold transition-all cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover active:bg-primary-hover text-primary-foreground text-xs font-black shadow-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
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
