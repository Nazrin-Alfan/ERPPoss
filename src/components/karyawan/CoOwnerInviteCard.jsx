import React, { useState, useEffect, useCallback } from 'react'
import { Crown, Mail, Copy, Check, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { ROLES } from '../../constants/roles'

const STATUS_BADGE = {
  pending: { label: 'Menunggu Login', cls: 'bg-warning-bg text-warning border-warning/30' },
  accepted: { label: 'Diterima', cls: 'bg-primary-soft text-primary-soft-foreground border-primary/30' },
  revoked: { label: 'Dibatalkan', cls: 'bg-subsurface text-muted border-border' }
}

export default function CoOwnerInviteCard({ activeTenant, profile }) {
  const canManage = profile?.role === ROLES.OWNER || profile?.role === ROLES.SUPER_ADMIN
  const [email, setEmail] = useState('')
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  const fetchInvitations = useCallback(async () => {
    if (!canManage || !activeTenant?.id || typeof supabase?.from !== 'function') return
    setLoading(true)
    try {
      const { data, error: fetchErr } = await supabase
        .from('tenant_invitations')
        .select('id, email, status, expires_at, created_at')
        .eq('tenant_id', activeTenant.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (fetchErr) throw fetchErr
      setInvitations(Array.isArray(data) ? data : [])
    } catch (err) {
      // Keep UI functional even if migration hasn't been pushed yet
      if (err?.code !== '42P01') {
        setError(err?.message || 'Gagal memuat daftar undangan Co-Owner.')
      }
    } finally {
      setLoading(false)
    }
  }, [canManage, activeTenant?.id])

  useEffect(() => {
    fetchInvitations()
  }, [fetchInvitations])

  if (!canManage) return null

  const handleInviteSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Masukkan alamat Gmail yang valid.')
      return
    }
    if (!activeTenant?.id || !profile?.id) {
      setError('Tenant aktif atau profil Owner tidak ditemukan.')
      return
    }

    setSubmitting(true)
    try {
      const { error: insertErr } = await supabase
        .from('tenant_invitations')
        .insert({
          tenant_id: activeTenant.id,
          email: cleanEmail,
          role: ROLES.OWNER,
          invited_by: profile.id
        })
      if (insertErr) {
        if (insertErr.code === '23505') {
          throw new Error('Undangan aktif untuk email ini sudah ada.')
        }
        throw insertErr
      }
      setEmail('')
      setSuccessMsg(`Undangan Co-Owner untuk ${cleanEmail} dibuat. Kirim link login lewat tombol Salin Pesan WA.`)
      await fetchInvitations()
    } catch (err) {
      setError(err?.message || 'Gagal membuat undangan Co-Owner.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (inviteId) => {
    setError('')
    try {
      const { error: revErr } = await supabase
        .from('tenant_invitations')
        .update({ status: 'revoked' })
        .eq('id', inviteId)
        .eq('tenant_id', activeTenant.id)
      if (revErr) throw revErr
      await fetchInvitations()
    } catch (err) {
      setError(err?.message || 'Gagal membatalkan undangan.')
    }
  }

  const handleCopyInvite = async (inv) => {
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://erpposs.pages.dev/login'
    const text = [
      `Halo, Anda diundang sebagai Co-Owner toko *${activeTenant?.nama || 'RelayPOS'}*.`,
      `Silakan buka ${loginUrl} lalu klik *"Lanjutkan dengan Google"* menggunakan akun ${inv.email}.`
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(inv.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setError('Gagal menyalin pesan ke clipboard.')
    }
  }

  return (
    <div className="bg-surface border border-border p-5 sm:p-6 rounded-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h4 className="text-base font-bold text-foreground flex items-center gap-2">
            <Crown size={17} className="text-warning" />
            <span>Undang Co-Owner (Gmail)</span>
          </h4>
          <p className="text-xs text-muted-dark mt-0.5">
            Partner cukup login dengan Google memakai Gmail yang diundang — tanpa perlu membuatkan kata sandi dan tidak masuk ke daftar Karyawan Kantor.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-destructive-bg border border-destructive/30 text-destructive text-xs flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="p-3 rounded-xl bg-primary-soft border border-primary/30 text-primary-soft-foreground text-xs">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleInviteSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Mail size={15} className="absolute left-3 top-2.5 text-muted-dark" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@gmail.com"
            required
            className="w-full bg-subsurface border border-border rounded-lg py-2 pl-9 pr-3 text-foreground text-xs sm:text-sm font-mono focus:outline-none focus:border-ring"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-warning hover:opacity-90 text-ink-foreground font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 shrink-0"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          <span>Buat Undangan</span>
        </button>
      </form>

      {loading ? (
        <div className="h-10 rounded-lg bg-subsurface animate-pulse" />
      ) : invitations.length === 0 ? (
        <p className="text-[11px] text-muted-dark">Belum ada undangan Co-Owner untuk toko ini.</p>
      ) : (
        <div className="divide-y divide-border border border-border rounded-xl bg-subsurface">
          {invitations.map((inv) => {
            const badge = STATUS_BADGE[inv.status] || STATUS_BADGE.pending
            return (
              <div key={inv.id} className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-foreground truncate">{inv.email}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
                {inv.status === 'pending' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCopyInvite(inv)}
                      className="px-2.5 py-1 rounded-md bg-surface hover:bg-surface-hover border border-border text-primary font-semibold text-[11px] flex items-center gap-1 cursor-pointer active:scale-[0.98]"
                    >
                      {copiedId === inv.id ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedId === inv.id ? 'Tersalin' : 'Salin Pesan WA'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      className="px-2 py-1 rounded-md bg-surface hover:bg-destructive-bg border border-border hover:border-destructive/40 text-destructive font-semibold text-[11px] flex items-center gap-1 cursor-pointer active:scale-[0.98]"
                    >
                      <XCircle size={12} />
                      <span>Batalkan</span>
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
