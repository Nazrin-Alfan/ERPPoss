# Page Override: POS Cashier & Carwash Queue (`pos.md` v4.2 — Database-Backed Dual POS)

> Overrides `design-system/MASTER.md` specifically for `/pos` (`HybridPOSPage`) and `/queue` (`CarwashQueue`).

## 1. Operational Surface Mode & Shell
- **POS Cashier (`/pos`):** High-Contrast Ink + Signal Lime Dark Mode (`#0B0B0D` canvas, `#141417` surface, `#1D1D21` subsurface, `#C8F31D` CTA with `#111113` text).
- **Topbar (`60px`):** Exact `40×40` **Logo B3** + POS Workspace Mode Tabs (`Intake Carwash`, `Katalog Cafe`, `Open Bill (4)`, `Riwayat & Void`, `Kas & Shift`) + Drawer/Printer/Theme pills.
- **Icon-Rail (`72px`):** 6 `48×48` circular buttons containing **pure `20×20` stroke-only vector icons** (Grid, Receipt [Active `#C8F31D` circle + `#111113` stroke], Car, Wallet, Cube, Sliders) — zero text labels inside circles.

## 2. Database-Backed POS Field Coverage (`HybridPOSPage.jsx` + `posService.js`)

### Screen 04A — Intake Kendaraan (`carwash` + `pelanggan`) & Pelunasan Tunai (`struk`)
- **Left Station (`64%`, `874px`):**
  1. **Identitas Kendaraan & CRM (`carwash` + `pelanggan`):** `plat` (uppercased monospace + live CRM loyalty badge `9/10 STAMP • KLAIM GRATIS`), `no_telepon` (WhatsApp Struk), `model` (vehicle model & color) — all `44px` pills with `16px` input text.
  2. **Paket, Matrix Ukuran & Varian (`carwash_packages`):** Selectable package cards (`paket`) + `ukuran` (`S`/`M`/`L`/`XL`/`Custom`) + `variant` (`Regular`/`Body Only`).
  3. **Bay, Kehadiran & Kru (`no_bay`, `kehadiran`, `anggota_1`, `anggota_2`, `gaji_pencuci`):** `Bay 01..03` selector, `TUNGGU` (Estafet Cafe) vs `TINGGAL`, Kru Pencuci 1 & 2 selectors, auto-calculated commission badge.
  4. **Inspeksi Fisik & Catatan (`kondisi_bodi`, `barang_berharga`, `catatan_kendaraan`):** `Normal`/`Baret`, `Aman`/`Ada di Kabin`, free-text vehicle note pill (`16px`).
- **Right Dock (`36%`, `492px`):**
  - Order context: `tipe_pesanan` (`DINE IN` / `TAKE AWAY`), `no_meja` (`16px` input pill), active `kasir`.
  - Cart rows (`carwash` + `cafeItems`) with per-item `notes` preview + `44×44` `-`/`+` steppers + right-aligned `Liberation Mono` subtotals.
  - Discount & Loyalty pills (`diskon`, `redeem_loyalty`).
  - Locked Checkout Footer: `status_bayar` (`LUNAS SEKARANG` vs `SIMPAN OPEN BILL`), `metode_bayar` (`TUNAI`, `QRIS`, `TRANSFER`, `SPLIT`), **`uang_diterima`** (`16px` mono input + quick chips `Pas`/`150K`/`200K`) + auto **`kembalian`**, `28px` Grand Total (`#C8F31D`), and `56px` **`BAYAR & CETAK STRUK (58MM / WA)`** CTA.

### Screen 04B — Katalog Cafe & Merchandise + Catatan Item & `SPLIT` Payment
- **Left Station (`64%`, `874px`):** `44px` Pill Search (`16px`), 6 Category Pills (`>= 88×44px`: `Semua`, `Kopi & Espresso`, `Minuman Segar`, `Makanan Berat`, `Snack`, `Merchandise`), 3x3 Cafe & Merchandise cards with BOM stock pills & `44×44` circular `+`/qty controls.
- **Right Dock (`36%`, `492px`):** Linked Vehicle & Customer summary banner (`BK 1842 ACN • WA • Bay 01 • Meja 04`), cart row with inline **`Catatan Item (cafe.catatan)`** `16px` pill input, and **`SPLIT` Payment Footer** (`nominal_cash` + `nominal_qris` side-by-side `44px` `16px` inputs summing to `Rp 139.000`).

## 3. Carwash Live Kanban Bay Board (`/queue` — Frame 05)
- Uses exact `40×40` **Logo B3** in Topbar and **pure `20×20` stroke-only vector icons** inside the `72px` Light Icon-Rail (`Car` active `#111113` circle + `#C8F31D` icon).
