"""
Deploy Database Rock-Solid Alignment to Supabase Cloud
Aligns all 13 operational tables, adds ON DELETE CASCADE, establishes column aliases and triggers.
"""
import os
import json
import subprocess
import sys

SQL_MIGRATION = """
-- ============================================================================
-- 1. FIX USER ROLE PERMISSIONS (ALLOW SUPER ADMIN & POSTGRES DB ROLES)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS character varying
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
    SELECT CASE 
        WHEN CURRENT_USER IN ('postgres', 'supabase_admin') THEN 'Super Admin'
        ELSE COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1), 'Kasir')
    END;
$$;

-- Allow founder RPC to run seamlessly for Super Admin or Postgres maintenance
CREATE OR REPLACE FUNCTION public.fn_founder_create_tenant(
    p_store_name TEXT,
    p_owner_name TEXT,
    p_owner_email TEXT,
    p_owner_password TEXT DEFAULT 'password123',
    p_telepon TEXT DEFAULT '-',
    p_alamat TEXT DEFAULT '-',
    p_business_type TEXT DEFAULT 'HYBRID',
    p_plan TEXT DEFAULT 'pro',
    p_license_months INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
    v_caller_role TEXT;
    v_user_id UUID;
    v_tenant_id UUID;
    v_branch_id UUID;
    v_license_id UUID;
    v_license_key TEXT;
    v_clean_slug TEXT;
    v_plan TEXT;
    v_result JSONB;
BEGIN
    v_caller_role := public.current_user_role();
    IF v_caller_role != 'Super Admin' AND CURRENT_USER NOT IN ('postgres', 'supabase_admin') THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya Founder / Super Admin yang berwenang menerbitkan tenant baru (Role aktif Anda: %)', v_caller_role;
    END IF;

    v_plan := LOWER(COALESCE(p_plan, 'pro'));
    IF v_plan LIKE '%enterprise%' THEN
        v_plan := 'enterprise';
    ELSIF v_plan LIKE '%basic%' THEN
        v_plan := 'basic';
    ELSE
        v_plan := 'pro';
    END IF;

    v_clean_slug := LOWER(REGEXP_REPLACE(p_store_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_clean_slug := TRIM(BOTH '-' FROM v_clean_slug);
    IF v_clean_slug = '' THEN
        v_clean_slug := 'store';
    END IF;

    IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_clean_slug) THEN
        v_clean_slug := v_clean_slug || '-' || SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6);
    END IF;

    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (
        id, nama, slug, plan, status, business_type, created_at, updated_at
    ) VALUES (
        v_tenant_id,
        TRIM(p_store_name),
        v_clean_slug,
        v_plan,
        'active',
        COALESCE(p_business_type, 'HYBRID'),
        NOW(),
        NOW()
    );

    v_branch_id := gen_random_uuid();
    INSERT INTO public.branches (
        id, tenant_id, nama, kode, alamat, telepon, is_active, created_at, updated_at
    ) VALUES (
        v_branch_id,
        v_tenant_id,
        'Cabang Utama (' || TRIM(p_store_name) || ')',
        'MAIN',
        COALESCE(p_alamat, '-'),
        COALESCE(p_telepon, '-'),
        TRUE,
        NOW(),
        NOW()
    );

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(TRIM(p_owner_email));

    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            created_at, updated_at, confirmation_token, recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            LOWER(TRIM(p_owner_email)),
            extensions.crypt(COALESCE(p_owner_password, 'password123'), extensions.gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'sub', v_user_id::text,
                'nama', COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
                'role', 'Owner',
                'tenant_name', TRIM(p_store_name),
                'business_type', COALESCE(p_business_type, 'HYBRID'),
                'email_verified', true
            ),
            NOW(), NOW(), '', ''
        );

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            jsonb_build_object('sub', v_user_id::text, 'email', LOWER(TRIM(p_owner_email))),
            'email',
            NOW(), NOW(), NOW()
        );
    END IF;

    INSERT INTO public.profiles (
        id, tenant_id, branch_id, nama, email, role, is_active, created_at, updated_at
    ) VALUES (
        v_user_id,
        v_tenant_id,
        v_branch_id,
        COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
        LOWER(TRIM(p_owner_email)),
        'Owner',
        TRUE,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW();

    v_license_id := gen_random_uuid();
    v_license_key := 'RLY-' || UPPER(SUBSTR(MD5(RANDOM()::text), 1, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 5, 4)) || '-' || UPPER(SUBSTR(MD5(RANDOM()::text), 9, 4));

    INSERT INTO public.tenant_licenses (
        id, tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features, created_at, updated_at
    ) VALUES (
        v_license_id,
        v_tenant_id,
        v_license_key,
        v_plan,
        'active',
        NOW() + (COALESCE(p_license_months, 12) || ' months')::interval,
        5,
        15,
        '{"pos": true, "inventory": true, "finance": true, "reports": true}'::jsonb,
        NOW(),
        NOW()
    );

    v_result := jsonb_build_object(
        'success', true,
        'tenant_id', v_tenant_id,
        'branch_id', v_branch_id,
        'user_id', v_user_id,
        'nama', TRIM(p_store_name),
        'slug', v_clean_slug,
        'plan', v_plan,
        'status', 'active',
        'business_type', COALESCE(p_business_type, 'HYBRID'),
        'owner_name', COALESCE(NULLIF(TRIM(p_owner_name), ''), 'Owner ' || TRIM(p_store_name)),
        'owner_email', LOWER(TRIM(p_owner_email)),
        'owner_password', COALESCE(p_owner_password, 'password123'),
        'license_key', v_license_key,
        'telepon', COALESCE(p_telepon, '-'),
        'alamat', COALESCE(p_alamat, '-')
    );

    RETURN v_result;
END;
$$;

-- ============================================================================
-- 2. CASCADE DELETE ON TENANTS FOREIGN KEYS
-- ============================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname, conrelid::regclass AS table_name
        FROM pg_constraint
        WHERE confrelid = 'public.tenants'::regclass AND contype = 'f' AND confdeltype != 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT ' || quote_ident(r.conname) || ';';
        EXECUTE 'ALTER TABLE ' || r.table_name || ' ADD CONSTRAINT ' || quote_ident(r.conname) || 
                ' FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;';
    END LOOP;
END $$;

-- ============================================================================
-- 3. ALIGN COLUMNS AND DEFAULTS ON OPERATIONAL TABLES
-- ============================================================================

-- A. STRUK
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total_biaya NUMERIC(18, 4);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS total NUMERIC(18, 4);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS subtotal NUMERIC(18, 4);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS diskon NUMERIC(18, 4);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS status_pembayaran VARCHAR(50);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS metode_pembayaran VARCHAR(50);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS nominal_bayar NUMERIC(18, 4);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS kembalian NUMERIC(18, 4);
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS catatan TEXT;
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS waktu_dibayar TIMESTAMPTZ;

ALTER TABLE public.struk ALTER COLUMN metode_bayar SET DEFAULT 'CASH';
ALTER TABLE public.struk ALTER COLUMN status_bayar SET DEFAULT 'Selesai';
ALTER TABLE public.struk ALTER COLUMN total_tagihan SET DEFAULT 0.00;
ALTER TABLE public.struk ALTER COLUMN nominal_cash SET DEFAULT 0.00;
ALTER TABLE public.struk ALTER COLUMN nominal_qris SET DEFAULT 0.00;
ALTER TABLE public.struk ALTER COLUMN nominal_transfer SET DEFAULT 0.00;
ALTER TABLE public.struk ALTER COLUMN diskon_carwash SET DEFAULT 0.00;
ALTER TABLE public.struk ALTER COLUMN diskon_cafe SET DEFAULT 0.00;
ALTER TABLE public.struk ALTER COLUMN waktu_dibuat SET DEFAULT NOW();
ALTER TABLE public.struk ALTER COLUMN kasir SET DEFAULT 'KASIR UTAMA';
ALTER TABLE public.struk ALTER COLUMN tanggal SET DEFAULT CURRENT_DATE;
ALTER TABLE public.struk ALTER COLUMN jam SET DEFAULT CURRENT_TIME;
ALTER TABLE public.struk ALTER COLUMN id_struk SET DEFAULT 'TRX-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

-- B. CARWASH
ALTER TABLE public.carwash ADD COLUMN IF NOT EXISTS catatan_kendaraan TEXT;
ALTER TABLE public.carwash ADD COLUMN IF NOT EXISTS no_telepon VARCHAR(50);

ALTER TABLE public.carwash ALTER COLUMN plat SET DEFAULT 'TANPA-PLAT';
ALTER TABLE public.carwash ALTER COLUMN tanggal SET DEFAULT CURRENT_DATE;
ALTER TABLE public.carwash ALTER COLUMN jam SET DEFAULT CURRENT_TIME;
ALTER TABLE public.carwash ALTER COLUMN gaji_anggota SET DEFAULT 0.00;
ALTER TABLE public.carwash ALTER COLUMN status SET DEFAULT 'Selesai';
ALTER TABLE public.carwash ALTER COLUMN harga SET DEFAULT 0.00;

-- C. CAFE
ALTER TABLE public.cafe ADD COLUMN IF NOT EXISTS catatan TEXT;

ALTER TABLE public.cafe ALTER COLUMN nama_menu SET DEFAULT 'Item Cafe';
ALTER TABLE public.cafe ALTER COLUMN tanggal SET DEFAULT CURRENT_DATE;
ALTER TABLE public.cafe ALTER COLUMN jam SET DEFAULT CURRENT_TIME;
ALTER TABLE public.cafe ALTER COLUMN harga_satuan SET DEFAULT 0.00;
ALTER TABLE public.cafe ALTER COLUMN subtotal SET DEFAULT 0.00;
ALTER TABLE public.cafe ALTER COLUMN status SET DEFAULT 'Selesai';
ALTER TABLE public.cafe ALTER COLUMN id_detail SET DEFAULT 'DTL-' || upper(substr(md5(random()::text), 1, 8));

-- D. BARANG MASUK
ALTER TABLE public.barang_masuk ADD COLUMN IF NOT EXISTS id_masuk VARCHAR(100);
ALTER TABLE public.barang_masuk ADD COLUMN IF NOT EXISTS id_pengeluaran VARCHAR(100);
ALTER TABLE public.barang_masuk ADD COLUMN IF NOT EXISTS id_cashflow VARCHAR(100);
ALTER TABLE public.barang_masuk ADD COLUMN IF NOT EXISTS nama_produk VARCHAR(200);
ALTER TABLE public.barang_masuk ALTER COLUMN id_bahan_baku DROP NOT NULL;
ALTER TABLE public.barang_masuk ALTER COLUMN tanggal SET DEFAULT CURRENT_DATE;
ALTER TABLE public.barang_masuk ALTER COLUMN jumlah_masuk SET DEFAULT 0.00;
ALTER TABLE public.barang_masuk ALTER COLUMN harga_satuan SET DEFAULT 0.00;
ALTER TABLE public.barang_masuk ALTER COLUMN total_harga SET DEFAULT 0.00;

-- E. BARANG KELUAR
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS id_keluar VARCHAR(100);
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS id_detail VARCHAR(100);
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS id_barang VARCHAR(100);
ALTER TABLE public.barang_keluar ADD COLUMN IF NOT EXISTS nama_produk VARCHAR(200);
ALTER TABLE public.barang_keluar ALTER COLUMN id_bahan_baku DROP NOT NULL;
ALTER TABLE public.barang_keluar ALTER COLUMN tanggal SET DEFAULT CURRENT_DATE;
ALTER TABLE public.barang_keluar ALTER COLUMN jumlah_keluar SET DEFAULT 0.00;

-- F. PENGELUARAN
ALTER TABLE public.pengeluaran ADD COLUMN IF NOT EXISTS id_pengeluaran VARCHAR(100);
ALTER TABLE public.pengeluaran ADD COLUMN IF NOT EXISTS no INT;
ALTER TABLE public.pengeluaran ALTER COLUMN id_cashflow DROP NOT NULL;
ALTER TABLE public.pengeluaran ALTER COLUMN tanggal SET DEFAULT CURRENT_DATE;
ALTER TABLE public.pengeluaran ALTER COLUMN jam SET DEFAULT CURRENT_TIME;
ALTER TABLE public.pengeluaran ALTER COLUMN nominal SET DEFAULT 0.00;
ALTER TABLE public.pengeluaran ALTER COLUMN nama_pengeluaran SET DEFAULT 'Pengeluaran';

-- G. CASHFLOW
ALTER TABLE public.cashflow ADD COLUMN IF NOT EXISTS saldo_cash NUMERIC(18, 4) DEFAULT 0.0000;
ALTER TABLE public.cashflow ADD COLUMN IF NOT EXISTS saldo_rekening_y NUMERIC(18, 4) DEFAULT 0.0000;
ALTER TABLE public.cashflow ADD COLUMN IF NOT EXISTS saldo_rekening_n NUMERIC(18, 4) DEFAULT 0.0000;
ALTER TABLE public.cashflow ALTER COLUMN keterangan_transaksi SET DEFAULT '';
ALTER TABLE public.cashflow ALTER COLUMN id_cashflow SET DEFAULT 'CF-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

-- H. KARYAWAN CUCI
ALTER TABLE public.karyawan_cuci ADD COLUMN IF NOT EXISTS id_karyawan VARCHAR(100);
ALTER TABLE public.karyawan_cuci ADD COLUMN IF NOT EXISTS role VARCHAR(100) DEFAULT 'Pencuci';
ALTER TABLE public.karyawan_cuci ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Aktif';
ALTER TABLE public.karyawan_cuci ADD COLUMN IF NOT EXISTS telepon VARCHAR(50);
ALTER TABLE public.karyawan_cuci ADD COLUMN IF NOT EXISTS shift VARCHAR(50) DEFAULT 'Pagi';
ALTER TABLE public.karyawan_cuci ADD COLUMN IF NOT EXISTS gaji_pokok NUMERIC(14, 2) DEFAULT 0.00;

-- I. KARYAWAN KANTOR
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS id_karyawan VARCHAR(100);
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS role VARCHAR(100) DEFAULT 'Kasir';
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Aktif';
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS telepon VARCHAR(50);
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS shift VARCHAR(50) DEFAULT 'Pagi';
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS gaji_pokok NUMERIC(14, 2) DEFAULT 0.00;
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE public.karyawan_kantor ADD COLUMN IF NOT EXISTS source VARCHAR(100);

-- J. CARWASH PACKAGES
ALTER TABLE public.carwash_packages ADD COLUMN IF NOT EXISTS nama_paket VARCHAR(200);
ALTER TABLE public.carwash_packages ADD COLUMN IF NOT EXISTS tarif NUMERIC(14, 2);
ALTER TABLE public.carwash_packages ADD COLUMN IF NOT EXISTS komisi_skema VARCHAR(50);
ALTER TABLE public.carwash_packages ADD COLUMN IF NOT EXISTS komisi_value NUMERIC(14, 2);

-- K. DISKON
ALTER TABLE public.diskon ADD COLUMN IF NOT EXISTS id_diskon VARCHAR(100);
ALTER TABLE public.diskon ADD COLUMN IF NOT EXISTS nama_diskon VARCHAR(200);
ALTER TABLE public.diskon ADD COLUMN IF NOT EXISTS persen NUMERIC(5, 2) DEFAULT 0.00;
ALTER TABLE public.diskon ADD COLUMN IF NOT EXISTS potongan_tetap NUMERIC(14, 2) DEFAULT 0.00;

-- L. RESEP
ALTER TABLE public.resep ADD COLUMN IF NOT EXISTS daftar_menu VARCHAR(200);
ALTER TABLE public.resep ADD COLUMN IF NOT EXISTS nama_bahan_baku VARCHAR(200);
ALTER TABLE public.resep ADD COLUMN IF NOT EXISTS jumlah_pemakaian NUMERIC(14, 4);
ALTER TABLE public.resep ALTER COLUMN id_menu DROP NOT NULL;
ALTER TABLE public.resep ALTER COLUMN id_bahan_baku DROP NOT NULL;
ALTER TABLE public.resep ALTER COLUMN jumlah DROP NOT NULL;

-- ============================================================================
-- 4. BIDIRECTIONAL AUTO-SYNC TRIGGERS (BULLETPROOF DATA CONSISTENCY)
-- ============================================================================

-- A. STRUK TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_struk_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id_struk IS NULL OR NEW.id_struk = '' THEN
        NEW.id_struk := 'TRX-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));
    END IF;
    NEW.total_tagihan := COALESCE(NEW.total_tagihan, NEW.total, NEW.total_biaya, NEW.subtotal, 0.00);
    NEW.total := COALESCE(NEW.total, NEW.total_tagihan);
    NEW.total_biaya := COALESCE(NEW.total_biaya, NEW.total_tagihan);
    NEW.status_bayar := COALESCE(NEW.status_bayar, NEW.status_pembayaran, 'Selesai');
    NEW.status_pembayaran := COALESCE(NEW.status_pembayaran, NEW.status_bayar);
    NEW.metode_bayar := COALESCE(NEW.metode_bayar, NEW.metode_pembayaran, 'CASH');
    NEW.metode_pembayaran := COALESCE(NEW.metode_pembayaran, NEW.metode_bayar);
    NEW.waktu_dibuat := COALESCE(NEW.waktu_dibuat, NEW.created_at, NOW());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_struk ON public.struk;
CREATE TRIGGER trg_sync_struk
BEFORE INSERT OR UPDATE ON public.struk
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_struk_columns();

-- B. CARWASH TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_carwash_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.plat := COALESCE(NEW.plat, NEW.plat_nomor, 'TANPA-PLAT');
    NEW.plat_nomor := COALESCE(NEW.plat_nomor, NEW.plat);
    NEW.gaji_anggota := COALESCE(NEW.gaji_anggota, NEW.gaji_pencuci, 0.00);
    NEW.gaji_pencuci := COALESCE(NEW.gaji_pencuci, NEW.gaji_anggota);
    NEW.harga := COALESCE(NEW.harga, NEW.harga_cuci, NEW.harga_paket, 0.00);
    NEW.harga_cuci := COALESCE(NEW.harga_cuci, NEW.harga);
    NEW.id_transaksi := COALESCE(NEW.id_transaksi, NEW.id_struk, 'CW-' || substr(NEW.id::text, 1, 8));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_carwash ON public.carwash;
CREATE TRIGGER trg_sync_carwash
BEFORE INSERT OR UPDATE ON public.carwash
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_carwash_columns();

-- C. CAFE TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_cafe_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id_detail IS NULL OR NEW.id_detail = '' THEN
        NEW.id_detail := 'DTL-' || upper(substr(md5(random()::text), 1, 8));
    END IF;
    NEW.nama_menu := COALESCE(NEW.nama_menu, NEW.daftar_menu, NEW.nama_item, 'Menu Cafe');
    NEW.daftar_menu := COALESCE(NEW.daftar_menu, NEW.nama_menu);
    NEW.harga_satuan := COALESCE(NEW.harga_satuan, NEW.harga, 0.00);
    NEW.harga := COALESCE(NEW.harga, NEW.harga_satuan);
    NEW.subtotal := COALESCE(NEW.subtotal, NEW.total, NEW.total_harga, (NEW.qty * NEW.harga_satuan));
    NEW.total := COALESCE(NEW.total, NEW.subtotal);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cafe ON public.cafe;
CREATE TRIGGER trg_sync_cafe
BEFORE INSERT OR UPDATE ON public.cafe
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cafe_columns();

-- D. BARANG MASUK TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_barang_masuk_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.id_masuk := COALESCE(NEW.id_masuk, 'BM-' || upper(substr(md5(random()::text), 1, 8)));
    NEW.nama_barang := COALESCE(NEW.nama_barang, NEW.nama_produk, NEW.nama_bahan_baku);
    NEW.nama_produk := COALESCE(NEW.nama_produk, NEW.nama_barang);
    NEW.nama_bahan_baku := COALESCE(NEW.nama_bahan_baku, NEW.nama_barang);
    IF (NEW.total_harga IS NULL OR NEW.total_harga = 0) AND (NEW.jumlah_masuk > 0 AND NEW.harga_satuan > 0) THEN
        NEW.total_harga := NEW.jumlah_masuk * NEW.harga_satuan;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_barang_masuk ON public.barang_masuk;
CREATE TRIGGER trg_sync_barang_masuk
BEFORE INSERT OR UPDATE ON public.barang_masuk
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_barang_masuk_columns();

-- E. BARANG KELUAR TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_barang_keluar_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.id_keluar := COALESCE(NEW.id_keluar, 'BK-' || upper(substr(md5(random()::text), 1, 8)));
    NEW.nama_bahan_baku := COALESCE(NEW.nama_bahan_baku, NEW.nama_produk);
    NEW.nama_produk := COALESCE(NEW.nama_produk, NEW.nama_bahan_baku);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_barang_keluar ON public.barang_keluar;
CREATE TRIGGER trg_sync_barang_keluar
BEFORE INSERT OR UPDATE ON public.barang_keluar
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_barang_keluar_columns();

-- F. PENGELUARAN TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_pengeluaran_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.id_pengeluaran := COALESCE(NEW.id_pengeluaran, 'EXP-' || upper(substr(md5(random()::text), 1, 8)));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pengeluaran ON public.pengeluaran;
CREATE TRIGGER trg_sync_pengeluaran
BEFORE INSERT OR UPDATE ON public.pengeluaran
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_pengeluaran_columns();

-- G. DISKON TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_diskon_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.id_diskon := COALESCE(NEW.id_diskon, NEW.id::text);
    NEW.nama := COALESCE(NEW.nama, NEW.nama_diskon, 'Diskon');
    NEW.nama_diskon := COALESCE(NEW.nama_diskon, NEW.nama);
    NEW.nominal := COALESCE(NEW.nominal, NULLIF(NEW.potongan_tetap, 0), NEW.persen, 0.00);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_diskon ON public.diskon;
CREATE TRIGGER trg_sync_diskon
BEFORE INSERT OR UPDATE ON public.diskon
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_diskon_columns();

-- H. RESEP TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_resep_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.nama_menu := COALESCE(NEW.nama_menu, NEW.daftar_menu, 'Menu');
    NEW.daftar_menu := COALESCE(NEW.daftar_menu, NEW.nama_menu);
    NEW.nama_bahan := COALESCE(NEW.nama_bahan, NEW.nama_bahan_baku, 'Bahan');
    NEW.nama_bahan_baku := COALESCE(NEW.nama_bahan_baku, NEW.nama_bahan);
    NEW.jumlah := COALESCE(NEW.jumlah, NEW.jumlah_pemakaian, NEW.jumlah_dibutuhkan, 0.00);
    NEW.jumlah_pemakaian := COALESCE(NEW.jumlah_pemakaian, NEW.jumlah);
    NEW.jumlah_dibutuhkan := COALESCE(NEW.jumlah_dibutuhkan, NEW.jumlah);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_resep ON public.resep;
CREATE TRIGGER trg_sync_resep
BEFORE INSERT OR UPDATE ON public.resep
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_resep_columns();

-- I. KARYAWAN SYNC TRIGGERS
CREATE OR REPLACE FUNCTION public.fn_sync_karyawan_cuci_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.id_karyawan := COALESCE(NEW.id_karyawan, NEW.id::text);
    NEW.status := CASE WHEN NEW.is_active THEN 'Aktif' ELSE 'Nonaktif' END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_karyawan_cuci ON public.karyawan_cuci;
CREATE TRIGGER trg_sync_karyawan_cuci
BEFORE INSERT OR UPDATE ON public.karyawan_cuci
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_karyawan_cuci_columns();

CREATE OR REPLACE FUNCTION public.fn_sync_karyawan_kantor_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.id_karyawan := COALESCE(NEW.id_karyawan, NEW.id::text);
    NEW.status := CASE WHEN NEW.is_active THEN 'Aktif' ELSE 'Nonaktif' END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_karyawan_kantor ON public.karyawan_kantor;
CREATE TRIGGER trg_sync_karyawan_kantor
BEFORE INSERT OR UPDATE ON public.karyawan_kantor
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_karyawan_kantor_columns();

-- J. CARWASH PACKAGES SYNC TRIGGER
CREATE OR REPLACE FUNCTION public.fn_sync_carwash_packages_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.name := COALESCE(NEW.name, NEW.nama_paket, 'Paket Cuci');
    NEW.nama_paket := COALESCE(NEW.nama_paket, NEW.name);
    NEW.price := COALESCE(NEW.price, NEW.tarif, 0.00);
    NEW.tarif := COALESCE(NEW.tarif, NEW.price);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_carwash_packages ON public.carwash_packages;
CREATE TRIGGER trg_sync_carwash_packages
BEFORE INSERT OR UPDATE ON public.carwash_packages
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_carwash_packages_columns();

-- ============================================================================
-- 5. RELOAD POSTGREST SCHEMA CACHE
-- ============================================================================
NOTIFY pgrst, 'reload schema';
"""

def main():
    print("Executing rock-solid database alignment on Supabase Cloud...")
    cmd = [sys.executable, "scripts/db_inspector.py", SQL_MIGRATION]
    result = subprocess.run(cmd, capture_output=True, text=True)
    print("OUTPUT:", result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

if __name__ == "__main__":
    main()
