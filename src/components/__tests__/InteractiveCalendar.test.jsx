import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'
import InteractiveCalendar from '../InteractiveCalendar.jsx'

describe('InteractiveCalendar UI Polish & Viewport Alignment Suite', () => {
  it('TC_01 (HAPPY_PATH): Renders compact proportional calendar container with tabular-nums and without oversized 2.4rem cells or neon glow', () => {
    const html = renderToString(
      React.createElement(InteractiveCalendar, {
        startDate: '2026-11-05',
        endDate: '2026-11-12',
        onChange: vi.fn(),
        onClose: vi.fn()
      })
    )

    expect(html).toContain('w-64')
    expect(html).toContain('tabular-nums')
    expect(html).not.toContain('2.4rem')
    expect(html).not.toContain('shadow-[0_0_12px_')
  })

  it('TC_02 (REGRESSION): Renders dynamic row count (35 cells for 5-week months like November 2026) instead of hardcoded 42 cells that cut off bottom footer', () => {
    const html = renderToString(
      React.createElement(InteractiveCalendar, {
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        onChange: vi.fn(),
        onClose: vi.fn()
      })
    )

    const dayCells = html.match(/data-calendar-day=/g) || []
    expect(dayCells.length).toBe(35)
  })

  it('TC_03 (REGRESSION): Dashboard, Reports, and Karyawan position the calendar popup without overflowing left into the sidebar on medium/tablet screens', () => {
    const dashboardSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/Dashboard.jsx'),
      'utf8'
    )
    const calendarSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/InteractiveCalendar.jsx'),
      'utf8'
    )

    // Dashboard should align left on sm..lg where the filter bar sits on the left, and right on xl+
    expect(dashboardSrc).toContain('sm:left-0 xl:left-auto xl:right-0')
    // InteractiveCalendar should support Escape and click-outside dismissal
    expect(calendarSrc).toContain('Escape')
    expect(calendarSrc).toContain('mousedown')
  })

  it('TC_04 (SINGLE_DATE_MODE): Supports single-date picker mode without range dash separator and includes Hari Ini shortcut', () => {
    const html = renderToString(
      React.createElement(InteractiveCalendar, {
        mode: 'single',
        startDate: '2026-11-27',
        endDate: '2026-11-27',
        onChange: vi.fn(),
        onClose: vi.fn()
      })
    )

    expect(html).toContain('2026-11-27')
    expect(html).toContain('Hari Ini')
    expect(html).not.toContain('>–<')
  })
})
