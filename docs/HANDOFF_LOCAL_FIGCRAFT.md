# Handoff Sesi Lokal: Rebranding UI/UX ERPPoss dengan FigCraft MCP

Dokumen ini disiapkan untuk **agen Antigravity di PC lokal User** agar dapat langsung melanjutkan pekerjaan dari sesi perencanaan Cloud tanpa mengulang audit kode dari awal.

---

## 1. Konteks Singkat & Apa yang Sudah Selesai

- **Tujuan User:** Melakukan rebranding UI/UX penuh pada aplikasi **ERPPoss (RelayPOS SaaS ERP)** menggunakan **FigCraft (diakses via MCP di PC lokal User)** terlebih dahulu untuk mendesain frontend baru, lalu mengganti layer UI React tanpa mengganggu koneksi front-end ke back-end (Supabase Cloud RLS, Local Offline Sandbox Engine, Realtime WebSocket, dan Web Bluetooth Thermal Printer).
- **Status Saat Ini:**
  - Audit arsitektur lengkap menggunakan metode `ponytail-review` dan penyusunan master plan 4 fase telah selesai dan terdokumentasi di [`docs/UIUX_REBRANDING_PLAN.md`](./UIUX_REBRANDING_PLAN.md).
  - **Belum ada file kode produksi (`src/*`) yang dimodifikasi.** Seluruh kode berada dalam kondisi bersih dan siap dieksekusi sesuai urutan rencana.
  - Sesi dipindahkan dari Cloud VM ke **Antigravity Desktop Lokal** agar agen dapat memanggil server MCP **FigCraft** yang berjalan di `127.0.0.1` pada PC User.

---

## 2. Wajib Dibaca Agen Berikutnya (Aturan & Dokumen)

1. [`AGENTS.md`](../AGENTS.md) — **Wajib dipatuhi mutlak** (protokol Single Point of Contact `@Lead_Orchestrator`, badge identitas agen di setiap giliran, Approval Gate, TDD Red-Green-Refactor, Anti-AI Slop, serta gerbang `@UIUX_Design_Auditor` & `@QA_ERP_Auditor`).
2. [`docs/UIUX_REBRANDING_PLAN.md`](./UIUX_REBRANDING_PLAN.md) — Berisi hasil 8 temuan `ponytail-review` beserta nomor baris pasti dan spesifikasi 4 Fase implementasi.

---

## 3. Suggested Skills (Wajib Dipanggil dengan `lookup_skill` / `lookup_skills`)

Agen lokal yang melanjutkan sesi ini **wajib** memuat skill berikut sebelum mulai bekerja:
- `ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max/SKILL.md`) — Untuk men-generate & menyimpan `design-system/MASTER.md` (`--design-system --persist --density 8 --motion 4 --variance 5`).
- `ui-styling` (`.agents/skills/ui-styling/SKILL.md`) — Untuk arsitektur komponen aksesibel berbasis Radix UI / `shadcn/ui` + token Tailwind CSS v4.
- `web-app-development` — Untuk prinsip desain fungsional, hirarki visual, dan pencegahan klise AI.
- `ponytail-review` (`.agents/skills/ponytail-review/SKILL.md`) — Untuk me-review setiap perubahan ekstraksi service/hook dan komponen baru agar tetap ramping (*lean*), aman di bawah beban multi-tenant, dan bebas regresi.

---

## 4. Panduan Koneksi FigCraft MCP di PC Lokal (Untuk User)

Pastikan aplikasi **FigCraft Desktop** (atau plugin FigCraft di Figma) sedang terbuka di PC lokal Anda dan server MCP-nya terdaftar di konfigurasi MCP Antigravity Desktop:

### Opsi A — FigCraft Desktop Rust (`storytold/figcraft`)
```json
{
  "mcpServers": {
    "figcraft": {
      "command": "figcraft-cli",
      "args": ["mcp", "--attach", "47800"]
    }
  }
}
```
*(Sesuaikan nomor port `--attach` dengan port yang aktif pada FigCraft Desktop Anda.)*

### Opsi B — `zuna107/figcraft-mcp` (Live-Streaming Canvas)
```json
{
  "mcpServers": {
    "figcraft": {
      "command": "npx",
      "args": ["-y", "figcraft-mcp"]
    }
  }
}
```

### Opsi C — FigCraft Figma Plugin (`divikwu/figcraft`)
```json
{
  "mcpServers": {
    "figcraft": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "C:/path/ke/folder/figcraft"
    }
  }
}
```

---

## 5. Langkah Pertama untuk Agen Lokal

1. Verifikasi koneksi ke tools MCP **FigCraft** (misal `ping` / cek daftar dokumen atau kanvas aktif).
2. Tanyakan dan kunci **3 Keputusan Desain (Open Questions)** yang tercantum di [`docs/UIUX_REBRANDING_PLAN.md`](./UIUX_REBRANDING_PLAN.md) bersama User:
   - Nama/logo brand baru & pilihan arah palet warna (*Light-First Clean Enterprise* vs *Refined Warm Graphite Dark-First*).
   - Konfirmasi penggunaan Tailwind CSS v4.3 + primitif Radix/shadcn.
   - Konfirmasi urutan gelombang layar di FigCraft (*Wave 1 -> Wave 2 -> Wave 3*).
3. Setelah User menyetujui:
   - Jalankan pembuatan sistem desain (`design-system/MASTER.md`) dan mulai bangun **Frame 00 (Brand & Token Sheet)**, **Frame 01 (Core UI Kit)**, serta **Wave 1 Screens** langsung di kanvas **FigCraft via MCP** untuk ditinjau User.
   - Sebelum menyentuh kode JSX di `src/pages/*`, wajib eksekusi **Fase 1 (Backend Connection Shield)** sesuai `docs/UIUX_REBRANDING_PLAN.md` agar 184 panggilan `supabase.*`, `localStorage`, dan CSS cetak thermal terisolasi dengan aman dan seluruh unit test (`npm run test`) 100% lulus.

---

## 6. Prompt Siap Pakai di Antigravity Desktop Lokal

Setelah melakukan `git fetch && git checkout chore/uiux-rebrand-plan` di PC lokal Anda, salin dan kirimkan pesan ini pada percakapan baru di Antigravity Desktop:

```text
Baca AGENTS.md, docs/HANDOFF_LOCAL_FIGCRAFT.md, dan docs/UIUX_REBRANDING_PLAN.md, serta aktifkan skill /ui-ux-pro-max, /ui-styling, /web-app-development, dan /ponytail-review. Cek koneksi ke MCP FigCraft di PC lokal saya, lalu pandu saya mengonfirmasi keputusan brand sebelum kita mulai membangun sistem desain di kanvas FigCraft.
```
