/**
 * pageFieldContracts.js - Phase 1.5 Master Field & Section Contract Registry
 *
 * Locks every route's mandatory tabs, modals/sections, form/DB fields, and critical handlers
 * so Phase 3-4 UI rebranding can replace JSX/styling without silently dropping any capability.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

  for (const section of contract.requiredSections || []) {
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
    requiredSections: ['showManualRegister', 'Google'],
    requiredFields: ['identifier', 'password', 'tenantSlug', 'regNama', 'regEmail', 'regPassword', 'regTenantName', 'regBusinessType'],
    requiredHandlers: ['handleLoginSubmit', 'handleRegisterSubmit', 'handleGoogleLogin', 'handleGoogleRegister']
  },
  {
    id: 'forgot-password',
    name: 'Forgot Password',
    route: '/forgot-password',
    file: 'src/pages/ForgotPassword.jsx',
    companionFiles: [],
    figcraftFrame: '02 (Auth Derivative)',
    requiredTabs: [],
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
    requiredSections: ['ROLE_FILTERS', 'CHAPTERS', '/login', 'window.print'],
    requiredFields: ['searchQuery', 'selectedRole'],
    requiredHandlers: []
  },

  // =========================================================================
  // WAVE 1: CORE REVENUE & OPERATIONS
  // =========================================================================
  {
    id: 'dashboard',
    name: 'Executive Cockpit Dashboard',
    route: '/dashboard',
    file: 'src/pages/Dashboard.jsx',
    companionFiles: [],
    figcraftFrame: '03',
    requiredTabs: ['ALL', 'CAFE', 'CARWASH'],
    requiredSections: [
      'AIPromptBuilderModal',
      'ExecutivePromptStudio',
      'ExpenseDetailModal',
      'OnboardingWizardModal',
      'InteractiveCalendar',
      'showAIPromptModal',
      'showCustomCalendar',
      'showExpenseModal'
    ],
    requiredFields: ['v_pocket_balances'],
    requiredHandlers: []
  },
  {
    id: 'pos',
    name: 'Hybrid POS Workstation (Cafe + Carwash + Merchandise)',
    route: '/pos',
    file: 'src/pages/pos/HybridPOSPage.jsx',
    companionFiles: ['src/pages/CafePOS.jsx', 'src/pages/pos/POSDispatcher.jsx'],
    figcraftFrame: '04A, 04B',
    requiredTabs: ['cafe', 'carwash', 'merchandise', 'pending', 'history', 'inventory', 'expense', 'exchange'],
    requiredSections: [
      'ThermalReceiptModal',
      'CustomerLoyaltyBanner',
      'VoidReasonModal',
      'ShiftClosingModal',
      'CrewDailyCommissionModal',
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
    ]
  },
  {
    id: 'queue',
    name: 'Carwash Live Kanban & QC Queue',
    route: '/queue',
    file: 'src/pages/CarwashQueue.jsx',
    companionFiles: [],
    figcraftFrame: '05',
    requiredTabs: ['Pending', 'Selesai', 'kanban', 'list'],
    requiredSections: ['qcModalItem', 'subscribeCarwashQueueRealtime'],
    requiredFields: ['bodyClean', 'interiorVacuum', 'glassClear', 'tireShine', 'selectedDate', 'searchQuery', 'filterType'],
    requiredHandlers: ['handleStartWashing', 'handleCompleteQc', 'handleSendWhatsAppNotification']
  },

  // =========================================================================
  // WAVE 2: BACK-OFFICE ERP & ACCOUNTING
  // =========================================================================
  {
    id: 'finance',
    name: 'Finance, Ledger & Bank Mandiri Mutation Inbox',
    route: '/finance',
    file: 'src/pages/Finance.jsx',
    companionFiles: [],
    figcraftFrame: '06',
    requiredTabs: ['cashflow', 'carwash', 'cafe', 'expenses', 'bank_inbox'],
    requiredSections: [
      'OwnerWithdrawalModal',
      'showExpenseModal',
      'showIncomeModal',
      'showTransferModal',
      'showWithdrawalModal',
      'showEditModal'
    ],
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
    requiredHandlers: [
      'handleSaveExpense',
      'handleSaveIncome',
      'handleSaveTransfer',
      'handleSaveEdit',
      'handleDeleteItem',
      'handleExportCSV'
    ]
  },
  {
    id: 'gudang',
    name: 'Gudang Multi-Unit, Restock, Opname & HPP',
    route: '/gudang',
    file: 'src/pages/Gudang.jsx',
    companionFiles: [],
    figcraftFrame: '07',
    requiredTabs: ['CAFE', 'CARWASH', 'MERCHANDISE'],
    requiredSections: ['showItemModal', 'showRestockModal', 'showOpnameModal', 'showHppCalculator', 'InventoryTable'],
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
    requiredHandlers: ['handleSaveItem', 'handleConfirmRestock', 'handleConfirmOpname', 'handleDeleteItem']
  },
  {
    id: 'reports',
    name: 'Laporan Keuangan & Buku Besar SAK EMKM',
    route: '/reports',
    file: 'src/pages/Reports.jsx',
    companionFiles: [],
    figcraftFrame: '08',
    requiredTabs: [],
    requiredSections: ['GeneralLedgerView', 'InteractiveCalendar', 'showCustomCalendar', 'print-area'],
    requiredFields: ['reportViewMode', 'timeRange', 'startDate', 'endDate'],
    requiredHandlers: []
  },
  {
    id: 'karyawan',
    name: 'Karyawan, Komisi Payroll & Co-Owner Invite',
    route: '/karyawan',
    file: 'src/pages/Karyawan.jsx',
    companionFiles: [],
    figcraftFrame: '09',
    requiredTabs: ['wages', 'crew', 'office', 'staff'],
    requiredSections: ['CoOwnerInviteCard', 'InteractiveCalendar', 'showPayModal', 'showWagesCalendar'],
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
    ]
  },
  {
    id: 'crm',
    name: 'CRM Kendaraan, Stamp Loyalty & WA Retention',
    route: '/crm',
    file: 'src/pages/CRM.jsx',
    companionFiles: [],
    figcraftFrame: '10',
    requiredTabs: ['ALL', 'VIP', 'LOYAL', 'NEED_ATTENTION', 'AT_RISK', 'NEW', 'REWARD_READY'],
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
    requiredHandlers: ['handleClaimReward', 'handleSaveCustomerNote', 'handleSaveProgramSettings', 'handleSendWhatsApp', 'handleExportCSV']
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
    requiredSections: [
      'ReceiptCustomizer',
      'CarwashPackageManager',
      'MerchandiseManager',
      'LicenseManager',
      'MenuHppCalculator',
      'BankEmailBindingModal',
      'showMenuModal',
      'showIngredientModal',
      'showAccountModal',
      'showCategoryModal',
      'showBankEmailModal'
    ],
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
      'handleAddRecipeRow',
      'handleCalibrateBalances',
      'handleDeleteAccount',
      'handleDeleteCarwashPackage',
      'handleDeleteCategory',
      'handleDeleteDiscount',
      'handleDeleteIngredient',
      'handleDeleteMenu',
      'handleDeleteMerchandise',
      'handleActivateLicenseKey'
    ]
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
    requiredSections: ['OnboardingWizardModal', 'showWizard'],
    requiredFields: ['selectedPeriod', 'cloudOutletsSummary'],
    requiredHandlers: ['handleJumpToTenant', 'handleWizardCompleted']
  },
  {
    id: 'founder',
    name: 'Solo Founder Platform Console',
    route: '/founder',
    file: 'src/pages/Founder.jsx',
    companionFiles: [],
    figcraftFrame: '15',
    requiredTabs: [],
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
    ]
  },
  {
    id: 'super-admin',
    name: 'SuperAdmin Tenant & License Provisioning',
    route: '/super-admin',
    file: 'src/pages/SuperAdmin.jsx',
    companionFiles: [],
    figcraftFrame: '15',
    requiredTabs: [],
    requiredSections: ['showAddModal', 'showKeyModal'],
    requiredFields: ['storeName', 'ownerName', 'ownerEmail', 'telepon', 'alamat', 'tier', 'durationMonths'],
    requiredHandlers: ['handleCreateTenant', 'handleGenerateAndApplyKey', 'handleExecuteDelete', 'handleExecutePurge']
  },
  {
    id: 'database',
    name: 'SuperAdmin Raw Database Explorer',
    route: '/database',
    file: 'src/pages/Database.jsx',
    companionFiles: [],
    figcraftFrame: 'Internal Platform Tool',
    requiredTabs: [],
    requiredSections: ['showFormModal', 'viewingRowJson'],
    requiredFields: ['selectedTable', 'selectedMonth', 'searchQuery', 'formData'],
    requiredHandlers: ['handleSubmitForm', 'handleDeleteRow', 'handleExportCSV', 'handleTableChange']
  }
]

export default PAGE_FIELD_CONTRACTS
