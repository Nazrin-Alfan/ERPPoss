import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileText,
  ArrowUpRight,
  RefreshCw,
  Plus,
  Check,
  X,
  Building2,
  ShieldAlert,
  Link2,
  Ban,
  ArrowRightLeft,
  Inbox
} from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { formatRupiah } from '../../utils/helpers'
import { isValidUUID } from '../../utils/staffHelpers'
import {
  parseMandiriNotificationEmail,
  SAMPLE_MANDIRI_EMAIL_TEMPLATES,
  normalizeEmailIdentity
} from '../../services/mandiriEmailParser'

export default function BankMutationInboxTab({
  pockets = [],
  cashflowList = [],
  expenseCategories = [],
  onPosted,
  onPendingCountChange
}) {
  const { activeTenant, profile } = useAuth()
  const rawTenantId = activeTenant?.id || profile?.tenant_id
  const tenantId = (!supabase.isLocal && !isValidUUID(rawTenantId)) ? null : rawTenantId

  const bankPockets = useMemo(() => {
    const active = (pockets || []).filter((p) => p.is_active !== false)
    const onlyBanks = active.filter(
      (p) => p.tipe === 'BANK' || p.type === 'BANK' || p.pos !== 'SALDO CASH'
    )
    return onlyBanks.length > 0 ? onlyBanks : active
  }, [pockets])

  const allActivePockets = useMemo(
    () => (pockets || []).filter((p) => p.is_active !== false),
    [pockets]
  )

  const [drafts, setDrafts] = useState([])
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [statusFilter, setStatusFilter] = useState('PENDING_ALL')
  const [postingDraftId, setPostingDraftId] = useState(null)

  // Per-draft form state overrides keyed by draft.id
  const [rowForms, setRowForms] = useState({})

  // Simulator / Importer Modal state
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('mandiri_transfer_v1')
  const [simConnectionId, setSimConnectionId] = useState('')
  const [simLast4, setSimLast4] = useState('1122')
  const [simSender, setSimSender] = useState('notifikasi@bankmandiri.co.id')
  const [simSubject, setSimSubject] = useState(
    SAMPLE_MANDIRI_EMAIL_TEMPLATES.mandiri_transfer_v1.subject
  )
  const [simHtml, setSimHtml] = useState(
    SAMPLE_MANDIRI_EMAIL_TEMPLATES.mandiri_transfer_v1.rawHtml
  )
  const [ingesting, setIngesting] = useState(false)

  const loadInboxData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let draftQuery = supabase
        .from('bank_transaction_drafts')
        .select('*')
        .order('tx_occurred_at', { ascending: false })
      let connQuery = supabase
        .from('bank_email_connections')
        .select('*')
        .order('created_at', { ascending: false })
      let bindQuery = supabase
        .from('bank_account_bindings')
        .select('*')
        .order('created_at', { ascending: false })

      if (tenantId) {
        draftQuery = draftQuery.eq('tenant_id', tenantId)
        connQuery = connQuery.eq('tenant_id', tenantId)
        bindQuery = bindQuery.eq('tenant_id', tenantId)
      }

      const [draftRes, connRes, bindRes] = await Promise.all([
        draftQuery,
        connQuery,
        bindQuery
      ])

      if (draftRes.error) throw draftRes.error
      if (connRes.error) throw connRes.error
      if (bindRes.error) throw bindRes.error

      const draftRows = Array.isArray(draftRes.data) ? draftRes.data : []
      const connRows = Array.isArray(connRes.data) ? connRes.data : []
      const bindRows = Array.isArray(bindRes.data) ? bindRes.data : []

      setDrafts(draftRows)
      setConnections(connRows)

      if (connRows.length > 0 && !simConnectionId) {
        setSimConnectionId(connRows[0].id)
      }
      if (bindRows.length > 0 && simLast4 === '1122') {
        setSimLast4(bindRows[0].account_last4 || '1122')
      }

      const pendingCount = draftRows.filter(
        (d) => d.review_status === 'READY' || d.review_status === 'NEEDS_REVIEW'
      ).length
      if (onPendingCountChange) {
        onPendingCountChange(pendingCount)
      }
    } catch (err) {
      setError(err.message || 'Gagal memuat antrean mutasi email bank.')
    } finally {
      setLoading(false)
    }
  }, [tenantId, onPendingCountChange, simConnectionId, simLast4])

  useEffect(() => {
    loadInboxData()
  }, [loadInboxData])

  const getRowForm = (draft) => {
    const existing = rowForms[draft.id]
    if (existing) return existing
    const defaultCategory =
      draft.suggested_kategori ||
      expenseCategories[0] ||
      'Operasional'
    const fallbackTargetPocket =
      allActivePockets.find((p) => p.id !== draft.pocket_id)?.id || ''
    return {
      action:
        draft.review_reason === 'POSSIBLE_DUPLICATE'
          ? 'LINK_EXISTING_CASHFLOW'
          : (draft.suggested_action || 'RECORD_EXPENSE'),
      pocket_id: draft.pocket_id || bankPockets[0]?.id || '',
      target_pocket_id: fallbackTargetPocket,
      jenis: draft.suggested_jenis || 'Operasional',
      kategori: defaultCategory,
      keterangan:
        draft.suggested_keterangan ||
        `Mutasi Mandiri ${draft.tx_type || 'TRANSFER'} ke ${draft.beneficiary_name || 'Penerima'}`,
      existing_cashflow_id: draft.matched_cashflow_id || '',
      ignore_reason: ''
    }
  }

  const updateRowForm = (draft, patch) => {
    const current = getRowForm(draft)
    setRowForms((prev) => ({
      ...prev,
      [draft.id]: {
        ...current,
        ...patch
      }
    }))
  }

  const applySampleTemplate = (tplKey, overrideLast4) => {
    const tpl = SAMPLE_MANDIRI_EMAIL_TEMPLATES[tplKey]
    if (!tpl) return
    const targetLast4 = overrideLast4 || simLast4 || '1122'
    setSelectedTemplateKey(tplKey)
    setSimSubject(tpl.subject)
    setSimHtml(tpl.rawHtml.replace(/1122/g, targetLast4))
  }

  const parsedPreview = useMemo(() => {
    return parseMandiriNotificationEmail({
      from: simSender,
      subject: simSubject,
      html: simHtml,
      receivedAt: new Date().toISOString()
    })
  }, [simSender, simSubject, simHtml])

  const handleIngestEmail = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!parsedPreview.ok) {
      setError(`Email tidak lolos validasi parser: ${parsedPreview.reason}`)
      return
    }

    setIngesting(true)
    try {
      let activeConnId = simConnectionId
      const targetPocket = bankPockets[0]
      const rawBranchId = targetPocket?.branch_id ?? profile?.branch_id ?? null
      const branchId = (!supabase.isLocal && !isValidUUID(rawBranchId)) ? null : rawBranchId

      // Auto-provision default connection + binding if tenant has none yet
      if (!activeConnId) {
        const defaultEmail = `mandiri.inbox.${String(tenantId || 'outlet').slice(0, 6)}@gmail.com`
        const { data: newConn, error: connErr } = await supabase
          .from('bank_email_connections')
          .insert({
            ...(tenantId ? { tenant_id: tenantId } : {}),
            ...(branchId ? { branch_id: branchId } : {}),
            provider_type: 'GMAIL_OAUTH',
            provider_account_id: `google-sub-${normalizeEmailIdentity(defaultEmail)}`,
            connected_email: defaultEmail,
            normalized_email: normalizeEmailIdentity(defaultEmail),
            status: 'ACTIVE'
          })
          .select('*')
          .single()
        if (connErr) throw connErr
        activeConnId = newConn.id
        setSimConnectionId(activeConnId)

        if (targetPocket?.id) {
          await supabase.from('bank_account_bindings').insert({
            ...(tenantId ? { tenant_id: tenantId } : {}),
            ...(branchId ? { branch_id: branchId } : {}),
            connection_id: activeConnId,
            pocket_id: targetPocket.id,
            bank_code: 'MANDIRI',
            account_last4: parsedPreview.source_account_last4 || simLast4 || '1122',
            account_holder_name: targetPocket.label || targetPocket.pos,
            is_default_for_last4: true,
            import_start_date: '2020-01-01',
            is_active: true
          })
        }
      }

      const uniqueMsgId = `livin-ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        'fn_ingest_mandiri_normalized_tx',
        {
          p_connection_id: activeConnId,
          p_provider_message_id: uniqueMsgId,
          p_sender_email: parsedPreview.sender_email,
          p_subject: parsedPreview.subject,
          p_email_received_at: parsedPreview.email_received_at,
          p_tx_occurred_at: parsedPreview.tx_occurred_at,
          p_parser_version: parsedPreview.parser_version,
          p_tx_type: parsedPreview.tx_type,
          p_source_account_last4: parsedPreview.source_account_last4,
          p_beneficiary_name: parsedPreview.beneficiary_name,
          p_beneficiary_bank: parsedPreview.beneficiary_bank,
          p_beneficiary_account: parsedPreview.beneficiary_account,
          p_principal_amount: parsedPreview.principal_amount,
          p_fee_amount: parsedPreview.fee_amount,
          p_bank_reference_no: `${parsedPreview.bank_reference_no}-${Date.now().toString().slice(-4)}`,
          p_raw_excerpt_redacted: parsedPreview.raw_excerpt_redacted,
          p_confidence: parsedPreview.confidence
        }
      )

      if (rpcErr) throw rpcErr

      if (rpcRes?.status === 'IGNORED_UNBOUND_ACCOUNT') {
        setError(
          `Notifikasi diabaikan otomatis (IGNORED_UNBOUND_ACCOUNT): Ekor rekening •••• ${parsedPreview.source_account_last4} belum diikat ke kantong saldo manapun di tenant ini.`
        )
      } else if (rpcRes?.status === 'SKIPPED_BEFORE_CUTOFF') {
        setError(
          `Notifikasi dilewati (SKIPPED_BEFORE_CUTOFF): Tanggal mutasi lebih lama dari tanggal cutoff mulai impor rekening.`
        )
      } else {
        setSuccess(
          `Notifikasi Mandiri •••• ${parsedPreview.source_account_last4} sebesar ${formatRupiah(
            parsedPreview.total_debit
          )} berhasil masuk antrean (${rpcRes?.review_status || 'READY'}).`
        )
        setShowImportModal(false)
      }

      await loadInboxData()
    } catch (err) {
      setError(err.message || 'Gagal mengimpor email notifikasi Bank Mandiri.')
    } finally {
      setIngesting(false)
    }
  }

  const handlePostDraft = async (draft) => {
    setError('')
    setSuccess('')
    const form = getRowForm(draft)

    if (!form.pocket_id && form.action !== 'IGNORE') {
      setError('Pilih kantong saldo (Rekening Bank) sumber terlebih dahulu.')
      return
    }
    if (form.action === 'TRANSFER_POCKET' && (!form.target_pocket_id || form.target_pocket_id === form.pocket_id)) {
      setError('Pilih kantong saldo tujuan yang berbeda dari kantong sumber.')
      return
    }
    if (form.action === 'LINK_EXISTING_CASHFLOW' && !form.existing_cashflow_id) {
      setError('Pilih transaksi cashflow manual yang ingin ditautkan.')
      return
    }
    if (form.action === 'IGNORE' && !String(form.ignore_reason || '').trim()) {
      setError('Isi alasan pengabaian mutasi (misal: Transaksi pribadi / duplikat).')
      return
    }

    setPostingDraftId(draft.id)
    try {
      const idempotencyKey = `post-${draft.id}-v${draft.version || 1}`
      const { data: postRes, error: postErr } = await supabase.rpc(
        'fn_post_bank_transaction_draft',
        {
          p_draft_id: draft.id,
          p_expected_version: Number(draft.version || 1),
          p_action: form.action,
          p_pocket_id: form.pocket_id || null,
          p_target_pocket_id: form.action === 'TRANSFER_POCKET' ? form.target_pocket_id : null,
          p_jenis: form.jenis || 'Operasional',
          p_kategori: form.kategori || 'Operasional',
          p_keterangan: form.keterangan || draft.suggested_keterangan,
          p_existing_cashflow_id:
            form.action === 'LINK_EXISTING_CASHFLOW' ? form.existing_cashflow_id : null,
          p_ignore_reason: form.action === 'IGNORE' ? form.ignore_reason : null,
          p_idempotency_key: idempotencyKey
        }
      )

      if (postErr) throw postErr

      const actionLabel =
        form.action === 'IGNORE'
          ? 'diabaikan'
          : form.action === 'LINK_EXISTING_CASHFLOW'
          ? 'ditautkan ke cashflow manual (tanpa potong saldo ganda)'
          : form.action === 'TRANSFER_POCKET'
          ? 'dicatat sebagai pindah saldo antar kantong'
          : 'diposting ke Cashflow & Jurnal Buku Besar'

      setSuccess(
        `Mutasi Mandiri ${formatRupiah(draft.total_debit)} (${
          postRes?.status || 'POSTED'
        }) berhasil ${actionLabel}.`
      )
      await loadInboxData()
      if (onPosted) {
        await onPosted()
      }
    } catch (err) {
      setError(err.message || 'Gagal memposting draf mutasi bank.')
    } finally {
      setPostingDraftId(null)
    }
  }

  const kpis = useMemo(() => {
    let pendingCount = 0
    let pendingDebit = 0
    let postedCount = 0
    let ignoredCount = 0

    drafts.forEach((d) => {
      const amt = Number(d.total_debit || 0)
      if (d.review_status === 'READY' || d.review_status === 'NEEDS_REVIEW') {
        pendingCount += 1
        pendingDebit += amt
      } else if (d.review_status === 'POSTED') {
        postedCount += 1
      } else if (d.review_status === 'IGNORED') {
        ignoredCount += 1
      }
    })

    return { pendingCount, pendingDebit, postedCount, ignoredCount }
  }, [drafts])

  const filteredDrafts = useMemo(() => {
    if (statusFilter === 'ALL') return drafts
    if (statusFilter === 'PENDING_ALL') {
      return drafts.filter(
        (d) => d.review_status === 'READY' || d.review_status === 'NEEDS_REVIEW'
      )
    }
    return drafts.filter((d) => d.review_status === statusFilter)
  }, [drafts, statusFilter])

  const candidateExpenseCashflows = useMemo(() => {
    return (cashflowList || [])
      .filter((c) => Number(c.pengeluaran || 0) > 0)
      .slice(0, 40)
  }, [cashflowList])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#121215] border border-[#26272d]">
          <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider">
            Menunggu Persetujuan
          </span>
          <p className="text-xl font-black font-mono tabular-nums text-[#00ffff] mt-1 text-right">
            {kpis.pendingCount} Draf
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-[#121215] border border-[#26272d]">
          <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider">
            Nominal Debit Antrean
          </span>
          <p className="text-xl font-black font-mono tabular-nums text-rose-400 mt-1 text-right">
            {formatRupiah(kpis.pendingDebit)}
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-[#121215] border border-[#26272d]">
          <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider">
            Sudah Diposting (Jurnal &amp; Kas)
          </span>
          <p className="text-xl font-black font-mono tabular-nums text-emerald-400 mt-1 text-right">
            {kpis.postedCount} Mutasi
          </p>
        </div>
        <div className="p-4 rounded-2xl bg-[#121215] border border-[#26272d]">
          <span className="text-[10px] text-[#6b7367] font-bold uppercase tracking-wider">
            Diabaikan (Ignored)
          </span>
          <p className="text-xl font-black font-mono tabular-nums text-[#bbcbb2] mt-1 text-right">
            {kpis.ignoredCount} Mutasi
          </p>
        </div>
      </div>

      {/* Status Alerts */}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5"
        >
          <AlertCircle size={16} className="shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5"
        >
          <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Queue Panel */}
      <div className="bg-[#121215] border border-[#26272d] p-5 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#26272d] pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Mail size={18} className="text-[#00ffff]" />
              <span>Antrean Rekonsiliasi Email Notifikasi Bank Mandiri</span>
            </h3>
            <p className="text-xs text-[#bbcbb2] mt-0.5">
              Setiap email transaksi keluar Livin&apos; by Mandiri masuk sebagai draf terlebih dahulu — saldo kantong
              hanya berkurang saat Anda menekan <strong>Setujui &amp; Posting</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={loadInboxData}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-[#18181c] hover:bg-[#26272d] border border-[#26272d] text-white text-xs font-bold flex items-center gap-1.5 active:scale-[0.98]"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-[#00ffff]' : ''} />
              <span>Segarkan</span>
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="px-3.5 py-2 rounded-xl bg-[#00ffff] hover:bg-cyan-400 active:scale-[0.98] text-[#0f0f0f] text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              <span>Impor / Uji Email Mandiri</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'PENDING_ALL', label: `Menunggu Tindakan (${kpis.pendingCount})` },
            { id: 'READY', label: 'Siap Posting (READY)' },
            { id: 'NEEDS_REVIEW', label: 'Perlu Review (Ambigu / Duplikat)' },
            { id: 'POSTED', label: `Sudah Diposting (${kpis.postedCount})` },
            { id: 'IGNORED', label: `Diabaikan (${kpis.ignoredCount})` },
            { id: 'ALL', label: `Semua (${drafts.length})` }
          ].map((tab) => {
            const isActive = statusFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors active:scale-[0.98] ${
                  isActive
                    ? 'bg-[#00ffff] text-[#0f0f0f]'
                    : 'bg-[#18181c] text-[#bbcbb2] hover:text-white border border-[#26272d]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* 4 UI States: Loading / Empty / List */}
        {loading ? (
          <div className="space-y-3 py-6" data-testid="bank-inbox-loading">
            <div className="h-24 rounded-xl bg-[#18181c] border border-[#26272d] animate-pulse" />
            <div className="h-24 rounded-xl bg-[#18181c] border border-[#26272d] animate-pulse" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="p-10 rounded-2xl bg-[#18181c]/50 border border-dashed border-[#26272d] text-center space-y-3">
            <Inbox size={34} className="mx-auto text-[#6b7367]" />
            <div>
              <p className="text-sm font-bold text-white">
                Tidak ada draf mutasi Bank Mandiri pada filter ini
              </p>
              <p className="text-xs text-[#bbcbb2] mt-1 max-w-md mx-auto">
                Gunakan tombol di bawah untuk menguji parser email notifikasi Livin&apos; by Mandiri (Transfer BI-FAST,
                QRIS, atau Tagihan PLN) dan memverifikasi alur persetujuan ke kantong saldo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00ffff]/15 hover:bg-[#00ffff]/25 text-[#00ffff] border border-[#00ffff]/30 text-xs font-bold active:scale-[0.98]"
            >
              <Plus size={14} />
              <span>Impor / Uji Email Notifikasi Mandiri Sekarang</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDrafts.map((draft) => {
              const form = getRowForm(draft)
              const isEditable =
                draft.review_status === 'READY' || draft.review_status === 'NEEDS_REVIEW'
              const isPosting = postingDraftId === draft.id

              return (
                <div
                  key={draft.id}
                  className={`p-4 rounded-2xl border transition-colors space-y-3 ${
                    draft.review_status === 'NEEDS_REVIEW'
                      ? 'bg-[#18181c] border-amber-500/40'
                      : draft.review_status === 'POSTED'
                      ? 'bg-[#18181c]/40 border-emerald-500/30'
                      : 'bg-[#18181c]/80 border-[#26272d]'
                  }`}
                >
                  {/* Top Row: Meta & Amounts */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#121215] border border-[#26272d] font-mono font-bold text-xs text-white">
                          <Building2 size={12} className="text-[#00ffff]" />
                          MANDIRI •••• {draft.source_account_last4}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#121215] border border-[#26272d] font-mono text-[11px] text-[#bbcbb2]">
                          {draft.tx_type}
                        </span>
                        {draft.review_status === 'READY' && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                            READY
                          </span>
                        )}
                        {draft.review_status === 'NEEDS_REVIEW' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            <AlertTriangle size={11} />
                            NEEDS REVIEW: {draft.review_reason || 'PERiksa KANTONG'}
                          </span>
                        )}
                        {draft.review_status === 'POSTED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            <Check size={11} />
                            POSTED
                          </span>
                        )}
                        {draft.review_status === 'IGNORED' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-[#bbcbb2] text-[10px] font-bold">
                            <Ban size={11} />
                            IGNORED
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-[#6b7367]">
                          Ref: {draft.bank_reference_no || '-'}
                        </span>
                      </div>

                      <div className="text-sm font-bold text-white">
                        Penerima: {draft.beneficiary_name || 'Merchant / Penerima'}{' '}
                        {draft.beneficiary_bank ? `(${draft.beneficiary_bank})` : ''}
                      </div>
                      <div className="text-[11px] text-[#bbcbb2] font-mono">
                        Waktu Transaksi:{' '}
                        {draft.tx_occurred_at
                          ? new Date(draft.tx_occurred_at).toLocaleString('id-ID')
                          : '-'}
                      </div>
                    </div>

                    {/* Numeric Breakdown (Mandatory text-right font-mono tabular-nums) */}
                    <div className="text-right font-mono tabular-nums bg-[#121215] border border-[#26272d] rounded-xl px-4 py-2.5 shrink-0">
                      <div className="text-[11px] text-[#bbcbb2]">
                        Pokok: {formatRupiah(draft.principal_amount)} | Biaya Admin:{' '}
                        {formatRupiah(draft.fee_amount)}
                      </div>
                      <div className="text-base font-black text-rose-400 mt-0.5">
                        -{formatRupiah(draft.total_debit)}
                      </div>
                    </div>
                  </div>

                  {/* Warning explanation when NEEDS_REVIEW */}
                  {draft.review_status === 'NEEDS_REVIEW' && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                      <ShieldAlert size={15} className="shrink-0 text-amber-400" />
                      <span>
                        {draft.review_reason === 'AMBIGUOUS_POCKET'
                          ? `Ekor rekening •••• ${draft.source_account_last4} terhubung ke lebih dari 1 kantong saldo di tenant ini. Pilih kantong saldo yang tepat sebelum memposting.`
                          : draft.review_reason === 'POSSIBLE_DUPLICATE'
                          ? 'Ditemukan transaksi pengeluaran manual dengan nominal dan tanggal serupa. Pilih "Tautkan ke Cashflow Manual" agar saldo tidak terpotong dua kali.'
                          : 'Ekor rekening belum terikat ke kantong default. Pilih kantong saldo tujuan secara eksplisit.'}
                      </span>
                    </div>
                  )}

                  {/* Action Controls for READY / NEEDS_REVIEW */}
                  {isEditable && (
                    <div className="pt-2 border-t border-[#26272d] grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                      {/* Pocket Selector */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                          Kantong Saldo Sumber
                        </label>
                        <select
                          aria-label="Pilih Kantong Saldo Sumber"
                          value={form.pocket_id}
                          onChange={(e) => updateRowForm(draft, { pocket_id: e.target.value })}
                          className={`w-full bg-[#121215] border rounded-xl px-3 py-2 text-xs text-white focus:outline-none ${
                            !form.pocket_id
                              ? 'border-amber-400'
                              : 'border-[#26272d] focus:border-[#00ffff]'
                          }`}
                        >
                          <option value="">-- Pilih Kantong Saldo --</option>
                          {bankPockets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label || p.pos} ({p.pos})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Action Selector */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                          Tindakan Rekonsiliasi
                        </label>
                        <select
                          aria-label="Pilih Tindakan Rekonsiliasi"
                          value={form.action}
                          onChange={(e) => updateRowForm(draft, { action: e.target.value })}
                          className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                        >
                          <option value="RECORD_EXPENSE">Catat Pengeluaran + Jurnal</option>
                          <option value="TRANSFER_POCKET">Pindah Saldo ke Kantong Lain</option>
                          <option value="LINK_EXISTING_CASHFLOW">
                            Tautkan Cashflow Manual (Tanpa Potong)
                          </option>
                          <option value="IGNORE">Abaikan Notifikasi (Ignore)</option>
                        </select>
                      </div>

                      {/* Dynamic Middle Fields based on Action */}
                      <div className="md:col-span-4">
                        {form.action === 'RECORD_EXPENSE' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                                Kategori Beban
                              </label>
                              <select
                                aria-label="Pilih Kategori Beban"
                                value={form.kategori}
                                onChange={(e) => updateRowForm(draft, { kategori: e.target.value })}
                                className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                              >
                                {(expenseCategories.length > 0
                                  ? expenseCategories
                                  : ['Operasional', 'Bahan Baku', 'Listrik, Air & Utilitas', 'Gaji & Komisi', 'Lain-lain']
                                ).map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                                Keterangan Jurnal
                              </label>
                              <input
                                type="text"
                                value={form.keterangan}
                                onChange={(e) => updateRowForm(draft, { keterangan: e.target.value })}
                                className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                              />
                            </div>
                          </div>
                        )}

                        {form.action === 'TRANSFER_POCKET' && (
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                              Kantong Saldo Tujuan (Mutasi Masuk)
                            </label>
                            <select
                              aria-label="Pilih Kantong Saldo Tujuan"
                              value={form.target_pocket_id}
                              onChange={(e) =>
                                updateRowForm(draft, { target_pocket_id: e.target.value })
                              }
                              className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                            >
                              <option value="">-- Pilih Kantong Tujuan --</option>
                              {allActivePockets
                                .filter((p) => p.id !== form.pocket_id)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.label || p.pos} ({p.pos})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        {form.action === 'LINK_EXISTING_CASHFLOW' && (
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                              Pilih Cashflow Manual yang Sudah Dicatat
                            </label>
                            <select
                              aria-label="Pilih Cashflow Manual"
                              value={form.existing_cashflow_id}
                              onChange={(e) =>
                                updateRowForm(draft, { existing_cashflow_id: e.target.value })
                              }
                              className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                            >
                              <option value="">-- Pilih Transaksi Cashflow --</option>
                              {candidateExpenseCashflows.map((cf) => (
                                <option key={cf.id || cf.id_cashflow} value={cf.id}>
                                  {cf.tanggal} | {formatRupiah(cf.pengeluaran)} |{' '}
                                  {cf.keterangan_transaksi}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {form.action === 'IGNORE' && (
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                              Alasan Abaikan Mutasi
                            </label>
                            <input
                              type="text"
                              placeholder="Misal: Transaksi pribadi / bukan pengeluaran toko"
                              value={form.ignore_reason}
                              onChange={(e) =>
                                updateRowForm(draft, { ignore_reason: e.target.value })
                              }
                              className="w-full bg-[#121215] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                            />
                          </div>
                        )}
                      </div>

                      {/* Submit Button */}
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          disabled={isPosting}
                          onClick={() => handlePostDraft(draft)}
                          className={`w-full px-4 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50 ${
                            form.action === 'IGNORE'
                              ? 'bg-slate-800 hover:bg-slate-700 text-white border border-[#26272d]'
                              : 'bg-[#00ffff] hover:bg-cyan-400 text-[#0f0f0f] shadow-sm'
                          }`}
                        >
                          {form.action === 'IGNORE' ? (
                            <>
                              <Ban size={13} />
                              <span>{isPosting ? 'Memproses...' : 'Abaikan'}</span>
                            </>
                          ) : form.action === 'LINK_EXISTING_CASHFLOW' ? (
                            <>
                              <Link2 size={13} />
                              <span>{isPosting ? 'Menautkan...' : 'Tautkan'}</span>
                            </>
                          ) : form.action === 'TRANSFER_POCKET' ? (
                            <>
                              <ArrowRightLeft size={13} />
                              <span>{isPosting ? 'Memproses...' : 'Posting Mutasi'}</span>
                            </>
                          ) : (
                            <>
                              <Check size={14} />
                              <span>{isPosting ? 'Memposting...' : 'Setujui & Posting'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Impor / Uji Email Notifikasi Mandiri */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto"
          aria-labelledby="import-mandiri-email-modal-title"
        >
          <div className="w-full max-w-2xl bg-[#121215] border border-[#26272d] rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#26272d] bg-[#18181c] shrink-0">
              <div className="flex items-center gap-2.5">
                <Mail size={18} className="text-[#00ffff]" />
                <div>
                  <h3 id="import-mandiri-email-modal-title" className="text-base font-bold text-white">
                    Impor / Uji Email Notifikasi Livin&apos; by Mandiri
                  </h3>
                  <p className="text-[11px] text-[#bbcbb2]">
                    Tempel body email dari notifikasi@bankmandiri.co.id atau gunakan template resmi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1.5 rounded-lg text-[#bbcbb2] hover:text-white hover:bg-[#26272d] active:scale-[0.98]"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleIngestEmail}
              className="p-6 overflow-y-auto flex-1 min-h-0 space-y-4 overscroll-contain"
            >
              {/* 1-Click Sample Template Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1.5">
                  Pilih Contoh Template Email Mandiri (1-Klik)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { key: 'mandiri_transfer_v1', label: 'Transfer BI-FAST (Rp 252.500)' },
                    { key: 'mandiri_qris_payment_v1', label: 'Bayar QRIS (Rp 85.000)' },
                    { key: 'mandiri_bill_va_v1', label: 'Tagihan PLN (Rp 453.000)' }
                  ].map((tpl) => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => applySampleTemplate(tpl.key, simLast4)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all active:scale-[0.98] ${
                        selectedTemplateKey === tpl.key
                          ? 'bg-[#00ffff]/15 border-[#00ffff] text-white'
                          : 'bg-[#18181c] border-[#26272d] text-[#bbcbb2] hover:text-white'
                      }`}
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                    Pengirim Email
                  </label>
                  <input
                    type="email"
                    value={simSender}
                    onChange={(e) => setSimSender(e.target.value)}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#00ffff]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                    4 Digit Ekor Rekening di Email
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={simLast4}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                      setSimLast4(val)
                      if (val.length === 4) {
                        setSimHtml((prev) =>
                          prev.replace(/(\d{3,12}|\*{2,12}|X{2,12})\d{4}/, `13700099${val}`)
                        )
                      }
                    }}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white font-mono tabular-nums focus:outline-none focus:border-[#00ffff]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                    Koneksi Gmail Penerima
                  </label>
                  <select
                    value={simConnectionId}
                    onChange={(e) => setSimConnectionId(e.target.value)}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                  >
                    <option value="">Otomatis (Buat / Gunakan Default)</option>
                    {connections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.connected_email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                  Subjek Email
                </label>
                <input
                  type="text"
                  value={simSubject}
                  onChange={(e) => setSimSubject(e.target.value)}
                  className="w-full bg-[#18181c] border border-[#26272d] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00ffff]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#bbcbb2] mb-1">
                  Isi HTML / Teks Email Notifikasi Mandiri
                </label>
                <textarea
                  rows={5}
                  value={simHtml}
                  onChange={(e) => setSimHtml(e.target.value)}
                  className="w-full bg-[#18181c] border border-[#26272d] rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-[#00ffff]"
                  required
                />
              </div>

              {/* Real-time Parser Preview Box */}
              <div className="p-3.5 rounded-xl bg-[#18181c] border border-[#26272d] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#00ffff] flex items-center gap-1.5">
                    <FileText size={14} />
                    <span>Hasil Ekstraksi Parser Deterministik</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      parsedPreview.ok
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {parsedPreview.ok ? `VALID (${parsedPreview.parser_version})` : parsedPreview.reason}
                  </span>
                </div>

                {parsedPreview.ok && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                    <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d]">
                      <span className="text-[#6b7367] block">Rekening Sumber</span>
                      <strong className="font-mono text-white">
                        •••• {parsedPreview.source_account_last4}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d]">
                      <span className="text-[#6b7367] block">Penerima</span>
                      <strong className="text-white truncate block">
                        {parsedPreview.beneficiary_name}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d] text-right">
                      <span className="text-[#6b7367] block">Pokok + Admin</span>
                      <strong className="font-mono tabular-nums text-white">
                        {formatRupiah(parsedPreview.principal_amount)} +{' '}
                        {formatRupiah(parsedPreview.fee_amount)}
                      </strong>
                    </div>
                    <div className="p-2 rounded-lg bg-[#121215] border border-[#26272d] text-right">
                      <span className="text-[#6b7367] block">Total Debit</span>
                      <strong className="font-mono tabular-nums text-rose-400">
                        {formatRupiah(parsedPreview.total_debit)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-[#26272d]">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#18181c] hover:bg-[#26272d] text-white text-xs font-bold active:scale-[0.98]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ingesting || !parsedPreview.ok}
                  className="px-5 py-2 rounded-xl bg-[#00ffff] hover:bg-cyan-400 active:scale-[0.98] text-[#0f0f0f] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <ArrowUpRight size={14} />
                  <span>{ingesting ? 'Memproses...' : 'Masukkan ke Antrean Draf'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
