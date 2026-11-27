/**
 * pageFieldContracts.js - Phase 1.5 Master Field, Section, Modal & DB Parity Registry
 *
 * Locks every route's mandatory tabs, rendered JSX sub-components, section states,
 * JSX-bound fields, event-wired handlers, print invariants, and SQL column parity
 * so Phase 3-4 UI rebranding cannot silently drop or decouple any ERP capability.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Legacy string validator kept exported for lightweight callers; authoritative CI/Vitest gate
// uses validateContractWithAst in src/utils/astContractValidator.js.
export function validatePageContract(contract, combinedSource) {
  const source = String(combinedSource || '')
  const missingTabs = []
  const missingSections = []
  const missingFields = []
  const missingHandlers = []

  for (const tab of contract.requiredTabs || []) {
    const tabRe = new RegExp(`['"\`]${escapeRegExp(tab)}['"\`]`)
    if (!tabRe.test(source)) {
      missingTabs.push(tab)
    }
  }

  for (const section of [
    ...(contract.requiredRenderedComponents || []),
    ...(contract.requiredSections || [])
  ]) {
    if (!source.includes(section)) {
      missingSections.push(section)
    }
  }

  for (const field of contract.requiredFields || []) {
    const fieldRe = new RegExp(`\\b${escapeRegExp(field)}\\b`)
    if (!fieldRe.test(source)) {
      missingFields.push(field)
    }
  }

  for (const handler of contract.requiredHandlers || []) {
    const handlerRe = new RegExp(`\\b${escapeRegExp(handler)}\\b`)
    if (!handlerRe.test(source)) {
      missingHandlers.push(handler)
    }
  }

  const passed =
    missingTabs.length === 0 &&
    missingSections.length === 0 &&
    missingFields.length === 0 &&
    missingHandlers.length === 0

  return {
    passed,
    missingTabs,
    missingSections,
    missingFields,
    missingHandlers
  }
}

export const PAGE_FIELD_CONTRACTS = [
  // =========================================================================
  // AUTH & PUBLIC ROUTES
  // =========================================================================
  {
    id: 'login',
    name: 'Login & Self-Service Registration',
    route: '/login',
    file: 'src/pages/Login.jsx',
    companionFiles: [],
    figcraftFrame: '02',
    requiredTabs: ['login', 'register'],
    requiredRenderedComponents: ['GoogleIcon'],
    requiredSections: ['showManualRegister', 'loginWithGoogle'],
    requiredFields: [
      'identifier',
      'password',
      'tenantSlug',
      'regNama',
      'regEmail',
      'regPassword',
      'regTenantName',
      'regBusinessType'
    ],
    requiredHandlers: ['handleLoginSubmit', 'handleRegisterSubmit', 'handleGoogleLogin', 'handleGoogleRegister'],
    dbColumns: {
      tenants: ['nama', 'slug', 'business_type'],
      profiles: ['nama', 'email', 'role']
    }
  },
  {
    id: 'forgot-password',
    name: 'Forgot Password',
    route: '/forgot-password',
    file: 'src/pages/ForgotPassword.jsx',
    companionFiles: [],
    figcraftFrame: '02 (Auth Derivative)',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['/login'],
    requiredFields: ['email', 'submitted'],
    requiredHandlers: ['handleSubmit']
  },
  {
    id: 'reset-password',
    name: 'Reset Password',
    route: '/reset-password',
    file: 'src/pages/ResetPassword.jsx',
    companionFiles: [],
    figcraftFrame: '02 (Auth Derivative)',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['/login', '/forgot-password'],
    requiredFields: ['newPassword', 'confirmPassword', 'hasRecoverySession'],
    requiredHandlers: ['handleSubmit']
  },
  {
    id: 'landing',
    name: 'Public SaaS Landing Page',
    route: '/welcome',
    file: 'src/pages/LandingPage.jsx',
    companionFiles: [],
    figcraftFrame: '13',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['/login', '/login?mode=register', '/panduan', 'selectedScreenshotId', 'zoomedShot'],
    requiredFields: ['selectedScreenshotId', 'zoomedShot'],
    requiredHandlers: []
  },
  {
    id: 'user-manual',
    name: 'Interactive User Manual & SOP',
    route: '/panduan',
    file: 'src/pages/UserManualPage.jsx',
    companionFiles: [],
    figcraftFrame: '14',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['ROLE_FILTERS', 'CHAPTERS', '/login'],
    requiredFields: ['searchQuery', 'selectedRole'],
    requiredHandlers: [],
    requiredPrintContract: 'window.print'
  },

  // =========================================================================
  // WAVE 1: CORE REVENUE & OPERATIONS
  // =========================================================================
  {
    id: 'dashboard',
    name: 'Executive Cockpit Dashboard',
    route: '/dashboard',
    file: 'src/pages/Dashboard.jsx',
    companionFiles: ['src/hooks/domain/useExecutiveDashboard.js'],
    figcraftFrame: '03',
    requiredTabs: ['ALL', 'CAFE', 'CARWASH'],
    requiredRenderedComponents: [
      'AIPromptBuilderModal',
      'ExpenseDetailModal',
      'OnboardingWizardModal',
      'InteractiveCalendar'
    ],
    requiredSections: ['v_pocket_balances', 'showAIPromptModal', 'showCustomCalendar', 'showExpenseModal'],
    requiredFields: ['selectedExpenseDivision', 'startDate', 'endDate'],
    requiredHandlers: [],
    dbColumns: {
      pos_balances: ['tenant_id', 'branch_id', 'label', 'tipe', 'balance'],
      cafe: ['tenant_id', 'branch_id', 'tanggal', 'subtotal'],
      carwash: ['tenant_id', 'branch_id', 'tanggal', 'harga']
    }
  },
  {
    id: 'ai-studio',
    name: 'AI Data Studio & Canvas Workspace',
    route: '/ai-studio',
    file: 'src/pages/AIStudio.jsx',
    companionFiles: [],
    figcraftFrame: '03',
    requiredTabs: [],
    requiredRenderedComponents: ['ExecutivePromptStudio'],
    requiredSections: ['v_pocket_balances', 'targetCapacity'],
    requiredFields: [],
    requiredHandlers: ['fetchStudioData'],
    dbColumns: {
      pos_balances: ['tenant_id', 'branch_id', 'label', 'tipe', 'balance']
    }
  },
  {
    id: 'pos',
    name: 'Hybrid POS Workstation (Cafe + Carwash + Merchandise)',
    route: '/pos',
    file: 'src/pages/pos/HybridPOSPage.jsx',
    companionFiles: ['src/pages/CafePOS.jsx', 'src/pages/pos/POSDispatcher.jsx', 'src/hooks/domain/usePosWorkspace.js'],
    figcraftFrame: '04A, 04B',
    requiredTabs: ['cafe', 'carwash', 'merchandise', 'pending', 'history', 'inventory', 'expense', 'exchange'],
    requiredRenderedComponents: [
      'ThermalReceiptModal',
      'CustomerLoyaltyBanner',
      'VoidReasonModal',
      'ShiftClosingModal',
      'CrewDailyCommissionModal'
    ],
    requiredSections: [
      'showModalModal',
      'showShiftClosingModal',
      'showCrewCommissionModal',
      'showCashDrawerDetail',
      'showCashOpsMenu',
      'showMobileCart'
    ],
    requiredFields: [
      'kehadiran',
      'variant',
      'ukuran',
      'paket',
      'bay',
      'anggota1',
      'anggota2',
      'platNomor',
      'model',
      'noTelepon',
      'harga',
      'customHarga',
      'gaji_pencuci',
      'kondisi_bodi',
      'barang_berharga',
      'catatan_kendaraan',
      'tanggal',
      'keterangan',
      'nominal',
      'unit',
      'kategori',
      'karyawan',
      'karyawan_id',
      'category_id',
      'id_bahan_baku',
      'qty',
      'selectedCashier',
      'selectedPayment',
      'paymentStatus',
      'startingCapitalInput',
      'settleCashReceived',
      'splitCashAmount',
      'splitQrisAmount',
      'exchangeCash',
      'exchangeQris',
      'exchangeCustomer',
      'orderType',
      'tableOrQueueNumber',
      'activeNoteText'
    ],
    requiredHandlers: [
      'handleCheckout',
      'handleConfirmVoid',
      'handleCancelBill',
      'handleConfirmShiftClose',
      'handleSaveExchange',
      'handleSavePosExpense',
      'handleSaveStartingCapital',
      'handleSetItemNote',
      'handleOpenCrewCommissionModal'
    ],
    dbColumns: {
      struk: [
        'tenant_id',
        'branch_id',
        'id_struk',
        'tanggal',
        'kasir',
        'nama_pelanggan',
        'metode_bayar',
        'nominal_cash',
        'nominal_qris',
        'total_tagihan',
        'total_diskon',
        'uang_diterima',
        'status_bayar'
      ],
      carwash: [
        'tenant_id',
        'branch_id',
        'id_struk',
        'tanggal',
        'plat',
        'model',
        'ukuran',
        'variant',
        'paket',
        'no',
        'no_telepon',
        'anggota_1_id',
        'anggota_2_id',
        'harga',
        'gaji_anggota',
        'status'
      ],
      cafe: ['tenant_id', 'branch_id', 'id_struk', 'tanggal', 'nama_menu', 'qty', 'harga_satuan', 'subtotal'],
      pengeluaran: ['tenant_id', 'branch_id', 'tanggal', 'jenis', 'kategori', 'nama_pengeluaran', 'nominal', 'id_bahan_baku', 'qty']
    }
  },
  {
    id: 'queue',
    name: 'Carwash Live Kanban & QC Queue',
    route: '/queue',
    file: 'src/pages/CarwashQueue.jsx',
    companionFiles: ['src/hooks/domain/useCarwashQueue.js'],
    figcraftFrame: '05',
    requiredTabs: ['Pending', 'Selesai', 'kanban', 'list'],
    requiredRenderedComponents: [],
    requiredSections: ['qcModalItem', 'subscribeCarwashQueueRealtime'],
    requiredFields: ['bodyClean', 'interiorVacuum', 'glassClear', 'tireShine', 'selectedDate', 'searchQuery', 'filterType'],
    requiredHandlers: ['handleStartWashing', 'handleCompleteQc', 'handleSendWhatsAppNotification'],
    dbColumns: {
      carwash: ['tenant_id', 'branch_id', 'tanggal', 'plat', 'model', 'paket', 'no', 'no_telepon', 'status']
    }
  },

  // =========================================================================
  // WAVE 2: BACK-OFFICE ERP & ACCOUNTING
  // =========================================================================
  {
    id: 'finance',
    name: 'Finance, Ledger & Bank Mandiri Mutation Inbox',
    route: '/finance',
    file: 'src/pages/Finance.jsx',
    companionFiles: ['src/hooks/domain/useFinanceLedger.js'],
    figcraftFrame: '06',
    requiredTabs: ['cashflow', 'carwash', 'cafe', 'expenses', 'bank_inbox'],
    requiredRenderedComponents: ['OwnerWithdrawalModal', 'BankMutationInboxTab'],
    requiredSections: ['showExpenseModal', 'showIncomeModal', 'showTransferModal', 'showWithdrawalModal', 'showEditModal'],
    requiredFields: [
      'tanggal',
      'jenis',
      'kategori',
      'pos',
      'keterangan',
      'total_harga',
      'karyawan',
      'karyawan_id',
      'nominal',
      'pos_asal',
      'pos_tujuan',
      'pemasukan',
      'pengeluaran',
      'metode_bayar',
      'status'
    ],
    requiredHandlers: ['handleSaveExpense', 'handleSaveIncome', 'handleSaveTransfer', 'handleSaveEdit', 'handleDeleteItem', 'handleExportCSV'],
    dbColumns: {
      cashflow: [
        'tenant_id',
        'branch_id',
        'tanggal',
        'jenis',
        'kategori',
        'keterangan_transaksi',
        'pos',
        'pocket_id',
        'pemasukan',
        'pengeluaran',
        'karyawan_id'
      ],
      pengeluaran: ['tenant_id', 'branch_id', 'tanggal', 'jenis', 'kategori', 'nama_pengeluaran', 'nominal', 'karyawan_id']
    }
  },
  {
    id: 'gudang',
    name: 'Gudang Multi-Unit, Restock, Opname & HPP',
    route: '/gudang',
    file: 'src/pages/Gudang.jsx',
    companionFiles: ['src/hooks/domain/useWarehouseInventory.js'],
    figcraftFrame: '07',
    requiredTabs: ['CAFE', 'CARWASH', 'MERCHANDISE'],
    requiredRenderedComponents: ['InventoryTable'],
    requiredSections: ['showItemModal', 'showRestockModal', 'showOpnameModal', 'showHppCalculator'],
    requiredFields: [
      'id_barang',
      'nama_barang',
      'kategori',
      'satuan',
      'harga_beli',
      'harga_jual',
      'min_stok',
      'gudang',
      'totalBeli',
      'jumlahQty',
      'satuanBeli',
      'isiPerKemasan',
      'satuanPemakaian',
      'restockQty',
      'restockCost',
      'opnameRealQty',
      'opnameCatatan'
    ],
    requiredHandlers: ['handleSaveItem', 'handleConfirmRestock', 'handleConfirmOpname', 'handleDeleteItem'],
    dbColumns: {
      stok_barang: ['tenant_id', 'branch_id', 'nama_produk', 'stok', 'min_stok', 'satuan', 'harga_beli', 'harga_satuan'],
      barang_keluar: ['tenant_id', 'branch_id', 'id_bahan_baku', 'nama_bahan_baku', 'jumlah_keluar', 'biaya_satuan', 'total_biaya', 'alasan']
    }
  },
  {
    id: 'reports',
    name: 'Laporan Keuangan & Buku Besar SAK EMKM',
    route: '/reports',
    file: 'src/pages/Reports.jsx',
    companionFiles: [],
    figcraftFrame: '08',
    requiredTabs: [],
    requiredRenderedComponents: ['GeneralLedgerView', 'InteractiveCalendar'],
    requiredSections: ['showCustomCalendar', 'print-area'],
    requiredFields: ['reportViewMode', 'timeRange', 'startDate', 'endDate'],
    requiredHandlers: [],
    requiredPrintContract: 'print-area'
  },
  {
    id: 'karyawan',
    name: 'Karyawan, Komisi Payroll & Co-Owner Invite',
    route: '/karyawan',
    file: 'src/pages/Karyawan.jsx',
    companionFiles: ['src/hooks/domain/useStaffDirectory.js'],
    figcraftFrame: '09',
    requiredTabs: ['wages', 'crew', 'office', 'staff'],
    requiredRenderedComponents: ['CoOwnerInviteCard', 'InteractiveCalendar'],
    requiredSections: ['showPayModal', 'showWagesCalendar'],
    requiredFields: [
      'workerId',
      'workerName',
      'calculatedOutstanding',
      'amountToPay',
      'fundSource',
      'note',
      'email',
      'password',
      'nama',
      'role',
      'branchId',
      'newKaryawanCuci',
      'newKaryawanKantor',
      'wagesStartDate',
      'wagesEndDate'
    ],
    requiredHandlers: [
      'handleAddKaryawanCuci',
      'handleAddKaryawanKantor',
      'handleProcessWagePayment',
      'handleRegisterStaff',
      'handleChangeStaffRole',
      'handleToggleStaffStatus'
    ],
    dbColumns: {
      profiles: ['tenant_id', 'branch_id', 'nama', 'email', 'role', 'is_active'],
      tenant_invitations: ['tenant_id', 'email', 'role', 'status', 'expires_at']
    }
  },
  {
    id: 'crm',
    name: 'CRM Kendaraan, Stamp Loyalty & WA Retention',
    route: '/crm',
    file: 'src/pages/CRM.jsx',
    companionFiles: [],
    figcraftFrame: '10',
    requiredTabs: ['ALL', 'VIP', 'LOYAL', 'NEED_ATTENTION', 'AT_RISK', 'NEW', 'REWARD_READY'],
    requiredRenderedComponents: [],
    requiredSections: ['showProgramConfigModal', 'configModalTab'],
    requiredFields: [
      'searchQuery',
      'filterSegment',
      'preferenceNoteInput',
      'customerNameInput',
      'whatsappInput',
      'customMessageBody',
      'editTargetStamps',
      'editRewardType',
      'editRewardTitle',
      'editRewardDescription',
      'editVipMinVisits',
      'editVipMinSpent',
      'editLoyalMinVisits',
      'editActiveDays',
      'editChurnDays'
    ],
    requiredHandlers: ['handleClaimReward', 'handleSaveCustomerNote', 'handleSaveProgramSettings', 'handleSendWhatsApp', 'handleExportCSV'],
    dbColumns: {
      crm_loyalty_programs: [
        'vip_min_visits',
        'vip_min_spent',
        'loyal_min_visits',
        'active_days_threshold',
        'churn_days_threshold',
        'vip_retention_mode'
      ]
    }
  },
  {
    id: 'admin',
    name: 'Admin Master Data, BOM, Bank Sync & Struk 58mm',
    route: '/admin',
    file: 'src/pages/Admin.jsx',
    companionFiles: [],
    figcraftFrame: '11',
    requiredTabs: [
      'menu',
      'merchandise',
      'carwash-packages',
      'cashier-pay',
      'discounts',
      'categories',
      'receipt-settings',
      'license',
      'calibration',
      'manual-eod'
    ],
    requiredRenderedComponents: [
      'ReceiptCustomizer',
      'CarwashPackageManager',
      'MerchandiseManager',
      'LicenseManager',
      'MenuHppCalculator',
      'BankEmailBindingModal'
    ],
    requiredSections: ['showMenuModal', 'showIngredientModal', 'showAccountModal', 'showCategoryModal', 'showBankEmailModal'],
    requiredFields: [
      'nama_menu',
      'harga',
      'kategori',
      'deskripsi',
      'foto_url',
      'is_bundling',
      'is_active',
      'id_bahan_baku',
      'nama_bahan',
      'stok',
      'satuan',
      'harga_satuan',
      'pos',
      'label',
      'tipe',
      'balance',
      'keterangan',
      'nama_kategori',
      'jenis',
      'tipe_arus',
      'account_id',
      'boleh_kasir',
      'nama',
      'nominal',
      'newCashier',
      'newPayment',
      'manualEodDate'
    ],
    requiredHandlers: [
      'handleAddCashier',
      'handleAddPayment',
      'handleSaveMenu',
      'handleDeleteMenu',
      'handleSaveIngredient',
      'handleUpdateIngredient',
      'handleSimpanOpname',
      'handleAddRecipeRow',
      'handleSaveCarwashPackage',
      'handleDeleteCarwashPackage',
      'handleSaveMerchandise',
      'handleDeleteMerchandise',
      'handleSaveAccount',
      'handleDeleteAccount',
      'handleSaveCategory',
      'handleDeleteCategory',
      'handleSaveDiscount',
      'handleDeleteDiscount',
      'handleCalibrateBalances',
      'handleActivateLicenseKey',
      'handleExecuteManualEod'
    ],
    dbColumns: {
      daftar_harga_menu: ['tenant_id', 'branch_id', 'daftar_menu', 'kategori', 'harga', 'deskripsi', 'is_bundling', 'is_active'],
      resep: ['tenant_id', 'id_menu', 'carwash_package_id', 'id_bahan_baku', 'nama_menu', 'nama_bahan', 'jumlah', 'satuan'],
      master_categories: ['tenant_id', 'nama_kategori', 'jenis', 'tipe_arus', 'account_id', 'boleh_kasir', 'is_active'],
      pos_balances: ['tenant_id', 'branch_id', 'pos', 'label', 'tipe', 'balance', 'keterangan', 'account_id', 'is_active']
    }
  },

  // =========================================================================
  // WAVE 3: MULTI-OUTLET & PLATFORM ADMINISTRATION
  // =========================================================================
  {
    id: 'konsolidasi',
    name: 'Konsolidasi Multi-Outlet & Matriks Cabang',
    route: '/konsolidasi',
    file: 'src/pages/Konsolidasi.jsx',
    companionFiles: [],
    figcraftFrame: '12',
    requiredTabs: [],
    requiredRenderedComponents: ['OnboardingWizardModal'],
    requiredSections: ['showWizard'],
    requiredFields: ['selectedPeriod', 'cloudOutletsSummary'],
    requiredHandlers: ['handleJumpToTenant', 'handleWizardCompleted'],
    dbColumns: {
      branches: ['tenant_id', 'nama', 'kode', 'alamat', 'telepon', 'is_main', 'is_active']
    }
  },
  {
    id: 'founder',
    name: 'Solo Founder Platform Console',
    route: '/founder',
    file: 'src/pages/Founder.jsx',
    companionFiles: [],
    figcraftFrame: '15',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['showCreateModal', 'beta_feedback'],
    requiredFields: ['storeName', 'slug', 'ownerName', 'ownerEmail', 'telepon', 'alamat', 'tier', 'licenseDurationMonths', 'businessType'],
    requiredHandlers: [
      'handleCreateNewTenant',
      'handleToggleSubscription',
      'handleConfirmRenewal',
      'handleConfirmArchive',
      'handleRestoreTenant',
      'handleImpersonate',
      'handleExportDatabaseSnapshot'
    ],
    dbColumns: {
      tenants: ['nama', 'slug', 'business_type', 'plan', 'status'],
      beta_feedback: ['tenant_id', 'user_id', 'category', 'rating', 'message', 'page_path', 'status']
    }
  },
  {
    id: 'super-admin',
    name: 'SuperAdmin Tenant & License Provisioning',
    route: '/super-admin',
    file: 'src/pages/SuperAdmin.jsx',
    companionFiles: [],
    figcraftFrame: '15',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['showAddModal', 'showKeyModal'],
    requiredFields: ['storeName', 'ownerName', 'ownerEmail', 'telepon', 'alamat', 'tier', 'durationMonths'],
    requiredHandlers: ['handleCreateTenant', 'handleGenerateAndApplyKey', 'handleExecuteDelete', 'handleExecutePurge'],
    dbColumns: {
      license_keys: ['key_code', 'tier', 'duration_days', 'max_branches', 'max_users', 'is_used', 'is_revoked']
    }
  },
  {
    id: 'database',
    name: 'SuperAdmin Raw Database Explorer',
    route: '/database',
    file: 'src/pages/Database.jsx',
    companionFiles: [],
    figcraftFrame: 'Internal Platform Tool',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['showFormModal', 'viewingRowJson'],
    requiredFields: ['selectedTable', 'selectedMonth', 'searchQuery', 'formData'],
    requiredHandlers: ['handleSubmitForm', 'handleDeleteRow', 'handleExportCSV', 'handleTableChange']
  }
]

// ===========================================================================
// 22 CRITICAL INTERACTIVE SUBCOMPONENTS & MODALS
// ===========================================================================
export const SUBCOMPONENT_FIELD_CONTRACTS = [
  {
    id: 'sub-admin-bank-binding',
    parentPage: 'admin',
    name: 'BankEmailBindingModal',
    file: 'src/components/admin/BankEmailBindingModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['bank_email_connections', 'bank_account_bindings'],
    requiredFields: [
      'newEmail',
      'bindingForm',
      'connection_id',
      'pocket_id',
      'account_last4',
      'account_holder_name',
      'import_start_date',
      'is_default_for_last4'
    ],
    requiredHandlers: ['handleAddConnection', 'handleDeleteConnection', 'handleAddBinding', 'handleDeleteBinding', 'onClose'],
    dbColumns: {
      bank_email_connections: ['tenant_id', 'email_address', 'normalized_email', 'provider', 'status'],
      bank_account_bindings: [
        'tenant_id',
        'connection_id',
        'pocket_id',
        'bank_code',
        'account_last4',
        'account_label_hint',
        'import_start_date',
        'is_default_for_last4',
        'is_active'
      ]
    }
  },
  {
    id: 'sub-admin-carwash-package',
    parentPage: 'admin',
    name: 'CarwashPackageManager',
    file: 'src/components/admin/CarwashPackageManager.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isModalOpen'],
    requiredFields: ['formData', 'nama_paket', 'tarif', 'keterangan', 'komisi_value', 'resepList'],
    requiredHandlers: ['handleSubmit', 'handlePriceChange', 'handleAddResepRow', 'handleRemoveResepRow', 'handleResepChange', 'onDeletePackage'],
    dbColumns: {
      carwash_packages: ['tenant_id', 'branch_id', 'name', 'description', 'price', 'tarif_matrix', 'is_active']
    }
  },
  {
    id: 'sub-admin-license-manager',
    parentPage: 'admin',
    name: 'LicenseManager',
    file: 'src/components/admin/LicenseManager.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['licenseData', 'currentPlan'],
    requiredFields: ['inputKey'],
    requiredHandlers: ['handleKeySubmit', 'handleCopyBank'],
    dbColumns: {
      license_keys: ['key_code', 'tier', 'duration_days', 'is_used']
    }
  },
  {
    id: 'sub-admin-menu-hpp',
    parentPage: 'admin',
    name: 'MenuHppCalculator',
    file: 'src/components/admin/MenuHppCalculator.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['calcMode', 'recipeHppData'],
    requiredFields: ['calcMode', 'invoiceQty', 'invoiceTotal', 'overheadCost', 'packagingCost', 'targetMargin'],
    requiredHandlers: ['onApplyPrice']
  },
  {
    id: 'sub-admin-merchandise-manager',
    parentPage: 'admin',
    name: 'MerchandiseManager',
    file: 'src/components/admin/MerchandiseManager.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isModalOpen'],
    requiredFields: ['formData', 'nama_barang', 'kategori', 'harga_beli', 'harga_jual', 'stok', 'min_stok', 'satuan', 'foto_url', 'searchQuery', 'selectedCategory'],
    requiredHandlers: ['handleSubmit', 'onDeleteMerchandise', 'onToggleActive'],
    dbColumns: {
      stok_barang: ['tenant_id', 'branch_id', 'nama_produk', 'stok', 'min_stok', 'satuan', 'harga_beli', 'harga_satuan']
    }
  },
  {
    id: 'sub-admin-receipt-customizer',
    parentPage: 'admin',
    name: 'ReceiptCustomizer',
    file: 'src/components/admin/ReceiptCustomizer.jsx',
    requiredTabs: ['hardware', 'closing', 'store', 'titles', 'paper', 'all', 'ORDER', 'PAYMENT'],
    requiredRenderedComponents: [],
    requiredSections: ['activeSubSection', 'fn_update_tenant_receipt_config'],
    requiredFields: [
      'storeName',
      'storeTagline',
      'storeAddress',
      'storePhone',
      'storeSocial',
      'showStoreAddress',
      'showStorePhone',
      'orderReceiptTitle',
      'orderReceiptSubtitle',
      'orderDisclaimer',
      'paymentReceiptTitle',
      'paymentReceiptSubtitle',
      'paymentDisclaimer'
    ],
    requiredHandlers: ['handleChange', 'handleSave', 'handleReset', 'handleTestPrint', 'handleBluetoothTestPrint'],
    requiredPrintContract: 'window.print',
    dbColumns: {
      tenants: ['receipt_config']
    }
  },
  {
    id: 'sub-auth-activate-license',
    parentPage: 'app-shell',
    name: 'ActivateLicenseModal',
    file: 'src/components/auth/ActivateLicenseModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOpen'],
    requiredFields: ['serialKey'],
    requiredHandlers: ['handleActivate', 'onClose']
  },
  {
    id: 'sub-auth-change-password',
    parentPage: 'app-shell',
    name: 'ChangePasswordModal',
    file: 'src/components/auth/ChangePasswordModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOpen'],
    requiredFields: ['currentPassword', 'newPassword', 'confirmPassword'],
    requiredHandlers: ['handleSubmit', 'onClose']
  },
  {
    id: 'sub-auth-license-lockout',
    parentPage: 'app-shell',
    name: 'LicenseExpiredLockout',
    file: 'src/components/auth/LicenseExpiredLockout.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOwner'],
    requiredFields: ['serialKey'],
    requiredHandlers: ['handleActivate']
  },
  {
    id: 'sub-auth-onboarding-wizard',
    parentPage: 'konsolidasi',
    name: 'OnboardingWizardModal',
    file: 'src/components/auth/OnboardingWizardModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['fn_complete_store_setup', 'fn_create_owner_outlet', 'currentStep'],
    requiredFields: [
      'businessModel',
      'ownerName',
      'storeName',
      'storeAddress',
      'storePhone',
      'cashierName',
      'cashierUsername',
      'cashierPin',
      'printerWidth'
    ],
    requiredHandlers: ['handleNext', 'handleBack', 'handleSubmit', 'handleSkipGuidedSetup'],
    dbColumns: {
      tenants: ['nama', 'business_type', 'onboarding_completed']
    }
  },
  {
    id: 'sub-dashboard-ai-prompt',
    parentPage: 'dashboard',
    name: 'AIPromptBuilderModal',
    file: 'src/components/dashboard/AIPromptBuilderModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['filteredPresets', 'selectedPreset'],
    requiredFields: ['activeTab', 'selectedPreset', 'customQuestion'],
    requiredHandlers: ['handleCopyJSON', 'handleCopyMarkdown', 'handleDownloadJSON', 'onClose']
  },
  {
    id: 'sub-dashboard-executive-studio',
    parentPage: 'ai-studio',
    name: 'ExecutivePromptStudio',
    file: 'src/components/dashboard/ExecutivePromptStudio.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['selectedBlockIds', 'periodPreset'],
    requiredFields: [
      'activeTab',
      'customStartDate',
      'customEndDate',
      'customHistStartDate',
      'customHistEndDate',
      'enableHistorical',
      'includeFeedback',
      'customInstruction'
    ],
    requiredHandlers: ['handleCopyDataOnly', 'handleCopyFullPrompt', 'handleCopyPresetPrompt', 'handleCopyJson', 'handleDownloadJson']
  },
  {
    id: 'sub-dashboard-expense-detail',
    parentPage: 'dashboard',
    name: 'ExpenseDetailModal',
    file: 'src/components/dashboard/ExpenseDetailModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOpen', 'activeItems'],
    requiredFields: ['searchTerm', 'selectedCategory'],
    requiredHandlers: ['handleExportCSV', 'onClose']
  },
  {
    id: 'sub-finance-bank-inbox',
    parentPage: 'finance',
    name: 'BankMutationInboxTab',
    file: 'src/components/finance/BankMutationInboxTab.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['showImportModal', 'fn_ingest_mandiri_normalized_tx', 'fn_post_bank_transaction_draft'],
    requiredFields: [
      'simConnectionId',
      'simLast4',
      'simSender',
      'simSubject',
      'simHtml',
      'action',
      'pocket_id',
      'target_pocket_id',
      'existing_cashflow_id',
      'kategori',
      'keterangan',
      'ignore_reason'
    ],
    requiredHandlers: ['handleIngestEmail', 'handlePostDraft'],
    dbColumns: {
      bank_transaction_drafts: [
        'tenant_id',
        'branch_id',
        'connection_id',
        'binding_id',
        'pocket_id',
        'book_date',
        'direction',
        'principal_amount',
        'suggested_jenis',
        'suggested_kategori',
        'review_status',
        'posting_action',
        'ignore_reason'
      ]
    }
  },
  {
    id: 'sub-finance-owner-withdrawal',
    parentPage: 'finance',
    name: 'OwnerWithdrawalModal',
    file: 'src/components/finance/OwnerWithdrawalModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOpen', 'activePockets'],
    requiredFields: ['sumberDana', 'nominal', 'keterangan'],
    requiredHandlers: ['handleWithdraw', 'onClose'],
    dbColumns: {
      cashflow: ['tenant_id', 'branch_id', 'tanggal', 'jenis', 'kategori', 'keterangan_transaksi', 'pos', 'pocket_id', 'pengeluaran']
    }
  },
  {
    id: 'sub-karyawan-coowner-invite',
    parentPage: 'karyawan',
    name: 'CoOwnerInviteCard',
    file: 'src/components/karyawan/CoOwnerInviteCard.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['invitations'],
    requiredFields: ['email'],
    requiredHandlers: ['handleInviteSubmit', 'handleCopyInvite', 'handleRevoke'],
    dbColumns: {
      tenant_invitations: ['tenant_id', 'email', 'role', 'status', 'expires_at']
    }
  },
  {
    id: 'sub-pos-crew-commission',
    parentPage: 'pos',
    name: 'CrewDailyCommissionModal',
    file: 'src/components/pos/CrewDailyCommissionModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOpen', 'crewSummaries'],
    requiredFields: ['crewSummaries'],
    requiredHandlers: ['handlePrintMiniSlip', 'onClose'],
    requiredPrintContract: 'window.print'
  },
  {
    id: 'sub-pos-merchandise-catalog',
    parentPage: 'pos',
    name: 'MerchandiseCatalog',
    file: 'src/components/pos/MerchandiseCatalog.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['displayItems'],
    requiredFields: ['searchQuery', 'selectedCategory'],
    requiredHandlers: ['onAddToCart', 'onUpdateQty']
  },
  {
    id: 'sub-pos-shift-closing',
    parentPage: 'pos',
    name: 'ShiftClosingModal',
    file: 'src/components/pos/ShiftClosingModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['expectedDrawerCash', 'isSuccessClosed'],
    requiredFields: ['physicalCash', 'notes'],
    requiredHandlers: ['handleProcessClosing', 'handleSendToWhatsApp', 'onClose'],
    dbColumns: {
      cashier_shift_closings: [
        'tenant_id',
        'branch_id',
        'tanggal',
        'kasir',
        'modal_awal',
        'penjualan_tunai',
        'penjualan_digital',
        'pengeluaran_kasir',
        'tukar_uang_keluar',
        'ekspektasi_kas',
        'kas_fisik',
        'selisih',
        'catatan'
      ]
    }
  },
  {
    id: 'sub-pos-thermal-receipt',
    parentPage: 'pos',
    name: 'ThermalReceiptModal',
    file: 'src/components/pos/ThermalReceiptModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['receiptData', 'showKitchenSlip'],
    requiredFields: ['phoneInput'],
    requiredHandlers: ['handlePrint', 'handleBluetoothPrint', 'handleCopyText', 'handleSendWhatsApp', 'onClose'],
    requiredPrintContract: 'thermal-receipt-print-wrapper'
  },
  {
    id: 'sub-pos-void-reason',
    parentPage: 'pos',
    name: 'VoidReasonModal',
    file: 'src/components/pos/VoidReasonModal.jsx',
    requiredTabs: [],
    requiredRenderedComponents: [],
    requiredSections: ['isOpen'],
    requiredFields: ['selectedPreset', 'customReason'],
    requiredHandlers: ['handleSelectPreset', 'handleSubmit', 'onClose']
  },
  {
    id: 'sub-reports-general-ledger',
    parentPage: 'reports',
    name: 'GeneralLedgerView',
    file: 'src/components/reports/GeneralLedgerView.jsx',
    requiredTabs: ['trial_balance', 'balance_sheet', 'income_statement', 'ledger_drilldown'],
    requiredRenderedComponents: [],
    requiredSections: ['showTransModal', 'showDrilldownModal', 'trialBalance', 'incomeStatement', 'balanceSheet'],
    requiredFields: ['activeGlTab', 'searchTerm', 'selectedAccountId', 'transForm', 'tanggal', 'tipe', 'kategori', 'pos', 'nominal', 'keterangan'],
    requiredHandlers: ['handleOpenDrilldown', 'handleSaveTransaction', 'handleDeleteTransaction'],
    dbColumns: {
      journal_entries: ['tenant_id', 'branch_id', 'entry_no', 'date', 'memo', 'status', 'total_amount'],
      journal_entry_lines: ['tenant_id', 'journal_entry_id', 'account_id', 'debit', 'credit', 'memo'],
      chart_of_accounts: ['tenant_id', 'kode_akun', 'nama_akun', 'tipe', 'kategori', 'saldo_normal', 'saldo_awal']
    }
  }
]

export default PAGE_FIELD_CONTRACTS
