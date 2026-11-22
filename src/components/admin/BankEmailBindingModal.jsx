import React, { useState, useEffect, useCallback } from 'react'
import {
  Mail,
  Link2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  X,
  RefreshCw,
  Calendar,
  Building2,
  Info
} from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { normalizeEmailIdentity } from '../../services/mandiriEmailParser'
import { isValidUUID } from '../../utils/staffHelpers'

export default function BankEmailBindingModal({
  isOpen,
  onClose,
  onSuccess,
  pockets = [],
  initialPocketId = ''
}) {
  const { activeTenant, profile } = useAuth()
  const rawTenantId = activeTenant?.id || profile?.tenant_id
  const tenantId = (!supabase.isLocal && !isValidUUID(rawTenantId)) ? null : rawTenantId

  const bankPockets = (pockets || []).filter(
    (p) => p.is_active !== false && (p.tipe === 'BANK' || p.type === 'BANK' || p.pos !== 'SALDO CASH')
  )

  const [connections, setConnections] = useState([])
  const [bindings, setBindings] = useState([])
  const [loading, setLoading] = useState(true)
  const [submittingConn, setSubmittingConn] = useState(false)
  const [submittingBind, setSubmittingBind] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [bindingForm, setBindingForm] = useState({
    connection_id: '',
    pocket_id: initialPocketId || bankPockets[0]?.id || '',
    account_last4: '',
    account_holder_name: '',
    import_start_date: new Date().toLocaleDateString('en-CA'),
    is_default_for_last4: false
  })

  useEffect(() => {
    if (initialPocketId) {
      setBindingForm((prev) => ({ ...prev, pocket_id: initialPocketId }))
    } else if (!bindingForm.pocket_id && bankPockets[0]?.id) {
      setBindingForm((prev) => ({ ...prev, pocket_id: bankPockets[0].id }))
    }
  }, [initialPocketId, bankPockets.length])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let connQuery = supabase
        .from('bank_email_connections')
        .select('*')
        .order('created_at', { ascending: false })
      let bindQuery = supabase
        .from('bank_account_bindings')
        .select('*')
        .order('created_at', { ascending: false })

      if (tenantId) {
        connQuery = connQuery.eq('tenant_id', tenantId)
        bindQuery = bindQuery.eq('tenant_id', tenantId)
      }

      const [connRes, bindRes] = await Promise.all([connQuery, bindQuery])
      if (connRes.error) throw connRes.error
      if (bindRes.error) throw bindRes.error

      const connRows = Array.isArray(connRes.data) ? connRes.data : []
      const bindRows = Array.isArray(bindRes.data) ? bindRes.data : []
      setConnections(connRows)
      setBindings(bindRows)

      if (connRows.length > 0) {
        setBindingForm((prev) => ({
          ...prev,
          connection_id:
            prev.connection_id && connRows.some((c) => c.id === prev.connection_id)
              ? prev.connection_id
              : connRows[0].id
        }))
      }
    } catch (err) {
      setError(err.message || 'Gagal memuat konfigurasi integrasi email bank.')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    if (isOpen) {
      loadData()
    }
  }, [isOpen, loadData])

  if (!isOpen) return null

  const handleAddConnection = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const trimmed = String(newEmail || '').trim().toLowerCase()
    const normalized = normalizeEmailIdentity(trimmed)
    if (!normalized || !normalized.includes('@')) {
      setError('Masukkan alamat email Gmail yang valid (contoh: finance.toko@gmail.com).')
      return
    }

    setSubmittingConn(true)
    try {
      const selectedPocket = bankPockets.find((p) => p.id === bindingForm.pocket_id)
      const rawBranchId = selectedPocket?.branch_id ?? profile?.branch_id ?? null
      const branchId = (!supabase.isLocal && !isValidUUID(rawBranchId)) ? null : rawBranchId

      const payload = {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...(branchId ? { branch_id: branchId } : {}),
        provider_type: 'GMAIL_OAUTH',
        provider_account_id: `google-sub-${normalized}`,
        connected_email: trimmed,
        normalized_email: normalized,
        status: 'ACTIVE',
        trusted_senders: ['notifikasi@bankmandiri.co.id', 'livin@bankmandiri.co.id'],
        connected_by: (!supabase.isLocal && !isValidUUID(profile?.id)) ? null : (profile?.id || null)
      }

      const { data, error: insErr } = await supabase
        .from('bank_email_connections')
        .insert(payload)
        .select('*')
        .single()

      if (insErr) {
        if (String(insErr.message || '').includes('EMAIL_ALREADY_BOUND_TO_OTHER_TENANT')) {
          throw new Error(
            'Koneksi ditolak: Akun Gmail ini sudah terhubung aktif pada tenant lain yang bukan milik Owner Anda.'
          )
        }
        throw insErr
      }

      setNewEmail('')
      setSuccess(`Email ${trimmed} berhasil dihubungkan (identitas ternormalisasi: ${normalized}).`)
      await loadData()
      if (data?.id) {
        setBindingForm((prev) => ({ ...prev, connection_id: data.id }))
      }
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message || 'Gagal menghubungkan akun email.')
    } finally {
      setSubmittingConn(false)
    }
  }

  const handleAddBinding = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!bindingForm.connection_id) {
      setError('Pilih atau tambahkan koneksi email terlebih dahulu.')
      return
    }
    if (!bindingForm.pocket_id) {
      setError('Pilih kantong saldo (Rekening Bank) tujuan.')
      return
    }
    if (!/^\d{4}$/.test(String(bindingForm.account_last4 || '').trim())) {
      setError('Ekor nomor rekening wajib tepat 4 digit angka (contoh: 1122).')
      return
    }

    setSubmittingBind(true)
    try {
      const targetPocket = bankPockets.find((p) => p.id === bindingForm.pocket_id)
      const rawBranchId = targetPocket?.branch_id ?? profile?.branch_id ?? null
      const branchId = (!supabase.isLocal && !isValidUUID(rawBranchId)) ? null : rawBranchId

      const payload = {
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...(branchId ? { branch_id: branchId } : {}),
        connection_id: bindingForm.connection_id,
        pocket_id: bindingForm.pocket_id,
        bank_code: 'MANDIRI',
        account_last4: String(bindingForm.account_last4).trim(),
        account_holder_name: String(bindingForm.account_holder_name || '').trim() || null,
        is_default_for_last4: Boolean(bindingForm.is_default_for_last4),
        import_start_date: bindingForm.import_start_date || new Date().toLocaleDateString('en-CA'),
        is_active: true
      }

      const { error: bindErr } = await supabase.from('bank_account_bindings').insert(payload)
      if (bindErr) throw bindErr

      setBindingForm((prev) => ({
        ...prev,
        account_last4: '',
        account_holder_name: '',
        is_default_for_last4: false
      }))
      setSuccess(
        `Rekening Mandiri •••• ${payload.account_last4} berhasil diikat ke kantong ${
          targetPocket?.label || targetPocket?.pos || 'Rekening'
        }.`
      )
      await loadData()
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message || 'Gagal menyimpan ikatan rekening bank.')
    } finally {
      setSubmittingBind(false)
    }
  }

  const handleDeleteBinding = async (bindingId) => {
    setError('')
    setSuccess('')
    try {
      const { error: delErr } = await supabase
        .from('bank_account_bindings')
        .delete()
        .eq('id', bindingId)
      if (delErr) throw delErr
      setSuccess('Ikatan ekor rekening berhasil dihapus.')
      await loadData()
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message || 'Gagal menghapus ikatan rekening.')
    }
  }

  const handleDeleteConnection = async (connId) => {
    setError('')
    setSuccess('')
    try {
      const { error: delErr } = await supabase
        .from('bank_email_connections')
        .delete()
        .eq('id', connId)
      if (delErr) throw delErr
      setSuccess('Koneksi email beserta ikatan rekening terkait berhasil dihapus.')
      await loadData()
      if (onSuccess) onSuccess()
    } catch (err) {
      setError(err.message || 'Gagal menghapus koneksi email.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
      aria-labelledby="bank-email-binding-modal-title"
    >
      <div className="w-full max-w-3xl bg-[#121215] border border-[#26272d] rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#26272d] bg-[#18181c] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00ffff]/10 border border-[#00ffff]/30 flex items-center justify-center text-[#00ffff]">
              <Mail size={18} />
            </div>
            <div>
              <h2 id="bank-email-binding-modal-title" className="text-base font-bold text-white">
                Integrasi Email Notifikasi Bank Mandiri
              </h2>
              <p className="text-[11px] text-[#bbcbb2]">
                1 Akun Gmail untuk banyak rekening Mandiri (filter 4 digit ekor rekening &amp; proteksi lintas tenant)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog integrasi email bank"
            className="p-1.5 rounded-lg text-[#bbcbb2] hover:text-white hover:bg-[#26272d] transition-colors active:scale-[0.98]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-6 overscroll-contain">
          {/* Architecture Notice */}
          <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] text-xs text-[#bbcbb2] space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-[#00ffff]">
              <ShieldCheck size={15} />
              <span>Cara Kerja Isolasi Multi-Rekening &amp; Multi-Tenant</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] leading-relaxed">
              <li>
                <strong>1 Gmail &rarr; Banyak Rekening Mandiri:</strong> Daftarkan 4 digit ekor rekening (misal{' '}
                <code className="text-white font-mono">1122</code>, <code className="text-white font-mono">3344</code>)
                ke masing-masing kantong saldo. Rekening pribadi di Gmail yang sama otomatis diabaikan (
                <code className="text-amber-300 font-mono">IGNORED_UNBOUND_ACCOUNT</code>).
              </li>
              <li>
                <strong>1 Rekening Fisik &rarr; Banyak Kantong Saldo:</strong> Jika beberapa kantong memakai ekor
                rekening yang sama tanpa default tunggal, mutasi masuk ke antrean{' '}
                <code className="text-amber-300 font-mono">AMBIGUOUS_POCKET</code> agar kasir/admin memilih kantong
                sebelum saldo dipotong.
              </li>
              <li>
                <strong>Anti-Bajak Lintas Tenant:</strong> Variasi titik atau <code className="font-mono">+alias</code>{' '}
                Gmail dinormalisasi otomatis dan dikunci agar tidak dipakai oleh tenant milik Owner lain.
              </li>
            </ul>
          </div>

          {/* Alerts (Error / Success States) */}
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
            >
              <AlertCircle size={16} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2"
            >
              <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {/* Loading State */}
          {loading ? (
            <div className="space-y-3 py-6" data-testid="bank-email-loading">
              <div className="h-10 rounded-xl bg-[#18181c] border border-[#26272d] animate-pulse" />
              <div className="h-24 rounded-xl bg-[#18181c] border border-[#26272d] animate-pulse" />
              <div className="h-28 rounded-xl bg-[#18181c] border border-[#26272d] animate-pulse" />
            </div>
          ) : (
            <>
              {/* Step 1: Email Connection */}
              <div className="p-4 rounded-xl bg-[#18181c]/70 border border-[#26272d] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Mail size={14} className="text-[#00ffff]" />
                    <span>1. Koneksi Kotak Masuk Gmail (Penerima Notifikasi Mandiri)</span>
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-[#bbcbb2]">
                    {connections.length} Koneksi Aktif
                  </span>
                </div>

                <form onSubmit={handleAddConnection} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    placeholder="Contoh: finance.outlet@gmail.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 bg-[#121215] border border-[#26272d] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                    required
                  />
                  <button
                    type="submit"
                    disabled={submittingConn}
                    className="px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-cyan-400 active:scale-[0.98] text-[#0f0f0f] font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                  >
                    <Plus size={14} />
                    <span>{submittingConn ? 'Menghubungkan...' : 'Hubungkan Gmail'}</span>
                  </button>
                </form>

                {connections.length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#121215] border border-dashed border-[#26272d] text-xs text-[#bbcbb2] flex items-center gap-2">
                    <Info size={14} className="text-[#00ffff] shrink-0" />
                    <span>
                      Belum ada akun Gmail terhubung. Tambahkan alamat Gmail yang menerima email dari{' '}
                      <code className="text-white font-mono">notifikasi@bankmandiri.co.id</code>.
                    </span>
                  </div>
                ) : (
                  <div className="divide-y divide-[#26272d] rounded-xl bg-[#121215] border border-[#26272d] overflow-hidden">
                    {connections.map((conn) => (
                      <div key={conn.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white truncate">{conn.connected_email}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              {conn.status || 'ACTIVE'}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#6b7367] font-mono mt-0.5">
                            Identitas Kanonis: {conn.normalized_email}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteConnection(conn.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors active:scale-[0.98]"
                          title="Putuskan Koneksi Email"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 2: Bind 4-digit Account to Pocket */}
              <div className="p-4 rounded-xl bg-[#18181c]/70 border border-[#26272d] space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Link2 size={14} className="text-[#00ffff]" />
                    <span>2. Ikat 4 Digit Ekor Rekening Mandiri ke Kantong Saldo</span>
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-[#bbcbb2]">
                    {bindings.length} Rekening Terikat
                  </span>
                </div>

                <form onSubmit={handleAddBinding} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1">
                        Koneksi Gmail Sumber
                      </label>
                      <select
                        value={bindingForm.connection_id}
                        onChange={(e) => setBindingForm((prev) => ({ ...prev, connection_id: e.target.value }))}
                        className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                        required
                      >
                        <option value="">-- Pilih Koneksi Gmail --</option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.connected_email}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1">
                        Kantong Saldo Tujuan (Rekening Bank)
                      </label>
                      <select
                        value={bindingForm.pocket_id}
                        onChange={(e) => setBindingForm((prev) => ({ ...prev, pocket_id: e.target.value }))}
                        className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                        required
                      >
                        <option value="">-- Pilih Kantong Saldo --</option>
                        {bankPockets.map((p) => (
                          <option key={p.id || p.pos} value={p.id}>
                            {p.label || p.pos} ({p.pos})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1">
                        4 Digit Ekor Rekening Mandiri
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="1122"
                        value={bindingForm.account_last4}
                        onChange={(e) =>
                          setBindingForm((prev) => ({
                            ...prev,
                            account_last4: e.target.value.replace(/\D/g, '').slice(0, 4)
                          }))
                        }
                        className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-[#00ffff]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1">
                        Tanggal Cutoff Mulai Impor
                      </label>
                      <input
                        type="date"
                        value={bindingForm.import_start_date}
                        onChange={(e) => setBindingForm((prev) => ({ ...prev, import_start_date: e.target.value }))}
                        className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00ffff]"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-[#bbcbb2] uppercase tracking-wider mb-1">
                        Nama Pemilik Rekening (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Misal: Mandiri Operasional"
                        value={bindingForm.account_holder_name}
                        onChange={(e) => setBindingForm((prev) => ({ ...prev, account_holder_name: e.target.value }))}
                        className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <label className="flex items-center gap-2 text-xs text-[#bbcbb2] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={bindingForm.is_default_for_last4}
                        onChange={(e) =>
                          setBindingForm((prev) => ({ ...prev, is_default_for_last4: e.target.checked }))
                        }
                        className="rounded border-[#26272d] bg-[#121215] text-[#00ffff]"
                      />
                      <span>
                        Jadikan kantong default untuk ekor rekening ini (jika 1 rekening fisik dipakai &gt;1 kantong)
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={submittingBind || connections.length === 0}
                      className="px-4 py-2 rounded-xl bg-[#00ffff] hover:bg-cyan-400 active:scale-[0.98] text-[#0f0f0f] font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shrink-0"
                    >
                      <Link2 size={14} />
                      <span>{submittingBind ? 'Menyimpan...' : 'Simpan Ikatan Rekening'}</span>
                    </button>
                  </div>
                </form>

                {/* Active Bindings Table */}
                {bindings.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#121215] border border-dashed border-[#26272d] text-center text-xs text-[#bbcbb2]">
                    Belum ada ekor rekening Bank Mandiri yang diikat ke kantong saldo.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-[#26272d] bg-[#121215]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#26272d] bg-[#18181c] text-[#bbcbb2] text-[10px] uppercase font-bold">
                          <th className="py-2.5 px-3">Bank &amp; Ekor</th>
                          <th className="py-2.5 px-3">Kantong Saldo</th>
                          <th className="py-2.5 px-3">Gmail Terhubung</th>
                          <th className="py-2.5 px-3 text-right">Cutoff Impor</th>
                          <th className="py-2.5 px-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#26272d]">
                        {bindings.map((b) => {
                          const pocket = pockets.find((p) => p.id === b.pocket_id)
                          const conn = connections.find((c) => c.id === b.connection_id)
                          return (
                            <tr key={b.id} className="hover:bg-[#18181c]/60">
                              <td className="py-2.5 px-3 font-mono font-bold text-white">
                                <div className="flex items-center gap-1.5">
                                  <Building2 size={13} className="text-[#00ffff]" />
                                  <span>MANDIRI •••• {b.account_last4}</span>
                                  {b.is_default_for_last4 && (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#00ffff]/15 text-[#00ffff] border border-[#00ffff]/30">
                                      DEFAULT
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-white font-semibold">
                                {pocket ? `${pocket.label || pocket.pos} (${pocket.pos})` : b.pocket_id}
                              </td>
                              <td className="py-2.5 px-3 text-[#bbcbb2]">
                                {conn?.connected_email || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#bbcbb2]">
                                <span className="inline-flex items-center gap-1">
                                  <Calendar size={11} />
                                  {b.import_start_date}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBinding(b.id)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors active:scale-[0.98]"
                                  title="Hapus Ikatan Rekening"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#26272d] bg-[#18181c] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-[#121215] hover:bg-[#26272d] border border-[#26272d] text-xs font-bold text-white flex items-center gap-1.5 active:scale-[0.98]"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-[#00ffff]' : ''} />
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#26272d] hover:bg-slate-700 text-xs font-bold text-white active:scale-[0.98]"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  )
}
