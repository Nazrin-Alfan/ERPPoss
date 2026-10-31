import React, { useEffect, useRef, useState } from 'react'
import { KeyRound, Eye, EyeOff, Lock, CheckCircle2, AlertCircle, X, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function ChangePasswordModal({ isOpen, onClose }) {
  const { profile, user, changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const dialogRef = useRef(null)
  const focusHistoryRef = useRef([])
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      // The menu item opening this dialog is removed when its menu closes.
      // Retain recent focus targets so its connected trigger can receive focus.
      const rememberFocus = (event) => {
        const target = event.target
        if (target instanceof HTMLElement && target !== document.body) {
          focusHistoryRef.current = [target, ...focusHistoryRef.current.filter(item => item !== target)].slice(0, 10)
        }
      }
      rememberFocus({ target: document.activeElement })
      document.addEventListener('focusin', rememberFocus)
      return () => document.removeEventListener('focusin', rememberFocus)
    }

    const dialog = dialogRef.current
    if (!dialog) return undefined
    const returnTargets = [document.activeElement, ...focusHistoryRef.current]
    const focusableElements = () => [...dialog.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter(element => element.getClientRects().length > 0 && element.tabIndex >= 0)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const elements = focusableElements()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (!first) {
          event.preventDefault()
          dialog.focus()
        } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    const keepFocusInside = (event) => {
      if (!dialog.contains(event.target)) (focusableElements()[0] || dialog).focus()
    }

    const initialTarget = dialog.querySelector('input') || focusableElements()[0] || dialog
    initialTarget.focus()
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', keepFocusInside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', keepFocusInside)
      const returnTarget = returnTargets.find(element => element instanceof HTMLElement && element !== document.body && element.isConnected && !dialog.contains(element))
      returnTarget?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const calculateStrength = (pwd) => {
    if (!pwd) return { score: 0, text: '', color: 'bg-slate-700' }
    let score = 0
    if (pwd.length >= 6) score += 1
    if (pwd.length >= 8) score += 1
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1
    if (/[0-9]/.test(pwd)) score += 1
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1

    if (score <= 2) return { score, text: 'Cukup', color: 'bg-amber-500' }
    if (score <= 4) return { score, text: 'Kuat', color: 'bg-emerald-500' }
    return { score, text: 'Sangat Kuat', color: 'bg-cyan-400' }
  }

  const strength = calculateStrength(newPassword)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!currentPassword.trim()) {
      setErrorMsg('Kata sandi saat ini wajib diisi.')
      return
    }

    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Kata sandi baru minimal 6 karakter.')
      return
    }

    if (newPassword === currentPassword) {
      setErrorMsg('Kata sandi baru harus berbeda dari kata sandi saat ini.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Konfirmasi kata sandi baru tidak cocok.')
      return
    }

    setIsLoading(true)
    try {
      const res = await changePassword({ currentPassword, newPassword })
      if (res && res.error) {
        setErrorMsg(res.error)
      } else {
        setSuccessMsg('Kata sandi Anda berhasil diperbarui! Silakan gunakan kata sandi baru pada sesi login selanjutnya.')
        setTimeout(() => {
          onClose()
          setCurrentPassword('')
          setNewPassword('')
          setConfirmPassword('')
          setSuccessMsg('')
        }, 1800)
      }
    } catch (err) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem saat memperbarui kata sandi.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-md bg-[#121215] border border-[#26272d] rounded-2xl shadow-2xl overflow-hidden animate-pop-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#26272d]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 id="change-password-title" className="text-base font-bold text-white">
                Ganti Kata Sandi
              </h3>
              <p className="text-xs text-slate-400">
                Akun: <span className="text-white font-medium">{profile?.email || user?.email || 'Pengguna'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Tutup modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Input Password Lama */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kata Sandi Saat Ini <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock size={15} />
              </div>
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Masukkan kata sandi saat ini"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full pl-9 pr-10 py-2.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#00ffff] transition"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                aria-label="Tampilkan atau sembunyikan kata sandi saat ini"
              >
                {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Bagi tenant baru, kata sandi awal default adalah <code className="text-cyan-400 font-mono">password123</code>
            </p>
          </div>

          {/* Input Password Baru */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Kata Sandi Baru <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock size={15} />
              </div>
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Minimal 6 karakter"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-9 pr-10 py-2.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#00ffff] transition"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                aria-label="Tampilkan atau sembunyikan kata sandi baru"
              >
                {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Indikator Kekuatan Password */}
            {newPassword && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden flex gap-0.5">
                  <div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${Math.min(100, strength.score * 20)}%` }}></div>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">{strength.text}</span>
              </div>
            )}
          </div>

          {/* Input Konfirmasi Password Baru */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Ulangi Kata Sandi Baru <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <ShieldCheck size={15} />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Ketik ulang kata sandi baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full pl-9 pr-10 py-2.5 bg-[#18181c] border border-[#26272d] rounded-xl text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-[#00ffff] transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white cursor-pointer"
                aria-label="Tampilkan atau sembunyikan konfirmasi kata sandi baru"
              >
                {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-[10px] text-red-400 mt-1">Konfirmasi kata sandi belum sama.</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#26272d]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isLoading || Boolean(successMsg)}
              className="px-5 py-2 rounded-xl bg-[#00ffff] hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <KeyRound size={14} />
                  <span>Simpan Kata Sandi</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
