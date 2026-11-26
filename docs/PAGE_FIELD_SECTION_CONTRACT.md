# Kontrak Field, Section, Modal & DB Parity — RelayPOS (`Phase 1.5 Deep Guard`)

Dokumen ini menjadi **checklist pengunci resmi 5-Layer** berbasis metodologi `qa-project-bootstrap` sebelum memasuki **Fase 3 (UI Primitif & App Shell Fintech Cobalt Blue v5.0)** dan **Fase 4 (Migrasi Halaman Strangler-Fig)**.

Seluruh poin pada dokumen ini diverifikasi **secara struktural (AST, SSR Render, SQL Schema DDL, dan Playwright Live DOM)** — bukan sekadar pencocokan teks regex — melalui:
1. [`scripts/verifyNoUndeclaredVars.js`](../scripts/verifyNoUndeclaredVars.js) — AST scope guard lintas `src/pages/`, `src/components/`, dan `src/hooks/` (hard-fail `exit 1`).
2. [`src/utils/astContractValidator.js`](../src/utils/astContractValidator.js) & [`src/constants/pageFieldContracts.js`](../src/constants/pageFieldContracts.js) — Validasi AST JSX komponen ter-render, input binding nyata (kebal terhadap *dead `useState`* dan komentar palsu), event handler ter-wire, dan print invariant.
3. [`src/pages/__tests__/pageIntegrity.test.jsx`](../src/pages/__tests__/pageIntegrity.test.jsx) — SSR smoke render (`renderToString`) untuk **18 halaman produksi + 5 modal kritis**.
4. [`src/services/__tests__/schemaFormParity.test.js`](../src/services/__tests__/schemaFormParity.test.js) — Paritas kolom payload form terhadap DDL riil `supabase/migrations/*.sql` + wajib `tenant_id`.
5. [`scripts/qa_phase1_5_field_section_e2e.mjs`](../scripts/qa_phase1_5_field_section_e2e.mjs) — Verifikasi Chromium Live DOM pada **14 rute** (tab, heading, input, modal terbuka, `#print-area`, `tabular-nums`, dan zero runtime error).

> [!IMPORTANT]
> **Preservation Notice untuk Fase 4:** Beberapa halaman di FigCraft (`00`–`15`) memvisualisasikan *tab utama* saja agar kanvas tetap ringkas. Selama migrasi JSX di Fase 4, **seluruh tab sekunder, 22 modal/manager sub-komponen, dan field database di dokumen ini WAJIB dipertahankan atau dipindahkan ke sub-komponen terdaftar pada `companionFiles` / `SUBCOMPONENT_FIELD_CONTRACTS`.**

---

## Cara Mengupdate Kontrak Saat Memecah God-Page (Fase 4)
1. Jika Anda memecah [`HybridPOSPage.jsx`](../src/pages/pos/HybridPOSPage.jsx), [`Finance.jsx`](../src/pages/Finance.jsx), [`Admin.jsx`](../src/pages/Admin.jsx), atau [`Dashboard.jsx`](../src/pages/Dashboard.jsx) menjadi file UI baru (misalnya `src/components/pos/PosExchangeTab.jsx`), tambahkan path file barunya ke array `companionFiles` pada kontrak halaman induk di [`src/constants/pageFieldContracts.js`](../src/constants/pageFieldContracts.js).
2. Jika file baru merupakan modal/manager/view interaktif domain baru, daftarkan kontraknya di `SUBCOMPONENT_FIELD_CONTRACTS` (dideteksi otomatis oleh `discoverDomainInteractiveComponents()`).
3. Jalankan `npm run qa:phase1.5` setelah setiap halaman selesai dimigrasi.

---

## A. Halaman Autentikasi & Publik (`5` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Komponen JSX & Section Wajib | Field Input Terikat JSX | Handler Ter-wire & Print |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Login`** (`/login`) [`Login.jsx`](../src/pages/Login.jsx) | `02` | `login`, `register` | `<GoogleIcon />`, `showManualRegister`, `loginWithGoogle` | `identifier`, `password`, `tenantSlug`, `regNama`, `regEmail`, `regPassword`, `regTenantName`, `regBusinessType` | `handleLoginSubmit`, `handleRegisterSubmit`, `handleGoogleLogin`, `handleGoogleRegister` |
| **`ForgotPassword`** (`/forgot-password`) [`ForgotPassword.jsx`](../src/pages/ForgotPassword.jsx) | `02` (Turunan) | — | Link `/login` | `email`, `submitted` | `handleSubmit` |
| **`ResetPassword`** (`/reset-password`) [`ResetPassword.jsx`](../src/pages/ResetPassword.jsx) | `02` (Turunan) | — | Link `/login`, `/forgot-password` | `newPassword`, `confirmPassword`, `hasRecoverySession` | `handleSubmit` |
| **`LandingPage`** (`/welcome`) [`LandingPage.jsx`](../src/pages/LandingPage.jsx) | `13` | — | `/login`, `/login?mode=register`, `/panduan`, `selectedScreenshotId`, `zoomedShot` | `selectedScreenshotId`, `zoomedShot` | — |
| **`UserManualPage`** (`/panduan`) [`UserManualPage.jsx`](../src/pages/UserManualPage.jsx) | `14` | — | `ROLE_FILTERS`, `CHAPTERS`, `/login` | `searchQuery`, `selectedRole` | Print: `window.print` |

---

## B. Wave 1 — Operasional Kasir & Pendapatan Inti (`3` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Komponen JSX & Section Wajib | Field Input Terikat JSX & Tabel DB | Handler Ter-wire |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Dashboard`** (`/dashboard`) [`Dashboard.jsx`](../src/pages/Dashboard.jsx) | `03` | `ALL`, `CAFE`, `CARWASH` | `<AIPromptBuilderModal />`, `<ExecutivePromptStudio />`, `<ExpenseDetailModal />`, `<OnboardingWizardModal />`, `<InteractiveCalendar />`, `v_pocket_balances` | `selectedExpenseDivision`, `startDate`, `endDate` (`pos_balances`, `cafe`, `carwash`) | — |
| **`HybridPOSPage`** (`/pos`) [`HybridPOSPage.jsx`](../src/pages/pos/HybridPOSPage.jsx) | `04A`, `04B` | **`cafe`, `carwash`, `merchandise`, `pending`, `history`, `inventory`, `expense`, `exchange`** | `<ThermalReceiptModal />`, `<CustomerLoyaltyBanner />`, `<VoidReasonModal />`, `<ShiftClosingModal />`, `<CrewDailyCommissionModal />` + 6 flag modal/drawer | 43 field kasir, carwash, expense & tukar uang (`struk`, `carwash`, `cafe`, `pengeluaran`) | `handleCheckout`, `handleConfirmVoid`, `handleCancelBill`, `handleConfirmShiftClose`, `handleSaveExchange`, `handleSavePosExpense`, `handleSaveStartingCapital`, `handleSetItemNote`, `handleOpenCrewCommissionModal` |
| **`CarwashQueue`** (`/queue`) [`CarwashQueue.jsx`](../src/pages/CarwashQueue.jsx) | `05` | `Pending`, `Selesai`, `kanban`, `list` | `qcModalItem`, `subscribeCarwashQueueRealtime` | `bodyClean`, `interiorVacuum`, `glassClear`, `tireShine`, `selectedDate`, `searchQuery`, `filterType` (`carwash`) | `handleStartWashing`, `handleCompleteQc`, `handleSendWhatsAppNotification` |

---

## C. Wave 2 — Back-Office ERP & Akuntansi (`6` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Komponen JSX & Section Wajib | Field Input Terikat JSX & Tabel DB | Handler Ter-wire |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Finance`** (`/finance`) [`Finance.jsx`](../src/pages/Finance.jsx) | `06` | **`cashflow`, `carwash`, `cafe`, `expenses`, `bank_inbox`** | `<OwnerWithdrawalModal />`, `<BankMutationInboxTab />`, 5 modal flag | 15 field (`cashflow`, `pengeluaran`) | `handleSaveExpense`, `handleSaveIncome`, `handleSaveTransfer`, `handleSaveEdit`, `handleDeleteItem`, `handleExportCSV` |
| **`Gudang`** (`/gudang`) [`Gudang.jsx`](../src/pages/Gudang.jsx) | `07` | `CAFE`, `CARWASH`, **`MERCHANDISE`** | `<InventoryTable />`, 4 modal/calculator flag | 17 field konversi kemasan & opname (`stok_barang`, `barang_keluar`) | `handleSaveItem`, `handleConfirmRestock`, `handleConfirmOpname`, `handleDeleteItem` |
| **`Reports`** (`/reports`) [`Reports.jsx`](../src/pages/Reports.jsx) | `08` | Operasional vs GL | `<GeneralLedgerView />`, `<InteractiveCalendar />`, `#print-area` | `reportViewMode`, `timeRange`, `startDate`, `endDate` | Print: `#print-area` |
| **`Karyawan`** (`/karyawan`) [`Karyawan.jsx`](../src/pages/Karyawan.jsx) | `09` | **`wages`, `crew`, `office`, `staff`** | `<CoOwnerInviteCard />`, `<InteractiveCalendar />`, `showPayModal`, `showWagesCalendar` | 15 field gaji, kru, office & RBAC staff (`profiles`, `tenant_invitations`) | `handleAddKaryawanCuci`, `handleAddKaryawanKantor`, `handleProcessWagePayment`, `handleRegisterStaff`, `handleChangeStaffRole`, `handleToggleStaffStatus` |
| **`CRM`** (`/crm`) [`CRM.jsx`](../src/pages/CRM.jsx) | `10` | `ALL`, `VIP`, `LOYAL`, `NEED_ATTENTION`, `AT_RISK`, `NEW`, `REWARD_READY` | `showProgramConfigModal`, `configModalTab` | 15 field profil RFM, WA & konfigurasi program (`crm_loyalty_programs`) | `handleClaimReward`, `handleSaveCustomerNote`, `handleSaveProgramSettings`, `handleSendWhatsApp`, `handleExportCSV` |
| **`Admin`** (`/admin`) [`Admin.jsx`](../src/pages/Admin.jsx) | `11` | **`menu`, `merchandise`, `carwash-packages`, `cashier-pay`, `discounts`, `categories`, `receipt-settings`, `license`, `calibration`, `manual-eod`** | `<ReceiptCustomizer />`, `<CarwashPackageManager />`, `<MerchandiseManager />`, `<LicenseManager />`, `<MenuHppCalculator />`, `<BankEmailBindingModal />` | 27 field master data (`daftar_harga_menu`, `resep`, `master_categories`, `pos_balances`) | 21 wired handlers (Add/Save/Delete Menu, Ingredient, Opname, RecipeRow, Package, Merchandise, Account, Category, Discount, Calibrate, LicenseKey, Manual EOD) |

---

## D. Wave 3 — Multi-Outlet & Platform SaaS (`4` Rute)

| Halaman & Rute | Frame FigCraft | Komponen JSX & Section Wajib | Field Input Terikat JSX & Tabel DB | Handler Ter-wire |
| :--- | :--- | :--- | :--- | :--- |
| **`Konsolidasi`** (`/konsolidasi`) [`Konsolidasi.jsx`](../src/pages/Konsolidasi.jsx) | `12` | `<OnboardingWizardModal />`, `showWizard` | `selectedPeriod`, `cloudOutletsSummary` (`branches`) | `handleJumpToTenant`, `handleWizardCompleted` |
| **`Founder`** (`/founder`) [`Founder.jsx`](../src/pages/Founder.jsx) | `15` | `showCreateModal`, `beta_feedback` | `storeName`, `slug`, `ownerName`, `ownerEmail`, `telepon`, `alamat`, `tier`, `licenseDurationMonths`, `businessType` (`tenants`, `beta_feedback`) | `handleCreateNewTenant`, `handleToggleSubscription`, `handleConfirmRenewal`, `handleConfirmArchive`, `handleRestoreTenant`, `handleImpersonate`, `handleExportDatabaseSnapshot` |
| **`SuperAdmin`** (`/super-admin`) [`SuperAdmin.jsx`](../src/pages/SuperAdmin.jsx) | `15` | `showAddModal`, `showKeyModal` | `storeName`, `ownerName`, `ownerEmail`, `telepon`, `alamat`, `tier`, `durationMonths` (`license_keys`) | `handleCreateTenant`, `handleGenerateAndApplyKey`, `handleExecuteDelete`, `handleExecutePurge` |
| **`Database`** (`/database`) [`Database.jsx`](../src/pages/Database.jsx) | Tool Internal | `showFormModal`, `viewingRowJson` | `selectedTable`, `selectedMonth`, `searchQuery`, `formData` | `handleSubmitForm`, `handleDeleteRow`, `handleExportCSV`, `handleTableChange` |

---

## E. Sub-Komponen & Modal Terkunci (`22` Komponen `SUBCOMPONENT_FIELD_CONTRACTS`)

| Domain | Komponen | File | Kontrak Utama (Fields, Handlers, Print / DB) |
| :--- | :--- | :--- | :--- |
| **Admin** | `BankEmailBindingModal` | [`BankEmailBindingModal.jsx`](../src/components/admin/BankEmailBindingModal.jsx) | `newEmail`, `bindingForm` (6 field) · 5 handlers · `bank_email_connections`, `bank_account_bindings` |
| **Admin** | `CarwashPackageManager` | [`CarwashPackageManager.jsx`](../src/components/admin/CarwashPackageManager.jsx) | `nama_paket`, `tarif`, `keterangan`, `komisi_value`, `resepList` · 6 handlers · `carwash_packages` |
| **Admin** | `LicenseManager` | [`LicenseManager.jsx`](../src/components/admin/LicenseManager.jsx) | `inputKey` · `handleKeySubmit`, `handleCopyBank` · `license_keys` |
| **Admin** | `MenuHppCalculator` | [`MenuHppCalculator.jsx`](../src/components/admin/MenuHppCalculator.jsx) | `calcMode`, `invoiceQty`, `invoiceTotal`, `overheadCost`, `packagingCost`, `targetMargin` · `onApplyPrice` |
| **Admin** | `MerchandiseManager` | [`MerchandiseManager.jsx`](../src/components/admin/MerchandiseManager.jsx) | `nama_barang`, `kategori`, `harga_beli`, `harga_jual`, `stok`, `min_stok`, `satuan`, `foto_url`, `searchQuery` · 3 handlers · `stok_barang` |
| **Admin** | `ReceiptCustomizer` | [`ReceiptCustomizer.jsx`](../src/components/admin/ReceiptCustomizer.jsx) | 8 sub-tab (`hardware`..`PAYMENT`), 13 field toko/struk · 5 handlers · Print: `window.print` · `tenants.receipt_config` |
| **Auth** | `ActivateLicenseModal` | [`ActivateLicenseModal.jsx`](../src/components/auth/ActivateLicenseModal.jsx) | `serialKey` · `handleActivate`, `onClose` |
| **Auth** | `ChangePasswordModal` | [`ChangePasswordModal.jsx`](../src/components/auth/ChangePasswordModal.jsx) | `currentPassword`, `newPassword`, `confirmPassword` · `handleSubmit`, `onClose` |
| **Auth** | `LicenseExpiredLockout` | [`LicenseExpiredLockout.jsx`](../src/components/auth/LicenseExpiredLockout.jsx) | `serialKey`, `isOwner` · `handleActivate` |
| **Auth** | `OnboardingWizardModal` | [`OnboardingWizardModal.jsx`](../src/components/auth/OnboardingWizardModal.jsx) | 9 field profil outlet, kasir & printer · 4 handlers · `tenants` |
| **Dashboard** | `AIPromptBuilderModal` | [`AIPromptBuilderModal.jsx`](../src/components/dashboard/AIPromptBuilderModal.jsx) | `activeTab`, `selectedPreset`, `customQuestion` · 4 handlers |
| **Dashboard** | `ExecutivePromptStudio` | [`ExecutivePromptStudio.jsx`](../src/components/dashboard/ExecutivePromptStudio.jsx) | 8 field filter tanggal/instruksi · 5 handlers |
| **Dashboard** | `ExpenseDetailModal` | [`ExpenseDetailModal.jsx`](../src/components/dashboard/ExpenseDetailModal.jsx) | `searchTerm`, `selectedCategory` · `handleExportCSV`, `onClose` |
| **Finance** | `BankMutationInboxTab` | [`BankMutationInboxTab.jsx`](../src/components/finance/BankMutationInboxTab.jsx) | 12 field simulasi email & rekonsiliasi draft · `handleIngestEmail`, `handlePostDraft` · `bank_transaction_drafts` |
| **Finance** | `OwnerWithdrawalModal` | [`OwnerWithdrawalModal.jsx`](../src/components/finance/OwnerWithdrawalModal.jsx) | `sumberDana`, `nominal`, `keterangan` · `handleWithdraw`, `onClose` · `cashflow` |
| **Karyawan** | `CoOwnerInviteCard` | [`CoOwnerInviteCard.jsx`](../src/components/karyawan/CoOwnerInviteCard.jsx) | `email` · `handleInviteSubmit`, `handleCopyInvite`, `handleRevoke` · `tenant_invitations` |
| **POS** | `CrewDailyCommissionModal` | [`CrewDailyCommissionModal.jsx`](../src/components/pos/CrewDailyCommissionModal.jsx) | `crewSummaries` · `handlePrintMiniSlip`, `onClose` · Print: `window.print` |
| **POS** | `MerchandiseCatalog` | [`MerchandiseCatalog.jsx`](../src/components/pos/MerchandiseCatalog.jsx) | `searchQuery`, `selectedCategory` · `onAddToCart`, `onUpdateQty` |
| **POS** | `ShiftClosingModal` | [`ShiftClosingModal.jsx`](../src/components/pos/ShiftClosingModal.jsx) | `physicalCash`, `notes` · 3 handlers · `cashier_shift_closings` |
| **POS** | `ThermalReceiptModal` | [`ThermalReceiptModal.jsx`](../src/components/pos/ThermalReceiptModal.jsx) | `phoneInput`, `showKitchenSlip` · 5 handlers · Print: `thermal-receipt-print-wrapper` |
| **POS** | `VoidReasonModal` | [`VoidReasonModal.jsx`](../src/components/pos/VoidReasonModal.jsx) | `selectedPreset`, `customReason` · 3 handlers |
| **Reports** | `GeneralLedgerView` | [`GeneralLedgerView.jsx`](../src/components/reports/GeneralLedgerView.jsx) | 4 tab GL (`trial_balance`..`ledger_drilldown`), 10 field · 3 handlers · `journal_entries`, `journal_entry_lines`, `chart_of_accounts` |

---

## Checklist Migrasi Per-Halaman Fase 4 (Definition of Done)

Sebelum menutup migrasi UI setiap halaman di Fase 4, pastikan **semua 5 gate** di bawah hijau:
1. `npm run test:ast-scope` → **0 warnings / 0 errors**.
2. `npm run test:contracts` → Seluruh 40 AST kontrak (18 halaman + 22 sub-komponen), 18-page SSR smoke render, dan DB schema parity **100% PASS**.
3. `npm run lint` & `npm run build` → `0` errors (`oxlint` tidak bertambah warning baru), bundle `dist/` terbangun.
4. `qa_phase1_5_field_section_e2e.mjs` + `qa_tahap3_playwright_e2e.mjs` + `qa_tahap4_a11y_perf_and_rbac_e2e.mjs` → **100% PASS**.
5. Audit visual Light Mode (`#F4F6FA`) & Dark Mode (`D1 #09090B` pada POS & Founder) lolos `@UIUX_Design_Auditor`.
