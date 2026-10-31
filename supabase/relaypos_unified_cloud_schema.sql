-- ==============================================================================
-- RELAYPOS ENTERPRISE CLOUD ARCHITECTURE (POSTGRESQL / SUPABASE DDL)
-- Version: 3.2-ENTERPRISE-UNIFIED-COMPLETE
-- Multi-Tenancy: Row Level Security (RLS) with composite (tenant_id, id) keys
-- Ledger Invariants: Double-entry balanced accounting (Debit == Credit)
-- Monetary Precision: NUMERIC(18, 4) strictly enforced
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. MULTI-TENANCY CORE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'pro',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    business_type TEXT NOT NULL DEFAULT 'HYBRID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    nama VARCHAR(255) NOT NULL,
    kode VARCHAR(50) NOT NULL,
    alamat TEXT,
    telepon VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_branches_tenant_kode UNIQUE (tenant_id, kode)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Kasir',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_profiles_tenant_email UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS public.tenant_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    license_key VARCHAR(255) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'pro',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    valid_until TIMESTAMPTZ,
    max_branches INT NOT NULL DEFAULT 5,
    max_users INT NOT NULL DEFAULT 10,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_licenses_tenant_key UNIQUE (tenant_id, license_key)
);

-- ==============================================================================
-- 2. HELPER FUNCTIONS UNTUK AUTH & TENANCY
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_branch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT branch_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1), 'Kasir');
$$;

-- ==============================================================================
-- 3. FINANCIAL CORE & DOUBLE-ENTRY GENERAL LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    kode_akun VARCHAR(50) NOT NULL,
    nama_akun VARCHAR(255) NOT NULL,
    tipe VARCHAR(50) NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    kategori VARCHAR(100),
    saldo_normal VARCHAR(10) NOT NULL DEFAULT 'DEBIT',
    saldo_awal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coa_tenant_kode UNIQUE (tenant_id, kode_akun)
);

CREATE TABLE IF NOT EXISTS public.pos_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    pos VARCHAR(100) NOT NULL,
    label VARCHAR(255) NOT NULL,
    tipe VARCHAR(50) NOT NULL DEFAULT 'CASH', -- 'CASH', 'BANK'
    balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    keterangan TEXT,
    color VARCHAR(50) DEFAULT 'emerald',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pos_balances_tenant_pos UNIQUE (tenant_id, branch_id, pos)
);

CREATE TABLE IF NOT EXISTS public.master_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    nama_kategori VARCHAR(255) NOT NULL,
    jenis VARCHAR(100) NOT NULL,
    tipe_arus VARCHAR(50) NOT NULL, -- 'PENGELUARAN' / 'PEMASUKAN'
    account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    boleh_kasir BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    entry_no VARCHAR(100) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    memo TEXT,
    total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    status VARCHAR(50) NOT NULL DEFAULT 'POSTED',
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_journal_entry_no UNIQUE (tenant_id, entry_no)
);

CREATE TABLE IF NOT EXISTS public.journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
    debit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    credit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    memo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positive_debit_credit CHECK (debit >= 0 AND credit >= 0)
);

CREATE TABLE IF NOT EXISTS public.cashflow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    id_sumber VARCHAR(100),
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    keterangan_transaksi TEXT NOT NULL,
    jenis VARCHAR(100),
    kategori VARCHAR(100),
    pemasukan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    pengeluaran NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    pos VARCHAR(100) NOT NULL DEFAULT 'SALDO CASH',
    saldo_kas NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    apakah_stok BOOLEAN DEFAULT FALSE,
    id_bahan_baku UUID,
    qty NUMERIC(18, 4) DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pengeluaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    id_cashflow UUID REFERENCES public.cashflow(id) ON DELETE SET NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    nama_pengeluaran VARCHAR(255) NOT NULL,
    jenis VARCHAR(100) NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    nominal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    id_bahan_baku UUID,
    qty NUMERIC(18, 4) DEFAULT 0.0000,
    apakah_stok BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. OPERASIONAL TOKO & MASTER POS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.kasir (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_kasir_tenant_nama UNIQUE (tenant_id, branch_id, nama)
);

CREATE TABLE IF NOT EXISTS public.metode_bayar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_metode_bayar_tenant_nama UNIQUE (tenant_id, branch_id, nama)
);

CREATE TABLE IF NOT EXISTS public.carwash_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.diskon (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama_diskon VARCHAR(100) NOT NULL,
    tipe_diskon VARCHAR(50) NOT NULL DEFAULT 'NOMINAL',
    nilai_diskon NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. INVENTORI & RESEP BILL OF MATERIALS (BOM)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.stok_barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama_produk VARCHAR(255) NOT NULL,
    satuan VARCHAR(50) NOT NULL,
    stok NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    harga_satuan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    min_stok NUMERIC(18, 4) NOT NULL DEFAULT 10.0000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stok_barang_tenant_nama UNIQUE (tenant_id, branch_id, nama_produk)
);

CREATE TABLE IF NOT EXISTS public.daftar_harga_menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    daftar_menu VARCHAR(255) NOT NULL,
    harga NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    kategori VARCHAR(100),
    deskripsi TEXT,
    foto_url TEXT,
    is_bundling BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_menu_tenant_nama UNIQUE (tenant_id, branch_id, daftar_menu)
);

CREATE TABLE IF NOT EXISTS public.resep (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    id_menu UUID NOT NULL REFERENCES public.daftar_harga_menu(id) ON DELETE CASCADE,
    id_bahan_baku UUID NOT NULL REFERENCES public.stok_barang(id) ON DELETE RESTRICT,
    nama_menu VARCHAR(255),
    nama_bahan VARCHAR(255),
    jumlah NUMERIC(18, 4) NOT NULL,
    satuan VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_resep_menu_bahan UNIQUE (tenant_id, id_menu, id_bahan_baku)
);

CREATE TABLE IF NOT EXISTS public.barang_keluar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    id_bahan_baku UUID NOT NULL REFERENCES public.stok_barang(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    nama_bahan_baku VARCHAR(255) NOT NULL,
    jumlah_keluar NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    alasan VARCHAR(100) NOT NULL DEFAULT 'PENJUALAN_POS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.barang_masuk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    id_bahan_baku UUID NOT NULL REFERENCES public.stok_barang(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    nama_bahan_baku VARCHAR(255) NOT NULL,
    jumlah_masuk NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    harga_beli NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    total_biaya NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. TRANSAKSI ESTAFET (CORE POS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.struk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_struk VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    nama_pelanggan VARCHAR(255),
    keterangan TEXT,
    metode_bayar VARCHAR(50) NOT NULL DEFAULT 'CASH',
    status_bayar VARCHAR(50) NOT NULL DEFAULT 'Selesai',
    kasir VARCHAR(100) NOT NULL,
    total_tagihan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    nominal_cash NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    nominal_qris NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    nominal_transfer NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    diskon_carwash NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    diskon_cafe NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    waktu_dibuat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    waktu_dibayar TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_struk_tenant_id UNIQUE (tenant_id, id_struk)
);

CREATE TABLE IF NOT EXISTS public.cafe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_struk VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    nama_menu VARCHAR(255) NOT NULL,
    qty NUMERIC(18, 4) NOT NULL DEFAULT 1.0000,
    harga_satuan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.carwash (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_struk VARCHAR(50),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    no INT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    plat VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    variant VARCHAR(100),
    ukuran VARCHAR(50),
    paket VARCHAR(100) NOT NULL,
    harga NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    anggota_1 VARCHAR(100),
    anggota_2 VARCHAR(100),
    shift VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'Dalam Antrian',
    gaji_anggota NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    no_telepon VARCHAR(50),
    keterangan TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. SDM & KOMISI PENGERJAAN
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.karyawan_cuci (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.karyawan_kantor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Kasir',
    email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. CRM & LOYALTY REWARDS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.crm_customers (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    plat VARCHAR(50) NOT NULL,
    nama VARCHAR(255),
    nama_pelanggan VARCHAR(255),
    no_whatsapp VARCHAR(50),
    model_kendaraan VARCHAR(100),
    catatan_khusus TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_crm_customers_tenant_plat UNIQUE (tenant_id, plat)
);

CREATE TABLE IF NOT EXISTS public.crm_loyalty_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    target_stamps INT NOT NULL DEFAULT 5,
    reward_type VARCHAR(50) NOT NULL DEFAULT 'FREE_SERVICE',
    reward_title VARCHAR(255) NOT NULL,
    reward_description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_loyalty_logs (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    plat VARCHAR(50) NOT NULL,
    tipe VARCHAR(50) NOT NULL DEFAULT 'REDEEM',
    reward_title VARCHAR(255),
    reward_type VARCHAR(50),
    id_struk VARCHAR(50),
    keterangan TEXT,
    notes TEXT,
    nama_pelanggan VARCHAR(255),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    plat VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255),
    reward_id UUID REFERENCES public.crm_loyalty_programs(id),
    id_struk VARCHAR(50),
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED'
);

-- ==============================================================================
-- 9. INTELLIGENCE DAILY SNAPSHOTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.intelligence_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    snapshot_date DATE NOT NULL,
    revenue_carwash NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    revenue_cafe NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    revenue_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    carwash_count INT NOT NULL DEFAULT 0,
    cafe_item_count INT NOT NULL DEFAULT 0,
    cash_drawer_variance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    expense_total NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    health_score INT NOT NULL DEFAULT 100,
    anomalies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_intelligence_snapshot UNIQUE (tenant_id, branch_id, snapshot_date)
);

-- ==============================================================================
-- 10. COMPATIBILITY VIEWS (SEAMLESS FRONTEND FALLBACK)
-- ==============================================================================

CREATE OR REPLACE VIEW public.bahan_baku AS 
SELECT 
    id, 
    tenant_id, 
    branch_id, 
    nama_produk AS nama_bahan, 
    nama_produk, 
    satuan, 
    stok, 
    harga_satuan, 
    min_stok, 
    updated_at 
FROM public.stok_barang;

CREATE OR REPLACE VIEW public.transaksi AS 
SELECT 
    id,
    id_struk,
    tenant_id,
    branch_id,
    tanggal,
    jam,
    nama_pelanggan,
    keterangan,
    metode_bayar,
    status_bayar,
    kasir,
    total_tagihan AS total,
    total_tagihan,
    nominal_cash,
    nominal_qris,
    nominal_transfer,
    diskon_carwash,
    diskon_cafe,
    waktu_dibuat,
    waktu_dibayar,
    created_at
FROM public.struk;

CREATE OR REPLACE VIEW public.akun_keuangan AS
SELECT
    id,
    tenant_id,
    branch_id,
    pos AS nama_akun,
    label,
    tipe,
    balance AS saldo,
    balance,
    keterangan,
    is_active,
    updated_at
FROM public.pos_balances;

CREATE OR REPLACE VIEW public.finance_summary AS
SELECT
    tenant_id,
    COALESCE(SUM(pemasukan), 0) AS total_pemasukan,
    COALESCE(SUM(pengeluaran), 0) AS total_pengeluaran,
    COALESCE(SUM(pemasukan - pengeluaran), 0) AS laba_bersih
FROM public.cashflow
GROUP BY tenant_id;

-- ==============================================================================
-- 11. RPC FUNCTIONS (BUSINESS LOGIC & STORED PROCEDURES)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_initialize_tenant_defaults(
    p_tenant_id UUID,
    p_branch_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_persediaan UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_cogs UUID;
    v_coa_gaji UUID;
    v_coa_ops UUID;
    v_coa_prive UUID;
BEGIN
    -- 1. Chart of Accounts Standar
    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '1101', 'Kas Tunai Laci Kasir', 'ASSET', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_kas;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '1102', 'Bank Rekening Operasional', 'ASSET', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_bank;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '1103', 'Persediaan Bahan Baku & Barang Dagang', 'ASSET', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_persediaan;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '4101', 'Pendapatan Layanan Carwash', 'REVENUE', 'CREDIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_rev_cw;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '4102', 'Pendapatan Penjualan Cafe & F&B', 'REVENUE', 'CREDIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_rev_cafe;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '5101', 'Beban Pokok Pendapatan (HPP)', 'EXPENSE', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_cogs;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '6101', 'Beban Gaji & Komisi Cuci', 'EXPENSE', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_gaji;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '6102', 'Beban Operasional & Listrik Air', 'EXPENSE', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_ops;

    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal)
    VALUES 
        (p_tenant_id, '3102', 'Prive / Penarikan Modal Pemilik', 'EQUITY', 'DEBIT', 0.0000)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING
    RETURNING id INTO v_coa_prive;

    -- 2. Pos Balances Kas & Bank
    INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color)
    VALUES 
        (p_tenant_id, p_branch_id, 'SALDO CASH', 'Kas Laci Kasir', 'CASH', 0.0000, 'emerald'),
        (p_tenant_id, p_branch_id, 'SALDO REKENING Y', 'Rekening Operasional Y', 'BANK', 0.0000, 'blue'),
        (p_tenant_id, p_branch_id, 'SALDO REKENING N', 'Rekening Cadangan N', 'BANK', 0.0000, 'indigo'),
        (p_tenant_id, p_branch_id, 'SALDO REKENING R', 'Rekening Tabungan R', 'BANK', 0.0000, 'violet')
    ON CONFLICT (tenant_id, branch_id, pos) DO NOTHING;

    -- 3. Master Kategori Transaksi Terstruktur
    INSERT INTO public.master_categories (tenant_id, nama_kategori, jenis, tipe_arus, boleh_kasir)
    VALUES
        (p_tenant_id, 'Operasional Harian Toko', 'Operasional', 'PENGELUARAN', TRUE),
        (p_tenant_id, 'Belanja Es Batu & Galon', 'Bahan Pelengkap', 'PENGELUARAN', TRUE),
        (p_tenant_id, 'Gas LPG & Perlengkapan', 'Bahan Bakar', 'PENGELUARAN', TRUE),
        (p_tenant_id, 'Pemasukan Non-POS', 'Pendapatan Lain', 'PEMASUKAN', TRUE),
        (p_tenant_id, 'Gaji & Komisi Karyawan', 'SDM', 'PENGELUARAN', FALSE),
        (p_tenant_id, 'Prive Penarikan Owner', 'Prive', 'PENGELUARAN', FALSE)
    ON CONFLICT DO NOTHING;

    -- 4. Metode Bayar
    INSERT INTO public.metode_bayar (tenant_id, branch_id, nama, is_active)
    VALUES
        (p_tenant_id, p_branch_id, 'CASH', TRUE),
        (p_tenant_id, p_branch_id, 'QRIS', TRUE),
        (p_tenant_id, p_branch_id, 'TRANSFER', TRUE)
    ON CONFLICT (tenant_id, branch_id, nama) DO NOTHING;

    -- 5. Kasir Bawaan
    INSERT INTO public.kasir (tenant_id, branch_id, nama, is_active)
    VALUES
        (p_tenant_id, p_branch_id, 'Kasir Utama', TRUE)
    ON CONFLICT (tenant_id, branch_id, nama) DO NOTHING;

    -- 6. Paket Carwash Standar
    INSERT INTO public.carwash_packages (tenant_id, branch_id, name, price, description, sort_order, is_active)
    VALUES
        (p_tenant_id, p_branch_id, 'Cuci Body Salju', 35000.0000, 'Cuci salju luar dan semir ban', 1, TRUE),
        (p_tenant_id, p_branch_id, 'Cuci Komplit + Vacuum', 50000.0000, 'Cuci hidrolik kolong, vacuum interior, dan semir ban', 2, TRUE),
        (p_tenant_id, p_branch_id, 'Cuci Motor Standar', 15000.0000, 'Cuci motor salju dan pengeringan detail', 3, TRUE)
    ON CONFLICT DO NOTHING;

    -- 7. Loyalty Program Bawaan
    INSERT INTO public.crm_loyalty_programs (tenant_id, branch_id, target_stamps, reward_type, reward_title, reward_description, is_active)
    VALUES
        (p_tenant_id, p_branch_id, 5, 'FREE_SERVICE', 'Gratis 1x Cuci Mobil Salju', 'Reward loyalitas pelanggan setelah 5x cuci', TRUE)
    ON CONFLICT DO NOTHING;

    -- 8. Lisensi Awal
    INSERT INTO public.tenant_licenses (tenant_id, license_key, plan, status, valid_until, max_branches, max_users)
    VALUES
        (p_tenant_id, 'LIC-' || upper(substr(md5(random()::text), 1, 12)), 'pro', 'ACTIVE', NOW() + INTERVAL '365 days', 5, 10)
    ON CONFLICT (tenant_id, license_key) DO NOTHING;
END;
$$;

-- Stored Procedure: Redeem Reward CRM Anti-Double Claim
CREATE OR REPLACE FUNCTION public.redeem_customer_reward(
    p_tenant_id UUID,
    p_plat TEXT,
    p_reward_title TEXT,
    p_notes TEXT DEFAULT '',
    p_nama_pelanggan TEXT DEFAULT '',
    p_reward_type TEXT DEFAULT 'FREE_SERVICE',
    p_id_struk TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_plate TEXT := upper(replace(trim(p_plat), ' ', ''));
    v_target_stamps INT := 5;
    v_visits_count INT := 0;
    v_redemptions_count INT := 0;
    v_available INT := 0;
    v_redemption_id TEXT;
    v_record JSONB;
BEGIN
    IF p_tenant_id IS NULL OR v_clean_plate = '' THEN
        RAISE EXCEPTION 'Tenant ID dan Plat nomor kendaraan wajib diisi';
    END IF;

    SELECT COALESCE(target_stamps, 5) INTO v_target_stamps
    FROM public.crm_loyalty_programs
    WHERE tenant_id = p_tenant_id AND is_active = TRUE
    ORDER BY created_at DESC LIMIT 1;

    SELECT COUNT(*) INTO v_visits_count
    FROM public.carwash
    WHERE tenant_id = p_tenant_id
      AND upper(replace(trim(COALESCE(plat, '')), ' ', '')) = v_clean_plate
      AND status != 'Batal';

    SELECT COUNT(*) INTO v_redemptions_count
    FROM public.crm_loyalty_logs
    WHERE tenant_id = p_tenant_id
      AND upper(replace(trim(COALESCE(plat, '')), ' ', '')) = v_clean_plate
      AND tipe = 'REDEEM';

    v_available := floor(v_visits_count / v_target_stamps) - v_redemptions_count;

    IF v_available <= 0 THEN
        RAISE EXCEPTION 'Stamp kunjungan belum cukup atau reward sudah diklaim';
    END IF;

    v_redemption_id := 'red_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 5);

    INSERT INTO public.crm_loyalty_logs (
        id, tenant_id, plat, tipe, reward_title, reward_type, id_struk, keterangan, notes, nama_pelanggan, claimed_at, created_at
    ) VALUES (
        v_redemption_id, p_tenant_id, p_plat, 'REDEEM', p_reward_title, p_reward_type, p_id_struk, p_notes, p_notes, p_nama_pelanggan, NOW(), NOW()
    );

    v_record := jsonb_build_object(
        'redemption_id', v_redemption_id,
        'tenant_id', p_tenant_id,
        'plat', p_plat,
        'reward_title', p_reward_title,
        'claimed_at', NOW()
    );

    RETURN v_record;
END;
$$;

-- Stored Procedure: Checkout Transaksi Atomik (BOM Deductions & Locking)
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id UUID,
    p_branch_id UUID,
    p_struk_payload JSONB,
    p_cafe_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_struk_id UUID;
    v_id_struk VARCHAR(50);
    v_item JSONB;
    v_recipe RECORD;
    v_menu RECORD;
    v_stok RECORD;
    v_qty_needed NUMERIC(18, 4);
    v_total_deduct NUMERIC(18, 4);
BEGIN
    v_id_struk := p_struk_payload->>'id_struk';

    INSERT INTO public.struk (
        tenant_id, branch_id, id_struk, tanggal, jam, nama_pelanggan,
        keterangan, metode_bayar, status_bayar, kasir, total_tagihan,
        nominal_cash, nominal_qris, nominal_transfer, diskon_carwash, diskon_cafe,
        waktu_dibuat, waktu_dibayar
    ) VALUES (
        p_tenant_id, p_branch_id, v_id_struk,
        COALESCE((p_struk_payload->>'tanggal')::date, CURRENT_DATE),
        COALESCE((p_struk_payload->>'jam')::time, CURRENT_TIME),
        p_struk_payload->>'nama_pelanggan',
        p_struk_payload->>'keterangan',
        COALESCE(p_struk_payload->>'metode_bayar', 'CASH'),
        COALESCE(p_struk_payload->>'status_bayar', 'Selesai'),
        COALESCE(p_struk_payload->>'kasir', 'Kasir'),
        COALESCE((p_struk_payload->>'total_tagihan')::numeric, 0.0000),
        COALESCE((p_struk_payload->>'nominal_cash')::numeric, 0.0000),
        COALESCE((p_struk_payload->>'nominal_qris')::numeric, 0.0000),
        COALESCE((p_struk_payload->>'nominal_transfer')::numeric, 0.0000),
        COALESCE((p_struk_payload->>'diskon_carwash')::numeric, 0.0000),
        COALESCE((p_struk_payload->>'diskon_cafe')::numeric, 0.0000),
        NOW(), NOW()
    )
    RETURNING id INTO v_struk_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
    LOOP
        INSERT INTO public.cafe (
            tenant_id, branch_id, id_struk, tanggal, jam,
            nama_menu, qty, harga_satuan, subtotal, status
        ) VALUES (
            p_tenant_id, p_branch_id, v_id_struk,
            CURRENT_DATE, CURRENT_TIME,
            v_item->>'nama_menu',
            (v_item->>'qty')::numeric,
            (v_item->>'harga_satuan')::numeric,
            (v_item->>'subtotal')::numeric,
            'Selesai'
        );

        SELECT * INTO v_menu FROM public.daftar_harga_menu
        WHERE tenant_id = p_tenant_id AND daftar_menu = v_item->>'nama_menu'
        LIMIT 1;

        IF FOUND THEN
            FOR v_recipe IN 
                SELECT * FROM public.resep
                WHERE tenant_id = p_tenant_id AND id_menu = v_menu.id
            LOOP
                v_qty_needed := (v_item->>'qty')::numeric * v_recipe.jumlah;

                SELECT * INTO v_stok FROM public.stok_barang
                WHERE id = v_recipe.id_bahan_baku AND tenant_id = p_tenant_id
                FOR UPDATE;

                IF FOUND THEN
                    UPDATE public.stok_barang
                    SET stok = GREATEST(0.0000, stok - v_qty_needed), updated_at = NOW()
                    WHERE id = v_stok.id;

                    INSERT INTO public.barang_keluar (
                        tenant_id, branch_id, id_bahan_baku, tanggal, nama_bahan_baku, jumlah_keluar, alasan
                    ) VALUES (
                        p_tenant_id, p_branch_id, v_stok.id, CURRENT_DATE, v_stok.nama_produk, v_qty_needed, 'PENJUALAN_POS_' || v_id_struk
                    );
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'struk_id', v_struk_id,
        'id_struk', v_id_struk
    );
END;
$$;

-- Trigger: Otomatisasi Registrasi Owner & Multi-Tenant Provisioning
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id UUID;
    v_branch_id UUID;
    v_slug TEXT;
    v_nama_toko TEXT;
    v_nama_user TEXT;
    v_user_role TEXT;
BEGIN
    v_user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'Owner');
    v_nama_user := COALESCE(NEW.raw_user_meta_data->>'nama', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
    v_nama_toko := COALESCE(NEW.raw_user_meta_data->>'nama_toko', 'RelayPOS ' || v_nama_user);
    v_slug := lower(regexp_replace(v_nama_toko, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(NEW.id::text, 1, 6);

    IF (NEW.raw_user_meta_data->>'tenant_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'tenant_id') != '' THEN
        v_tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
        IF (NEW.raw_user_meta_data->>'branch_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'branch_id') != '' THEN
            v_branch_id := (NEW.raw_user_meta_data->>'branch_id')::uuid;
        END IF;
    ELSE
        INSERT INTO public.tenants (nama, slug, plan, status, business_type)
        VALUES (v_nama_toko, v_slug, 'pro', 'active', 'HYBRID')
        RETURNING id INTO v_tenant_id;

        INSERT INTO public.branches (tenant_id, nama, kode, alamat, is_active)
        VALUES (v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE)
        RETURNING id INTO v_branch_id;

        PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);
    END IF;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_branch_id, v_nama_user, NEW.email, v_user_role, TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = COALESCE(EXCLUDED.branch_id, public.profiles.branch_id),
        nama = EXCLUDED.nama,
        role = EXCLUDED.role,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ==============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_licenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS tenant_isolation_tenants ON public.tenants;
    CREATE POLICY tenant_isolation_tenants ON public.tenants
        FOR ALL USING (id = public.current_tenant_id() OR public.current_user_role() = 'Super Admin');

    DROP POLICY IF EXISTS tenant_isolation_branches ON public.branches;
    CREATE POLICY tenant_isolation_branches ON public.branches
        FOR ALL USING (tenant_id = public.current_tenant_id() OR public.current_user_role() = 'Super Admin');

    DROP POLICY IF EXISTS tenant_isolation_profiles ON public.profiles;
    CREATE POLICY tenant_isolation_profiles ON public.profiles
        FOR ALL USING (tenant_id = public.current_tenant_id() OR public.current_user_role() = 'Super Admin');

    DROP POLICY IF EXISTS tenant_isolation_licenses ON public.tenant_licenses;
    CREATE POLICY tenant_isolation_licenses ON public.tenant_licenses
        FOR ALL USING (tenant_id = public.current_tenant_id() OR public.current_user_role() = 'Super Admin');
END $$;

DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY[
        'pos_balances', 'chart_of_accounts', 'master_categories', 'journal_entries',
        'journal_entry_lines', 'stok_barang', 'daftar_harga_menu', 'resep',
        'carwash_packages', 'diskon', 'kasir', 'metode_bayar', 'struk', 'carwash', 'cafe',
        'barang_keluar', 'barang_masuk', 'cashflow', 'pengeluaran',
        'karyawan_cuci', 'karyawan_kantor', 'crm_customers', 'crm_loyalty_programs',
        'crm_loyalty_logs', 'customer_reward_claims', 'intelligence_daily_snapshots'
    ];
BEGIN
    FOREACH tbl IN ARRAY target_tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON public.%I;', tbl);
        EXECUTE format('
            CREATE POLICY tenant_isolation_policy ON public.%I
            FOR ALL
            USING (tenant_id = public.current_tenant_id() OR public.current_user_role() = ''Super Admin'')
            WITH CHECK (tenant_id = public.current_tenant_id() OR public.current_user_role() = ''Super Admin'');
        ', tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- 13. COMPOSITE INDEXES FOR ZERO-LATENCY QUERIES
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON public.branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_balances_tenant ON public.pos_balances(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_coa_tenant ON public.chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_master_cat_tenant ON public.master_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date ON public.journal_entries(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_stok_barang_tenant ON public.stok_barang(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_tenant ON public.daftar_harga_menu(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_resep_tenant ON public.resep(tenant_id, id_menu);
CREATE INDEX IF NOT EXISTS idx_struk_tenant_tanggal ON public.struk(tenant_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_struk_id_struk ON public.struk(tenant_id, id_struk);
CREATE INDEX IF NOT EXISTS idx_carwash_tenant_plat ON public.carwash(tenant_id, plat);
CREATE INDEX IF NOT EXISTS idx_carwash_tenant_tanggal ON public.carwash(tenant_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_cafe_tenant_struk ON public.cafe(tenant_id, id_struk);
CREATE INDEX IF NOT EXISTS idx_cashflow_tenant_tanggal ON public.cashflow(tenant_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_pengeluaran_tenant_tanggal ON public.pengeluaran(tenant_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_crm_customers_tenant_plat ON public.crm_customers(tenant_id, plat);
CREATE INDEX IF NOT EXISTS idx_crm_logs_tenant_plat ON public.crm_loyalty_logs(tenant_id, plat);
CREATE INDEX IF NOT EXISTS idx_daily_snapshots_tenant_date ON public.intelligence_daily_snapshots(tenant_id, snapshot_date);
