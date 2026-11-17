import React, { useState, useMemo } from 'react'
import { Calculator, TrendingUp, Sparkles, Check, ChevronDown, ChevronUp, AlertCircle, Package } from 'lucide-react'
import { formatRupiah } from '../../utils/helpers'
import { calculateMenuHpp, calculateMarginSimulation } from '../../utils/hppCalculator'

const MenuHppCalculator = ({
  menuRecipe = [],
  stokBahan = [],
  sellingPrice = 0,
  onApplyPrice,
  initialOpen = false
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [calcMode, setCalcMode] = useState('recipe') // 'recipe' | 'invoice'
  const [packagingCost, setPackagingCost] = useState(0)
  const [overheadCost, setOverheadCost] = useState(0)
  const [targetMargin, setTargetMargin] = useState(60)

  // Invoice mode inputs (misal beli snack / dessert jadi per box)
  const [invoiceTotal, setInvoiceTotal] = useState('')
  const [invoiceQty, setInvoiceQty] = useState('')

  // 1. Hitung HPP dari Resep
  const recipeHppData = useMemo(() => {
    return calculateMenuHpp({
      recipeList: menuRecipe,
      stockItems: stokBahan,
      packagingCost,
      overheadCost
    })
  }, [menuRecipe, stokBahan, packagingCost, overheadCost])

  // 2. Hitung HPP dari Faktur
  const invoiceHppPerPortion = useMemo(() => {
    const total = parseFloat(invoiceTotal) || 0
    const qty = parseFloat(invoiceQty) || 0
    if (total > 0 && qty > 0) {
      return Math.round(total / qty)
    }
    return 0
  }, [invoiceTotal, invoiceQty])

  // Effective Total HPP berdasarkan mode aktif
  const effectiveTotalHpp = useMemo(() => {
    if (calcMode === 'recipe') {
      return recipeHppData.totalHpp
    }
    return Math.round(invoiceHppPerPortion + (parseFloat(packagingCost) || 0) + (parseFloat(overheadCost) || 0))
  }, [calcMode, recipeHppData.totalHpp, invoiceHppPerPortion, packagingCost, overheadCost])

  // 3. Simulasi Margin & Rekomendasi Harga
  const marginSimulation = useMemo(() => {
    return calculateMarginSimulation({
      sellingPrice,
      totalHpp: effectiveTotalHpp,
      targetMargin
    })
  }, [sellingPrice, effectiveTotalHpp, targetMargin])

  const marginBadges = {
    HEALTHY: { text: 'Sangat Sehat', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    MODERATE: { text: 'Wajar/Sedang', bg: 'bg-cyan-500/15 text-[#00ffff] border-cyan-500/30' },
    LOW: { text: 'Margin Tipis', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    LOSS: { text: 'Jual Rugi', bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
    EMPTY: { text: 'Belum Ada Harga', bg: 'bg-slate-800 text-slate-400 border-slate-700' }
  }

  const activeBadge = marginBadges[marginSimulation.marginStatus] || marginBadges.EMPTY

  return (
    <div className="bg-[#18181c] border border-[#26272d] rounded-xl overflow-hidden transition-all duration-200">
      {/* Header bar / Toggle */}
      <div className="p-3 flex items-center justify-between gap-3 bg-[#121215]/80">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#00ffff]/10 text-[#00ffff] border border-cyan-500/20">
            <Calculator size={15} />
          </div>
          <div>
            <span className="font-bold text-xs text-white flex items-center gap-2">
              Kalkulator HPP & Margin
              {effectiveTotalHpp > 0 && (
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-[#00ffff]/15 text-[#00ffff] border border-cyan-500/30 font-bold">
                  HPP Resep: {formatRupiah(effectiveTotalHpp)}
                </span>
              )}
            </span>
            <p className="text-[10px] text-[#bbcbb2]">
              Hitung biaya bahan baku & simulasi keuntungan porsi
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#26272d] hover:bg-[#32333a] active:scale-[0.98] text-white transition-colors"
        >
          <span>{isOpen ? 'Tutup' : 'Buka Kalkulator'}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Collapsible Calculator Body */}
      {isOpen && (
        <div className="p-4 border-t border-[#26272d] space-y-4">
          {/* Mode Selector */}
          <div className="flex items-center gap-2 p-1 bg-[#121215] rounded-lg border border-[#26272d]">
            <button
              type="button"
              onClick={() => setCalcMode('recipe')}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                calcMode === 'recipe'
                  ? 'bg-[#00ffff]/20 text-[#00ffff] border border-cyan-500/30'
                  : 'text-[#bbcbb2] hover:text-white'
              }`}
            >
              1. Dari Resep Bahan ({menuRecipe.length} item)
            </button>
            <button
              type="button"
              onClick={() => setCalcMode('invoice')}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                calcMode === 'invoice'
                  ? 'bg-[#00ffff]/20 text-[#00ffff] border border-cyan-500/30'
                  : 'text-[#bbcbb2] hover:text-white'
              }`}
            >
              2. Hitung Cepat Faktur / Dus
            </button>
          </div>

          {/* Mode 1: Dari Resep */}
          {calcMode === 'recipe' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#bbcbb2]">
                <span>Biaya Bahan Baku (Food Cost):</span>
                <span className="font-bold text-white font-mono">{formatRupiah(recipeHppData.foodCost)}</span>
              </div>
              {recipeHppData.hasMissingPrices && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>Ada bahan baku di resep yang belum memiliki harga beli di master inventori (Rp 0).</span>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Faktur Cepat */}
          {calcMode === 'invoice' && (
            <div className="p-3 rounded-xl bg-[#121215] border border-[#26272d] space-y-2.5">
              <p className="text-[11px] text-[#bbcbb2]">
                Masukkan total biaya faktur dan jumlah porsi untuk membagi rata HPP.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#bbcbb2] mb-1">
                    Total Beli Faktur (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Contoh: 100000"
                    value={invoiceTotal}
                    onChange={(e) => setInvoiceTotal(e.target.value)}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-1.5 px-2.5 text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-[#bbcbb2] mb-1">
                    Jumlah Porsi / Satuan
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Contoh: 20"
                    value={invoiceQty}
                    onChange={(e) => setInvoiceQty(e.target.value)}
                    className="w-full bg-[#18181c] border border-[#26272d] rounded-lg py-1.5 px-2.5 text-white text-xs font-mono"
                  />
                </div>
              </div>
              {invoiceHppPerPortion > 0 && (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-[#26272d]">
                  <span className="text-[#bbcbb2]">HPP Mentah per Porsi:</span>
                  <span className="font-bold text-[#00ffff] font-mono">{formatRupiah(invoiceHppPerPortion)}</span>
                </div>
              )}
            </div>
          )}

          {/* Input Biaya Tambahan: Packaging & Overhead */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-[#bbcbb2] mb-1">
                Biaya Kemasan / Cup (Rp)
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={packagingCost || ''}
                onChange={(e) => setPackagingCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#121215] border border-[#26272d] rounded-lg py-1.5 px-2.5 text-white text-xs font-mono"
              />
              <span className="text-[10px] text-[#6b7367]">Misal: Cup, sedotan, tutup</span>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#bbcbb2] mb-1">
                Biaya Overhead / Garnish (Rp)
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={overheadCost || ''}
                onChange={(e) => setOverheadCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-[#121215] border border-[#26272d] rounded-lg py-1.5 px-2.5 text-white text-xs font-mono"
              />
              <span className="text-[10px] text-[#6b7367]">Misal: Es batu, gas, garnish</span>
            </div>
          </div>

          {/* TOTAL ESTIMASI HPP CARD */}
          <div className="p-3 rounded-xl bg-[#121215] border border-cyan-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-extrabold tracking-wider text-[#00ffff]">
                Total Estimasi HPP per Porsi
              </span>
              <div className="text-lg font-black text-white font-mono tabular-nums">
                {formatRupiah(effectiveTotalHpp)}
              </div>
            </div>
            <div className="text-right text-[11px] text-[#bbcbb2]">
              <div>Food Cost: {formatRupiah(calcMode === 'recipe' ? recipeHppData.foodCost : invoiceHppPerPortion)}</div>
              <div>Tambahan: {formatRupiah((parseFloat(packagingCost) || 0) + (parseFloat(overheadCost) || 0))}</div>
            </div>
          </div>

          {/* SIMULASI HARGA JUAL & TARGET MARGIN */}
          <div className="p-3 rounded-xl bg-[#121215] border border-[#26272d] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <TrendingUp size={14} className="text-[#00ffff]" />
                Simulasi Rekomendasi Harga Jual
              </span>
              <span className="text-[10px] text-[#bbcbb2]">
                Target Margin: <strong className="text-[#00ffff] font-mono">{targetMargin}%</strong>
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex gap-1.5">
              {[40, 50, 60, 70].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTargetMargin(preset)}
                  className={`flex-1 py-1 rounded text-xs font-semibold font-mono transition-all ${
                    targetMargin === preset
                      ? 'bg-[#00ffff] text-[#0f0f0f] font-bold shadow-sm'
                      : 'bg-[#18181c] text-[#bbcbb2] hover:text-white border border-[#26272d]'
                  }`}
                >
                  {preset}%
                </button>
              ))}
              <div className="w-16">
                <input
                  type="number"
                  min="1"
                  max="95"
                  value={targetMargin}
                  onChange={(e) => setTargetMargin(Math.max(1, Math.min(95, parseFloat(e.target.value) || 0)))}
                  className="w-full bg-[#18181c] border border-[#26272d] rounded py-1 px-1.5 text-center text-xs font-mono text-white"
                  title="Target Margin Kustom (%)"
                />
              </div>
            </div>

            {/* Rekomendasi Harga & Tombol Terapkan */}
            {effectiveTotalHpp > 0 && (
              <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-cyan-300 block">Rekomendasi Harga Jual ({targetMargin}%):</span>
                  <span className="text-sm font-bold text-[#00ffff] font-mono tabular-nums">
                    {formatRupiah(marginSimulation.recommendedPrice)}
                  </span>
                </div>
                {onApplyPrice && (
                  <button
                    type="button"
                    onClick={() => onApplyPrice(marginSimulation.recommendedPrice)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#00ffff] hover:bg-[#00ffff]/90 active:scale-[0.98] text-[#0f0f0f] font-bold text-xs rounded-lg transition-all"
                  >
                    <Check size={13} />
                    <span>Terapkan Harga</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* LIVE MARGIN ANALYSIS FROM SELLING PRICE */}
          {sellingPrice > 0 && (
            <div className="p-3 rounded-xl bg-[#121215] border border-[#26272d] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#bbcbb2]">Harga Jual Saat Ini:</span>
                <span className="font-bold text-white font-mono">{formatRupiah(sellingPrice)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#bbcbb2]">Estimasi Laba Kotor per Porsi:</span>
                <span className={`font-bold font-mono ${marginSimulation.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatRupiah(marginSimulation.grossProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-[#26272d]">
                <span className="text-[#bbcbb2]">Margin Keuntungan:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-white">{marginSimulation.marginPercent}%</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${activeBadge.bg}`}>
                    {activeBadge.text}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MenuHppCalculator
