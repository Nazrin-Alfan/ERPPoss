# RelayPOS — Enterprise Design System Master (`MASTER.md` v5.0 — Fintech Cobalt Blue + Pure Carbon Dark D1)

> **Retrieval Rule:** When building or reviewing any page, check `design-system/pages/<page-name>.md` first. Page-level rules override this Master file; otherwise, follow this Master specification strictly.

---

## 1. Brand & Product Architecture

- **Product Name:** **RelayPOS** (*Estafet Operations & Multi-Outlet SaaS ERP*)
- **Locked Brand Mark:** **Logo B3 — Ink Squircle Emblem (Opsi 1: Ink + Cobalt)** (Mathematical single-path Γ-pillar + Cobalt Blue `#3B82F6` pill relay bar + circular estafet node inside a rounded squircle emblem).
- **Core Philosophy:** *Modern Fintech Dual-Mode Enterprise (Cobalt Blue + Pure Carbon D1)* — Cool off-white alabaster canvas (`#F4F6FA`), soft floating white cards (`20–24px` radii), Deep Slate ink weight (`#0F172A`), generous pill geometry (`rounded-full`), and Crisp Fintech Cobalt Blue (`#2563EB`) accents for Back-Office ERP, paired with **Pure Carbon Obsidian Dark Mode (Opsi D1)** for semi-outdoor POS Cashier stations & Founder Console.
- **UI Stack:** `Tailwind CSS v4.3` + Selective `shadcn/ui` (`@radix-ui/react-dialog`, `select`, `tabs`, `dropdown-menu`, `popover`) + `class-variance-authority` (`cva`) + `clsx` + `tailwind-merge` + `lucide-react` (`strokeWidth={1.75}`).

---

## 2. Mathematical Blueprint for Logo B3 (`Ink Squircle Emblem — Opsi 1`)

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

- **On Light Surfaces (`#FFFFFF` / `#F4F6FA` — Opsi 1):** Squircle `#0F172A` (no stroke), Γ-Pillar `#FFFFFF`, Relay Pill `#3B82F6`, Node `#3B82F6`.
- **On Dark Surfaces (`#09090B` / `#121215` — Opsi D1):** Squircle `#1C1C21` with `1px` inside stroke `#3F3F46`, Γ-Pillar `#FFFFFF`, Relay Pill `#3B82F6`, Node `#60A5FA`.
- **On 58mm Thermal Receipt:** Squircle `#FFFFFF` with `1.5px` inside stroke `#000000`, all 3 inner primitives `#000000`.

---

## 3. Three-Layer Semantic Color Tokens & Contrast Rules

Zero `#00ffff` neon cyan. Zero Signal Lime `#C8F31D`. Zero purple/indigo gradients. Minimum contrast ratio **WCAG 2.2 AA (`>= 4.5:1`)**.
**CRITICAL WCAG RULE:** Text and icons placed on Primary Cobalt (`#2563EB`) **MUST ALWAYS** use Pure White (`#FFFFFF`, `5.17:1` AA+). Never place dark `#0F172A` ink directly on `#2563EB`.

### Light Mode (Default Back-Office, Dashboard, Carwash Kanban, Login)
- Canvas `#F4F6FA`, Floating Surface `#FFFFFF` (`cornerRadius: 20–24`, border `#E2E8F0`), Subsurface `#F1F5F9` (border `#CBD5E1`), Deep Slate Ink `#0F172A`, Muted `#475569`, Primary Cobalt `#2563EB` (hover `#1D4ED8`, soft tint `#EFF6FF` + `#1D4ED8` text), Focus Ring `#3B82F6`, Success `#15803D` on `#DCFCE7` (`#16A34A` bars), Warning `#B45309` on `#FEF3C7`, Danger `#B91C1C` on `#FEE2E2` (solid `#B91C1C` + `#FFFFFF`).

### Pure Carbon Obsidian Dark Mode (Opsi D1 — POS Cashier & Founder Console)
- Neutral non-blue surfaces eliminate visual fatigue: Canvas `#09090B`, Surface `#121215` (`cornerRadius: 18–20`, border `#27272A`), Subsurface `#1C1C21` (border `#27272A` / `#3F3F46`), Selected/Focused Card Tint `#121722` with `#3B82F6` (`1.5px`) border, Foreground `#FAFAFA`, Muted `#A1A1AA`, Primary CTA & Active Pills `#2563EB` with `#FFFFFF` Bold text/icon, Numeric Prices & KPIs `#FFFFFF` (razor-sharp AAA), Accent Callouts `#60A5FA` / `#93C5FD` on `#172554`, Success `#4ADE80` on `#052E16`, Warning `#FBBF24` on `#451A03`, Danger `#F87171` on `#450A0A`.

---

## 4. Navigation Iconography (`72px` Circular Icon-Rail & `240px` Sidebar)

- **Pure Vector Icons Only (Zero Text Abbreviations Inside Rail Circles):** Every `48×48` circular button in the `72px` tablet icon-rail renders a centered `20×20` stroke-only vector icon (`strokeWeight: 2`, `strokeCap: "round"`, `strokeJoin: "round"` — matching Lucide `LayoutGrid`, `ReceiptText`, `Car`, `Wallet`, `Package`, `Users`, `SlidersHorizontal`). Active rail button uses `#2563EB` fill + `#FFFFFF` stroke icon.
- **Desktop Sidebar (`240px`):** Every `44px` pill nav item pairs an `18×18` stroke-only vector icon with its Indonesian module label. Active sidebar pill uses `#2563EB` fill + `#FFFFFF` Bold text/icon + `#93C5FD` dot.

---

## 5. Typography, Touch Ergonomics & 4 UI States

- **Fonts:** `'Plus Jakarta Sans' / 'Inter'` (UI) and `'JetBrains Mono' / 'Liberation Mono'` (`tabular-nums` + right alignment on all Rupiah & ledger figures).
- **Touch Targets:** Buttons, inputs, search bars, filter pills, topbar pills, sidebar nav items `>= 44px` height; form inputs `fontSize >= 16px` (prevents Android Chrome auto-zoom); POS steppers `44×44px` (`gap >= 8px`); POS Pay CTA `56px` pill.
- **4 Mandatory UI States:** `LOADING`, `SUCCESS`, `EMPTY`, `ERROR`.
