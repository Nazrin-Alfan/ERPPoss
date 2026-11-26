# RelayPOS v5.0 — Spesifikasi Responsive Mobile (`390×844`) & Tablet (`768px` / `1024px`)

> **Status:** Complete Page 3 FigCraft (`M1`–`T2`, **7/7 Frames** — Audited `APPROVED` by `@UIUX_Design_Auditor`)  
> **File Sumber FigCraft:** [`RelayPOS-Rebrand.figcraft`](../RelayPOS-Rebrand.figcraft) → Page `03 — Responsive Mobile & Tablet (Cobalt Blue v5.0)`  
> **Standar Token:** [Fintech Cobalt Light + Pure Carbon Obsidian D1](../MASTER.md)

---

## 1. Matriks Breakpoint & Kontrak Layout

| Breakpoint | Range Lebar | Shell Navigasi | Pola Grid & Konten | Target Utama |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile** | `< 768px` (`390×844` baseline) | Topbar `56px` + **Bottom Nav Bar `64px`** (`data-testid="mobile-bottom-nav"`, 4 tab RBAC + `Menu`) | Single-column, `2`-kolom katalis KPI/POS (`grid-cols-2`), **Card-List** (tabel di-hide via `hidden md:block`), bottom-sheet checkout | Kasir POS Mobile, Kru Carwash Lapangan, Pemantauan Owner |
| **Tablet Portrait** | `768px – 1023px` (`768×1024`) | **Circular Vector Icon-Rail `72px`** (kiri, pure stroke icons, nol huruf inisial) | `2×2` KPI Bento + `2`-kolom Board/Summary (`md:grid-cols-2`) | Cockpit Back-Office & Monitor Bay |
| **Tablet Landscape** | `1024px – 1279px` (`1024×768`) | `72px` Circular Icon-Rail (atau `240px` Expanded bila di-expand) | Split **58 : 42** untuk POS Kasir (Katalog + Quick Carwash Intake kiri, Docked Checkout kanan) | Terminal Kasir iPad / Tablet 10" |
| **Desktop** | `>= 1280px` (`1440×900`) | `240px` Full Expanded Sidebar (`72px` collapse toggle tersedia) | `4`-kolom KPI, dense `tabular-nums` Data Tables, Split Workstation | Back-Office Akuntansi, Gudang, Konsolidasi, Founder |

---

## 2. Kontrak App Shell Mobile (`Sidebar.jsx` & `App.jsx`)

1. **Topbar Sticky (`56px` / `h-14`):**
   - Kiri: Logo **B3 Opsi 1 Ink + Cobalt** `32×32px` (`<RelayLogo size="sm" />`) + Judul `RELAYPOS` + nama cabang aktif (`activeTenant?.nama`).
   - Kanan: Tombol circular `40×40px` (`Sun/Moon` Theme Toggle) + tombol circular `Menu`.
2. **RBAC-Aware Bottom Navigation Bar (`64px` / `h-16`, `md:hidden fixed bottom-0 left-0 right-0 z-30`):**
   - Menampilkan maksimal **4 rute prioritas yang lolos `isItemVisible(item)`** dari `navSections` (urutan prioritas: `/dashboard` → `Home`, `/pos` → `POS`, `/queue` → `Antrean`, `/finance` → `Kas`, disusul `/gudang`, `/crm`, `/reports`, `/karyawan`, `/admin`) + slot ke-5 tombol **`Menu`** (`data-testid="mobile-bottom-nav-menu"`) untuk membuka drawer lengkap (TenantSwitcher, Ganti Sandi, Panduan, Keluar).
   - **Invariant RBAC:** Akun `Kasir` hanya melihat modul operasional yang diizinkan (`POS`, `Antrean`, `Menu`) — tautan `/dashboard` dan `/finance` tidak pernah muncul di bottom nav Kasir.
   - **Active State:** Pill kapsul `#2563EB` (`bg-primary`) dengan ikon putih `#FFFFFF` (`text-primary-foreground`) dan label Cobalt `10px Bold`.
3. **Safe Bottom Padding (`App.jsx`):**
   - Pembungkus `<main>` konten aplikasi menambahkan `pb-20 md:pb-0` saat `showSidebar === true` agar baris terakhir kartu/tabel tidak pernah tertutup oleh `64px` Bottom Nav Bar pada viewport `< 768px`.

---

## 3. Pola POS Mobile Dua-Langkah (`M2A` → `M2B`)

Untuk menghindari layout sempit atau checkout panel terpotong di layar `390×844`:
- **Langkah 1 (`M2A` — Katalog 2-Kolom + Sticky Cart Bar):**
  - Topbar gelap Pure Carbon D1 (`#09090B`/`#121215`) + pill `Open Bill (4)`.
  - Bar mode horizontal (`Carwash`, `Cafe`, `Merch`, `Pending`) + input cari `16px` (`text-base`) anti-zoom Safari iOS.
  - Grid katalog 2-kolom (`#121215` border `#27272A`, kartu terpilih `#121722` border `#3B82F6`), harga `#FFFFFF` `JetBrains Mono tabular-nums`, tombol `+` circular minimal `44×44px`.
  - **Sticky Bottom Cart Bar (`72px`)** tepat di atas Bottom Nav: total item & nominal (`Rp 139.000`) di kiri, tombol pill `Checkout →` (`#2563EB`) di kanan.
- **Langkah 2 (`M2B` — Bottom-Sheet Cart & Split Payment Drawer):**
  - Sheet `rounded-t-[24px]` dengan drag handle, banner kendaraan terhubung (`BK 1842 ACN • Bay 01`), stepper kuantitas `- / +`, input catatan item `16px`, segmented `BAYAR LUNAS` vs `SIMPAN OPEN BILL`, metode `TUNAI` / `QRIS` / `SPLIT BILL`, quick cash chips (`Uang Pas`, `Rp 150.000`, `Rp 200.000`), dan CTA utama **full-pill `56px`** `#2563EB` (`BAYAR & CETAK (58MM / WA)`).

---

## 4. Aturan Transformasi Table-to-Card & Ergonomi Sentuh

- **Wajib Card-List di Mobile (`md:hidden`) untuk seluruh halaman ber-tabel:** `/dashboard`, `/queue`, `/finance`, `/gudang`, `/reports`, `/karyawan`, `/crm`, `/admin`. Tabel multi-kolom hanya tampil di `hidden md:block` agar **zero horizontal overflow** (`documentElement.scrollWidth <= window.innerWidth + 2`).
- **Ergonomi Minimum:**
  - Target sentuh interaktif `>= 44×44px` (`min-h-[44px]`).
  - Seluruh `<input>`/`<select>` di mobile minimal `font-size: 16px` (`text-base`) agar browser mobile tidak melakukan auto-zoom saat mengetik plat nomor atau nominal kas.
  - Ikon rail/nav **100% vektor stroke** (`lucide-react`), tanpa huruf inisial teks di dalam lingkaran ikon.

---

## 5. Indeks Layar Page 3 (`M1`–`T2`)

| ID | Nama Layar | Viewport & Tema | Berkas Pratinjau (2x PNG) |
| :--- | :--- | :--- | :--- |
| **`M1`** | Mobile Shell & Executive Dashboard | `390×844` Light Cobalt | [`responsive_m1_dashboard_mobile.png`](../responsive_m1_dashboard_mobile.png) |
| **`M2A`** | Hybrid POS Mobile: Katalog & Sticky Cart Bar | `390×844` Carbon D1 Dark | [`responsive_m2a_pos_catalog_mobile.png`](../responsive_m2a_pos_catalog_mobile.png) |
| **`M2B`** | Hybrid POS Mobile: Bottom-Sheet Cart & Split Payment | `390×844` Carbon D1 Dark | [`responsive_m2b_pos_cart_drawer_mobile.png`](../responsive_m2b_pos_cart_drawer_mobile.png) |
| **`M3`** | Carwash Queue Mobile Kru Lapangan | `390×844` Light Cobalt | [`responsive_m3_queue_mobile.png`](../responsive_m3_queue_mobile.png) |
| **`M4`** | Buku Kas & Mutasi Bank Mandiri Mobile | `390×844` Light Cobalt | [`responsive_m4_finance_mobile.png`](../responsive_m4_finance_mobile.png) |
| **`T1`** | Hybrid POS Tablet 10" Landscape (Split 58:42) | `1024×768` Carbon D1 Dark | [`responsive_t1_pos_tablet_1024.png`](../responsive_t1_pos_tablet_1024.png) |
| **`T2`** | Executive Cockpit & Kanban Tablet Portrait | `768×1024` Light Cobalt | [`responsive_t2_backoffice_tablet_768.png`](../responsive_t2_backoffice_tablet_768.png) |
