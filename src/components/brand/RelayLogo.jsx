import React from 'react'
import { useAppTheme } from '../../context/ThemeContext'
import { cn } from '../../lib/cn'

const SIZE_MAP = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56
}

/**
 * Official RelayPOS Logo B3 — Ink Squircle Emblem (Opsi 1: Ink + Cobalt).
 * Uses the exact zero-seam single-path Gamma pillar + Cobalt pill + estafet handoff node.
 */
export default function RelayLogo({
  variant = 'auto', // 'auto' | 'light' | 'dark' | 'thermal'
  size = 'md',
  showWordmark = false,
  subtitle = '',
  className = '',
  wordmarkClassName = ''
}) {
  const themeCtx = useAppTheme() || {}
  const resolvedVariant =
    variant === 'auto'
      ? (themeCtx.resolvedMode === 'light' ? 'light' : 'dark')
      : variant

  const px = typeof size === 'number' ? size : SIZE_MAP[size] || SIZE_MAP.md

  const palette =
    resolvedVariant === 'thermal'
      ? {
          bg: '#FFFFFF',
          stroke: '#000000',
          strokeWidth: 2.5,
          pillar: '#000000',
          pill: '#000000',
          node: '#000000'
        }
      : resolvedVariant === 'light'
        ? {
            bg: '#0F172A',
            stroke: null,
            strokeWidth: 0,
            pillar: '#FFFFFF',
            pill: '#3B82F6',
            node: '#3B82F6'
          }
        : {
            bg: '#1C1C21',
            stroke: '#3F3F46',
            strokeWidth: 1,
            pillar: '#FFFFFF',
            pill: '#3B82F6',
            node: '#60A5FA'
          }

  const svgMark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', !showWordmark && className)}
    >
      {palette.stroke ? (
        <rect
          x={palette.strokeWidth / 2}
          y={palette.strokeWidth / 2}
          width={56 - palette.strokeWidth}
          height={56 - palette.strokeWidth}
          rx={16 - palette.strokeWidth / 2}
          fill={palette.bg}
          stroke={palette.stroke}
          strokeWidth={palette.strokeWidth}
        />
      ) : (
        <rect width="56" height="56" rx="16" fill={palette.bg} />
      )}
      <path
        transform="translate(12 12)"
        d="M8 0 L20 0 A4 4 0 0 1 20 8 L11 8 A3 3 0 0 0 8 11 L8 28 A4 4 0 0 1 0 28 L0 8 A8 8 0 0 1 8 0 Z"
        fill={palette.pillar}
      />
      <rect x="24" y="24" width="20" height="8" rx="4" fill={palette.pill} />
      <circle cx="40" cy="40" r="4" fill={palette.node} />
    </svg>
  )

  if (!showWordmark) {
    return svgMark
  }

  return (
    <div className={cn('inline-flex items-center gap-2.5 min-w-0', className)}>
      {svgMark}
      <div className={cn('min-w-0', wordmarkClassName)}>
        <span className="block font-extrabold text-sm tracking-tight text-foreground truncate leading-tight">
          RelayPOS
        </span>
        {subtitle && (
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted truncate mt-0.5">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}
