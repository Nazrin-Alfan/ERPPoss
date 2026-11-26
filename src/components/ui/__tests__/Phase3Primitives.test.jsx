import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import RelayLogo from '../../brand/RelayLogo'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Input,
  SearchInput,
  CurrencyInput,
  FieldGroup,
  Stepper,
  StatCard,
  LoadingState,
  EmptyState,
  ErrorState,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle
} from '../index'

const ROOT = process.cwd()

const PHASE3_CLEAN_FILES = [
  'src/index.css',
  'src/context/ThemeContext.jsx',
  'src/components/brand/RelayLogo.jsx',
  'src/components/ui/Button.jsx',
  'src/components/ui/Badge.jsx',
  'src/components/ui/Card.jsx',
  'src/components/ui/Containers.jsx',
  'src/components/ui/Input.jsx',
  'src/components/ui/Stepper.jsx',
  'src/components/ui/StatCard.jsx',
  'src/components/ui/UIStates.jsx',
  'src/components/ui/Dialog.jsx',
  'src/components/ui/Tabs.jsx',
  'src/components/ui/Table.jsx',
  'src/components/ui/tables/LedgerTable.jsx',
  'src/components/Sidebar.jsx',
  'src/components/TenantSwitcher.jsx',
  'src/components/layout/ExecutiveLayout.jsx',
  'src/components/layout/FounderLayout.jsx',
  'src/components/common/CustomSelect.jsx',
  'src/components/common/FeedbackModal.jsx',
  'src/App.jsx',
  'src/pages/dev/UIKitPreview.jsx',
  'public/favicon.svg',
  'public/relaypos-logo.svg'
]

describe('Phase 3: UI Primitives, Brand Logo B3 & Token Hygiene Gate', () => {
  it('renders official B3 RelayLogo variants (light Ink+Cobalt, dark Carbon D1, thermal 1-bit)', () => {
    const lightLogo = renderToString(<RelayLogo variant="light" showWordmark subtitle="Estafet ERP" />)
    expect(lightLogo).toContain('#0F172A')
    expect(lightLogo).toContain('#3B82F6')
    expect(lightLogo).toContain('RelayPOS')
    expect(lightLogo).toContain('Estafet ERP')

    const darkLogo = renderToString(<RelayLogo variant="dark" />)
    expect(darkLogo).toContain('#1C1C21')
    expect(darkLogo).toContain('#60A5FA')

    const thermalLogo = renderToString(<RelayLogo variant="thermal" size="sm" />)
    expect(thermalLogo).toContain('#FFFFFF')
    expect(thermalLogo).toContain('#000000')
  })

  it('renders Button with WCAG white-on-cobalt primary, touch heights, and shortcut badge', () => {
    const html = renderToString(
      <>
        <Button variant="primary" size="cta" shortcut="F9">Bayar Sekarang</Button>
        <Button variant="ink">Primary Ink</Button>
        <Button variant="destructive">Void Bill</Button>
      </>
    )
    expect(html).toContain('bg-primary')
    expect(html).toContain('text-primary-foreground')
    expect(html).toContain('h-14')
    expect(html).toContain('rounded-full')
    expect(html).toContain('F9')
    expect(html).toContain('bg-ink')
    expect(html).toContain('bg-destructive-solid')
  })

  it('renders 16px touch Inputs, CurrencyInput tabular-nums, Stepper, Badge, Card, StatCard & Tabs cleanly', () => {
    const html = renderToString(
      <Card selected>
        <CardHeader>
          <Badge variant="success" dot>LUNAS</Badge>
        </CardHeader>
        <CardContent>
          <FieldGroup label="Nominal Pembayaran" required>
            <CurrencyInput value="250.000" onChange={() => {}} />
          </FieldGroup>
          <SearchInput value="" onChange={() => {}} placeholder="Cari plat..." shortcut="/" />
          <Input placeholder="Nama pelanggan" />
          <Stepper value={2} onIncrement={() => {}} onDecrement={() => {}} />
          <StatCard variant="hero" label="Total Kas" value="Rp 12.500.000" delta="+8%" />
          <Tabs value="a" onValueChange={() => {}}>
            <TabsList>
              <TabsTrigger value="a">Tab A</TabsTrigger>
            </TabsList>
            <TabsContent value="a">Panel A</TabsContent>
          </Tabs>
          <Dialog open={false} onOpenChange={() => {}}>
            <DialogTrigger asChild><Button>Trigger</Button></DialogTrigger>
            <DialogContent><DialogTitle>Judul</DialogTitle></DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    )

    expect(html).toContain('text-base')
    expect(html).toContain('min-h-[44px]')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('w-11 h-11')
    expect(html).toContain('LUNAS')
    expect(html).toContain('Total Kas')
    expect(html).toContain('Tab A')
  })

  it('renders all 3 UIStates feedback panels (LoadingState, EmptyState, ErrorState)', () => {
    const html = renderToString(
      <>
        <LoadingState rows={3} />
        <EmptyState title="Belum ada mutasi kas" actionLabel="Catat Kas Masuk" onAction={() => {}} />
        <ErrorState title="Gagal sinkronisasi cabang" onRetry={() => {}} />
      </>
    )
    expect(html).toContain('SHIMMER')
    expect(html).toContain('Belum ada mutasi kas')
    expect(html).toContain('Catat Kas Masuk')
    expect(html).toContain('SYNC_TIMEOUT')
    expect(html).toContain('Coba Lagi')
  })

  it('enforces Zero-Neon Token Hygiene across all 25 Phase 3 files', () => {
    const forbiddenHexPattern = /#00ffff|#c8f31d|#6366f1|#c084fc/i
    const violations = []

    for (const relPath of PHASE3_CLEAN_FILES) {
      const content = fs.readFileSync(path.join(ROOT, relPath), 'utf-8')
      if (forbiddenHexPattern.test(content)) {
        violations.push(relPath)
      }
    }

    expect(violations).toEqual([])
  })
})
