# Kontrak Field, Section, Tab & Modal Seluruh Halaman — RelayPOS (`Phase 1.5`)

Dokumen ini menjadi **checklist pengunci resmi** sebelum memasuki **Fase 3 (UI Primitif & App Shell Cobalt Blue v5.0)** dan **Fase 4 (Migrasi Halaman Strangler-Fig)**. Seluruh poin di bawah diverifikasi otomatis oleh [`src/pages/__tests__/pageFieldContracts.test.js`](../src/pages/__tests__/pageFieldContracts.test.js) terhadap registri [`src/constants/pageFieldContracts.js`](../src/constants/pageFieldContracts.js).

> [!IMPORTANT]
> **Preservation Notice untuk Fase 4:** Beberapa halaman di FigCraft (`00`–`15`) memvisualisasikan *tab utama* saja agar kanvas tetap ringkas. Selama migrasi JSX di Fase 4, **seluruh tab sekunder, modal form, dan field database dalam tabel ini WAJIB dipertahankan atau dipindahkan ke sub-komponen terdaftar pada `companionFiles`.** Jangan membuang fitur hanya karena sub-tab/modal tersebut tidak digambar terpisah di FigCraft.

---

## Cara Mengupdate Kontrak Saat Memecah God-Page (Fase 4)
Jika di Fase 4 Anda memecah [`HybridPOSPage.jsx`](../src/pages/pos/HybridPOSPage.jsx), [`Finance.jsx`](../src/pages/Finance.jsx), [`Admin.jsx`](../src/pages/Admin.jsx), atau [`Dashboard.jsx`](../src/pages/Dashboard.jsx) menjadi beberapa file UI (misalnya `src/components/pos/PosExchangeTab.jsx`), cukup tambahkan path file barunya ke array `companionFiles` pada kontrak halaman tersebut di [`src/constants/pageFieldContracts.js`](../src/constants/pageFieldContracts.js).

---

## A. Halaman Autentikasi & Publik (`5` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Section & Modal Wajib | Field Input / State & Tabel DB | Handler Kritis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Login`** (`/login`) [`Login.jsx`](../src/pages/Login.jsx) | `02` | `login`, `register` | `showManualRegister`, `Google` OAuth | `identifier`, `password`, `tenantSlug`, `regNama`, `regEmail`, `regPassword`, `regTenantName`, `regBusinessType` | `handleLoginSubmit`, `handleRegisterSubmit`, `handleGoogleLogin`, `handleGoogleRegister` |
| **`ForgotPassword`** (`/forgot-password`) [`ForgotPassword.jsx`](../src/pages/ForgotPassword.jsx) | `02` (Turunan) | — | Link kembali `/login` | `email`, `submitted` | `handleSubmit` |
| **`ResetPassword`** (`/reset-password`) [`ResetPassword.jsx`](../src/pages/ResetPassword.jsx) | `02` (Turunan) | — | Link `/login`, `/forgot-password` | `newPassword`, `confirmPassword`, `hasRecoverySession` | `handleSubmit` |
| **`LandingPage`** (`/welcome`) [`LandingPage.jsx`](../src/pages/LandingPage.jsx) | `13` | — | Showcase Screenshot + Lightbox (`zoomedShot`), link `/login`, `/login?mode=register`, `/panduan` | `selectedScreenshotId`, `zoomedShot` | — |
| **`UserManualPage`** (`/panduan`) [`UserManualPage.jsx`](../src/pages/UserManualPage.jsx) | `14` | — | `ROLE_FILTERS`, `CHAPTERS`, link `/login`, aksi `window.print` | `searchQuery`, `selectedRole` | — |

---

## B. Wave 1 — Operasional Kasir & Pendapatan Inti (`3` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Section & Modal Wajib | Field Input / State & Tabel DB | Handler Kritis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Dashboard`** (`/dashboard`) [`Dashboard.jsx`](../src/pages/Dashboard.jsx) | `03` | `ALL`, `CAFE`, `CARWASH` | `AIPromptBuilderModal`, `ExecutivePromptStudio`, `ExpenseDetailModal`, `OnboardingWizardModal`, `InteractiveCalendar`, `showAIPromptModal`, `showCustomCalendar`, `showExpenseModal` | Query `v_pocket_balances`, `cafe`, `pos_balances` + KPI Omzet/Laba/Bay/Estafet | — |
| **`HybridPOSPage`** (`/pos`) [`HybridPOSPage.jsx`](../src/pages/pos/HybridPOSPage.jsx) | `04A`, `04B` | **`cafe`, `carwash`, `merchandise`, `pending`, `history`, `inventory`, `expense`, `exchange`** *(6 tab di luar 04A/04B wajib dipertahankan!)* | `ThermalReceiptModal`, `CustomerLoyaltyBanner`, `VoidReasonModal`, `ShiftClosingModal`, `CrewDailyCommissionModal`, `showModalModal`, `showShiftClosingModal`, `showCrewCommissionModal`, `showCashDrawerDetail`, `showCashOpsMenu`, `showMobileCart` | **Carwash/CRM (`carwash`, `pelanggan`):** `kehadiran`, `variant`, `ukuran`, `paket`, `bay`, `anggota1`, `anggota2`, `platNomor`, `model`, `noTelepon`, `harga`, `customHarga`, `gaji_pencuci`, `kondisi_bodi`, `barang_berharga`, `catatan_kendaraan`<br>**POS Expense:** `tanggal`, `keterangan`, `nominal`, `unit`, `kategori`, `karyawan`, `karyawan_id`, `category_id`, `id_bahan_baku`, `qty`<br>**Checkout & Tukar Uang:** `selectedCashier`, `selectedPayment`, `paymentStatus`, `startingCapitalInput`, `settleCashReceived`, `splitCashAmount`, `splitQrisAmount`, `exchangeCash`, `exchangeQris`, `exchangeCustomer`, `orderType`, `tableOrQueueNumber`, `activeNoteText` | `handleCheckout`, `handleConfirmVoid`, `handleCancelBill`, `handleConfirmShiftClose`, `handleSaveExchange`, `handleSavePosExpense`, `handleSaveStartingCapital`, `handleSetItemNote`, `handleOpenCrewCommissionModal` |
| **`CarwashQueue`** (`/queue`) [`CarwashQueue.jsx`](../src/pages/CarwashQueue.jsx) | `05` | `Pending`, `Selesai`, `kanban`, `list` | `qcModalItem`, `subscribeCarwashQueueRealtime` (`carwash`) | `bodyClean`, `interiorVacuum`, `glassClear`, `tireShine`, `selectedDate`, `searchQuery`, `filterType` | `handleStartWashing`, `handleCompleteQc`, `handleSendWhatsAppNotification` |

---

## C. Wave 2 — Back-Office ERP & Akuntansi (`6` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Section & Modal Wajib | Field Input / State & Tabel DB | Handler Kritis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Finance`** (`/finance`) [`Finance.jsx`](../src/pages/Finance.jsx) | `06` | **`cashflow`, `carwash`, `cafe`, `expenses`, `bank_inbox`** | `OwnerWithdrawalModal`, `showExpenseModal`, `showIncomeModal`, `showTransferModal`, `showWithdrawalModal`, `showEditModal` | `tanggal`, `jenis`, `kategori`, `pos`, `keterangan`, `total_harga`, `karyawan`, `karyawan_id`, `nominal`, `pos_asal`, `pos_tujuan`, `pemasukan`, `pengeluaran`, `metode_bayar`, `status` *(13 tabel termasuk `bank_transaction_drafts` & `v_pocket_balances`)* | `handleSaveExpense`, `handleSaveIncome`, `handleSaveTransfer`, `handleSaveEdit`, `handleDeleteItem`, `handleExportCSV` |
| **`Gudang`** (`/gudang`) [`Gudang.jsx`](../src/pages/Gudang.jsx) | `07` | `CAFE`, `CARWASH`, **`MERCHANDISE`** | `showItemModal`, `showRestockModal`, `showOpnameModal`, `showHppCalculator`, `InventoryTable` | `id_barang`, `nama_barang`, `kategori`, `satuan`, `harga_beli`, `harga_jual`, `min_stok`, `gudang`, `totalBeli`, `jumlahQty`, `satuanBeli`, `isiPerKemasan`, `satuanPemakaian`, `restockQty`, `restockCost`, `opnameRealQty`, `opnameCatatan` | `handleSaveItem`, `handleConfirmRestock`, `handleConfirmOpname`, `handleDeleteItem` |
| **`Reports`** (`/reports`) [`Reports.jsx`](../src/pages/Reports.jsx) | `08` | Operasional vs `GeneralLedgerView` | `GeneralLedgerView`, `InteractiveCalendar`, `showCustomCalendar`, `#print-area` | `reportViewMode`, `timeRange`, `startDate`, `endDate` | — |
| **`Karyawan`** (`/karyawan`) [`Karyawan.jsx`](../src/pages/Karyawan.jsx) | `09` | **`wages`, `crew`, `office`, `staff`** | `CoOwnerInviteCard`, `InteractiveCalendar`, `showPayModal`, `showWagesCalendar` | `workerId`, `workerName`, `calculatedOutstanding`, `amountToPay`, `fundSource`, `note`, `email`, `password`, `nama`, `role`, `branchId`, `newKaryawanCuci`, `newKaryawanKantor`, `wagesStartDate`, `wagesEndDate` | `handleAddKaryawanCuci`, `handleAddKaryawanKantor`, `handleProcessWagePayment`, `handleRegisterStaff`, `handleChangeStaffRole`, `handleToggleStaffStatus` |
| **`CRM`** (`/crm`) [`CRM.jsx`](../src/pages/CRM.jsx) | `10` | `ALL`, `VIP`, `LOYAL`, `NEED_ATTENTION`, `AT_RISK`, `NEW`, `REWARD_READY` | `showProgramConfigModal`, `configModalTab` | `searchQuery`, `filterSegment`, `preferenceNoteInput`, `customerNameInput`, `whatsappInput`, `customMessageBody`, `editTargetStamps`, `editRewardType`, `editRewardTitle`, `editRewardDescription`, `editVipMinVisits`, `editVipMinSpent`, `editLoyalMinVisits`, `editActiveDays`, `editChurnDays` | `handleClaimReward`, `handleSaveCustomerNote`, `handleSaveProgramSettings`, `handleSendWhatsApp`, `handleExportCSV` |
| **`Admin`** (`/admin`) [`Admin.jsx`](../src/pages/Admin.jsx) | `11` | **`menu`, `merchandise`, `carwash-packages`, `cashier-pay`, `discounts`, `categories`, `receipt-settings`, `license`, `calibration`, `manual-eod`** *(9 tab sekunder wajib aman!)* | `ReceiptCustomizer`, `CarwashPackageManager`, `MerchandiseManager`, `LicenseManager`, `MenuHppCalculator`, `BankEmailBindingModal`, `showMenuModal`, `showIngredientModal`, `showAccountModal`, `showCategoryModal`, `showBankEmailModal` | `nama_menu`, `harga`, `kategori`, `deskripsi`, `foto_url`, `is_bundling`, `is_active`, `id_bahan_baku`, `nama_bahan`, `stok`, `satuan`, `harga_satuan`, `pos`, `label`, `tipe`, `balance`, `keterangan`, `nama_kategori`, `jenis`, `tipe_arus`, `account_id`, `boleh_kasir`, `nama`, `nominal`, `newCashier`, `newPayment`, `manualEodDate` | `handleAddCashier`, `handleAddPayment`, `handleAddRecipeRow`, `handleCalibrateBalances`, `handleDeleteAccount`, `handleDeleteCarwashPackage`, `handleDeleteCategory`, `handleDeleteDiscount`, `handleDeleteIngredient`, `handleDeleteMenu`, `handleDeleteMerchandise`, `handleActivateLicenseKey` |

---

## D. Wave 3 — Multi-Outlet & Platform SaaS (`4` Rute)

| Halaman & Rute | Frame FigCraft | Tab / Mode Wajib | Section & Modal Wajib | Field Input / State & Tabel DB | Handler Kritis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Konsolidasi`** (`/konsolidasi`) [`Konsolidasi.jsx`](../src/pages/Konsolidasi.jsx) | `12` | — | `OnboardingWizardModal`, `showWizard` | `selectedPeriod`, `cloudOutletsSummary` (`fn_get_owner_consolidated_summary`) | `handleJumpToTenant`, `handleWizardCompleted` |
| **`Founder`** (`/founder`) [`Founder.jsx`](../src/pages/Founder.jsx) | `15` | — | `showCreateModal`, `beta_feedback` | `storeName`, `slug`, `ownerName`, `ownerEmail`, `telepon`, `alamat`, `tier`, `licenseDurationMonths`, `businessType` | `handleCreateNewTenant`, `handleToggleSubscription`, `handleConfirmRenewal`, `handleConfirmArchive`, `handleRestoreTenant`, `handleImpersonate`, `handleExportDatabaseSnapshot` |
| **`SuperAdmin`** (`/super-admin`) [`SuperAdmin.jsx`](../src/pages/SuperAdmin.jsx) | `15` | — | `showAddModal`, `showKeyModal` | `storeName`, `ownerName`, `ownerEmail`, `telepon`, `alamat`, `tier`, `durationMonths` | `handleCreateTenant`, `handleGenerateAndApplyKey`, `handleExecuteDelete`, `handleExecutePurge` |
| **`Database`** (`/database`) [`Database.jsx`](../src/pages/Database.jsx) | Tool Internal | — | `showFormModal`, `viewingRowJson` | `selectedTable`, `selectedMonth`, `searchQuery`, `formData` | `handleSubmitForm`, `handleDeleteRow`, `handleExportCSV`, `handleTableChange` |
