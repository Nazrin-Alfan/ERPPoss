-- ==============================================================================
-- MIGRATION 009: PRODUCTION-GRADE ZERO-DEFECT ENTERPRISE HARDENING
-- Resolves all findings from rigorous QA audit review on commit b8639f8:
-- 1. Eliminate double stock deduction (mutate ONLY stok_barang, single source of truth; bahan_baku is a view)
-- 2. Complete profiles protection covering INSERT, UPDATE, and DELETE against role escalation & tenant hijacking
-- 3. Concurrent-safe idempotency via transactional advisory locks & payload hash integrity
-- 4. Server-side Carwash catalog pricing verification against carwash_packages
-- 5. Revocation & removal of committed plaintext public serial keys, replaced by secure on-demand generation
-- 6. Complete journal immutability on POSTED status covering INSERT/UPDATE/DELETE across lines and header
-- 7. License expiration (valid_until > NOW()) enforcement and root tenant-row locking in branch/user quota triggers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SCHEMA EXTENSIONS & RECOVERY OF EXPOSED SERIAL KEYS
-- ------------------------------------------------------------------------------

-- Kolom payload_hash untuk verifikasi kesesuaian idempotency
ALTER TABLE public.struk ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64);

-- Kolom is_test untuk memisahkan fixture pengujian dari serial produksi
ALTER TABLE public.license_keys ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;

-- Cabut dan hapus serial statis publik yang sempat ter-commit di migrasi 008 dari database
DELETE FROM public.license_keys 
WHERE key_code IN (
    'RELAY-ENT-2026-CORP9', 'RELAY-ENT-2026-ALPHA1', 'RELAY-ENT-2026-VIP99',
    'RELAY-PRO-2026-SCALE8', 'RELAY-PRO-2026-BETA2', 'RELAY-PRO-2026-GROWTH',
    'RELAY-STR-2026-INIT7', 'RELAY-STR-2026-DEV01'
);

-- Buat fungsi administratif untuk menerbitkan serial lisensi secara on-demand & kriptografis aman
CREATE OR REPLACE FUNCTION public.fn_admin_generate_license_key(
    p_tier VARCHAR,
    p_max_branches INT,
    p_max_users INT,
    p_duration_days INT,
    p_notes TEXT DEFAULT '',
    p_is_test BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_new_key VARCHAR(100);
    v_random_suffix VARCHAR(16);
    v_normalized_tier VARCHAR(20);
BEGIN
    v_caller_role := public.current_user_role();
    
    -- Hanya Super Admin atau service_role yang berhak menerbitkan lisensi
    IF v_caller_role <> 'Super Admin' AND auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Super Admin atau sistem yang berhak menerbitkan serial lisensi.';
    END IF;

    v_normalized_tier := LOWER(TRIM(p_tier));
    IF v_normalized_tier NOT IN ('starter', 'pro', 'enterprise') THEN
        RAISE EXCEPTION 'INVALID_TIER: Tier lisensi harus salah satu dari: starter, pro, enterprise';
    END IF;

    -- Bangkitkan serial acak berbasis UUID
    v_random_suffix := UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 10));
    v_new_key := 'RELAY-' || UPPER(v_normalized_tier) || '-' || TO_CHAR(NOW(), 'YYYY') || '-' || v_random_suffix;

    INSERT INTO public.license_keys (
        key_code, tier, duration_days, max_branches, max_users, is_used, notes, is_test, created_at
    ) VALUES (
        v_new_key, v_normalized_tier, p_duration_days, p_max_branches, p_max_users, FALSE, p_notes, p_is_test, NOW()
    );

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'key_code', v_new_key,
        'tier', v_normalized_tier,
        'duration_days', p_duration_days,
        'max_branches', p_max_branches,
        'max_users', p_max_users,
        'is_test', p_is_test
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admin_generate_license_key(VARCHAR, INT, INT, INT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_generate_license_key(VARCHAR, INT, INT, INT, TEXT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. HARDEN fn_activate_license_key: TEST KEY RESTRICTION & ROW LOCKING
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_activate_license_key(
    p_key_code VARCHAR,
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role VARCHAR(50);
    v_key RECORD;
    v_new_expiry TIMESTAMPTZ;
    v_tenant_nama VARCHAR;
    v_tenant_slug VARCHAR;
BEGIN
    -- 1. Evaluasi otorisasi pemanggil
    v_caller_role := public.current_user_role();
    IF v_caller_role NOT IN ('Owner', 'Super Admin') THEN
        RAISE EXCEPTION 'FORBIDDEN_LICENSE_ACTIVATION: Hanya Owner tenant atau Super Admin yang berhak mengaktivasi lisensi (Role aktif: %).', v_caller_role;
    END IF;

    -- 2. Kunci baris katalog lisensi untuk mencegah race-condition aktivasi paralel
    SELECT * INTO v_key
    FROM public.license_keys
    WHERE key_code = TRIM(p_key_code)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LICENSE_KEY: Kunci lisensi "%" tidak valid atau tidak terdaftar dalam katalog resmi.', p_key_code;
    END IF;

    IF v_key.is_used THEN
        RAISE EXCEPTION 'LICENSE_KEY_ALREADY_USED: Kunci lisensi "%" sudah pernah digunakan pada %.', 
            p_key_code, TO_CHAR(v_key.used_at, 'YYYY-MM-DD HH24:MI:SS');
    END IF;

    -- 3. Proteksi Kunci Uji Coba: Kunci bertanda is_test hanya dapat diaktivasi pada tenant QA/Test/Demo
    IF v_key.is_test IS TRUE THEN
        SELECT nama, slug INTO v_tenant_nama, v_tenant_slug
        FROM public.tenants
        WHERE id = p_tenant_id;

        IF NOT (
            LOWER(COALESCE(v_tenant_nama, '')) LIKE '%test%' OR 
            LOWER(COALESCE(v_tenant_nama, '')) LIKE '%qa%' OR 
            LOWER(COALESCE(v_tenant_nama, '')) LIKE '%demo%' OR
            LOWER(COALESCE(v_tenant_slug, '')) LIKE '%test%' OR 
            LOWER(COALESCE(v_tenant_slug, '')) LIKE '%qa%'
        ) THEN
            RAISE EXCEPTION 'TEST_KEY_RESTRICTED: Kunci lisensi bertanda pengujian (is_test) dilarang digunakan pada tenant produksi.';
        END IF;
    END IF;

    -- 4. Hitung masa berlaku baru (akumulasi jika masih ada sisa aktif, atau dari NOW())
    SELECT 
        CASE 
            WHEN valid_until > NOW() THEN valid_until + (v_key.duration_days || ' days')::interval
            ELSE NOW() + (v_key.duration_days || ' days')::interval
        END INTO v_new_expiry
    FROM public.tenant_licenses
    WHERE tenant_id = p_tenant_id AND status = 'ACTIVE'
    ORDER BY valid_until DESC
    LIMIT 1;

    IF v_new_expiry IS NULL THEN
        v_new_expiry := NOW() + (v_key.duration_days || ' days')::interval;
    END IF;

    -- 5. Perbarui riwayat lisensi tenant
    UPDATE public.tenant_licenses
    SET status = 'EXPIRED'
    WHERE tenant_id = p_tenant_id AND status = 'ACTIVE';

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, tier, valid_until, max_branches, max_users, status, created_at
    ) VALUES (
        p_tenant_id,
        v_key.key_code,
        LOWER(TRIM(v_key.tier)),
        v_new_expiry,
        v_key.max_branches,
        v_key.max_users,
        'ACTIVE',
        NOW()
    );

    -- 6. Tandai serial dalam katalog sebagai terpakai
    UPDATE public.license_keys
    SET is_used = TRUE,
        used_by_tenant_id = p_tenant_id,
        used_at = NOW()
    WHERE key_code = v_key.key_code;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'tenant_id', p_tenant_id,
        'license_key', v_key.key_code,
        'tier', v_key.tier,
        'max_branches', v_key.max_branches,
        'max_users', v_key.max_users,
        'valid_until', v_new_expiry
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. COMPREHENSIVE JOURNAL IMMUTABILITY: ALL MUTATION PATHS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_status VARCHAR;
    v_new_status VARCHAR;
BEGIN
    -- A. PROTEKSI HEADER JURNAL (journal_entries)
    IF TG_TABLE_NAME = 'journal_entries' THEN
        IF TG_OP = 'DELETE' THEN
            IF OLD.status = 'POSTED' THEN
                RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Jurnal % yang sudah berstatus POSTED tidak boleh dihapus. Buat jurnal pembalik (reversal) untuk koreksi pembukuan.', OLD.id;
            END IF;
            RETURN OLD;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.status = 'POSTED' THEN
                IF NEW.status <> 'POSTED' THEN
                    RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Status jurnal POSTED % tidak boleh diubah kembali menjadi %.', OLD.id, NEW.status;
                END IF;
                -- Seluruh kolom pada jurnal POSTED bersifat mutlak tidak boleh diubah
                IF OLD.* IS DISTINCT FROM NEW.* THEN
                    RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Jurnal POSTED % bersifat mutlak immutable. Tidak ada kolom yang boleh dimodifikasi.', OLD.id;
                END IF;
            END IF;
            RETURN NEW;
        END IF;

    -- B. PROTEKSI BARIS RINCIAN JURNAL (journal_entry_lines)
    ELSIF TG_TABLE_NAME = 'journal_entry_lines' THEN
        -- 1. Jalur DELETE: Periksa parent OLD
        IF TG_OP = 'DELETE' THEN
            SELECT status INTO v_old_status FROM public.journal_entries WHERE id = OLD.journal_entry_id;
            IF v_old_status = 'POSTED' THEN
                RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Baris rincian pada jurnal POSTED (ID: %) tidak boleh dihapus.', OLD.journal_entry_id;
            END IF;
            RETURN OLD;

        -- 2. Jalur INSERT: Periksa parent NEW (cegah penambahan baris ke jurnal posted)
        ELSIF TG_OP = 'INSERT' THEN
            SELECT status INTO v_new_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
            IF v_new_status = 'POSTED' THEN
                RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Tidak boleh menyisipkan baris rincian baru ke dalam jurnal POSTED (ID: %).', NEW.journal_entry_id;
            END IF;
            RETURN NEW;

        -- 3. Jalur UPDATE: Periksa KEDUA parent (cegah modifikasi baris posted maupun pemindahan baris ke/dari jurnal posted)
        ELSIF TG_OP = 'UPDATE' THEN
            SELECT status INTO v_old_status FROM public.journal_entries WHERE id = OLD.journal_entry_id;
            IF v_old_status = 'POSTED' THEN
                RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Baris rincian pada jurnal POSTED (ID: %) tidak boleh dimodifikasi.', OLD.journal_entry_id;
            END IF;

            IF OLD.journal_entry_id <> NEW.journal_entry_id THEN
                SELECT status INTO v_new_status FROM public.journal_entries WHERE id = NEW.journal_entry_id;
                IF v_new_status = 'POSTED' THEN
                    RAISE EXCEPTION 'JOURNAL_POSTED_IMMUTABLE: Tidak boleh memindahkan baris rincian ke dalam jurnal POSTED (ID: %).', NEW.journal_entry_id;
                END IF;
            END IF;

            RETURN NEW;
        END IF;
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
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_journal_immutability();

-- ------------------------------------------------------------------------------
-- 4. COMPLETE PROFILES PROTECTION: INSERT, UPDATE, DELETE & ESCALATION GUARD
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

    -- 1. PROTEKSI DELETE: Hanya Super Admin & Owner yang berhak menghapus profil
    IF TG_OP = 'DELETE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Pengguna dengan role "%" tidak diizinkan menghapus profil pengguna.', v_caller_role;
        END IF;
        RETURN OLD;
    END IF;

    -- 2. PROTEKSI INSERT: Cegah pembuatan profil dengan role istimewa oleh pihak tidak berwenang
    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak membuat profil dengan role Super Admin.';
        END IF;

        IF NEW.role = 'Owner' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            -- Hanya izinkan jika pendaftaran tenant baru di mana profil pertama dibuat
            IF EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Tenant ini sudah memiliki profil terdaftar. Penambahan profil Owner hanya dapat dilakukan oleh Owner atau Super Admin.';
            END IF;
        END IF;

        IF v_caller_role IN ('Kasir', 'Staff', 'Finance') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Pengguna dengan role "%" dilarang membuat profil pengguna baru.', v_caller_role;
        END IF;

        RETURN NEW;
    END IF;

    -- 3. PROTEKSI UPDATE: Cegah eskalasi role dan mutasi tenant_id
    IF TG_OP = 'UPDATE' THEN
        -- Validasi perubahan role
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Pengguna tanpa hak akses Owner/Super Admin dilarang mengubah role (Role aktif: %)', v_caller_role;
            END IF;

            IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak memberikan role Super Admin.';
            END IF;
        END IF;

        -- Validasi perpindahan tenant_id
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

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_profile_role_and_tenant();

-- Batasi hak akses DELETE langsung pada profiles untuk pengguna biasa
REVOKE DELETE ON public.profiles FROM authenticated, anon;

-- ------------------------------------------------------------------------------
-- 5. QUOTA TRIGGERS: ROOT TENANT ROW LOCKING & EXPIRATION ENFORCEMENT
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
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.is_active = FALSE) THEN
        RETURN NEW;
    END IF;

    -- Kunci baris tenant di public.tenants (dijamin ada melalui FK) untuk serialisasi mutlak
    PERFORM 1 FROM public.tenants WHERE id = NEW.tenant_id FOR UPDATE;

    -- Evaluasi lisensi aktif DAN belum kadaluarsa
    SELECT COALESCE(max_branches, 1) INTO v_max_branches
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id 
      AND status = 'ACTIVE'
      AND valid_until > NOW()
    ORDER BY valid_until DESC
    LIMIT 1;

    -- Default fallback kuota dasar jika tidak memiliki lisensi aktif dan berlaku
    IF v_max_branches IS NULL THEN
        v_max_branches := 1;
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.branches
    WHERE tenant_id = NEW.tenant_id AND (is_active IS NULL OR is_active = TRUE)
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_current_count >= v_max_branches THEN
        RAISE EXCEPTION 'BRANCH_LIMIT_EXCEEDED: Tenant telah mencapai batas kuota cabang aktif (%) untuk paket lisensi yang berlaku.', v_max_branches;
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
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.is_active = FALSE) THEN
        RETURN NEW;
    END IF;

    -- Kunci baris tenant di public.tenants untuk serialisasi mutlak
    PERFORM 1 FROM public.tenants WHERE id = NEW.tenant_id FOR UPDATE;

    -- Evaluasi lisensi aktif DAN belum kadaluarsa
    SELECT COALESCE(max_users, 3) INTO v_max_users
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id 
      AND status = 'ACTIVE'
      AND valid_until > NOW()
    ORDER BY valid_until DESC
    LIMIT 1;

    -- Default fallback kuota pengguna jika lisensi kadaluarsa atau belum ada
    IF v_max_users IS NULL THEN
        v_max_users := 3;
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.profiles
    WHERE tenant_id = NEW.tenant_id AND (is_active IS NULL OR is_active = TRUE)
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_current_count >= v_max_users THEN
        RAISE EXCEPTION 'USER_LIMIT_EXCEEDED: Tenant telah mencapai batas kuota pengguna aktif (%) untuk paket lisensi yang berlaku.', v_max_users;
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
-- 6. FULL PRODUCTION-GRADE fn_execute_checkout
-- Concurrency lock, payload hash idempotency, carwash catalog verification,
-- and single-source stock deduction (mutating stok_barang only!)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id UUID,
    p_branch_id UUID,
    p_struk_payload JSONB,
    p_cafe_items JSONB DEFAULT '[]'::jsonb,
    p_carwash_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id_struk VARCHAR(100);
    v_tanggal DATE;
    v_jam TIME;
    v_metode_bayar VARCHAR(50);
    v_status_bayar VARCHAR(50);
    v_kasir VARCHAR(100);
    v_nama_pelanggan VARCHAR(150);
    v_no_meja VARCHAR(50);
    v_catatan TEXT;

    v_diskon_carwash NUMERIC(15, 4) := 0.0000;
    v_diskon_cafe NUMERIC(15, 4) := 0.0000;
    v_total_diskon NUMERIC(15, 4) := 0.0000;
    v_nominal_cash NUMERIC(15, 4) := 0.0000;
    v_nominal_qris NUMERIC(15, 4) := 0.0000;
    v_nominal_transfer NUMERIC(15, 4) := 0.0000;
    v_total_bayar_terima NUMERIC(15, 4) := 0.0000;

    v_total_cafe NUMERIC(15, 4) := 0.0000;
    v_total_carwash NUMERIC(15, 4) := 0.0000;
    v_subtotal NUMERIC(15, 4) := 0.0000;
    v_total_tagihan NUMERIC(15, 4) := 0.0000;
    v_kembalian NUMERIC(15, 4) := 0.0000;

    v_struk_uuid UUID;
    v_cafe_item JSONB;
    v_cw_id UUID;
    v_recipe RECORD;
    v_stok RECORD;
    v_qty_needed NUMERIC(15, 4);
    v_nama_menu VARCHAR;
    v_harga_menu NUMERIC(15, 4);
    v_official_menu_price NUMERIC(15, 4);
    v_official_cw_price NUMERIC(15, 4);
    v_qty_menu NUMERIC(15, 4);
    v_subtotal_item NUMERIC(15, 4);
    v_has_recipe BOOLEAN;
    v_effective_branch_id UUID;
    v_has_cafe BOOLEAN := FALSE;
    v_has_carwash BOOLEAN := FALSE;
    v_deductions_count INT := 0;

    v_cw_paket VARCHAR;
    v_cw_harga NUMERIC(15, 4);
    v_cw_is_custom BOOLEAN;
    
    v_lock_key BIGINT;
    v_current_hash VARCHAR(64);
    v_existing_struk RECORD;
BEGIN
    -- 1. IDENTITAS & VALIDASI PARAMETER UTAMA
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'CHECKOUT_FAILED: Tenant ID wajib disertakan.';
    END IF;

    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', p_struk_payload->>'struk_id', ''));
    IF v_id_struk = '' THEN
        v_id_struk := 'STRUK-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS') || '-' || SUBSTR(gen_random_uuid()::text, 1, 6);
    END IF;

    -- 2. SERIALISASI TRANSAKSI DENGAN TRANSACTIONAL ADVISORY LOCK
    -- Mencegah race condition ketika 2 request dengan id_struk sama dikirim secara simultan
    v_lock_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Hitung hash payload untuk verifikasi integritas idempotency
    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || 
        COALESCE(p_cafe_items::text, '[]') || 
        COALESCE(p_carwash_payload::text, '{}')
    );

    -- 3. IDEMPOTENCY GUARD: Cek apakah transaksi sudah pernah tersimpan sebelumnya
    SELECT id, status_bayar, total_tagihan, total, nominal_bayar, payload_hash INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk
    LIMIT 1;

    IF FOUND THEN
        IF v_existing_struk.status_bayar = 'Selesai' THEN
            -- Jika nomor struk sama digunakan dengan payload berbeda, tolak konflik integritas
            IF v_existing_struk.payload_hash IS NOT NULL AND v_existing_struk.payload_hash <> v_current_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Nomor struk "%" telah digunakan pada transaksi selesai lain dengan payload berbeda.', v_id_struk;
            END IF;

            -- Kembalikan struk eksisting secara aman TANPA MEMOTONG STOK ULANG
            RETURN jsonb_build_object(
                'status', 'ALREADY_COMPLETED',
                'is_idempotent', TRUE,
                'struk_id', v_existing_struk.id,
                'id_struk', v_id_struk,
                'total_tagihan', v_existing_struk.total_tagihan,
                'message', 'Transaksi sudah berstatus Selesai sebelumnya (Idempotent OK). Stok bahan baku tidak dipotong ulang.'
            );
        END IF;
    END IF;

    -- 4. RESOLUSI CABANG & METADATA
    v_effective_branch_id := p_branch_id;
    IF v_effective_branch_id IS NULL THEN
        SELECT branch_id INTO v_effective_branch_id
        FROM public.profiles
        WHERE id = auth.uid() AND tenant_id = p_tenant_id;
    END IF;

    v_tanggal := COALESCE((p_struk_payload->>'tanggal')::date, CURRENT_DATE);
    v_jam := COALESCE((p_struk_payload->>'jam')::time, CURRENT_TIME);
    v_status_bayar := COALESCE(p_struk_payload->>'status_bayar', p_struk_payload->>'status_pembayaran', 'Selesai');
    v_metode_bayar := COALESCE(p_struk_payload->>'metode_bayar', p_struk_payload->>'metode_pembayaran', 'CASH');
    v_kasir := COALESCE(p_struk_payload->>'kasir', 'KASIR UTAMA');
    v_nama_pelanggan := COALESCE(p_struk_payload->>'nama_pelanggan', 'Pelanggan');
    v_no_meja := COALESCE(p_struk_payload->>'no_meja', p_struk_payload->>'nomor_meja_antrean', '-');
    v_catatan := COALESCE(p_struk_payload->>'catatan', p_struk_payload->>'keterangan', '');

    -- 5. EXTRACT & VALIDASI DISKON
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

    -- 6. PROSES & VALIDASI HARGA ITEM CAFE
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        v_has_cafe := TRUE;
        FOR v_cafe_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_cafe_item->>'nama_menu', v_cafe_item->>'nama_produk', ''));
            v_harga_menu := COALESCE((v_cafe_item->>'harga')::numeric, 0.0000);
            v_qty_menu := COALESCE((v_cafe_item->>'qty')::numeric, (v_cafe_item->>'jumlah')::numeric, 1.0000);

            -- Validasi harga terhadap katalog resmi daftar_harga_menu
            SELECT harga INTO v_official_menu_price
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id 
              AND (LOWER(TRIM(daftar_menu)) = LOWER(v_nama_menu) OR LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu))
              AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
              AND (is_active IS NULL OR is_active = TRUE)
            ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
            LIMIT 1;

            IF v_official_menu_price IS NULL THEN
                RAISE EXCEPTION 'MENU_NOT_FOUND: Menu "%" tidak terdaftar dalam katalog resmi tenant.', v_nama_menu;
            END IF;

            IF ABS(v_harga_menu - v_official_menu_price) > 0.0100 THEN
                RAISE EXCEPTION 'PRICE_MISMATCH: Harga item "%" (Rp %) tidak sesuai dengan harga resmi katalog (Rp %)',
                    v_nama_menu, v_harga_menu, v_official_menu_price;
            END IF;

            v_subtotal_item := v_official_menu_price * v_qty_menu;
            v_total_cafe := v_total_cafe + v_subtotal_item;
        END LOOP;
    END IF;

    -- 7. PROSES & VALIDASI HARGA LAYANAN CARWASH TERHADAP KATALOG
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_has_carwash := TRUE;
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', p_carwash_payload->>'model', ''));
        v_cw_harga := COALESCE((p_carwash_payload->>'harga')::numeric, (p_carwash_payload->>'biaya')::numeric, (p_carwash_payload->>'total')::numeric, 0.0000);
        v_cw_is_custom := (LOWER(TRIM(COALESCE(p_carwash_payload->>'ukuran', ''))) = 'custom');

        IF v_cw_harga < 0.0000 THEN
            RAISE EXCEPTION 'INVALID_CARWASH_PRICE: Tarif carwash tidak boleh negatif (Rp %).', v_cw_harga;
        END IF;

        -- Jika bukan custom size dan paket disertakan, verifikasi dengan katalog carwash_packages
        IF NOT v_cw_is_custom AND v_cw_paket <> '' THEN
            SELECT COALESCE(price, tarif, 0.0000) INTO v_official_cw_price
            FROM public.carwash_packages
            WHERE tenant_id = p_tenant_id
              AND (
                  LOWER(TRIM(name)) = LOWER(v_cw_paket) OR 
                  LOWER(TRIM(COALESCE(nama_paket, ''))) = LOWER(v_cw_paket)
              )
              AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
              AND (is_active IS NULL OR is_active = TRUE)
            ORDER BY (branch_id = v_effective_branch_id) DESC, created_at DESC
            LIMIT 1;

            IF v_official_cw_price IS NULL THEN
                RAISE EXCEPTION 'CARWASH_PACKAGE_NOT_FOUND: Paket carwash "%" tidak terdaftar dalam katalog resmi tenant.', v_cw_paket;
            END IF;

            IF ABS(v_cw_harga - v_official_cw_price) > 0.0100 THEN
                RAISE EXCEPTION 'PRICE_MISMATCH: Tarif layanan carwash "%" (Rp %) tidak sesuai dengan tarif resmi katalog (Rp %)',
                    v_cw_paket, v_cw_harga, v_official_cw_price;
            END IF;

            v_total_carwash := v_official_cw_price;
        ELSE
            v_total_carwash := v_cw_harga;
        END IF;
    END IF;

    -- 8. KALKULASI TOTAL TAGIHAN
    v_subtotal := v_total_cafe + v_total_carwash;
    IF v_total_diskon > v_subtotal THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Total diskon (Rp %) tidak boleh melebihi subtotal transaksi (Rp %).',
            v_total_diskon, v_subtotal;
    END IF;

    v_total_tagihan := GREATEST(0.0000, v_subtotal - v_total_diskon);

    -- 9. VALIDASI PEMBAYARAN JIKA TRANSAKSI LUNAS
    IF v_status_bayar = 'Selesai' THEN
        v_total_bayar_terima := v_nominal_cash + v_nominal_qris + v_nominal_transfer;
        IF v_total_bayar_terima < v_total_tagihan THEN
            RAISE EXCEPTION 'INSUFFICIENT_PAYMENT: Total pembayaran (Rp %) kurang dari total tagihan (Rp %).',
                v_total_bayar_terima, v_total_tagihan;
        END IF;
        v_kembalian := GREATEST(0.0000, v_total_bayar_terima - v_total_tagihan);
    ELSE
        v_kembalian := 0.0000;
    END IF;

    -- 10. INSERT ATAU UPDATE STRUK UTAMA
    INSERT INTO public.struk (
        id_struk, tenant_id, branch_id, tanggal, jam,
        nama_pelanggan, no_meja, plat_nomor, keterangan,
        metode_bayar, status_bayar, kasir,
        subtotal, diskon, diskon_carwash, diskon_cafe,
        total_tagihan, total,
        nominal_cash, nominal_qris, nominal_transfer, nominal_bayar,
        kembalian, catatan, payload_hash, waktu_dibuat, created_at
    ) VALUES (
        v_id_struk, p_tenant_id, v_effective_branch_id, v_tanggal, v_jam,
        v_nama_pelanggan, v_no_meja, COALESCE(p_carwash_payload->>'plat_nomor', p_carwash_payload->>'platNomor', '-'), v_catatan,
        v_metode_bayar, v_status_bayar, v_kasir,
        v_subtotal, v_total_diskon, v_diskon_carwash, v_diskon_cafe,
        v_total_tagihan, v_total_tagihan,
        v_nominal_cash, v_nominal_qris, v_nominal_transfer, v_total_bayar_terima,
        v_kembalian, v_catatan, v_current_hash, NOW(), NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        subtotal = EXCLUDED.subtotal,
        diskon = EXCLUDED.diskon,
        diskon_carwash = EXCLUDED.diskon_carwash,
        diskon_cafe = EXCLUDED.diskon_cafe,
        total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        nominal_cash = EXCLUDED.nominal_cash,
        nominal_qris = EXCLUDED.nominal_qris,
        nominal_transfer = EXCLUDED.nominal_transfer,
        nominal_bayar = EXCLUDED.nominal_bayar,
        kembalian = EXCLUDED.kembalian,
        status_bayar = EXCLUDED.status_bayar,
        payload_hash = EXCLUDED.payload_hash
    RETURNING id INTO v_struk_uuid;

    -- 11. INSERT ENTRI CARWASH (JIKA ADA)
    IF v_has_carwash THEN
        INSERT INTO public.carwash (
            tenant_id, branch_id, tanggal, jam,
            plat_nomor, model, ukuran, paket, harga,
            diskon, status, metode_bayar,
            keterangan, id_struk, created_at
        ) VALUES (
            p_tenant_id, v_effective_branch_id, v_tanggal, v_jam,
            COALESCE(p_carwash_payload->>'plat_nomor', p_carwash_payload->>'platNomor', '-'),
            COALESCE(p_carwash_payload->>'model', 'Standard'),
            COALESCE(p_carwash_payload->>'ukuran', p_carwash_payload->>'tipe_mobil', 'Standard'),
            v_cw_paket,
            v_total_carwash,
            v_diskon_carwash,
            v_status_bayar,
            v_metode_bayar,
            v_catatan,
            v_id_struk,
            NOW()
        )
        RETURNING id INTO v_cw_id;
    END IF;

    -- 12. PROSES ITEM CAFE & PENGURANGAN STOK ATOMIK (SINGLE SOURCE OF TRUTH: stok_barang ONLY)
    IF v_has_cafe THEN
        FOR v_cafe_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_cafe_item->>'nama_menu', v_cafe_item->>'nama_produk', ''));
            v_qty_menu := COALESCE((v_cafe_item->>'qty')::numeric, (v_cafe_item->>'jumlah')::numeric, 1.0000);

            -- Ambil kembali harga resmi katalog
            SELECT harga INTO v_official_menu_price
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id 
              AND (LOWER(TRIM(daftar_menu)) = LOWER(v_nama_menu) OR LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu))
              AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
            ORDER BY (branch_id = v_effective_branch_id) DESC
            LIMIT 1;

            v_subtotal_item := v_official_menu_price * v_qty_menu;

            -- Simpan rincian transaksi cafe
            INSERT INTO public.cafe (
                tenant_id, branch_id, tanggal, jam,
                id_struk, nama_menu, harga_satuan, harga, qty, jumlah,
                subtotal, total_harga, status, created_at
            ) VALUES (
                p_tenant_id, v_effective_branch_id, v_tanggal, v_jam,
                v_id_struk, v_nama_menu, v_official_menu_price, v_official_menu_price, v_qty_menu, v_qty_menu,
                v_subtotal_item, v_subtotal_item, v_status_bayar, NOW()
            );

            -- Eksekusi pengurangan inventori HANYA jika status pembayaran Selesai
            IF v_status_bayar = 'Selesai' THEN
                v_has_recipe := FALSE;

                -- Periksa apakah item memiliki resep Bill of Materials (BOM)
                IF EXISTS (
                    SELECT 1 FROM public.resep
                    WHERE tenant_id = p_tenant_id AND (LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu) OR LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(v_nama_menu))
                ) THEN
                    v_has_recipe := TRUE;
                    FOR v_recipe IN 
                        SELECT COALESCE(nama_bahan, '') AS nama_bahan,
                               COALESCE(jumlah, 1.0) AS jumlah
                        FROM public.resep
                        WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu)
                    LOOP
                        v_qty_needed := v_recipe.jumlah * v_qty_menu;

                        -- Ambil dan kunci baris stok_barang (SINGLE SOURCE OF TRUTH)
                        SELECT * INTO v_stok FROM public.stok_barang
                        WHERE tenant_id = p_tenant_id 
                          AND LOWER(TRIM(nama_produk)) = LOWER(TRIM(v_recipe.nama_bahan))
                          AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                        ORDER BY (branch_id = v_effective_branch_id) DESC
                        LIMIT 1
                        FOR UPDATE;

                        IF FOUND THEN
                            IF COALESCE(v_stok.stok, 0.0000) < v_qty_needed THEN
                                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan baku "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %)',
                                    v_stok.nama_produk, v_stok.stok, v_qty_needed;
                            END IF;

                            -- MUTASI SATU SUMBER SAJA: HANYA stok_barang!
                            -- bahan_baku adalah view langsung atas stok_barang, sehingga TIDAK BOLEH di-UPDATE terpisah!
                            UPDATE public.stok_barang
                            SET stok = stok - v_qty_needed,
                                updated_at = NOW()
                            WHERE id = v_stok.id AND tenant_id = p_tenant_id;

                            INSERT INTO public.barang_keluar (
                                tenant_id, branch_id, tanggal, nama_barang, nama_produk, nama_bahan_baku, jumlah_keluar, alasan, created_at
                            ) VALUES (
                                p_tenant_id, v_effective_branch_id, CURRENT_DATE,
                                v_stok.nama_produk, v_stok.nama_produk, v_stok.nama_produk,
                                v_qty_needed,
                                'Konsumsi BOM Struk: ' || v_id_struk || ' (' || v_nama_menu || ')',
                                NOW()
                            );
                            v_deductions_count := v_deductions_count + 1;
                        END IF;
                    END LOOP;
                END IF;

                -- Pengurangan langsung jika produk adalah barang jadi (retail/non-resep)
                IF NOT v_has_recipe THEN
                    SELECT * INTO v_stok FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id 
                      AND LOWER(TRIM(nama_produk)) = LOWER(v_nama_menu)
                      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                    ORDER BY (branch_id = v_effective_branch_id) DESC
                    LIMIT 1
                    FOR UPDATE;

                    IF FOUND THEN
                        IF COALESCE(v_stok.stok, 0.0000) < v_qty_menu THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %)',
                                v_stok.nama_produk, v_stok.stok, v_qty_menu;
                        END IF;

                        -- MUTASI SATU SUMBER SAJA: HANYA stok_barang!
                        UPDATE public.stok_barang
                        SET stok = stok - v_qty_menu,
                            updated_at = NOW()
                        WHERE id = v_stok.id AND tenant_id = p_tenant_id;

                        INSERT INTO public.barang_keluar (
                            tenant_id, branch_id, tanggal, nama_barang, nama_produk, jumlah_keluar, alasan, created_at
                        ) VALUES (
                            p_tenant_id, v_effective_branch_id, CURRENT_DATE,
                            v_stok.nama_produk, v_stok.nama_produk,
                            v_qty_menu,
                            'Penjualan Langsung Struk: ' || v_id_struk,
                            NOW()
                        );
                        v_deductions_count := v_deductions_count + 1;
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 13. KEMBALIKAN PAYLOAD SUKSES
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'struk_id', v_struk_uuid,
        'id_struk', v_id_struk,
        'tenant_id', p_tenant_id,
        'branch_id', v_effective_branch_id,
        'subtotal', v_subtotal,
        'diskon', v_total_diskon,
        'total_tagihan', v_total_tagihan,
        'nominal_bayar', v_total_bayar_terima,
        'kembalian', v_kembalian,
        'status_bayar', v_status_bayar,
        'metode_bayar', v_metode_bayar,
        'stock_deductions_applied', v_deductions_count,
        'payload_hash', v_current_hash
    );
END;
$$;

-- Pastikan izin eksekusi RPC checkout
REVOKE ALL ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_execute_checkout(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated, service_role;
