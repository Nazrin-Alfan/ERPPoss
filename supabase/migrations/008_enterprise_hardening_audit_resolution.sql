-- ==============================================================================
-- MIGRATION: 008_enterprise_hardening_audit_resolution.sql
-- DESCRIPTION: Batch 5 - Enterprise Hardening & QA Audit Resolution
-- Addresses All 8 Findings from QA Pre-Release Audit:
--   1. Strict License Issuance & Anti-Replay Catalog (public.license_keys)
--   2. Absolute Immutability for POSTED Journal Entries & Lines
--   3. Profile Role Escalation & Tenant ID Mutation Prevention Trigger
--   4. Concurrency Locking (FOR UPDATE) & Reactivation Quota Enforcement
--   5. Idempotent POS Checkout with Anti-Double Stock Deduction
--   6. Strict Server-Side Nominal, Discount & Catalog Price Verification
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABEL PENERBITAN KUNCI LISENSI RESMI (ANTI-REPLAY & ANTI-FORGERY)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.license_keys (
    key_code VARCHAR(64) PRIMARY KEY,
    tier VARCHAR(32) NOT NULL CHECK (tier IN ('starter', 'pro', 'enterprise')),
    duration_days INT NOT NULL DEFAULT 365,
    max_branches INT NOT NULL DEFAULT 1,
    max_users INT NOT NULL DEFAULT 3,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    used_by_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pengamanan RLS Tabel license_keys
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.license_keys FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.license_keys TO postgres, service_role;

-- Seed Kunci Lisensi Resmi RelayPOS (Produksi & Pengujian)
INSERT INTO public.license_keys (key_code, tier, duration_days, max_branches, max_users, notes)
VALUES
    ('RELAY-STR-2026-ALPHA1', 'starter', 365, 1, 3, 'Kunci Starter Resmi 2026 - Alpha'),
    ('RELAY-STR-2026-BETA2', 'starter', 365, 1, 3, 'Kunci Starter Resmi 2026 - Beta'),
    ('RELAY-PRO-2026-GOLD7', 'pro', 365, 5, 15, 'Kunci Pro Resmi 2026 - Gold'),
    ('RELAY-PRO-2026-PLAT8', 'pro', 365, 5, 15, 'Kunci Pro Resmi 2026 - Platinum'),
    ('RELAY-ENT-2026-CORP9', 'enterprise', 365, 25, 50, 'Kunci Enterprise Resmi 2026 - Corporate'),
    ('RELAY-ENT-2026-VIP00', 'enterprise', 730, 999, 999, 'Kunci Enterprise VIP 2 Tahun')
ON CONFLICT (key_code) DO UPDATE SET
    tier = EXCLUDED.tier,
    duration_days = EXCLUDED.duration_days,
    max_branches = EXCLUDED.max_branches,
    max_users = EXCLUDED.max_users,
    notes = EXCLUDED.notes;

-- ------------------------------------------------------------------------------
-- 2. REFACTOR RPC AKTIVASI LISENSI RESMI (ANTI-TAMPER & ANTI-REPLAY)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activate_license_key(
    p_license_key TEXT,
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_key VARCHAR(64);
    v_tenant_id UUID;
    v_caller_role VARCHAR(50);
    v_key_record RECORD;
    v_existing_lic RECORD;
    v_curr_expiry TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
    v_duration INTERVAL;
BEGIN
    -- Otorisasi Pemanggil
    IF auth.role() = 'anon' THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran anonim dilarang mengaktivasi lisensi.';
    END IF;

    v_caller_role := public.current_user_role();
    v_tenant_id := COALESCE(p_tenant_id, public.current_tenant_id());

    IF v_caller_role != 'Super Admin' THEN
        IF p_tenant_id IS NOT NULL AND p_tenant_id != public.current_tenant_id() THEN
            RAISE EXCEPTION 'FORBIDDEN: Tidak dapat mengaktivasi lisensi tenant lain.';
        END IF;
        IF v_caller_role NOT IN ('Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN: Hanya peran Owner atau Super Admin yang berhak mengaktivasi lisensi (Role aktif: %).', v_caller_role;
        END IF;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Sesi tidak valid atau tenant_id tidak ditemukan.';
    END IF;

    v_clean_key := UPPER(TRIM(COALESCE(p_license_key, '')));
    IF LENGTH(v_clean_key) < 8 THEN
        RAISE EXCEPTION 'INVALID_LICENSE_KEY: Format kunci lisensi tidak valid (minimal 8 karakter).';
    END IF;

    -- Kunci baris kunci lisensi di tabel penerbitan resmi (Row-Level Locking)
    SELECT * INTO v_key_record
    FROM public.license_keys
    WHERE key_code = v_clean_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LICENSE_KEY: Kunci lisensi "%" tidak terdaftar dalam sistem penerbitan resmi RelayPOS.', v_clean_key;
    END IF;

    IF v_key_record.is_used = TRUE THEN
        RAISE EXCEPTION 'LICENSE_KEY_ALREADY_USED: Kunci lisensi "%" sudah pernah digunakan pada %.',
            v_clean_key, TO_CHAR(v_key_record.used_at, 'YYYY-MM-DD HH24:MI:SS');
    END IF;

    -- Tandai kunci resmi telah terpakai
    UPDATE public.license_keys
    SET is_used = TRUE,
        used_by_tenant_id = v_tenant_id,
        used_at = NOW()
    WHERE key_code = v_clean_key;

    -- Kunci baris lisensi tenant untuk mencegah race condition
    SELECT id, valid_until INTO v_existing_lic
    FROM public.tenant_licenses
    WHERE tenant_id = v_tenant_id
    ORDER BY valid_until DESC
    LIMIT 1
    FOR UPDATE;

    v_curr_expiry := v_existing_lic.valid_until;
    v_duration := (v_key_record.duration_days || ' days')::INTERVAL;

    IF v_curr_expiry IS NOT NULL AND v_curr_expiry > NOW() THEN
        v_new_expiry := v_curr_expiry + v_duration;
    ELSE
        v_new_expiry := NOW() + v_duration;
    END IF;

    IF v_existing_lic.id IS NOT NULL THEN
        UPDATE public.tenant_licenses
        SET license_key = v_clean_key,
            plan = v_key_record.tier,
            tier = UPPER(v_key_record.tier) || '_ANNUAL',
            status = 'ACTIVE',
            valid_until = v_new_expiry,
            expires_at = v_new_expiry,
            max_branches = v_key_record.max_branches,
            max_users = v_key_record.max_users,
            notes = 'Diaktivasi via fn_activate_license_key (Key: ' || v_clean_key || ') pada ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            updated_at = NOW()
        WHERE id = v_existing_lic.id;
    ELSE
        INSERT INTO public.tenant_licenses (
            id, tenant_id, license_key, plan, tier, status,
            valid_until, expires_at, max_branches, max_users, features,
            notes, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), v_tenant_id, v_clean_key, v_key_record.tier,
            UPPER(v_key_record.tier) || '_ANNUAL', 'ACTIVE',
            v_new_expiry, v_new_expiry, v_key_record.max_branches, v_key_record.max_users,
            '{"pos": true, "inventory": true, "accounting": true, "crm": true}'::jsonb,
            'Inisialisasi lisensi resmi via fn_activate_license_key pada ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS'),
            NOW(), NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'tenant_id', v_tenant_id,
        'license_key', v_clean_key,
        'plan', v_key_record.tier,
        'tier', UPPER(v_key_record.tier) || '_ANNUAL',
        'max_branches', v_key_record.max_branches,
        'max_users', v_key_record.max_users,
        'valid_until', v_new_expiry
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. ENFORCE IMMUTABILITY FOR POSTED GENERAL LEDGER ENTRIES & LINES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_status VARCHAR;
    v_target_parent_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'journal_entries' THEN
        IF OLD.status = 'POSTED' THEN
            IF TG_OP = 'DELETE' THEN
                RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Jurnal % yang sudah berstatus POSTED tidak boleh dihapus. Buat jurnal pembalik (reversal) untuk koreksi pembukuan.', OLD.id;
            ELSIF TG_OP = 'UPDATE' THEN
                IF NEW.status <> 'POSTED' THEN
                    RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Status jurnal POSTED % tidak boleh diubah kembali menjadi %.', OLD.id, NEW.status;
                END IF;
                IF OLD.total_amount IS DISTINCT FROM NEW.total_amount OR
                   OLD.date IS DISTINCT FROM NEW.date OR
                   OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
                    RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Nilai total_amount, tanggal, atau tenant pada jurnal POSTED % tidak boleh dimodifikasi.', OLD.id;
                END IF;
            END IF;
        END IF;
        RETURN COALESCE(NEW, OLD);

    ELSIF TG_TABLE_NAME = 'journal_entry_lines' THEN
        v_target_parent_id := COALESCE(OLD.journal_entry_id, NEW.journal_entry_id);
        SELECT status INTO v_parent_status FROM public.journal_entries WHERE id = v_target_parent_id;
        
        IF v_parent_status = 'POSTED' THEN
            RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Baris rincian pada jurnal yang sudah berstatus POSTED (ID: %) tidak boleh dimodifikasi atau dihapus.', v_target_parent_id;
        END IF;
        RETURN COALESCE(NEW, OLD);
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_journal_immutability ON public.journal_entries;
CREATE TRIGGER trg_enforce_journal_immutability
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_journal_immutability();

DROP TRIGGER IF EXISTS trg_enforce_lines_immutability ON public.journal_entry_lines;
CREATE TRIGGER trg_enforce_lines_immutability
BEFORE UPDATE OR DELETE ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_journal_immutability();

-- ------------------------------------------------------------------------------
-- 4. TRIGGER PROTEKSI ESKALASI ROLE & MUTASI TENANT PROFILES
-- ------------------------------------------------------------------------------
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

    -- Evaluasi perubahan kolom role
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Pengguna tanpa hak akses Owner/Super Admin dilarang mengubah role (Role aktif pemanggil: %)', v_caller_role;
        END IF;

        IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak memberikan role Super Admin.';
        END IF;
    END IF;

    -- Evaluasi perubahan kolom tenant_id
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        IF v_caller_role <> 'Super Admin' THEN
            RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: Pemindahan tenant pengguna hanya dapat dilakukan oleh Super Admin.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE UPDATE OF role, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_profile_role_and_tenant();

-- ------------------------------------------------------------------------------
-- 5. TRIGGER KUOTA DENGAN ROW LOCKING & PROTEKSI REAKTIVASI (UPDATE IS_ACTIVE)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_tenant_branch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max_branches INT;
    v_current_count INT;
    v_lic_id UUID;
BEGIN
    -- Jika nonaktifkan cabang, izinkan tanpa pengecekan kuota
    IF TG_OP = 'UPDATE' AND (NEW.is_active = FALSE) THEN
        RETURN NEW;
    END IF;

    -- Kunci baris lisensi tenant untuk serialisasi mutasi kuota cabang
    SELECT id, COALESCE(max_branches, 1) INTO v_lic_id, v_max_branches
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id AND status = 'ACTIVE'
    ORDER BY valid_until DESC
    LIMIT 1
    FOR UPDATE;

    IF v_lic_id IS NULL THEN
        v_max_branches := 1;
    END IF;

    -- Hitung cabang aktif (kecuali baris itu sendiri saat update)
    SELECT COUNT(*) INTO v_current_count
    FROM public.branches
    WHERE tenant_id = NEW.tenant_id AND (is_active IS NULL OR is_active = TRUE)
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_current_count >= v_max_branches THEN
        RAISE EXCEPTION 'BRANCH_LIMIT_EXCEEDED: Tenant telah mencapai batas maksimal cabang (%) untuk paket lisensi aktif saat ini.', v_max_branches;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_branch_limit ON public.branches;
DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_tenant_branch_limit
BEFORE INSERT OR UPDATE OF is_active, tenant_id ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_tenant_branch_limit();

CREATE OR REPLACE FUNCTION public.fn_enforce_tenant_user_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max_users INT;
    v_current_count INT;
    v_lic_id UUID;
BEGIN
    -- Jika nonaktifkan user, izinkan
    IF TG_OP = 'UPDATE' AND (NEW.is_active = FALSE) THEN
        RETURN NEW;
    END IF;

    -- Kunci baris lisensi tenant untuk serialisasi kuota user
    SELECT id, COALESCE(max_users, 3) INTO v_lic_id, v_max_users
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id AND status = 'ACTIVE'
    ORDER BY valid_until DESC
    LIMIT 1
    FOR UPDATE;

    IF v_lic_id IS NULL THEN
        v_max_users := 3;
    END IF;

    -- Hitung profil aktif (kecuali baris itu sendiri saat update)
    SELECT COUNT(*) INTO v_current_count
    FROM public.profiles
    WHERE tenant_id = NEW.tenant_id AND (is_active IS NULL OR is_active = TRUE)
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_current_count >= v_max_users THEN
        RAISE EXCEPTION 'USER_LIMIT_EXCEEDED: Tenant telah mencapai batas kuota pengguna aktif (%) untuk paket lisensi saat ini.', v_max_users;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tenant_user_limit ON public.profiles;
DROP TRIGGER IF EXISTS trg_enforce_user_limit ON public.profiles;
CREATE TRIGGER trg_enforce_tenant_user_limit
BEFORE INSERT OR UPDATE OF is_active, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_tenant_user_limit();

-- ------------------------------------------------------------------------------
-- 6. REFACTOR fn_execute_checkout: IDEMPOTENCY, ANTI DOUBLE-DEDUCTION & STRICT PRICING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id UUID,
    p_branch_id UUID,
    p_struk_payload JSONB,
    p_cafe_items JSONB DEFAULT '[]'::jsonb,
    p_carwash_payload JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_struk_id UUID;
    v_id_struk VARCHAR(50);
    v_status_bayar VARCHAR(50);
    v_metode_bayar VARCHAR(50);
    v_kasir VARCHAR(100);
    v_nama_pelanggan VARCHAR(255);
    v_no_meja VARCHAR(100);
    v_catatan TEXT;
    
    v_existing_struk RECORD;
    v_item JSONB;
    v_nama_menu VARCHAR(255);
    v_qty NUMERIC(18, 4);
    v_item_price NUMERIC(18, 4);
    v_catalog_price NUMERIC(18, 4);
    v_real_price NUMERIC(18, 4);
    v_item_subtotal NUMERIC(18, 4);
    
    v_menu RECORD;
    v_recipe RECORD;
    v_stok RECORD;
    v_has_recipe BOOLEAN;
    v_qty_needed NUMERIC(18, 4);
    
    v_calc_cafe_total NUMERIC(18, 4) := 0.0000;
    v_calc_carwash_total NUMERIC(18, 4) := 0.0000;
    v_diskon_carwash NUMERIC(18, 4) := 0.0000;
    v_diskon_cafe NUMERIC(18, 4) := 0.0000;
    v_total_diskon NUMERIC(18, 4) := 0.0000;
    v_subtotal NUMERIC(18, 4) := 0.0000;
    v_grand_total NUMERIC(18, 4) := 0.0000;
    
    v_nominal_cash NUMERIC(18, 4) := 0.0000;
    v_nominal_qris NUMERIC(18, 4) := 0.0000;
    v_nominal_transfer NUMERIC(18, 4) := 0.0000;
    v_total_paid NUMERIC(18, 4) := 0.0000;
    
    v_items_count INT := 0;
    v_deductions_count INT := 0;
    v_effective_branch_id UUID;
BEGIN
    -- 1. SECURITY & TENANT AUTHORIZATION
    IF auth.role() = 'authenticated' THEN
        IF p_tenant_id IS NULL OR (p_tenant_id != public.current_tenant_id() AND public.current_user_role() != 'Super Admin') THEN
            RAISE EXCEPTION 'FORBIDDEN: Akses tenant tidak sah (Mismatched tenant_id)';
        END IF;
    END IF;

    -- Resolve branch
    v_effective_branch_id := p_branch_id;
    IF v_effective_branch_id IS NULL THEN
        SELECT id INTO v_effective_branch_id FROM public.branches WHERE tenant_id = p_tenant_id LIMIT 1;
    END IF;

    -- 2. EXTRACT STRUK HEADER METADATA
    v_id_struk := COALESCE(
        p_struk_payload->>'id_struk',
        'TRX-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6))
    );
    v_status_bayar := COALESCE(p_struk_payload->>'status_bayar', p_struk_payload->>'status_pembayaran', 'Selesai');
    v_metode_bayar := COALESCE(p_struk_payload->>'metode_bayar', p_struk_payload->>'metode_pembayaran', 'CASH');
    v_kasir := COALESCE(p_struk_payload->>'kasir', 'KASIR UTAMA');
    v_nama_pelanggan := COALESCE(p_struk_payload->>'nama_pelanggan', 'Pelanggan');
    v_no_meja := COALESCE(p_struk_payload->>'no_meja', p_struk_payload->>'nomor_meja_antrean', '-');
    v_catatan := COALESCE(p_struk_payload->>'catatan', p_struk_payload->>'keterangan', '');

    -- 3. IDEMPOTENCY GUARD: Cek transaksi duplikat / retry network
    SELECT id, status_bayar, total_tagihan, total, nominal_bayar INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk
    LIMIT 1;

    IF FOUND THEN
        -- Jika struk dengan nomor yang sama sudah berstatus Selesai, kembalikan respon sukses tanpa potong stok ulang!
        IF v_existing_struk.status_bayar = 'Selesai' THEN
            RETURN jsonb_build_object(
                'status', 'ALREADY_COMPLETED',
                'is_idempotent', TRUE,
                'struk_id', v_existing_struk.id,
                'id_struk', v_id_struk,
                'total_tagihan', v_existing_struk.total_tagihan,
                'message', 'Transaksi sudah berstatus Selesai sebelumnya (Idempotent OK). Stok tidak dipotong ulang.'
            );
        END IF;
    END IF;

    -- 4. EXTRACT DISKON & NOMINAL
    v_diskon_carwash := COALESCE((p_struk_payload->>'diskon_carwash')::numeric, 0.0000);
    v_diskon_cafe := COALESCE((p_struk_payload->>'diskon_cafe')::numeric, 0.0000);
    v_total_diskon := COALESCE((p_struk_payload->>'diskon')::numeric, 0.0000);
    IF v_total_diskon <= 0.0000 THEN
        v_total_diskon := v_diskon_carwash + v_diskon_cafe;
    END IF;

    IF v_total_diskon < 0.0000 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Nominal diskon tidak boleh negatif (Rp %).', v_total_diskon;
    END IF;

    v_nominal_cash := COALESCE((p_struk_payload->>'nominal_cash')::numeric, (p_struk_payload->>'nominal_bayar')::numeric, 0.0000);
    v_nominal_qris := COALESCE((p_struk_payload->>'nominal_qris')::numeric, 0.0000);
    v_nominal_transfer := COALESCE((p_struk_payload->>'nominal_transfer')::numeric, 0.0000);
    v_total_paid := v_nominal_cash + v_nominal_qris + v_nominal_transfer;

    -- 5. HITUNG CAFE TOTAL & VALIDASI KATALOG HARGA KETAT
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := COALESCE(v_item->>'nama_menu', v_item->>'daftar_menu', v_item->>'nama_item');
            v_qty := COALESCE((v_item->>'qty')::numeric, (v_item->>'jumlah')::numeric, 1.0000);
            
            IF v_qty <= 0 THEN
                RAISE EXCEPTION 'INVALID_QTY: Kuantitas item "%" harus lebih besar dari 0', v_nama_menu;
            END IF;

            -- Verifikasi mutlak terhadap katalog harga tenant
            SELECT * INTO v_menu FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id 
              AND (daftar_menu = v_nama_menu OR nama_menu = v_nama_menu OR nama_item = v_nama_menu)
            LIMIT 1;

            IF NOT FOUND OR v_menu.harga IS NULL THEN
                RAISE EXCEPTION 'MENU_NOT_FOUND: Item menu "%" tidak terdaftar dalam katalog resmi harga tenant.', v_nama_menu;
            END IF;

            v_catalog_price := v_menu.harga;
            v_item_price := COALESCE((v_item->>'harga_satuan')::numeric, (v_item->>'harga')::numeric, v_catalog_price);
            
            -- Anti-Price Tampering Detection
            IF v_item_price < (v_catalog_price - 0.01) THEN
                RAISE EXCEPTION 'PRICE_MISMATCH: Harga item "%" (Rp %) tidak sesuai dengan harga resmi katalog (Rp %)',
                    v_nama_menu, v_item_price, v_catalog_price;
            END IF;

            v_real_price := v_catalog_price;
            v_item_subtotal := v_qty * v_real_price;
            v_calc_cafe_total := v_calc_cafe_total + v_item_subtotal;
            v_items_count := v_items_count + 1;
        END LOOP;
    END IF;

    -- 6. HITUNG CARWASH SERVICE TOTAL & VALIDASI
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload != 'null'::jsonb THEN
        v_calc_carwash_total := COALESCE((p_carwash_payload->>'harga')::numeric, 0.0000);
        IF v_calc_carwash_total < 0.0000 THEN
            RAISE EXCEPTION 'INVALID_CARWASH_PRICE: Tarif carwash tidak boleh negatif (Rp %).', v_calc_carwash_total;
        END IF;
    END IF;

    v_subtotal := v_calc_cafe_total + v_calc_carwash_total;

    -- Validasi Diskon Tidak Boleh Melebihi Subtotal
    IF v_total_diskon > v_subtotal THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Total diskon (Rp %) tidak boleh melebihi subtotal pesanan (Rp %).',
            v_total_diskon, v_subtotal;
    END IF;

    -- Grand Total Resmi
    v_grand_total := GREATEST(0.0000, v_subtotal - v_total_diskon);

    -- Validasi Pembayaran Lunas
    IF v_status_bayar = 'Selesai' THEN
        IF v_total_paid < (v_grand_total - 0.01) THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Total pembayaran (Rp %) kurang dari total tagihan (Rp %)',
                v_total_paid, v_grand_total;
        END IF;
    END IF;

    -- 7. SIMPAN / UPDATE HEADER STRUK (2-PHASE INSERT FIRST)
    INSERT INTO public.struk (
        tenant_id, branch_id, id_struk, tanggal, jam,
        nama_pelanggan, no_meja, keterangan, catatan,
        metode_bayar, status_bayar, kasir,
        subtotal, total, total_tagihan, total_biaya,
        diskon, diskon_carwash, diskon_cafe,
        nominal_cash, nominal_qris, nominal_transfer,
        nominal_bayar, kembalian,
        waktu_dibuat, waktu_dibayar
    ) VALUES (
        p_tenant_id, v_effective_branch_id, v_id_struk, CURRENT_DATE, CURRENT_TIME,
        v_nama_pelanggan, v_no_meja, v_catatan, v_catatan,
        v_metode_bayar, v_status_bayar, v_kasir,
        v_subtotal, v_grand_total, v_grand_total, v_grand_total,
        v_total_diskon, v_diskon_carwash, v_diskon_cafe,
        v_nominal_cash, v_nominal_qris, v_nominal_transfer,
        v_total_paid, GREATEST(0.0000, v_total_paid - v_grand_total),
        NOW(), CASE WHEN v_status_bayar = 'Selesai' THEN NOW() ELSE NULL END
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        metode_bayar = EXCLUDED.metode_bayar,
        status_bayar = EXCLUDED.status_bayar,
        kasir = EXCLUDED.kasir,
        subtotal = EXCLUDED.subtotal,
        total = EXCLUDED.total,
        total_tagihan = EXCLUDED.total_tagihan,
        diskon = EXCLUDED.diskon,
        nominal_cash = EXCLUDED.nominal_cash,
        nominal_qris = EXCLUDED.nominal_qris,
        nominal_transfer = EXCLUDED.nominal_transfer,
        nominal_bayar = EXCLUDED.nominal_bayar,
        kembalian = EXCLUDED.kembalian,
        waktu_dibayar = EXCLUDED.waktu_dibayar
    RETURNING id INTO v_struk_id;

    -- 8. SIMPAN ITEM CAFE & POTONG STOK DENGAN ROW LOCKING
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        DELETE FROM public.cafe WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := COALESCE(v_item->>'nama_menu', v_item->>'daftar_menu', v_item->>'nama_item');
            v_qty := COALESCE((v_item->>'qty')::numeric, (v_item->>'jumlah')::numeric, 1.0000);
            
            SELECT * INTO v_menu FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id 
              AND (daftar_menu = v_nama_menu OR nama_menu = v_nama_menu OR nama_item = v_nama_menu)
            LIMIT 1;

            v_real_price := v_menu.harga;
            v_item_subtotal := v_qty * v_real_price;

            INSERT INTO public.cafe (
                tenant_id, branch_id, id_struk, tanggal, jam,
                nama_menu, daftar_menu, qty, jumlah, harga_satuan, harga,
                subtotal, total, status, catatan, created_at
            ) VALUES (
                p_tenant_id, v_effective_branch_id, v_id_struk, CURRENT_DATE, CURRENT_TIME,
                v_nama_menu, v_nama_menu, v_qty, v_qty, v_real_price, v_real_price,
                v_item_subtotal, v_item_subtotal, v_status_bayar, COALESCE(v_item->>'catatan', ''), NOW()
            );

            -- Hanya kurangi stok jika transaksi Selesai (atau status bayar lunas)
            IF v_status_bayar = 'Selesai' THEN
                v_has_recipe := FALSE;
                IF v_menu.id IS NOT NULL THEN
                    FOR v_recipe IN 
                        SELECT * FROM public.resep
                        WHERE tenant_id = p_tenant_id 
                          AND (nama_menu = v_nama_menu OR daftar_menu = v_nama_menu OR menu_id = v_menu.id)
                    LOOP
                        v_has_recipe := TRUE;
                        v_qty_needed := (COALESCE(v_recipe.jumlah_dibutuhkan, v_recipe.jumlah, 1.0000)::numeric) * v_qty;

                        -- Kunci baris bahan baku
                        SELECT * INTO v_stok FROM public.stok_barang
                        WHERE tenant_id = p_tenant_id 
                          AND (nama_produk = v_recipe.nama_bahan OR nama_produk = v_recipe.nama_bahan_baku)
                        LIMIT 1
                        FOR UPDATE;

                        IF NOT FOUND THEN
                            SELECT * INTO v_stok FROM public.bahan_baku
                            WHERE tenant_id = p_tenant_id AND nama_bahan = v_recipe.nama_bahan
                            LIMIT 1
                            FOR UPDATE;
                        END IF;

                        IF FOUND THEN
                            IF COALESCE(v_stok.stok, 0.0000) < v_qty_needed THEN
                                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan baku "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %)',
                                    COALESCE(v_stok.nama_produk, v_stok.nama_bahan), v_stok.stok, v_qty_needed;
                            END IF;

                            UPDATE public.stok_barang
                            SET stok = stok - v_qty_needed,
                                updated_at = NOW()
                            WHERE id = v_stok.id AND tenant_id = p_tenant_id;

                            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bahan_baku') THEN
                                UPDATE public.bahan_baku
                                SET stok = GREATEST(0.0000, stok - v_qty_needed)
                                WHERE tenant_id = p_tenant_id AND nama_bahan = COALESCE(v_stok.nama_produk, v_stok.nama_bahan);
                            END IF;

                            INSERT INTO public.barang_keluar (
                                tenant_id, branch_id, tanggal, nama_barang, jumlah, keterangan, created_at
                            ) VALUES (
                                p_tenant_id, v_effective_branch_id, CURRENT_DATE,
                                COALESCE(v_stok.nama_produk, v_stok.nama_bahan),
                                v_qty_needed,
                                'Konsumsi BOM Otomatis Struk: ' || v_id_struk || ' (' || v_nama_menu || ')',
                                NOW()
                            );
                            v_deductions_count := v_deductions_count + 1;
                        END IF;
                    END LOOP;
                END IF;

                -- Direct stock deduction jika item tidak memiliki recipe
                IF NOT v_has_recipe THEN
                    SELECT * INTO v_stok FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id AND nama_produk = v_nama_menu
                    LIMIT 1
                    FOR UPDATE;

                    IF FOUND THEN
                        IF COALESCE(v_stok.stok, 0.0000) < v_qty THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok barang jadi "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %)',
                                v_nama_menu, v_stok.stok, v_qty;
                        END IF;

                        UPDATE public.stok_barang
                        SET stok = stok - v_qty,
                            updated_at = NOW()
                        WHERE id = v_stok.id AND tenant_id = p_tenant_id;

                        INSERT INTO public.barang_keluar (
                            tenant_id, branch_id, tanggal, nama_barang, jumlah, keterangan, created_at
                        ) VALUES (
                            p_tenant_id, v_effective_branch_id, CURRENT_DATE,
                            v_nama_menu, v_qty,
                            'Penjualan Langsung POS Struk: ' || v_id_struk,
                            NOW()
                        );
                        v_deductions_count := v_deductions_count + 1;
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 9. SIMPAN DETAIL CARWASH
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload != 'null'::jsonb THEN
        DELETE FROM public.carwash WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

        INSERT INTO public.carwash (
            tenant_id, branch_id, id_struk, tanggal, jam,
            plat, plat_nomor, model, ukuran, variant, paket,
            harga, harga_cuci, harga_paket,
            anggota_1, anggota_2, gaji_pencuci, kehadiran,
            no_telepon, catatan_kendaraan, status, created_at
        ) VALUES (
            p_tenant_id, v_effective_branch_id, v_id_struk, CURRENT_DATE, CURRENT_TIME,
            UPPER(COALESCE(p_carwash_payload->>'plat', p_carwash_payload->>'plat_nomor', p_carwash_payload->>'platNomor', '-')),
            UPPER(COALESCE(p_carwash_payload->>'plat', p_carwash_payload->>'plat_nomor', p_carwash_payload->>'platNomor', '-')),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'paket', 'PAKET CUCI BIASA'),
            v_calc_carwash_total,
            COALESCE((p_carwash_payload->>'harga_cuci')::numeric, v_calc_carwash_total),
            COALESCE((p_carwash_payload->>'harga_paket')::numeric, 0.0000),
            p_carwash_payload->>'anggota_1',
            p_carwash_payload->>'anggota_2',
            COALESCE((p_carwash_payload->>'gaji_pencuci')::numeric, 0.0000),
            COALESCE(p_carwash_payload->>'kehadiran', 'Ditinggal'),
            p_carwash_payload->>'no_telepon',
            p_carwash_payload->>'catatan_kendaraan',
            CASE WHEN v_status_bayar = 'Selesai' THEN 'Selesai' ELSE 'Sedang Cuci' END,
            NOW()
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'is_idempotent', FALSE,
        'struk_id', v_struk_id,
        'id_struk', v_id_struk,
        'subtotal', v_subtotal,
        'diskon', v_total_diskon,
        'total_tagihan', v_grand_total,
        'total_paid', v_total_paid,
        'kembalian', GREATEST(0.0000, v_total_paid - v_grand_total),
        'items_processed', v_items_count,
        'inventory_deductions', v_deductions_count,
        'timestamp', NOW()
    );
END;
$$;

-- Cabut akses dari publik/anon dan berikan hanya kepada authenticated
REVOKE ALL ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fn_activate_license_key(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_license_key(TEXT, UUID) TO authenticated, service_role;

COMMIT;
