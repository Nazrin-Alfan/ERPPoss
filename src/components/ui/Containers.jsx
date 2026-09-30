import React from 'react'

/**
 * Semantic Container Suite (VRS_2026 Cyan Master)
 * Single Source of Truth for Layout & Surface Hierarchies
 */

/**
 * 1. Canvas: Lantai dasar aplikasi (Pitch Black #000000)
 * Mengunci pembatas layar mobile agar konten tidak pernah meluap/overflow horizontal.
 */
export function Canvas({
  children,
  className = '',
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={`min-h-screen w-full max-w-full min-w-0 bg-canvas text-white overflow-x-hidden ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * 2. SurfaceCard: Kontainer panel / kartu utama (#121215)
 * Untuk kartu besar, form input, panel tabel, atau drawer.
 */
export function SurfaceCard({
  children,
  className = '',
  hover = false,
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={`bg-surface border border-border rounded-xl p-3 sm:p-4 text-white transition-colors ${
        hover ? 'hover:border-border-hover' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * 3. SubsurfaceCard: Elemen di dalam kartu utama (#18181c)
 * Untuk item belanja, kartu menu F&B / Carwash, atau grup input.
 */
export function SubsurfaceCard({
  children,
  className = '',
  interactive = false,
  as: Component = 'div',
  ...props
}) {
  return (
    <Component
      className={`bg-subsurface border border-border rounded-xl p-2.5 sm:p-3 text-white transition-all ${
        interactive
          ? 'hover:border-border-hover active:scale-[0.98] cursor-pointer'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}

/**
 * 4. HeaderPanel: Panel header navigasi / toolbar atas
 * Terkunci di dalam batas layar dengan penanganan scroll horizontal ramah mobile.
 */
export function HeaderPanel({
  children,
  className = '',
  ...props
}) {
  return (
    <header
      className={`bg-surface border border-border p-2.5 sm:px-3.5 sm:py-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 relative z-20 w-full max-w-full overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </header>
  )
}

/**
 * 5. GridContainer: Grid katalog produk/layanan responsif
 * 2 kolom pada smartphone, 3-5 kolom pada tablet/desktop, tanpa risiko overflow.
 */
export function GridContainer({
  children,
  className = '',
  ...props
}) {
  return (
    <div
      className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3 w-full max-w-full min-w-0 content-start ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

export default {
  Canvas,
  SurfaceCard,
  SubsurfaceCard,
  HeaderPanel,
  GridContainer,
}
