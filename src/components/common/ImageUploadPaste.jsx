import React, { useState, useRef, useEffect } from 'react'
import { Upload, Image as ImageIcon, Trash2, AlertCircle, Check, RefreshCw } from 'lucide-react'

/**
 * ImageUploadPaste
 * Komponen upload foto dengan validasi ketat PNG & JPG,
 * dukungan Copy-Paste (Ctrl+V) langsung dari clipboard,
 * tombol "Ganti Foto" eksplisit & "Hapus Foto",
 * pembatasan ukuran file (default: 2MB),
 * dan auto-kompresi canvas agar database & kasir POS tetap ringan.
 */
export default function ImageUploadPaste({
  value = '',
  onChange,
  maxSizeMB = 2,
  label = 'Foto Produk',
  helperText = 'Klik untuk upload, drag & drop, atau tekan Ctrl+V untuk Paste gambar (PNG/JPG, maks 2MB)'
}) {
  const [dragOver, setDragOver] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [compressedSizeKb, setCompressedSizeKb] = useState(null)
  const fileInputRef = useRef(null)
  const dropZoneRef = useRef(null)

  // Validasi tipe mime
  const isAllowedType = (file) => {
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg']
    return validTypes.includes(file.type) || /\.(png|jpe?g)$/i.test(file.name || '')
  }

  // Kompresi gambar via Canvas di browser
  const processAndCompressImage = (file) => {
    setErrorMsg('')

    // 1. Validasi jenis file
    if (!isAllowedType(file)) {
      setErrorMsg('Format file tidak didukung! Harap gunakan file gambar PNG atau JPG/JPEG.')
      return
    }

    // 2. Validasi batas ukuran file (MB)
    const maxBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxBytes) {
      setErrorMsg(`Ukuran file terlalu besar (${(file.size / (1024 * 1024)).toFixed(1)}MB)! Maksimal ukuran file adalah ${maxSizeMB}MB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        // Resize canvas max 500x500px agar super ringan di POS dan database
        const maxDim = 500
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        // Output kualitas optimal 0.85
        const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        const compressedBase64 = canvas.toDataURL(outputType, 0.85)

        // Estimasi ukuran dalam KB
        const sizeInKb = Math.round((compressedBase64.length * 3) / 4 / 1024)
        setCompressedSizeKb(sizeInKb)

        if (onChange) {
          onChange(compressedBase64)
        }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }

  // Listener paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      const items = (e.clipboardData || window.clipboardData)?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            processAndCompressImage(file)
            break
          }
        }
      }
    }

    const dropEl = dropZoneRef.current
    if (dropEl) {
      dropEl.addEventListener('paste', handlePaste)
    }

    window.addEventListener('paste', handlePaste)
    return () => {
      if (dropEl) dropEl.removeEventListener('paste', handlePaste)
      window.removeEventListener('paste', handlePaste)
    }
  }, [maxSizeMB])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      processAndCompressImage(file)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      processAndCompressImage(file)
    }
  }

  const handleRemove = (e) => {
    e.stopPropagation()
    if (onChange) onChange('')
    setCompressedSizeKb(null)
    setErrorMsg('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleTriggerFileInput = (e) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <label className="block text-xs font-bold text-slate-300">
          {label}
        </label>
        {value && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleTriggerFileInput}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
            >
              <RefreshCw size={12} /> Ganti Foto
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={12} /> Hapus Foto
            </button>
          </div>
        )}
      </div>

      <div
        ref={dropZoneRef}
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={handleTriggerFileInput}
        className={`relative border-2 border-dashed rounded-2xl p-4 transition-all cursor-pointer outline-none flex flex-col items-center justify-center min-h-[120px] text-center ${
          dragOver
            ? 'border-amber-400 bg-amber-500/10'
            : value
            ? 'border-slate-700 bg-slate-900/50 hover:border-amber-500/50'
            : 'border-slate-800 bg-slate-950/40 hover:border-amber-500/50 hover:bg-slate-900/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg, image/jpg"
          className="hidden"
          onChange={handleFileChange}
        />

        {value ? (
          <div className="flex items-center gap-4 w-full">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-900 border border-slate-700 shrink-0 relative group">
              <img
                src={value}
                alt="Preview Produk"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[10px] font-bold text-amber-300">
                <RefreshCw size={14} />
                <span>Ganti</span>
              </div>
            </div>
            <div className="flex-1 text-left space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Check size={14} />
                <span>Foto Terpasang</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Klik kartu ini, tekan tombol <strong className="text-amber-400">Ganti Foto</strong>, atau langsung tekan <strong className="text-slate-200">Ctrl + V</strong> untuk mengganti gambar baru.
              </p>
              <div className="flex items-center gap-2">
                {compressedSizeKb && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                    ~{compressedSizeKb} KB
                  </span>
                )}
                <span className="text-[10px] font-bold text-amber-400/90 hover:underline">
                  Klik untuk pilih file lain ↺
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2 py-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
              <ImageIcon size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5">
                <Upload size={13} className="text-amber-400" />
                <span>Pilih Foto atau Paste (Ctrl + V)</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 max-w-xs">
                {helperText}
              </p>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  )
}
