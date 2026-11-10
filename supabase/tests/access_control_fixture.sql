-- ==============================================================================
-- ACCESS CONTROL & RBAC REGRESSION TEST FIXTURE (PR-1)
-- Disposable database fixture for testing 35 public objects across 2 tenants & 2 branches.
-- NEVER apply to a hosted/production database.
-- ==============================================================================

DO $$ 
BEGIN 
  IF current_database() NOT LIKE 'erpposs_qa_%' THEN 
    RAISE EXCEPTION 'Safety check failed: Access control tests must run only in a disposable erpposs_qa_* database'; 
  END IF; 
END $$;

-- 1. Setup Auth Schema & Supabase Auth Helpers
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid() 
RETURNS uuid 
LANGUAGE sql 
STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN 
    CREATE ROLE authenticated NOLOGIN; 
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN 
    CREATE ROLE anon NOLOGIN; 
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN 
    CREATE ROLE service_role NOLOGIN; 
  END IF;
END $$;

-- 2. Core Entities (Tenants, Branches, Profiles, Licenses)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'pro',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    nama VARCHAR(255) NOT NULL,
    kode VARCHAR(50) NOT NULL,
    alamat TEXT,
    telepon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_branch_tenant_kode UNIQUE (tenant_id, kode)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Kasir',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_profile_tenant_email UNIQUE (tenant_id, email)
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

CREATE TABLE IF NOT EXISTS public.license_keys (
    key_code VARCHAR(64) PRIMARY KEY,
    tier VARCHAR(32) NOT NULL,
    duration_days INT NOT NULL DEFAULT 365,
    max_branches INT NOT NULL DEFAULT 1,
    max_users INT NOT NULL DEFAULT 3,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_by_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Context Functions
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

-- 3. Financial Core & Accounting
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    kode_akun VARCHAR(50) NOT NULL,
    nama_akun VARCHAR(255) NOT NULL,
    tipe VARCHAR(50) NOT NULL,
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
    tipe VARCHAR(50) NOT NULL DEFAULT 'CASH',
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
    tipe_arus VARCHAR(50) NOT NULL,
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

-- 4. Operasional POS & Master Katalog
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

-- 5. Inventori & Resep BOM
CREATE TABLE IF NOT EXISTS public.stok_barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES public.branches(id) ON DELETE RESTRICT,
    nama_produk VARCHAR(255) NOT NULL,
    satuan VARCHAR(50) NOT NULL,
    stok NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    harga_satuan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    harga_beli NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    min_stok NUMERIC(18, 4) NOT NULL DEFAULT 10.0000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stok_barang_tenant_nama UNIQUE (tenant_id, branch_id, nama_produk)
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

-- 6. Transaksi POS Core
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

-- 7. Arus Kas & Pengeluaran
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
    id_bahan_baku UUID REFERENCES public.stok_barang(id),
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
    id_bahan_baku UUID REFERENCES public.stok_barang(id),
    qty NUMERIC(18, 4) DEFAULT 0.0000,
    apakah_stok BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. SDM & Payroll
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

-- 9. CRM & Loyalty
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
    vip_min_visits INT DEFAULT 5,
    vip_min_spent NUMERIC(18, 4) DEFAULT 0,
    loyal_min_visits INT DEFAULT 3,
    active_days_threshold INT DEFAULT 14,
    churn_days_threshold INT DEFAULT 30,
    vip_retention_mode VARCHAR(50) DEFAULT 'DYNAMIC',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- 10. Intelligence Daily Snapshots
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

-- 11. Views with security_invoker = true
CREATE OR REPLACE VIEW public.bahan_baku WITH (security_invoker = true) AS 
SELECT 
    id, tenant_id, branch_id, nama_produk AS nama_bahan, 
    nama_produk, satuan, stok, harga_satuan, min_stok, updated_at 
FROM public.stok_barang;

CREATE OR REPLACE VIEW public.transaksi WITH (security_invoker = true) AS 
SELECT 
    id, id_struk, tenant_id, branch_id, tanggal, jam,
    nama_pelanggan, keterangan, metode_bayar, status_bayar, kasir,
    total_tagihan AS total, total_tagihan, nominal_cash, nominal_qris, nominal_transfer,
    diskon_carwash, diskon_cafe, waktu_dibuat, waktu_dibayar, created_at
FROM public.struk;

CREATE OR REPLACE VIEW public.akun_keuangan WITH (security_invoker = true) AS
SELECT
    id, tenant_id, branch_id, pos AS nama_akun, label, tipe,
    balance AS saldo, balance, keterangan, is_active, updated_at
FROM public.pos_balances;

CREATE OR REPLACE VIEW public.finance_summary WITH (security_invoker = true) AS
SELECT
    tenant_id,
    COALESCE(SUM(pemasukan), 0) AS total_pemasukan,
    COALESCE(SUM(pengeluaran), 0) AS total_pengeluaran,
    COALESCE(SUM(pemasukan - pengeluaran), 0) AS laba_bersih
FROM public.cashflow
GROUP BY tenant_id;

-- 12. Profile Role Protection Trigger (Baseline Implementation)
CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role VARCHAR(50);
BEGIN
    v_caller_role := public.current_user_role();

    IF TG_OP = 'DELETE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Pengguna dengan role "%" tidak diizinkan menghapus profil pengguna.', v_caller_role;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak membuat profil dengan role Super Admin.';
        END IF;

        IF NEW.role = 'Owner' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            IF EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Tenant ini sudah memiliki profil terdaftar.';
            END IF;
        END IF;

        IF v_caller_role IN ('Kasir', 'Staff', 'Finance') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Pengguna dengan role "%" dilarang membuat profil pengguna baru.', v_caller_role;
        END IF;

        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Pengguna tanpa hak akses Owner/Super Admin dilarang mengubah role (Role aktif: %)', v_caller_role;
            END IF;

            IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak memberikan role Super Admin.';
            END IF;
        END IF;

        IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
            IF v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: Pemindahan tenant_id profil pengguna hanya dapat dilakukan oleh Super Admin.';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- 13. RPC redeem_customer_reward (Baseline Implementation)
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

-- 14. Apply Baseline RLS Policies (Current State)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

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

-- 15. Grants (Reflecting baseline snapshot with broad privileges)
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE ALL ON TABLE public.license_keys FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.bahan_baku, public.transaksi, public.finance_summary, public.akun_keuangan TO authenticated;
REVOKE ALL ON public.bahan_baku, public.transaksi, public.finance_summary, public.akun_keuangan FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_customer_reward(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 16. SEED POSITIVE FIXTURES FOR ALL 35 OBJECTS (TENANT A & TENANT D)
-- ==============================================================================

-- Tenants
INSERT INTO public.tenants (id, nama, slug, plan, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Jaya Bersama Tenant A', 'jaya-bersama-a', 'pro', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Delta Auto Tenant D', 'delta-auto-d', 'pro', 'active')
ON CONFLICT (id) DO NOTHING;

-- Branches
INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_active) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Cabang Pusat A1', 'BR-A1', 'Jl. Sudirman No 1', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Cabang Timur A2', 'BR-A2', 'Jl. Gatot Subroto No 2', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Cabang Delta D1', 'BR-D1', 'Jl. Pemuda No 10', true)
ON CONFLICT (id) DO NOTHING;

-- Profiles / Actors
INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Owner A', 'owner.a@example.com', 'Owner', true),
  ('00000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Admin A', 'admin.a@example.com', 'Admin', true),
  ('00000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kasir A1', 'kasir.a1@example.com', 'Kasir', true),
  ('00000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Kasir A2', 'kasir.a2@example.com', 'Kasir', true),
  ('00000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Staff Kantor A', 'staff.a@example.com', 'Staff Kantor', true),
  ('00000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Karyawan Cuci A', 'cuci.a@example.com', 'Karyawan Cuci', true),
  ('00000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Inactive User A', 'inactive.a@example.com', 'Kasir', false),
  ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Owner D', 'owner.d@example.com', 'Owner', true),
  ('00000000-0000-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Super Admin Root', 'superadmin@example.com', 'Super Admin', true)
ON CONFLICT (id) DO NOTHING;

-- Tenant Licenses
INSERT INTO public.tenant_licenses (id, tenant_id, license_key, plan, status, valid_until, max_branches, max_users) VALUES
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'RLPOS-PRO-TENANT-A-KEY', 'pro', 'ACTIVE', NOW() + INTERVAL '365 days', 5, 10),
  ('d2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'RLPOS-PRO-TENANT-D-KEY', 'pro', 'ACTIVE', NOW() + INTERVAL '365 days', 5, 10)
ON CONFLICT (id) DO NOTHING;

-- License Keys (Platform-wide inventory)
INSERT INTO public.license_keys (key_code, tier, duration_days, max_branches, max_users, is_used, notes) VALUES
  ('RLPOS-PRO-OFFICIAL-2026-KEY1', 'pro', 365, 5, 10, false, 'Official Production Key 1'),
  ('RLPOS-ENT-OFFICIAL-2026-KEY2', 'enterprise', 365, 10, 25, false, 'Official Production Key 2')
ON CONFLICT (key_code) DO NOTHING;

-- Chart of Accounts
INSERT INTO public.chart_of_accounts (id, tenant_id, kode_akun, nama_akun, tipe, saldo_normal, saldo_awal) VALUES
  ('a1111111-c0a1-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '1101', 'Kas Tunai Laci Kasir A', 'ASSET', 'DEBIT', 500000.00),
  ('a1111111-c0a2-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '1102', 'Bank BCA Operasional A', 'ASSET', 'DEBIT', 2500000.00),
  ('a1111111-c0a3-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '4101', 'Pendapatan Carwash A', 'REVENUE', 'CREDIT', 0.00),
  ('a1111111-c0a4-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '5101', 'Beban Gaji Staf A', 'EXPENSE', 'DEBIT', 0.00),
  ('d2222222-c0a1-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '1101', 'Kas Tunai Laci Kasir D', 'ASSET', 'DEBIT', 800000.00),
  ('d2222222-c0a2-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '1102', 'Bank Mandiri Operasional D', 'ASSET', 'DEBIT', 5000000.00)
ON CONFLICT (id) DO NOTHING;

-- POS Balances
INSERT INTO public.pos_balances (id, tenant_id, branch_id, pos, label, tipe, balance) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SALDO CASH', 'Kasir Utama A1', 'CASH', 500000.00),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'SALDO CASH', 'Kasir Utama A2', 'CASH', 300000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'SALDO CASH', 'Kasir Delta D1', 'CASH', 800000.00)
ON CONFLICT (id) DO NOTHING;

-- Master Categories
INSERT INTO public.master_categories (id, tenant_id, nama_kategori, jenis, tipe_arus, boleh_kasir) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Bahan Baku F&B', 'Pengeluaran Cafe', 'PENGELUARAN', false),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Operasional Kasir', 'Pengeluaran Bersama', 'PENGELUARAN', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Perlengkapan Cuci', 'Pengeluaran Carwash', 'PENGELUARAN', false)
ON CONFLICT (id) DO NOTHING;

-- Journal Entries & Lines
INSERT INTO public.journal_entries (id, tenant_id, branch_id, entry_no, date, memo, total_amount, status) VALUES
  ('a1111111-00e1-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'JE-A1-2026-001', CURRENT_DATE, 'Opening Balance A1', 500000.00, 'POSTED'),
  ('a1111111-00e2-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'JE-A2-2026-001', CURRENT_DATE, 'Opening Balance A2', 300000.00, 'POSTED'),
  ('d2222222-00e1-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'JE-D1-2026-001', CURRENT_DATE, 'Opening Balance D1', 800000.00, 'POSTED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.journal_entry_lines (id, tenant_id, journal_entry_id, account_id, debit, credit, memo) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a1111111-00e1-0000-0000-000000000001', 'a1111111-c0a1-0000-0000-000000000001', 500000.00, 0.00, 'Debit Kas A1'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a1111111-00e1-0000-0000-000000000001', 'a1111111-c0a3-0000-0000-000000000003', 0.00, 500000.00, 'Credit Pendapatan A1'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'd2222222-00e1-0000-0000-000000000001', 'd2222222-c0a1-0000-0000-000000000001', 800000.00, 0.00, 'Debit Kas D1'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'd2222222-00e1-0000-0000-000000000001', 'd2222222-c0a2-0000-0000-000000000002', 0.00, 800000.00, 'Credit Bank D1')
ON CONFLICT (id) DO NOTHING;

-- Stok Barang (Bahan Baku)
INSERT INTO public.stok_barang (id, tenant_id, branch_id, nama_produk, satuan, stok, harga_satuan) VALUES
  ('a1111111-5701-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Biji Kopi Arabica A1', 'kg', 25.00, 120000.00),
  ('a1111111-5702-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Biji Kopi Arabica A2', 'kg', 15.00, 120000.00),
  ('d2222222-5701-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Shampoo Snow Wash D1', 'liter', 50.00, 45000.00)
ON CONFLICT (id) DO NOTHING;

-- Daftar Harga Menu
INSERT INTO public.daftar_harga_menu (id, tenant_id, branch_id, daftar_menu, harga, kategori) VALUES
  ('a1111111-0de1-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Espresso Single A1', 18000.00, 'Coffee'),
  ('a1111111-0de2-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Espresso Single A2', 19000.00, 'Coffee'),
  ('d2222222-0de1-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ice Tea Delta D1', 12000.00, 'Beverage')
ON CONFLICT (id) DO NOTHING;

-- Resep
INSERT INTO public.resep (id, tenant_id, id_menu, id_bahan_baku, nama_menu, nama_bahan, jumlah, satuan) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'a1111111-0de1-0000-0000-000000000001', 'a1111111-5701-0000-0000-000000000001', 'Espresso Single A1', 'Biji Kopi Arabica A1', 0.018, 'kg')
ON CONFLICT (id) DO NOTHING;

-- Carwash Packages
INSERT INTO public.carwash_packages (id, tenant_id, branch_id, name, price, description) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Cuci Reguler A1', 50000.00, 'Cuci Body + Semir Ban'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cuci Salju Delta D1', 60000.00, 'Cuci Salju Premium')
ON CONFLICT (id) DO NOTHING;

-- Diskon
INSERT INTO public.diskon (id, tenant_id, branch_id, nama_diskon, tipe_diskon, nilai_diskon) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Diskon Member A1', 'NOMINAL', 10000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Diskon Jumat Berkah D1', 'NOMINAL', 15000.00)
ON CONFLICT (id) DO NOTHING;

-- Kasir
INSERT INTO public.kasir (id, tenant_id, branch_id, nama) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Budi Kasir A1'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rudi Kasir D1')
ON CONFLICT (id) DO NOTHING;

-- Metode Bayar
INSERT INTO public.metode_bayar (id, tenant_id, branch_id, nama) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CASH'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'QRIS'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CASH')
ON CONFLICT (id) DO NOTHING;

-- Struk (Receipts)
INSERT INTO public.struk (id, tenant_id, branch_id, id_struk, total_tagihan, metode_bayar, status_bayar, kasir) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'STR-A1-001', 50000.00, 'CASH', 'Selesai', 'Budi Kasir A1'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'STR-A2-001', 35000.00, 'CASH', 'Selesai', 'Kasir A2'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-001', 60000.00, 'CASH', 'Selesai', 'Rudi Kasir D1'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-PENDING-001', 60000.00, 'CASH', 'Pending', 'Rudi Kasir D1')
ON CONFLICT (id) DO NOTHING;

-- Cafe & Carwash Transactions
INSERT INTO public.cafe (id, tenant_id, branch_id, id_struk, nama_menu, qty, harga_satuan, subtotal, status) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'STR-A1-001', 'Espresso Single A1', 1, 18000.00, 18000.00, 'Selesai'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-001', 'Ice Tea Delta D1', 1, 12000.00, 12000.00, 'Selesai')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.carwash (id, tenant_id, branch_id, id_struk, plat, paket, harga, status, gaji_anggota) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'STR-A1-001', 'B1234ABC', 'Cuci Reguler A1', 50000.00, 'Selesai Dicuci', 15000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-001', 'D5678XYZ', 'Cuci Salju Delta D1', 60000.00, 'Selesai Dicuci', 18000.00),
  -- 5 Pending Carwash visits for Tenant D (Audit Evidence: Unpaid visits eligible bug)
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-PENDING-001', 'D9999QA', 'Cuci Salju Delta D1', 60000.00, 'Dalam Antrian', 18000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-PENDING-001', 'D9999QA', 'Cuci Salju Delta D1', 60000.00, 'Dalam Antrian', 18000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-PENDING-001', 'D9999QA', 'Cuci Salju Delta D1', 60000.00, 'Dalam Antrian', 18000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-PENDING-001', 'D9999QA', 'Cuci Salju Delta D1', 60000.00, 'Dalam Antrian', 18000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-PENDING-001', 'D9999QA', 'Cuci Salju Delta D1', 60000.00, 'Dalam Antrian', 18000.00)
ON CONFLICT (id) DO NOTHING;

-- Mutasi Barang (Keluar & Masuk)
INSERT INTO public.barang_keluar (id, tenant_id, branch_id, id_bahan_baku, nama_bahan_baku, jumlah_keluar) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-5701-0000-0000-000000000001', 'Biji Kopi Arabica A1', 0.018),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd2222222-5701-0000-0000-000000000001', 'Shampoo Snow Wash D1', 0.50)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.barang_masuk (id, tenant_id, branch_id, id_bahan_baku, nama_bahan_baku, jumlah_masuk, harga_beli, total_biaya) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-5701-0000-0000-000000000001', 'Biji Kopi Arabica A1', 10.00, 120000.00, 1200000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'd2222222-5701-0000-0000-000000000001', 'Shampoo Snow Wash D1', 20.00, 45000.00, 900000.00)
ON CONFLICT (id) DO NOTHING;

-- Cashflow & Pengeluaran
INSERT INTO public.cashflow (id, tenant_id, branch_id, id_sumber, keterangan_transaksi, pemasukan, pengeluaran) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'STR-A1-001', 'Penjualan POS STR-A1-001', 50000.00, 0.00),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'EXP-A1-001', 'Beli Kertas Thermal POS', 0.00, 25000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STR-D1-001', 'Penjualan POS STR-D1-001', 60000.00, 0.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pengeluaran (id, tenant_id, branch_id, nama_pengeluaran, jenis, kategori, nominal) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Kertas Struk Kasir', 'Pengeluaran Bersama', 'Operasional Kasir', 25000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Spon Cuci Mobil', 'Pengeluaran Carwash', 'Perlengkapan Cuci', 30000.00)
ON CONFLICT (id) DO NOTHING;

-- SDM (Karyawan Cuci & Kantor)
INSERT INTO public.karyawan_cuci (id, tenant_id, branch_id, nama, is_active) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Asep Kru Cuci A1', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Joko Kru Cuci D1', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.karyawan_kantor (id, tenant_id, branch_id, nama, role, email, is_active) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Siti Staff Kantor A1', 'Staff Kantor', 'siti@example.com', true),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Dewi Staff Kantor D1', 'Staff Kantor', 'dewi@example.com', true)
ON CONFLICT (id) DO NOTHING;

-- CRM & Loyalty
INSERT INTO public.crm_customers (id, tenant_id, plat, nama_pelanggan, no_whatsapp) VALUES
  ('crm_a_cust1', '11111111-1111-1111-1111-111111111111', 'B1234ABC', 'Bapak Agus', '081234567890'),
  ('crm_d_cust1', '22222222-2222-2222-2222-222222222222', 'D5678XYZ', 'Ibu Ratna', '081987654321'),
  ('crm_d_cust2', '22222222-2222-2222-2222-222222222222', 'D9999QA', 'Pelanggan QA Delta', '081112223334')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.crm_loyalty_programs (id, tenant_id, branch_id, target_stamps, reward_type, reward_title, is_active) VALUES
  ('a1111111-1091-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 'FREE_SERVICE', 'Gratis 1x Cuci Body A1', true),
  ('d2222222-1091-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5, 'FREE_SERVICE', 'Gratis 1x Cuci Salju D1', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.crm_loyalty_logs (id, tenant_id, branch_id, plat, tipe, reward_title) VALUES
  ('log_a_001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B1234ABC', 'REDEEM', 'Gratis 1x Cuci Body A1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customer_reward_claims (id, tenant_id, branch_id, plat, customer_name, reward_id) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'B1234ABC', 'Bapak Agus', 'a1111111-1091-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Intelligence Daily Snapshots
INSERT INTO public.intelligence_daily_snapshots (id, tenant_id, branch_id, snapshot_date, revenue_carwash, revenue_cafe, revenue_total) VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', CURRENT_DATE, 50000.00, 18000.00, 68000.00),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', CURRENT_DATE, 60000.00, 12000.00, 72000.00)
ON CONFLICT (id) DO NOTHING;

-- Attach Profile Protection Trigger After Seeding Initial Fixtures
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_profile_role_and_tenant();
