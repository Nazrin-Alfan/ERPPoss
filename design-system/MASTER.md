# RelayPOS — Enterprise Design System Master (`MASTER.md` v4.2 — Modern Fintech / Precision Logo B3)

> **Retrieval Rule:** When building or reviewing any page, check `design-system/pages/<page-name>.md` first. Page-level rules override this Master file; otherwise, follow this Master specification strictly.

---

## 1. Brand & Product Architecture

- **Product Name:** **RelayPOS** (*Estafet Operations & Multi-Outlet SaaS ERP*)
- **Locked Brand Mark:** **Logo B3 — Ink Squircle Emblem** (Mathematical single-path Γ-pillar + Signal Lime `#C8F31D` pill relay bar + circular estafet node inside a rounded squircle emblem).
- **Core Philosophy:** *Modern Fintech Dual-Mode Enterprise (LumenWave Direction)* — Warm off-white alabaster canvas (`#F6F5F1`), soft floating white cards (`20–24px` radii), heavy ink-black UI weight (`#111113`), generous pill geometry (`rounded-full`), and punchy Signal Lime (`#C8F31D`) accents for Back-Office ERP, paired with High-Contrast Ink+Lime Dark Mode for semi-outdoor POS Cashier & Carwash Bay tablets.
- **UI Stack:** `Tailwind CSS v4.3` + Selective `shadcn/ui` (`@radix-ui/react-dialog`, `select`, `tabs`, `dropdown-menu`, `popover`) + `class-variance-authority` (`cva`) + `clsx` + `tailwind-merge` + `lucide-react` (`strokeWidth={1.75}`).

---

## 2. Mathematical Blueprint for Logo B3 (`Ink Squircle Emblem`)

Never assemble the Γ-pillar out of overlapping rectangles. Always construct the mark from **one continuous zero-seam SVG path** + 1 pill rectangle + 1 ellipse on a canonical `32×32` inner symbol grid (`k = M / 32`, `pad = (S - M) / 2`):

1. **Γ-Pillar (`vector`, `closed: true`):**
   `path: "M8 0 L20 0 A4 4 0 0 1 20 8 L11 8 A3 3 0 0 0 8 11 L8 28 A4 4 0 0 1 0 28 L0 8 A8 8 0 0 1 8 0 Z"`
   Bounds: `x: pad, y: pad, width: 24 * k, height: 32 * k`
2. **Relay Pill Bar (`rectangle`):**
   Bounds: `x: pad + 12 * k, y: pad + 12 * k, width: 20 * k, height: 8 * k, cornerRadius: 4 * k`
3. **Estafet Handoff Node (`ellipse`):**
   Bounds: `x: pad + 24 * k, y: pad + 24 * k, width: 8 * k, height: 8 * k`

### Exact Scale Table
| Usage | Outer Squircle (`S×S`) | Radius | `pad` | Γ-Pillar (`x, y, w, h`) | Relay Pill (`x, y, w, h, r`) | Node (`x, y, w, h`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Blueprint (`k=2.0`)** | `112×112` | `32` | `24` | `24, 24, 48, 64` | `48, 48, 40, 16, r=8` | `72, 72, 16, 16` |
| **Brand Lockup (`k=1.0`)** | `56×56` | `16` | `12` | `12, 12, 24, 32` | `24, 24, 20, 8, r=4` | `36, 36, 8, 8` |
| **Header / Tile (`k=0.75`)** | `40×40` | `12` | `8` | `8, 8, 18, 24` | `17, 17, 15, 6, r=3` | `26, 26, 6, 6` |
| **58mm Thermal (`k=0.625`)** | `32×32` | `9` | `6` | `6, 6, 15, 20` | `13.5, 13.5, 12.5, 5, r=2.5` | `21, 21, 5, 5` |
| **Favicon (`k=0.5`)** | `24×24` | `7` | `4` | `4, 4, 12, 16` | `10, 10, 10, 4, r=2` | `16, 16, 4, 4` |

- **On Light Surfaces (`#FFFFFF` / `#F6F5F1`):** Squircle `#111113` (no stroke), Γ-Pillar `#FFFFFF`, Relay Pill `#C8F31D`, Node `#C8F31D`.
- **On Dark Surfaces (`#111113` / `#141417`):** Squircle `#1D1D21` with `1px` inside stroke `#3F3F46`, Γ-Pillar `#FFFFFF`, Relay Pill `#C8F31D`, Node `#C8F31D`.
- **On 58mm Thermal Receipt:** Squircle `#FFFFFF` with `1.5px` inside stroke `#000000`, all 3 inner primitives `#000000`.

---

## 3. Three-Layer Semantic Color Tokens & Contrast Rules

Zero `#00ffff` neon cyan. Zero purple/indigo gradients. Minimum contrast ratio **WCAG 2.2 AA (`>= 4.5:1`)**.
**CRITICAL WCAG RULE:** Text/icons placed on Signal Lime (`#C8F31D`) **MUST ALWAYS** use Deep Ink-Black (`#111113`, `15.8:1` AAA). Never place `#FFFFFF` text on `#C8F31D`.

### Light Mode (Default Back-Office, Dashboard, Carwash Kanban, Login)
- Canvas `#F6F5F1`, Floating Surface `#FFFFFF` (`cornerRadius: 20–24`, border `#E7E5DE`), Subsurface `#EFECE6`, Deep Ink `#111113`, Muted `#52525B`, Signal Lime `#C8F31D`, Success `#3F6212` on `#ECFCCB` (`#15803D` on `#FFFFFF`), Warning `#B45309` on `#FEF3C7`, Danger `#B91C1C` on `#FEE2E2` (solid `#B91C1C` + `#FFFFFF`).

### High-Contrast Dark Mode (POS Cashier Split-Station)
- Canvas `#0B0B0D`, Surface `#141417` (`cornerRadius: 18–20`, border `#27272A`), Subsurface `#1D1D21` (border `#2E2E34`), Foreground `#F6F5F1`, Muted `#A1A1AA` (`7.4:1`), Primary CTA & Price Accent `#C8F31D` (with `#111113` Bold text), Success `#86EFAC` on `#14532D`, Warning `#FCD34D` on `#451A03`, Danger `#FCA5A5` on `#450A0A`.

---

## 4. Navigation Iconography (`72px` Circular Icon-Rail & `240px` Sidebar)

- **Pure Vector Icons Only (Zero Text Abbreviations Inside Rail Circles):** Every `48×48` circular button in the `72px` tablet icon-rail renders a centered `20×20` stroke-only vector icon (`strokeWeight: 2`, `strokeCap: "round"`, `strokeJoin: "round"` — matching Lucide `LayoutGrid`, `ReceiptText`, `Car`, `Wallet`, `Package`, `Users`, `SlidersHorizontal`).
- **Desktop Sidebar (`240px`):** Every `44px` pill nav item pairs an `18×18` stroke-only vector icon with its Indonesian module label.

---

## 5. Typography, Touch Ergonomics & 4 UI States

- **Fonts:** `'Plus Jakarta Sans' / 'Inter'` (UI) and `'JetBrains Mono' / 'Liberation Mono'` (`tabular-nums` + right alignment on all Rupiah & ledger figures).
- **Touch Targets:** Buttons, inputs, search bars, filter pills, topbar pills, sidebar nav items `>= 44px` height; form inputs `fontSize >= 16px` (prevents Android Chrome auto-zoom); POS steppers `44×44px` (`gap >= 8px`); POS Pay CTA `56px` pill.
- **4 Mandatory UI States:** `LOADING`, `SUCCESS`, `EMPTY`, `ERROR`.
