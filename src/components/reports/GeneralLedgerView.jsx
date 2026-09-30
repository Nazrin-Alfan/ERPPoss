import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import {
  Scale,
  BookOpen,
  PieChart,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  ShieldCheck,
  Plus,
  Edit3,
  Trash2,
  X,
  RefreshCw
} from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'

export default function GeneralLedgerView({ tenantId }) {
  const [activeGlTab, setActiveGlTab] = useState('trial_balance') // 'trial_balance' | 'balance_sheet' | 'income_statement' | 'ledger_drilldown'
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState('acc_1001')
  const [searchTerm, setSearchTerm] = useState('')

  // Report Data States
  const [trialBalance, setTrialBalance] = useState(null)
  const [balanceSheet, setBalanceSheet] = useState(null)
  const [incomeStatement, setIncomeStatement] = useState(null)
  const [accountLedger, setAccountLedger] = useState(null)

  // Drilldown & Two-Way Sync Modal States
  const [showDrilldownModal, setShowDrilldownModal] = useState(false)
  const [drilldownAccount, setDrilldownAccount] = useState(null)
  const [drilldownLedger, setDrilldownLedger] = useState(null)
  const [showTransModal, setShowTransModal] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [categoriesList, setCategoriesList] = useState([])
  const [transForm, setTransForm] = useState({
    tipe: 'Pengeluaran',
    tanggal: new Date().toLocaleDateString('en-CA'),
    pos: 'SALDO CASH',
    kategori: '',
    nominal: '',
    keterangan: '',
    nama_karyawan: '',
    plat_nomor: '',
  })

  const loadGlData = () => {
    setLoading(true)
    try {
      const gl = supabase.localDb?.gl || supabase.erp?.gl
      if (gl) {
        const tb = gl.getTrialBalance(tenantId)
        const bs = gl.getBalanceSheet(tenantId)
        const is = gl.getIncomeStatement(tenantId)
        const ledger = gl.getAccountLedger(tenantId, selectedAccountId)

        setTrialBalance(tb)
        setBalanceSheet(bs)
        setIncomeStatement(is)
        setAccountLedger(ledger)

        if (drilldownAccount) {
          const dl = gl.getAccountLedger(tenantId, drilldownAccount.id)
          setDrilldownLedger(dl)
        }
      }

      // Ambil master categories untuk dropdown
      supabase.from('master_categories').select('*').then(({ data }) => {
        if (data) setCategoriesList(data)
      })
    } catch (err) {
      console.error('Error generating GL reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDrilldown = (account) => {
    const gl = supabase.localDb?.gl || supabase.erp?.gl
    if (!gl) return
    const accObj = trialBalance?.accounts.find(a => a.id === account.id || a.code === account.code) || account
    setDrilldownAccount(accObj)
    const dl = gl.getAccountLedger(tenantId, accObj.id)
    setDrilldownLedger(dl)
    setShowDrilldownModal(true)
  }

  const handleSaveTransaction = (e) => {
    e.preventDefault()
    const gl = supabase.localDb?.gl || supabase.erp?.gl
    if (!gl) return

    try {
      if (editingRow) {
        gl.updateTransaction({
          source_type: editingRow.source_type,
          source_id: editingRow.source_id,
          tanggal: transForm.tanggal,
          nominal: parseFloat(transForm.nominal) || 0,
          keterangan: transForm.keterangan,
          pos: transForm.pos,
          kategori: transForm.kategori,
          tenant_id: tenantId,
        })
      } else {
        gl.createManualTransaction({
          tipe: transForm.tipe,
          tanggal: transForm.tanggal,
          nominal: parseFloat(transForm.nominal) || 0,
          keterangan: transForm.keterangan,
          pos: transForm.pos,
          kategori: transForm.kategori,
          account_id: drilldownAccount?.id || selectedAccountId,
          tenant_id: tenantId,
        })
      }
      setShowTransModal(false)
      setEditingRow(null)
      loadGlData()
    } catch (err) {
      alert('Gagal menyimpan transaksi: ' + err.message)
    }
  }

  const handleDeleteTransaction = (row) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus transaksi "${row.memo}"? Perubahan ini akan menghapus data di jurnal dan tabel operasional sumbernya.`)) {
      return
    }
    const gl = supabase.localDb?.gl || supabase.erp?.gl
    if (!gl) return

    try {
      gl.deleteTransaction({
        source_type: row.source_type,
        source_id: row.source_id,
        tenant_id: tenantId,
      })
      loadGlData()
    } catch (err) {
      alert('Gagal menghapus transaksi: ' + err.message)
    }
  }

  useEffect(() => {
    loadGlData()
  }, [tenantId, selectedAccountId])

  // Filtered accounts for Trial Balance
  const filteredAccounts = useMemo(() => {
    if (!trialBalance?.accounts) return []
    if (!searchTerm) return trialBalance.accounts
    const term = searchTerm.toLowerCase()
    return trialBalance.accounts.filter(
      (a) => a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) || a.category.toLowerCase().includes(term)
    )
  }, [trialBalance, searchTerm])

  if (loading && !trialBalance) {
    return (
      <div className="p-8 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-brand-emerald border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-xs uppercase tracking-wider font-semibold">Menghitung Buku Besar & Neraca Saldo...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            onClick={() => setActiveGlTab('trial_balance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeGlTab === 'trial_balance' ? 'bg-brand-emerald text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scale size={14} />
            Neraca Saldo (Trial Balance)
          </button>
          <button
            onClick={() => setActiveGlTab('balance_sheet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeGlTab === 'balance_sheet' ? 'bg-brand-emerald text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PieChart size={14} />
            Neraca Keuangan (Balance Sheet)
          </button>
          <button
            onClick={() => setActiveGlTab('income_statement')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeGlTab === 'income_statement' ? 'bg-brand-emerald text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <DollarSign size={14} />
            Laba Rugi Akuntansi (P&L)
          </button>
          <button
            onClick={() => setActiveGlTab('ledger_drilldown')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeGlTab === 'ledger_drilldown' ? 'bg-brand-emerald text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen size={14} />
            Drilldown Buku Besar (GL)
          </button>
        </div>

        {/* Balance Invariant Indicator */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          {trialBalance?.is_balanced ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle2 size={15} />
              <span>Buku Besar: 100% Seimbang (Debit = Kredit)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
              <AlertTriangle size={15} />
              <span>Selisih: {formatRupiah(trialBalance?.difference || 0)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 1. TAB: NERACA SALDO (TRIAL BALANCE) */}
      {activeGlTab === 'trial_balance' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center gap-3">
            <div className="relative w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Cari kode / nama akun..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-emerald"
              />
            </div>
            <div className="text-xs text-slate-400">
              Total {filteredAccounts.length} Akun Terdaftar
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Kode</th>
                  <th className="py-3 px-4">Nama Akun</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4 text-right">Debit (Rp)</th>
                  <th className="py-3 px-4 text-right">Kredit (Rp)</th>
                  <th className="py-3 px-4 text-right">Saldo Normal (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {filteredAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    onClick={() => handleOpenDrilldown(acc)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    <td className="py-2.5 px-4 font-bold text-brand-emerald group-hover:underline flex items-center gap-1.5">
                      {acc.code}
                      <span className="text-[10px] text-slate-500 font-sans opacity-0 group-hover:opacity-100 transition-opacity">
                        (Klik Rincian)
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-200">{acc.name}</td>
                    <td className="py-2.5 px-4 font-sans text-[11px] text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                        {acc.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-300">{formatRupiah(acc.total_debit)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-300">{formatRupiah(acc.total_credit)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-white">
                      {acc.normal_balance === 'DEBIT'
                        ? formatRupiah(acc.balance_debit)
                        : formatRupiah(acc.balance_credit)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-950 font-bold font-mono">
                  <td colSpan={3} className="py-3 px-4 uppercase text-slate-300 font-sans tracking-wider">
                    Total Mutasi Buku Besar
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-400">{formatRupiah(trialBalance?.total_debit || 0)}</td>
                  <td className="py-3 px-4 text-right text-emerald-400">{formatRupiah(trialBalance?.total_credit || 0)}</td>
                  <td className="py-3 px-4 text-right text-brand-emerald">
                    {trialBalance?.is_balanced ? 'SEIMBANG' : 'SELISIH'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 2. TAB: NERACA KEUANGAN (BALANCE SHEET) */}
      {activeGlTab === 'balance_sheet' && balanceSheet && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SISI KIRI: TOTAL ASET */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/30 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-brand-blue font-bold">
                  <Building2 size={18} />
                  <span className="uppercase tracking-wider text-xs">ASET (HARTA PERUSAHAAN)</span>
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">Akun 1xxx</span>
              </div>

              <div className="space-y-2">
                {balanceSheet.assets.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenDrilldown(item)}
                    className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-slate-800/50 cursor-pointer text-xs group transition-colors"
                  >
                    <span className="text-slate-300 group-hover:text-white">
                      <strong className="text-brand-blue mr-2 font-mono group-hover:underline">{item.code}</strong>
                      {item.name}
                    </span>
                    <span className="font-mono font-semibold text-white">{formatRupiah(item.amount)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t-2 border-slate-800 flex justify-between items-center">
                <span className="font-extrabold text-sm uppercase text-slate-200">TOTAL ASET</span>
                <span className="font-mono text-base font-black text-brand-blue">
                  {formatRupiah(balanceSheet.total_assets)}
                </span>
              </div>
            </div>

            {/* SISI KANAN: LIABILITAS & EKUITAS */}
            <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/30 space-y-5">
              {/* LIABILITAS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <ShieldCheck size={18} />
                    <span className="uppercase tracking-wider text-xs">LIABILITAS (KEWAJIBAN & HUTANG)</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-400">Akun 2xxx</span>
                </div>

                <div className="space-y-1.5">
                  {balanceSheet.liabilities.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleOpenDrilldown(item)}
                      className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-slate-800/50 cursor-pointer text-xs group transition-colors"
                    >
                      <span className="text-slate-300 group-hover:text-white">
                        <strong className="text-amber-400 mr-2 font-mono group-hover:underline">{item.code}</strong>
                        {item.name}
                      </span>
                      <span className="font-mono font-semibold text-white">{formatRupiah(item.amount)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2 text-xs font-bold text-slate-400">
                  <span>Subtotal Liabilitas</span>
                  <span className="font-mono text-white">{formatRupiah(balanceSheet.total_liabilities)}</span>
                </div>
              </div>

              {/* EKUITAS */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2 text-purple-400 font-bold">
                    <PieChart size={18} />
                    <span className="uppercase tracking-wider text-xs">EKUITAS (MODAL & LABA)</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-400">Akun 3xxx</span>
                </div>

                <div className="space-y-1.5">
                  {balanceSheet.equity.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleOpenDrilldown(item)}
                      className="flex justify-between items-center py-1.5 px-3 rounded-lg hover:bg-slate-800/50 cursor-pointer text-xs group transition-colors"
                    >
                      <span className="text-slate-300 group-hover:text-white">
                        <strong className="text-purple-400 mr-2 font-mono group-hover:underline">{item.code}</strong>
                        {item.name}
                      </span>
                      <span className="font-mono font-semibold text-white">{formatRupiah(item.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-1.5 px-3 rounded-lg text-xs bg-brand-emerald/10 border border-brand-emerald/20 text-emerald-300">
                    <span className="font-semibold">Laba Bersih Periode Berjalan</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatRupiah(balanceSheet.current_net_profit)}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 text-xs font-bold text-slate-400">
                  <span>Subtotal Ekuitas</span>
                  <span className="font-mono text-white">{formatRupiah(balanceSheet.total_equity)}</span>
                </div>
              </div>

              <div className="pt-3 border-t-2 border-slate-800 flex justify-between items-center">
                <span className="font-extrabold text-sm uppercase text-slate-200">TOTAL LIABILITAS & EKUITAS</span>
                <span className="font-mono text-base font-black text-purple-400">
                  {formatRupiah(balanceSheet.total_liabilities_and_equity)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB: LABA RUGI AKUNTANSI (INCOME STATEMENT) */}
      {activeGlTab === 'income_statement' && incomeStatement && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-6 max-w-4xl mx-auto">
          <div className="border-b border-slate-800 pb-4">
            <h4 className="text-lg font-black text-white uppercase tracking-wider">Laporan Laba Rugi Akuntansi (General Ledger P&L)</h4>
            <p className="text-xs text-slate-400 mt-0.5">Dihitung otomatis berdasarkan jurnal mutasi pendapatan, HPP Moving Average, dan beban terverifikasi.</p>
          </div>

          {/* REVENUE */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-brand-emerald flex items-center gap-2">
              <ArrowUpRight size={16} />
              1. Pendapatan Usaha
            </h5>
            <div className="space-y-2 pl-4">
              {incomeStatement.revenues.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleOpenDrilldown(r)}
                  className="flex justify-between items-center py-1.5 border-b border-slate-800/40 text-xs font-mono hover:bg-slate-800/40 px-2 rounded cursor-pointer group transition-colors"
                >
                  <span className="font-sans text-slate-300 group-hover:text-white group-hover:underline">
                    {r.name}
                  </span>
                  <span className="text-emerald-400 font-semibold">{formatRupiah(r.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 text-xs font-bold font-mono">
                <span className="font-sans uppercase text-slate-200">Total Pendapatan</span>
                <span className="text-brand-emerald text-sm">{formatRupiah(incomeStatement.total_revenue)}</span>
              </div>
            </div>
          </div>

          {/* COGS */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <ArrowDownRight size={16} />
              2. Harga Pokok Penjualan (HPP Bahan Terpakai)
            </h5>
            <div className="space-y-2 pl-4">
              {incomeStatement.cogs.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleOpenDrilldown(c)}
                  className="flex justify-between items-center py-1.5 border-b border-slate-800/40 text-xs font-mono hover:bg-slate-800/40 px-2 rounded cursor-pointer group transition-colors"
                >
                  <span className="font-sans text-slate-300 group-hover:text-white group-hover:underline">
                    {c.name}
                  </span>
                  <span className="text-amber-400 font-semibold">{formatRupiah(c.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 text-xs font-bold font-mono">
                <span className="font-sans uppercase text-slate-200">Total HPP</span>
                <span className="text-amber-400 text-sm">({formatRupiah(incomeStatement.total_cogs)})</span>
              </div>
            </div>
          </div>

          {/* GROSS PROFIT */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center font-mono">
            <span className="font-sans font-bold uppercase text-xs text-white">LABA KOTOR (GROSS PROFIT)</span>
            <span className="text-base font-black text-white">{formatRupiah(incomeStatement.gross_profit)}</span>
          </div>

          {/* OPERATING EXPENSES */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
              <ArrowDownRight size={16} />
              3. Beban Operasional Usaha
            </h5>
            <div className="space-y-2 pl-4">
              {incomeStatement.expenses.map((e) => (
                <div
                  key={e.id}
                  onClick={() => handleOpenDrilldown(e)}
                  className="flex justify-between items-center py-1.5 border-b border-slate-800/40 text-xs font-mono hover:bg-slate-800/40 px-2 rounded cursor-pointer group transition-colors"
                >
                  <span className="font-sans text-slate-300 group-hover:text-white group-hover:underline">
                    {e.name}
                  </span>
                  <span className="text-rose-400 font-semibold">{formatRupiah(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 text-xs font-bold font-mono">
                <span className="font-sans uppercase text-slate-200">Total Beban Operasional</span>
                <span className="text-rose-400 text-sm">({formatRupiah(incomeStatement.total_expenses)})</span>
              </div>
            </div>
          </div>

          {/* NET PROFIT */}
          <div className="p-4 rounded-xl bg-brand-emerald/15 border border-brand-emerald/30 flex justify-between items-center font-mono">
            <div>
              <span className="font-sans font-black uppercase text-sm text-emerald-300 block">
                LABA BERSIH BERJALAN (NET INCOME)
              </span>
              <span className="text-[10px] text-emerald-400/80 font-sans">
                Laba Kotor dikurangi Total Beban Operasional
              </span>
            </div>
            <span className="text-xl font-black text-brand-emerald">
              {formatRupiah(incomeStatement.net_profit)}
            </span>
          </div>
        </div>
      )}

      {/* 4. TAB: DRILLDOWN BUKU BESAR (GL EXPLORER) */}
      {activeGlTab === 'ledger_drilldown' && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pilih Akun Buku Besar:</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-brand-emerald"
            >
              {trialBalance?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.code}] {a.name} ({a.category})
                </option>
              ))}
            </select>
          </div>

          {accountLedger && (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-300">
                  Total Transaksi: <strong className="text-white font-mono">{accountLedger.rows.length} baris</strong>
                </div>
                <button
                  onClick={() => {
                    setEditingRow(null)
                    setTransForm({
                      tipe: accountLedger.account.category === 'REVENUE' ? 'Pemasukan' : 'Pengeluaran',
                      tanggal: new Date().toLocaleDateString('en-CA'),
                      pos: 'SALDO CASH',
                      kategori: categoriesList.length > 0 ? categoriesList[0].nama_kategori : 'Operasional',
                      nominal: '',
                      keterangan: '',
                      nama_karyawan: '',
                      plat_nomor: '',
                    })
                    setDrilldownAccount(accountLedger.account)
                    setShowTransModal(true)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-emerald text-slate-950 text-xs font-bold hover:bg-emerald-500 shadow-md shadow-brand-emerald/10 transition-all"
                >
                  <Plus size={13} />
                  + Catat Transaksi untuk Akun Ini
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-bold uppercase">
                      <th className="py-3 px-4">Tanggal</th>
                      <th className="py-3 px-4">No. Bukti / Ref</th>
                      <th className="py-3 px-4">Keterangan / Memo</th>
                      <th className="py-3 px-4 text-right">Debit (Rp)</th>
                      <th className="py-3 px-4 text-right">Kredit (Rp)</th>
                      <th className="py-3 px-4 text-right">Saldo Berjalan (Rp)</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 font-mono">
                    {accountLedger.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                          Belum ada riwayat mutasi untuk akun ini.
                        </td>
                      </tr>
                    ) : (
                      accountLedger.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-4 text-slate-300">{row.date}</td>
                          <td className="py-2.5 px-4 font-bold text-brand-emerald">{row.entry_no}</td>
                          <td className="py-2.5 px-4 font-sans text-slate-200">{row.memo}</td>
                          <td className="py-2.5 px-4 text-right text-slate-300">{row.debit > 0 ? formatRupiah(row.debit) : '-'}</td>
                          <td className="py-2.5 px-4 text-right text-slate-300">{row.credit > 0 ? formatRupiah(row.credit) : '-'}</td>
                          <td className="py-2.5 px-4 text-right font-bold text-white">{formatRupiah(row.running_balance)}</td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex justify-end gap-1.5 font-sans">
                              <button
                                onClick={() => {
                                  setEditingRow(row)
                                  setTransForm({
                                    tipe: row.debit > 0 ? 'Pengeluaran' : 'Pemasukan',
                                    tanggal: row.date,
                                    pos: 'SALDO CASH',
                                    kategori: categoriesList.length > 0 ? categoriesList[0].nama_kategori : 'Operasional',
                                    nominal: (row.debit || row.credit || 0).toString(),
                                    keterangan: row.memo,
                                    nama_karyawan: '',
                                    plat_nomor: '',
                                  })
                                  setDrilldownAccount(accountLedger.account)
                                  setShowTransModal(true)
                                }}
                                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                                title="Edit Transaksi Sumber"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(row)}
                                className="p-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                title="Hapus Transaksi Sumber"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-950 font-bold font-mono">
                      <td colSpan={5} className="py-3 px-4 uppercase text-slate-300 font-sans">
                        Saldo Akhir Akun
                      </td>
                      <td className="py-3 px-4 text-right text-brand-emerald text-sm">
                        {formatRupiah(accountLedger.closing_balance)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* MODAL 1: DRILLDOWN RINCIAN TRANSAKSI (CLICKABLE ROW) */}
      {showDrilldownModal && drilldownAccount && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="glass-panel w-full max-w-4xl p-6 rounded-2xl shadow-2xl border border-slate-800 bg-slate-900 text-slate-200 max-h-[90vh] flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono px-2.5 py-0.5 rounded bg-brand-emerald/20 text-brand-emerald font-black text-sm">
                      {drilldownAccount.code}
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {drilldownAccount.name}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Kategori: <strong className="text-slate-200">{drilldownAccount.category}</strong> • Saldo Normal: <strong className="text-slate-200">{drilldownAccount.normal_balance}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditingRow(null)
                      setTransForm({
                        tipe: drilldownAccount.category === 'REVENUE' ? 'Pemasukan' : 'Pengeluaran',
                        tanggal: new Date().toLocaleDateString('en-CA'),
                        pos: 'SALDO CASH',
                        kategori: categoriesList.length > 0 ? categoriesList[0].nama_kategori : 'Operasional',
                        nominal: '',
                        keterangan: '',
                        nama_karyawan: '',
                        plat_nomor: '',
                      })
                      setShowTransModal(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-emerald hover:bg-emerald-500 text-slate-950 text-xs font-bold shadow-md shadow-brand-emerald/10 transition-all"
                  >
                    <Plus size={14} />
                    + Catat Transaksi Baru
                  </button>
                  <button
                    onClick={() => setShowDrilldownModal(false)}
                    className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Tabel Transaksi Pembentuk */}
              <div className="overflow-x-auto max-h-[50vh] rounded-xl border border-slate-800 bg-slate-950/50 mb-4">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase z-10">
                    <tr>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">No. Bukti / Ref</th>
                      <th className="py-2.5 px-3">Keterangan Sumber</th>
                      <th className="py-2.5 px-3 text-right">Debit (Rp)</th>
                      <th className="py-2.5 px-3 text-right">Kredit (Rp)</th>
                      <th className="py-2.5 px-3 text-right">Saldo Berjalan</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 font-mono">
                    {(!drilldownLedger || drilldownLedger.rows.length === 0) ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                          Belum ada transaksi pembentuk untuk akun ini.
                        </td>
                      </tr>
                    ) : (
                      drilldownLedger.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-slate-300">{row.date}</td>
                          <td className="py-2 px-3 font-bold text-brand-emerald">{row.entry_no}</td>
                          <td className="py-2 px-3 font-sans text-slate-200">{row.memo}</td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {row.debit > 0 ? formatRupiah(row.debit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-300">
                            {row.credit > 0 ? formatRupiah(row.credit) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-white">
                            {formatRupiah(row.running_balance)}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex justify-end gap-1.5 font-sans">
                              <button
                                onClick={() => {
                                  setEditingRow(row)
                                  setTransForm({
                                    tipe: row.debit > 0 ? 'Pengeluaran' : 'Pemasukan',
                                    tanggal: row.date,
                                    pos: 'SALDO CASH',
                                    kategori: categoriesList.length > 0 ? categoriesList[0].nama_kategori : 'Operasional',
                                    nominal: (row.debit || row.credit || 0).toString(),
                                    keterangan: row.memo,
                                    nama_karyawan: '',
                                    plat_nomor: '',
                                  })
                                  setShowTransModal(true)
                                }}
                                className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
                                title="Edit Transaksi Sumber"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(row)}
                                className="p-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                                title="Hapus Transaksi Sumber"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                Saldo Terhitung: <strong className="font-mono text-white text-sm">{formatRupiah(drilldownLedger?.closing_balance || 0)}</strong>
              </div>
              <button
                onClick={() => setShowDrilldownModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: FORM CREATE / EDIT TRANSAKSI (TWO-WAY SYNC) */}
      {showTransModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-60 overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl shadow-2xl border border-slate-800 bg-slate-900 text-slate-200">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="text-brand-emerald" size={18} />
                <span>{editingRow ? 'Koreksi / Edit Transaksi Sumber' : 'Catat Transaksi Baru (Two-Way Sync)'}</span>
              </h3>
              <button
                onClick={() => setShowTransModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Jenis Arus
                  </label>
                  <select
                    value={transForm.tipe}
                    onChange={(e) => setTransForm(prev => ({ ...prev, tipe: e.target.value }))}
                    disabled={!!editingRow}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-emerald disabled:opacity-50"
                  >
                    <option value="Pengeluaran">Pengeluaran (Beban)</option>
                    <option value="Pemasukan">Pemasukan (Pendapatan)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={transForm.tanggal}
                    onChange={(e) => setTransForm(prev => ({ ...prev, tanggal: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-emerald"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Pos Uang / Rekening
                </label>
                <select
                  value={transForm.pos}
                  onChange={(e) => setTransForm(prev => ({ ...prev, pos: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-emerald"
                >
                  <option value="SALDO CASH">SALDO CASH (Laci Tunai)</option>
                  <option value="SALDO BANK / QRIS">SALDO BANK / QRIS (Rekening)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Kategori
                </label>
                <select
                  value={transForm.kategori}
                  onChange={(e) => setTransForm(prev => ({ ...prev, kategori: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-emerald"
                >
                  {categoriesList.map(c => (
                    <option key={c.id} value={c.nama_kategori}>{c.nama_kategori} ({c.jenis})</option>
                  ))}
                  {categoriesList.length === 0 && (
                    <>
                      <option value="Operasional">Operasional</option>
                      <option value="Bahan Baku">Bahan Baku</option>
                      <option value="Sewa">Sewa</option>
                      <option value="Lain-lain">Lain-lain</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nominal (Rp)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={transForm.nominal}
                  onChange={(e) => setTransForm(prev => ({ ...prev, nominal: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-brand-emerald"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Keterangan / Memo
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Belanja bahan dapur tambahan, bayar teknisi carwash"
                  value={transForm.keterangan}
                  onChange={(e) => setTransForm(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-emerald"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTransModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-emerald hover:bg-emerald-500 text-slate-950 shadow-lg shadow-brand-emerald/20 transition-all"
                >
                  {editingRow ? 'Simpan Pembaruan' : 'Posting Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
