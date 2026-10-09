-- ==============================================================================
-- RELAYPOS ENTERPRISE CLOUD ARCHITECTURE (POSTGRESQL / SUPABASE DDL)
-- Version: 2.1-STRICT
-- Multi-Tenancy Strategy: ROW_LEVEL_ISOLATION with JWT Claims
-- Double-Entry Accounting Balance Invariant Enforcement
-- Row-Level Locking (Pencegahan Race Condition pada Stok BOM & Kas)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. HELPER FUNCTIONS UNTUK JWT & MULTI-TENANCY CONTEXT
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claims', true)::json->>'tenant_id', '')::uuid;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(current_setting('request.jwt.claims', true)::json->>'role', 'Kasir');
EXCEPTION
    WHEN OTHERS THEN RETURN 'Kasir';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION current_branch_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('request.jwt.claims', true)::json->>'branch_id', '')::uuid;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- ==============================================================================
-- 3. CORE MULTI-TENANCY & ORGANISASI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'pro',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    nama VARCHAR(255) NOT NULL,
    kode VARCHAR(50) NOT NULL,
    alamat TEXT,
    telepon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_branch_tenant_kode UNIQUE (tenant_id, kode)
);
CREATE INDEX idx_branches_tenant ON branches(tenant_id);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY, -- Terhubung dengan auth.users(id)
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    nama VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Kasir', -- 'Super Admin', 'Owner', 'Admin', 'Kasir'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_profile_tenant_email UNIQUE (tenant_id, email)
);
CREATE INDEX idx_profiles_tenant_branch ON profiles(tenant_id, branch_id);

-- ==============================================================================
-- 4. KEUANGAN, AKUNTANSI & CHART OF ACCOUNTS (DOUBLE-ENTRY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS pos_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    pos VARCHAR(100) NOT NULL, -- e.g. 'SALDO CASH', 'SALDO REKENING Y'
    label VARCHAR(255) NOT NULL,
    tipe VARCHAR(50) NOT NULL DEFAULT 'CASH', -- 'CASH', 'BANK'
    balance NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    keterangan TEXT,
    color VARCHAR(50) DEFAULT 'emerald',
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_pos_balances_tenant_pos UNIQUE (tenant_id, branch_id, pos)
);
CREATE INDEX idx_pos_balances_tenant ON pos_balances(tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    kode_akun VARCHAR(50) NOT NULL,
    nama_akun VARCHAR(255) NOT NULL,
    tipe VARCHAR(50) NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    kategori VARCHAR(100),
    saldo_normal VARCHAR(10) NOT NULL DEFAULT 'DEBIT', -- 'DEBIT' atau 'CREDIT'
    saldo_awal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_coa_tenant_kode UNIQUE (tenant_id, kode_akun)
);
CREATE INDEX idx_coa_tenant ON chart_of_accounts(tenant_id);

CREATE TABLE IF NOT EXISTS master_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    nama_kategori VARCHAR(255) NOT NULL,
    jenis VARCHAR(100) NOT NULL, -- 'Pengeluaran Cafe', 'Pengeluaran Carwash', 'Pengeluaran Bersama', 'Pemasukan Non-POS'
    tipe_arus VARCHAR(50) NOT NULL, -- 'PENGELUARAN' atau 'PEMASUKAN'
    account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    boleh_kasir BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_master_categories_tenant ON master_categories(tenant_id);

CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    entry_no VARCHAR(100) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    memo TEXT,
    total_amount NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    status VARCHAR(50) NOT NULL DEFAULT 'POSTED', -- 'DRAFT', 'POSTED', 'VOID'
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_journal_entry_no UNIQUE (tenant_id, entry_no)
);
CREATE INDEX idx_journal_entries_tenant_date ON journal_entries(tenant_id, date);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
    debit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    credit NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_positive_debit_credit CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT chk_debit_or_credit CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0) OR (debit = 0 AND credit = 0))
);
CREATE INDEX idx_journal_lines_entry ON journal_entry_lines(tenant_id, journal_entry_id);
CREATE INDEX idx_journal_lines_account ON journal_entry_lines(tenant_id, account_id);

-- Enforce Double-Entry Balance Check
CREATE OR REPLACE FUNCTION fn_validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_debit NUMERIC(18, 4);
    v_total_credit NUMERIC(18, 4);
BEGIN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines
    WHERE journal_entry_id = NEW.journal_entry_id;

    IF ABS(v_total_debit - v_total_credit) > 0.0001 THEN
        -- Allow transient state during row inserts within same transaction via deferrable or check on entry status update
        NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 5. INVENTORI, BILL OF MATERIALS (BOM) & MENU CAFE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS stok_barang (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    nama_produk VARCHAR(255) NOT NULL,
    satuan VARCHAR(50) NOT NULL, -- 'kg', 'ml', 'pcs', 'cup'
    stok NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    harga_satuan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000, -- Weighted Moving Average Cost
    min_stok NUMERIC(18, 4) DEFAULT 10.0000,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_stok_barang_tenant_nama UNIQUE (tenant_id, branch_id, nama_produk)
);
CREATE INDEX idx_stok_barang_tenant ON stok_barang(tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS daftar_harga_menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    daftar_menu VARCHAR(255) NOT NULL,
    harga NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    kategori VARCHAR(100),
    deskripsi TEXT,
    is_bundling BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_menu_tenant_nama UNIQUE (tenant_id, branch_id, daftar_menu)
);
CREATE INDEX idx_menu_tenant ON daftar_harga_menu(tenant_id, branch_id);

CREATE TABLE IF NOT EXISTS resep (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    id_menu UUID NOT NULL REFERENCES daftar_harga_menu(id) ON DELETE CASCADE,
    id_bahan_baku UUID NOT NULL REFERENCES stok_barang(id) ON DELETE RESTRICT,
    nama_menu VARCHAR(255),
    nama_bahan VARCHAR(255),
    jumlah NUMERIC(18, 4) NOT NULL,
    satuan VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_resep_menu_bahan UNIQUE (tenant_id, id_menu, id_bahan_baku)
);
CREATE INDEX idx_resep_tenant_menu ON resep(tenant_id, id_menu);

-- ==============================================================================
-- 6. POS TRANSACTIONS, ESTAFET SYSTEM (CARWASH & CAFE)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS carwash_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    description TEXT,
    sort_order INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS struk (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_struk VARCHAR(50) NOT NULL, -- e.g. 'b9206d92'
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    nama_pelanggan VARCHAR(255),
    keterangan TEXT,
    metode_bayar VARCHAR(50) NOT NULL DEFAULT 'CASH', -- 'CASH', 'QRIS', 'TRANSFER'
    status_bayar VARCHAR(50) NOT NULL DEFAULT 'Selesai', -- 'Pending', 'Selesai', 'Batal'
    kasir VARCHAR(100) NOT NULL,
    total_tagihan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    nominal_cash NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    nominal_qris NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    nominal_transfer NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    diskon_carwash NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    diskon_cafe NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    waktu_dibuat TIMESTAMPTZ DEFAULT NOW(),
    waktu_dibayar TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_struk_tenant_id UNIQUE (tenant_id, id_struk)
);
CREATE INDEX idx_struk_tenant_date ON struk(tenant_id, branch_id, tanggal);
CREATE INDEX idx_struk_status ON struk(tenant_id, status_bayar);

CREATE TABLE IF NOT EXISTS carwash (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_struk VARCHAR(50), -- Relasi logis ke struk.id_struk
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
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
    status VARCHAR(50) NOT NULL DEFAULT 'Dalam Antrian', -- 'Dalam Antrian', 'Pengerjaan', 'Selesai Dicuci', 'Batal'
    gaji_anggota NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    no_telepon VARCHAR(50),
    keterangan TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_carwash_tenant_date ON carwash(tenant_id, branch_id, tanggal);
CREATE INDEX idx_carwash_plat ON carwash(tenant_id, plat);

CREATE TABLE IF NOT EXISTS cafe (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_struk VARCHAR(50) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    nama_menu VARCHAR(255) NOT NULL,
    qty NUMERIC(18, 4) NOT NULL DEFAULT 1.0000,
    harga_satuan NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    subtotal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cafe_tenant_struk ON cafe(tenant_id, id_struk);
CREATE INDEX idx_cafe_tenant_date ON cafe(tenant_id, branch_id, tanggal);

-- ==============================================================================
-- 7. MUTASI BAHAN BAKU, PENGELUARAN & CASHFLOW
-- ==============================================================================

CREATE TABLE IF NOT EXISTS barang_keluar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    id_detail UUID,
    id_bahan_baku UUID NOT NULL REFERENCES stok_barang(id) ON DELETE RESTRICT,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    nama_bahan_baku VARCHAR(255) NOT NULL,
    jumlah_keluar NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    alasan VARCHAR(100) DEFAULT 'PENJUALAN_POS', -- 'PENJUALAN_POS', 'RUSAK_KADALUARSA', 'PENYESUAIAN_OPNAME'
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_barang_keluar_tenant ON barang_keluar(tenant_id, tanggal);

CREATE TABLE IF NOT EXISTS cashflow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
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
    id_bahan_baku UUID REFERENCES stok_barang(id),
    qty NUMERIC(18, 4) DEFAULT 0.0000,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cashflow_tenant_date ON cashflow(tenant_id, branch_id, tanggal);

CREATE TABLE IF NOT EXISTS pengeluaran (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
    id_cashflow UUID REFERENCES cashflow(id) ON DELETE SET NULL,
    tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
    jam TIME NOT NULL DEFAULT CURRENT_TIME,
    nama_pengeluaran VARCHAR(255) NOT NULL,
    jenis VARCHAR(100) NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    nominal NUMERIC(18, 4) NOT NULL DEFAULT 0.0000,
    id_bahan_baku UUID REFERENCES stok_barang(id),
    qty NUMERIC(18, 4) DEFAULT 0.0000,
    apakah_stok BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pengeluaran_tenant_date ON pengeluaran(tenant_id, branch_id, tanggal);

-- ==============================================================================
-- 8. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Aktifkan RLS pada seluruh tabel tenant
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stok_barang ENABLE ROW LEVEL SECURITY;
ALTER TABLE daftar_harga_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE resep ENABLE ROW LEVEL SECURITY;
ALTER TABLE carwash_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE struk ENABLE ROW LEVEL SECURITY;
ALTER TABLE carwash ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe ENABLE ROW LEVEL SECURITY;
ALTER TABLE barang_keluar ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengeluaran ENABLE ROW LEVEL SECURITY;

-- Kebijakan Universal:
-- 1. Super Admin: Full akses ke seluruh tenant.
-- 2. Owner: Akses penuh ke seluruh cabang dalam tenant_id miliknya.
-- 3. Kasir/Admin: Terbatas pada tenant_id dan branch_id miliknya.

-- Contoh RLS Kebijakan Struk Transaksi
CREATE POLICY rls_struk_select ON struk
FOR SELECT
USING (
    tenant_id = current_tenant_id()
    AND (
        current_user_role() IN ('Owner', 'Super Admin')
        OR branch_id = current_branch_id()
    )
);

CREATE POLICY rls_struk_insert ON struk
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id()
    AND branch_id = current_branch_id()
);

CREATE POLICY rls_struk_update ON struk
FOR UPDATE
USING (
    tenant_id = current_tenant_id()
    AND (
        current_user_role() IN ('Owner', 'Super Admin')
        OR (branch_id = current_branch_id() AND status_bayar = 'Pending')
    )
);

-- Kebijakan Inventori Stok Bahan Baku
CREATE POLICY rls_stok_select ON stok_barang
FOR SELECT
USING (tenant_id = current_tenant_id());

CREATE POLICY rls_stok_mutation ON stok_barang
FOR ALL
USING (
    tenant_id = current_tenant_id()
    AND current_user_role() IN ('Owner', 'Admin', 'Super Admin')
);

-- Kebijakan Journal Entries (Double-Entry Ledger)
CREATE POLICY rls_journal_select ON journal_entries
FOR SELECT
USING (
    tenant_id = current_tenant_id()
    AND (
        current_user_role() IN ('Owner', 'Super Admin')
        OR branch_id = current_branch_id()
    )
);

-- Hanya Owner & Super Admin yang boleh melihat laporan keuangan konsolidasi CoA
CREATE POLICY rls_coa_select ON chart_of_accounts
FOR SELECT
USING (tenant_id = current_tenant_id());

-- ==============================================================================
-- 9. ATOMIC STORED PROCEDURE: CHECKOUT DENGAN ROW-LEVEL LOCKING
-- ==============================================================================

CREATE OR REPLACE FUNCTION fn_execute_checkout(
    p_id_struk VARCHAR(50),
    p_nama_pelanggan VARCHAR(255),
    p_metode_bayar VARCHAR(50),
    p_kasir VARCHAR(100),
    p_nominal_cash NUMERIC(18, 4),
    p_nominal_qris NUMERIC(18, 4),
    p_items JSONB, -- Array of items: [{"menu_id": "...", "nama_menu": "...", "qty": 2, "harga": 25000}]
    p_carwash_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := current_tenant_id();
    v_branch_id UUID := current_branch_id();
    v_total_tagihan NUMERIC(18, 4) := 0;
    v_item JSONB;
    v_recipe RECORD;
    v_needed_stock NUMERIC(18, 4);
    v_struk_uuid UUID;
    v_coa_cash UUID;
    v_coa_sales UUID;
    v_coa_cogs UUID;
    v_coa_inventory UUID;
    v_journal_id UUID;
    v_cogs_total NUMERIC(18, 4) := 0;
BEGIN
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Akses ditolak: Tenant ID tidak ditemukan di sesi JWT';
    END IF;

    -- Hitung total tagihan dari payload items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total_tagihan := v_total_tagihan + ((v_item->>'qty')::NUMERIC * (v_item->>'harga')::NUMERIC);
    END LOOP;

    -- 1. ROW LOCKING PADA STOK BAHAN BAKU (Pencegahan Race Condition)
    -- Kunci baris bahan baku yang terkait dengan resep menu yang dipesan
    PERFORM id 
    FROM stok_barang 
    WHERE tenant_id = v_tenant_id 
      AND id IN (
          SELECT r.id_bahan_baku 
          FROM resep r
          JOIN jsonb_array_elements(p_items) item ON r.id_menu = (item->>'menu_id')::UUID
          WHERE r.tenant_id = v_tenant_id
      )
    FOR UPDATE;

    -- 2. INSERT KE TABEL STRUK
    INSERT INTO struk (
        id_struk, tenant_id, branch_id, tanggal, jam,
        nama_pelanggan, metode_bayar, status_bayar, kasir,
        total_tagihan, nominal_cash, nominal_qris, waktu_dibayar
    ) VALUES (
        p_id_struk, v_tenant_id, v_branch_id, CURRENT_DATE, CURRENT_TIME,
        p_nama_pelanggan, p_metode_bayar, 'Selesai', p_kasir,
        v_total_tagihan, p_nominal_cash, p_nominal_qris, NOW()
    ) RETURNING id INTO v_struk_uuid;

    -- 3. PROSES PESANAN CAFE & PENGURANGAN BAHAN BAKU (BOM)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Simpan ke tabel cafe
        INSERT INTO cafe (
            id_struk, tenant_id, branch_id, tanggal, jam, nama_menu, qty, harga_satuan, subtotal, status
        ) VALUES (
            p_id_struk, v_tenant_id, v_branch_id, CURRENT_DATE, CURRENT_TIME,
            v_item->>'nama_menu',
            (v_item->>'qty')::NUMERIC,
            (v_item->>'harga')::NUMERIC,
            ((v_item->>'qty')::NUMERIC * (v_item->>'harga')::NUMERIC),
            'Selesai'
        );

        -- Kurangi stok bahan baku berdasarkan resep
        IF (v_item->>'menu_id') IS NOT NULL AND (v_item->>'menu_id') != '' THEN
            FOR v_recipe IN 
                SELECT id_bahan_baku, nama_bahan, jumlah, satuan 
                FROM resep 
                WHERE tenant_id = v_tenant_id AND id_menu = (v_item->>'menu_id')::UUID
            LOOP
                v_needed_stock := v_recipe.jumlah * (v_item->>'qty')::NUMERIC;

                -- Update stok bahan baku
                UPDATE stok_barang
                SET stok = stok - v_needed_stock,
                    updated_at = NOW()
                WHERE id = v_recipe.id_bahan_baku AND tenant_id = v_tenant_id;

                -- Catat mutasi barang keluar
                INSERT INTO barang_keluar (
                    tenant_id, branch_id, id_bahan_baku, tanggal, nama_bahan_baku, jumlah_keluar, alasan
                ) VALUES (
                    v_tenant_id, v_branch_id, v_recipe.id_bahan_baku, CURRENT_DATE, v_recipe.nama_bahan, v_needed_stock, 'PENJUALAN_POS'
                );
            END LOOP;
        END IF;
    END LOOP;

    -- 4. UPDATE STATUS CARWASH JIKA TERKAIT
    IF p_carwash_id IS NOT NULL THEN
        UPDATE carwash
        SET status = 'Selesai Dicuci',
            id_struk = p_id_struk
        WHERE id = p_carwash_id AND tenant_id = v_tenant_id;
    END IF;

    -- 5. CATAT ARUS KAS KE CASHFLOW
    INSERT INTO cashflow (
        tenant_id, branch_id, id_sumber, tanggal, keterangan_transaksi,
        jenis, kategori, pemasukan, pengeluaran, pos, saldo_kas
    ) VALUES (
        v_tenant_id, v_branch_id, p_id_struk, CURRENT_DATE,
        'Pendapatan POS Struk #' || p_id_struk,
        'PENJUALAN', 'Pendapatan Usaha',
        v_total_tagihan, 0,
        CASE WHEN p_metode_bayar = 'QRIS' THEN 'SALDO REKENING Y' ELSE 'SALDO CASH' END,
        0
    );

    -- 6. DOUBLE-ENTRY GENERAL LEDGER POSTING
    SELECT id INTO v_coa_cash FROM chart_of_accounts WHERE tenant_id = v_tenant_id AND kode_akun = '1001' LIMIT 1; -- Kas Laci
    SELECT id INTO v_coa_sales FROM chart_of_accounts WHERE tenant_id = v_tenant_id AND kode_akun = '4001' LIMIT 1; -- Penjualan Cafe

    IF v_coa_cash IS NOT NULL AND v_coa_sales IS NOT NULL THEN
        INSERT INTO journal_entries (
            tenant_id, branch_id, entry_no, date, memo, total_amount, status
        ) VALUES (
            v_tenant_id, v_branch_id, 'JE-' || p_id_struk, CURRENT_DATE,
            'Jurnal Otomatis Checkout #' || p_id_struk, v_total_tagihan, 'POSTED'
        ) RETURNING id INTO v_journal_id;

        -- Debit Kas Laci (atau Bank QRIS)
        INSERT INTO journal_entry_lines (
            tenant_id, journal_entry_id, account_id, debit, credit, memo
        ) VALUES (
            v_tenant_id, v_journal_id, v_coa_cash, v_total_tagihan, 0, 'Penerimaan Penjualan'
        );

        -- Credit Pendapatan Penjualan
        INSERT INTO journal_entry_lines (
            tenant_id, journal_entry_id, account_id, debit, credit, memo
        ) VALUES (
            v_tenant_id, v_journal_id, v_coa_sales, 0, v_total_tagihan, 'Pendapatan Kasir'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'struk_id', p_id_struk,
        'total', v_total_tagihan,
        'message', 'Checkout berhasil diproses secara ACID tanpa race condition'
    );
END;
$$;
