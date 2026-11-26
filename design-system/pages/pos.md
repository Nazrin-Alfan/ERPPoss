# Page Override: POS Cashier & Carwash Queue (`pos.md` v5.0 — Fintech Cobalt + Pure Carbon Dark D1)

> Overrides `design-system/MASTER.md` specifically for `/pos` (`HybridPOSPage`) and `/queue` (`CarwashQueue`).

## 1. Operational Surface Mode & Shell
- **POS Cashier (`/pos`):** **Pure Carbon Obsidian Dark Mode (Opsi D1)** — neutral `#09090B` canvas, `#121215` card surface, `#1C1C21` subsurface inputs, `#121722` + `#3B82F6` selected card highlight, `#2563EB` primary CTA & active pills with `#FFFFFF` Bold text/icons, and crisp `#FFFFFF` numeric prices.
- **Topbar (`60px`):** Exact `40×40` Dark **Logo B3 (Opsi 1)** (`#1C1C21` squircle, `#3B82F6` pill, `#60A5FA` node) + POS Workspace Mode Tabs (`Intake Carwash`, `Katalog Cafe`, `Open Bill (4)`, `Riwayat & Void`, `Kas & Shift`) + Drawer/Printer/Theme pills.
- **Icon-Rail (`72px`):** 6 `48×48` circular buttons containing **pure `20×20` stroke-only vector icons** (Grid, Receipt [Active `#2563EB` circle + `#FFFFFF` stroke], Car, Wallet, Cube, Sliders) — zero text labels inside circles.

## 2. Database-Backed POS Field Coverage (`HybridPOSPage.jsx` + `posService.js`)

### Screen 04A — Intake Kendaraan (`carwash` + `pelanggan`) & Pelunasan Tunai (`struk`)
- **Left Station (`64%`, `874px`):**
  1. **Identitas Kendaraan & CRM (`carwash` + `pelanggan`):** `plat` (uppercased monospace `#FFFFFF` + live CRM loyalty badge `9/10 STAMP • KLAIM GRATIS`), `no_telepon` (WhatsApp Struk), `model` (vehicle model & color) — all `44px` pills with `16px` input text.
  2. **Paket, Matrix Ukuran & Varian (`carwash_packages`):** Selectable package cards (`paket`, active `#121722` + `#3B82F6` ring, price `#FFFFFF`) + `ukuran` (`S`/`M`/`L`/`XL`/`Custom`) + `variant` (`Regular`/`Body Only`).
  3. **Bay, Kehadiran & Kru (`no_bay`, `kehadiran`, `anggota_1`, `anggota_2`, `gaji_pencuci`):** `Bay 01..03` selector, `TUNGGU` (Estafet Cafe) vs `TINGGAL`, Kru Pencuci 1 & 2 selectors, auto-calculated commission badge (`#60A5FA` text on `#1C1C21`).
  4. **Inspeksi Fisik & Catatan (`kondisi_bodi`, `barang_berharga`, `catatan_kendaraan`):** `Normal`/`Baret`, `Aman`/`Ada di Kabin`, free-text vehicle note pill (`16px`).
- **Right Dock (`36%`, `492px`):**
  - Order context: `tipe_pesanan` (`DINE IN` / `TAKE AWAY`), `no_meja` (`16px` input pill), active `kasir`.
  - Cart rows (`carwash` + `cafeItems`) with per-item `notes` preview + `44×44` `-`/`+` steppers + right-aligned `Liberation Mono` subtotals (`#FAFAFA`).
  - Discount & Loyalty pills (`diskon`, `redeem_loyalty`).
  - Locked Checkout Footer: `status_bayar` (`LUNAS SEKARANG` vs `SIMPAN OPEN BILL`), `metode_bayar` (`TUNAI`, `QRIS`, `TRANSFER`, `SPLIT`), **`uang_diterima`** (`16px` mono input + quick chips `Pas`/`150K`/`200K`) + auto **`kembalian`** (`#60A5FA`), `28px` Grand Total (`#FFFFFF`), and `56px` **`BAYAR & CETAK STRUK (58MM / WA)`** `#2563EB` CTA with `#FFFFFF` Bold text.

### Screen 04B — Katalog Cafe & Merchandise + Catatan Item & `SPLIT` Payment
- **Left Station (`64%`, `874px`):** `44px` Pill Search (`16px`), 6 Category Pills (`>= 88×44px`: `Semua`, `Kopi & Espresso`, `Minuman Segar`, `Makanan Berat`, `Snack`, `Merchandise`), 3x3 Cafe & Merchandise cards (`#FFFFFF` Mono prices) with BOM stock pills & `44×44` circular `+`/qty controls.
- **Right Dock (`36%`, `492px`):** Linked Vehicle & Customer summary banner (`BK 1842 ACN • WA • Bay 01 • Meja 04`), cart row with inline **`Catatan Item (cafe.catatan)`** `16px` pill input (`#3B82F6` focus border), and **`SPLIT` Payment Footer** (`nominal_cash` + `nominal_qris` side-by-side `44px` `16px` inputs summing to `Rp 139.000`).

## 3. Carwash Live Kanban Bay Board (`/queue` — Frame 05)
- Uses Light Mode Cobalt Blue (`#F4F6FA` canvas, `#FFFFFF` cards, exact `40×40` Light **Logo B3 Opsi 1** `#0F172A` + `#3B82F6` in Topbar) and **pure `20×20` stroke-only vector icons** inside the `72px` Light Icon-Rail (`Car` active `#2563EB` circle + `#FFFFFF` stroke icon).
