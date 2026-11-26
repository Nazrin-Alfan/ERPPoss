import React, { useState } from 'react'
import { LayoutGrid, ReceiptText, Wallet, RefreshCw, Sparkles } from 'lucide-react'
import RelayLogo from '../../components/brand/RelayLogo'
import {
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
  LedgerTable
} from '../../components/ui'

function UIKitSection({ mode, title, subtitle }) {
  const [search, setSearch] = useState('')
  const [nominal, setNominal] = useState('250.000')
  const [qty, setQty] = useState(2)
  const [tab, setTab] = useState('overview')

  const ledgerCols = [
    { key: 'order', label: 'Plat / Order' },
    { key: 'status', label: 'Status' },
    { key: 'nominal', label: 'Nominal', numeric: true }
  ]

  const ledgerRows = [
    { id: '1', order: 'B 1842 KZX', status: 'LUNAS', nominal: 'Rp 115.000' },
    { id: '2', order: 'B 9021 UVW', status: 'CUCI', nominal: 'Rp 92.000' },
    { id: '3', order: 'B 4410 RTY', status: 'OPEN BILL', nominal: 'Rp 80.000' }
  ]

  return (
    <section
      data-theme={mode}
      className="bg-canvas text-foreground border border-border rounded-3xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <RelayLogo variant={mode} size="md" showWordmark subtitle={subtitle} />
        <Badge variant={mode === 'light' ? 'primary-soft' : 'primary'} size="md" dot>
          {title}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-foreground">Pill Buttons &amp; Touch Controls (&gt;= 44px)</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ink">Primary Ink</Button>
              <Button variant="primary">Cobalt Blue</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="destructive">Void Bill</Button>
              <Button variant="secondary" disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="cta" shortcut="F9" className="flex-1 min-w-[220px]">
                Bayar &amp; Cetak Struk
              </Button>
              <Stepper
                value={qty}
                onDecrement={() => setQty((prev) => Math.max(0, prev - 1))}
                onIncrement={() => setQty((prev) => prev + 1)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-bold text-foreground">Pill Inputs, Status Pills &amp; Modal</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
                placeholder="Cari plat / SKU..."
                shortcut="/"
              />
              <CurrencyInput
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
                aria-label="Nominal input"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="success" dot>LUNAS</Badge>
                <Badge variant="primary" dot>SEDANG CUCI</Badge>
                <Badge variant="warning" dot>OPEN BILL</Badge>
                <Badge variant="error" dot>VOID</Badge>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">Buka Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Konfirmasi Dialog Primitif</DialogTitle>
                    <DialogDescription>Dialog Radix UI aksesibel untuk Dual-Mode v5.0.</DialogDescription>
                  </DialogHeader>
                  <DialogBody>
                    <FieldGroup label="Catatan">
                      <CurrencyInput value={nominal} onChange={(e) => setNominal(e.target.value)} />
                    </FieldGroup>
                  </DialogBody>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="secondary" size="sm">Tutup</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button variant="primary" size="sm">Simpan</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          variant="hero"
          label="Total Likuiditas"
          value="Rp 148.250.000"
          delta="+12.4% vs kemarin"
          deltaTone="primary"
          icon={Wallet}
        />
        <StatCard
          label="Omzet Hari Ini"
          value="Rp 8.420.000"
          delta="34 Transaksi"
          deltaTone="success"
          icon={ReceiptText}
        />
        <StatCard
          label="Antrean Aktif"
          value="7 Kendaraan"
          subtitle="Bay 1-3 beroperasi optimal"
          icon={LayoutGrid}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Ringkasan Ledger</TabsTrigger>
          <TabsTrigger value="states">4 UI States</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <LedgerTable
            columns={ledgerCols}
            data={ledgerRows}
            footerTotals={{ order: 'TOTAL MUTASI', status: '', nominal: 'Rp 287.000' }}
          />
        </TabsContent>
        <TabsContent value="states">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <LoadingState rows={3} />
            <EmptyState
              title="Belum ada mutasi kas"
              description="Shift kasir masih kosong. Catat setoran awal atau transaksi masuk."
              actionLabel="Catat Kas Masuk"
              onAction={() => {}}
            />
            <ErrorState
              title="Gagal sinkronisasi cabang"
              description="Antrean lokal aman (12 transaksi). Periksa koneksi gateway outlet."
              onRetry={() => {}}
            />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

export default function UIKitPreview() {
  return (
    <div className="min-h-screen bg-[#E2E8F0] p-4 sm:p-8 space-y-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#2563EB] flex items-center gap-1.5">
              <Sparkles size={14} />
              <span>Phase 3 Verification Preview</span>
            </p>
            <h1 className="text-2xl font-extrabold text-[#0F172A] tracking-tight">
              RelayPOS v5.0 — Fintech Cobalt Light &amp; Pure Carbon Dark D1
            </h1>
          </div>
          <Button variant="primary" size="sm" icon={RefreshCw} onClick={() => window.location.reload()}>
            Muat Ulang Preview
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        <UIKitSection
          mode="light"
          title="Back-Office Light Mode (#F4F6FA)"
          subtitle="Opsi 1 Ink + Cobalt Light"
        />
        <UIKitSection
          mode="dark"
          title="Pure Carbon Obsidian Dark (Opsi D1 #09090B)"
          subtitle="POS Cashier & Founder Mode"
        />
      </div>
    </div>
  )
}
