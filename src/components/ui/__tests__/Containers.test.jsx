import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { Canvas, SurfaceCard, SubsurfaceCard, HeaderPanel, GridContainer } from '../Containers'

describe('Semantic Container Suite (VRS_2026)', () => {
  it('renders Canvas with root ground classes and safe mobile boundaries', () => {
    const html = renderToString(
      React.createElement(Canvas, { className: 'custom-test' }, 'Canvas Content')
    )
    expect(html).toContain('Canvas Content')
    expect(html).toContain('bg-canvas')
    expect(html).toContain('w-full')
    expect(html).toContain('max-w-full')
    expect(html).toContain('overflow-x-hidden')
    expect(html).toContain('custom-test')
  })

  it('renders SurfaceCard with elevated background and sleek border', () => {
    const html = renderToString(
      React.createElement(SurfaceCard, { hover: true }, 'Surface Content')
    )
    expect(html).toContain('Surface Content')
    expect(html).toContain('bg-surface')
    expect(html).toContain('border-border')
    expect(html).toContain('rounded-xl')
    expect(html).toContain('hover:border-border-hover')
  })

  it('renders SubsurfaceCard with control background and interactive styles when enabled', () => {
    const normalHtml = renderToString(
      React.createElement(SubsurfaceCard, null, 'Normal Subsurface')
    )
    expect(normalHtml).toContain('bg-subsurface')
    expect(normalHtml).toContain('border-border')

    const interactiveHtml = renderToString(
      React.createElement(SubsurfaceCard, { interactive: true }, 'Interactive Subsurface')
    )
    expect(interactiveHtml).toContain('hover:border-border-hover')
    expect(interactiveHtml).toContain('active:scale-[0.98]')
  })

  it('renders HeaderPanel with responsive flex and overscroll lock', () => {
    const html = renderToString(
      React.createElement(HeaderPanel, null, 'Header Nav')
    )
    expect(html).toContain('Header Nav')
    expect(html).toContain('bg-surface')
    expect(html).toContain('w-full')
    expect(html).toContain('max-w-full')
  })

  it('renders GridContainer with responsive fluid columns', () => {
    const html = renderToString(
      React.createElement(GridContainer, null, React.createElement('div', null, 'Item'))
    )
    expect(html).toContain('grid')
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('w-full')
    expect(html).toContain('max-w-full')
  })
})
