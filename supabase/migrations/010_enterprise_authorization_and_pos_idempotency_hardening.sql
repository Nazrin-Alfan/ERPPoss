-- ==============================================================================
-- MIGRATION 010: ENTERPRISE AUTHORIZATION, POS IDEMPOTENCY & AUDIT RESOLUTION
-- Target: Supabase PostgreSQL Cloud
-- Fixes: SEC-01, SEC-02, API-01, LIC-01, POS-01, POS-02, POS-03, POS-04
-- ==============================================================================

-- 1. TABEL PENUNJANG & KOLOM TAMBAHAN KEAMANAN (LIC-01, SEC-01, POS-03)
ALTER TABLE public.tenants 
    ADD COLUMN IF NOT EXISTS is_test_tenant BOOLEAN DEFAULT FALSE;

ALTER TABLE public.license_keys 
    ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

-- 2. PENCABUTAN MENYELURUH SERIAL PUBLIK YANG BOCOR KE REPOSITORI (LIC-01)
UPDATE public.license_keys
SET is_revoked = TRUE,
    revoked_at = NOW(),
    revocation_reason = 'EXPOSED_PUBLIC_SEED_VULNERABILITY',
    is_used = TRUE
WHERE key_code IN (
    'RELAY-STR-2026-ALPHA1', 'RELAY-STR-2026-BETA2',
    'RELAY-PRO-2026-GOLD7', 'RELAY-PRO-2026-PLAT8',
    'RELAY-ENT-2026-CORP9', 'RELAY-ENT-2026-VIP00',
    'RELAY-ENT-2026-ALPHA1', 'RELAY-ENT-2026-VIP99',
    'RELAY-PRO-2026-SCALE8', 'RELAY-PRO-2026-GROWTH',
    'RELAY-STR-2026-INIT7', 'RELAY-STR-2026-DEV01'
);

DELETE FROM public.license_keys
WHERE key_code IN (
    'RELAY-STR-2026-ALPHA1', 'RELAY-STR-2026-BETA2',
    'RELAY-PRO-2026-GOLD7', 'RELAY-PRO-2026-PLAT8',
    'RELAY-ENT-2026-CORP9', 'RELAY-ENT-2026-VIP00',
    'RELAY-ENT-2026-ALPHA1', 'RELAY-ENT-2026-VIP99',
    'RELAY-PRO-2026-SCALE8', 'RELAY-PRO-2026-GROWTH',
    'RELAY-STR-2026-INIT7', 'RELAY-STR-2026-DEV01'
);

-- 2.5 STANDARISASI CURRENT USER ROLE DENGAN SERVICE ROLE AWARENESS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS character varying
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_claims JSONB;
    v_role TEXT;
    v_profile_role VARCHAR(50);
BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role := COALESCE(
        v_claims->>'role',
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        CASE WHEN current_user = 'postgres' THEN 'service_role' ELSE 'anon' END
    );

    IF v_role = 'service_role' THEN
        RETURN 'Super Admin';
    END IF;

    IF auth.uid() IS NOT NULL THEN
        SELECT role INTO v_profile_role
        FROM public.profiles
        WHERE id = auth.uid() AND is_active = TRUE
        LIMIT 1;

        IF v_profile_role IS NOT NULL THEN
            RETURN v_profile_role;
        END IF;
    END IF;

    RETURN 'Anon';
END;
$$;

-- 3. DROP OVERLOAD LAMA DARI fn_activate_license_key (API-01)
DROP FUNCTION IF EXISTS public.fn_activate_license_key(text, uuid);
DROP FUNCTION IF EXISTS public.fn_activate_license_key(character varying, uuid);
DROP FUNCTION IF EXISTS public.fn_activate_license_key(text);
DROP FUNCTION IF EXISTS public.fn_activate_license_key(character varying);

-- 4. IMPLEMENTASI KANONIKAL TUNGGAL: fn_activate_license_key (SEC-02, API-01, LIC-01)
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
    v_caller_id UUID;
    v_caller_role VARCHAR(50);
    v_caller_tenant_id UUID;
    v_target_tenant_id UUID;
    v_jwt_claims JSONB;
    v_jwt_role TEXT;
    v_key_record RECORD;
    v_existing_lic RECORD;
    v_curr_expiry TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
    v_duration INTERVAL;
    v_is_test_tenant BOOLEAN := FALSE;
    v_caller_active BOOLEAN;
BEGIN
    v_clean_key := UPPER(TRIM(COALESCE(p_license_key, '')));
    IF v_clean_key = '' OR LENGTH(v_clean_key) < 8 THEN
        RAISE EXCEPTION 'INVALID_LICENSE_KEY: Format kunci lisensi tidak valid (minimal 8 karakter).';
    END IF;

    -- Blacklist serial publik yang pernah bocor ke git
    IF v_clean_key = ANY(ARRAY[
        'RELAY-STR-2026-ALPHA1', 'RELAY-STR-2026-BETA2',
        'RELAY-PRO-2026-GOLD7', 'RELAY-PRO-2026-PLAT8',
        'RELAY-ENT-2026-CORP9', 'RELAY-ENT-2026-VIP00',
        'RELAY-ENT-2026-ALPHA1', 'RELAY-ENT-2026-VIP99',
        'RELAY-PRO-2026-SCALE8', 'RELAY-PRO-2026-GROWTH',
        'RELAY-STR-2026-INIT7', 'RELAY-STR-2026-DEV01'
    ]) THEN
        RAISE EXCEPTION 'REVOKED_LICENSE_KEY: Kunci serial ini telah dicabut secara permanen demi keamanan publik.';
    END IF;

    -- IDENTIFIKASI PEMANGGIL & OTORISASI (SEC-02)
    v_caller_id := auth.uid();
    v_jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    v_jwt_role := COALESCE(
        v_jwt_claims->>'role',
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        'anon'
    );

    IF v_jwt_role = 'service_role' AND v_caller_id IS NULL THEN
        IF p_tenant_id IS NULL THEN
            RAISE EXCEPTION 'TENANT_REQUIRED: Tenant ID wajib disertakan untuk pemanggilan service role.';
        END IF;
        v_target_tenant_id := p_tenant_id;
        v_caller_role := 'service_role';
    ELSE
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Pengguna tidak terotentikasi. Sesi login diperlukan.';
        END IF;

        SELECT tenant_id, LOWER(TRIM(COALESCE(role, ''))), COALESCE(is_active, FALSE)
        INTO v_caller_tenant_id, v_caller_role, v_caller_active
        FROM public.profiles
        WHERE id = v_caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PROFILE_NOT_FOUND: Profil pengguna tidak ditemukan dalam database.';
        END IF;

        IF v_caller_active IS NOT TRUE THEN
            RAISE EXCEPTION 'USER_INACTIVE: Akun pengguna dinonaktifkan. Hubungi Administrator.';
        END IF;

        IF v_caller_role NOT IN ('owner', 'super_admin', 'superadmin') THEN
            RAISE EXCEPTION 'FORBIDDEN_LICENSE_ACTIVATION: Hanya Owner atau Super Admin yang dapat mengaktifkan lisensi.';
        END IF;

        -- Jika bukan Super Admin platform, target tenant WAJIB milik caller
        IF v_caller_role NOT IN ('super_admin', 'superadmin') THEN
            IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_caller_tenant_id THEN
                RAISE EXCEPTION 'TENANT_FORBIDDEN: Anda tidak memiliki wewenang mengaktifkan lisensi untuk tenant lain.';
            END IF;
            v_target_tenant_id := v_caller_tenant_id;
        ELSE
            v_target_tenant_id := COALESCE(p_tenant_id, v_caller_tenant_id);
        END IF;
    END IF;

    IF v_target_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_REQUIRED: Tenant target lisensi tidak valid.';
    END IF;

    -- KUNCI TENANT SEBAGAI TITIK SERIALISASI KONKURENSI
    SELECT COALESCE(is_test_tenant, FALSE) INTO v_is_test_tenant
    FROM public.tenants
    WHERE id = v_target_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant tidak ditemukan.';
    END IF;

    -- KUNCI & VALIDASI KUNCI LISENSI
    SELECT * INTO v_key_record
    FROM public.license_keys
    WHERE key_code = v_clean_key
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LICENSE_KEY: Kunci lisensi "%" tidak terdaftar dalam katalog resmi.', v_clean_key;
    END IF;

    IF COALESCE(v_key_record.is_revoked, FALSE) = TRUE THEN
        RAISE EXCEPTION 'REVOKED_LICENSE_KEY: Kunci lisensi "%" telah dicabut dan tidak dapat digunakan lagi.', v_clean_key;
    END IF;

    IF v_key_record.is_used = TRUE THEN
        RAISE EXCEPTION 'LICENSE_KEY_ALREADY_USED: Kunci lisensi "%" sudah pernah diaktifkan sebelumnya.', v_clean_key;
    END IF;

    -- CEK PEMBATASAN KUNCI UJI COBA (IS_TEST)
    IF COALESCE(v_key_record.is_test, FALSE) = TRUE AND v_is_test_tenant IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST_KEY_RESTRICTED: Kunci lisensi uji coba hanya dapat digunakan pada tenant bertipe testing/QA.';
    END IF;

    -- UPDATE/INSERT TENANT_LICENSES
    SELECT * INTO v_existing_lic
    FROM public.tenant_licenses
    WHERE tenant_id = v_target_tenant_id
    FOR UPDATE;

    v_duration := (v_key_record.duration_days || ' days')::INTERVAL;

    IF FOUND THEN
        v_curr_expiry := COALESCE(v_existing_lic.valid_until, v_existing_lic.expires_at, NOW());
        IF v_curr_expiry > NOW() THEN
            v_new_expiry := v_curr_expiry + v_duration;
        ELSE
            v_new_expiry := NOW() + v_duration;
        END IF;

        UPDATE public.tenant_licenses
        SET license_key = v_clean_key,
            tier = v_key_record.tier,
            plan = v_key_record.tier,
            max_branches = GREATEST(COALESCE(v_existing_lic.max_branches, 1), v_key_record.max_branches),
            max_users = GREATEST(COALESCE(v_existing_lic.max_users, 2), v_key_record.max_users),
            valid_until = v_new_expiry,
            expires_at = v_new_expiry,
            status = 'ACTIVE',
            updated_at = NOW()
        WHERE id = v_existing_lic.id;
    ELSE
        v_new_expiry := NOW() + v_duration;
        INSERT INTO public.tenant_licenses (
            tenant_id, license_key, tier, plan, max_branches, max_users, valid_until, expires_at, status, created_at, updated_at
        ) VALUES (
            v_target_tenant_id, v_clean_key, v_key_record.tier, v_key_record.tier, v_key_record.max_branches, v_key_record.max_users,
            v_new_expiry, v_new_expiry, 'ACTIVE', NOW(), NOW()
        );
    END IF;

    -- Sinkronisasi status plan pada tabel tenants
    UPDATE public.tenants
    SET plan = v_key_record.tier,
        updated_at = NOW()
    WHERE id = v_target_tenant_id;

    -- TANDAI KUNCI TERPAKAI
    UPDATE public.license_keys
    SET is_used = TRUE,
        used_by_tenant_id = v_target_tenant_id,
        used_at = NOW()
    WHERE key_code = v_clean_key;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'SUCCESS',
        'tier', v_key_record.tier,
        'valid_until', v_new_expiry,
        'max_branches', v_key_record.max_branches,
        'max_users', v_key_record.max_users,
        'message', 'Aktivasi lisensi berhasil.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_activate_license_key(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_license_key(text, uuid) TO authenticated, service_role;

-- 5. RESTRUKTURISASI fn_execute_checkout (SEC-01, POS-01, POS-02, POS-03, POS-04)
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
    -- Identitas & Otorisasi Caller
    v_caller_id UUID;
    v_jwt_claims JSONB;
    v_jwt_role TEXT;
    v_caller_role VARCHAR(50);
    v_caller_tenant_id UUID;
    v_caller_branch_id UUID;
    v_caller_is_active BOOLEAN;
    v_effective_branch_id UUID;

    -- Struk Data
    v_id_struk VARCHAR(100);
    v_struk_uuid UUID;
    v_total_tagihan NUMERIC(15, 2) := 0.00;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;
    v_status_bayar VARCHAR(50);
    v_metode_pembayaran VARCHAR(50);
    v_kasir VARCHAR(100);
    v_diskon NUMERIC(15, 2) := 0.00;
    v_pajak NUMERIC(15, 2) := 0.00;
    v_tanggal DATE;
    v_current_hash TEXT;
    v_existing_struk RECORD;

    -- Cafe & Recipe Data
    v_cafe_item JSONB;
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_item_subtotal NUMERIC(15, 2) := 0.00;
    v_nama_menu VARCHAR(255);
    v_qty_menu NUMERIC(12, 4);
    v_harga_menu NUMERIC(15, 2);
    v_official_price NUMERIC(15, 2);
    v_menu_catalog RECORD;
    v_recipe RECORD;
    v_stok_record RECORD;
    v_needed_qty NUMERIC(12, 4);

    -- Carwash Data
    v_has_carwash BOOLEAN := FALSE;
    v_cw_paket VARCHAR(100);
    v_cw_harga NUMERIC(15, 2) := 0.00;
    v_cw_is_custom BOOLEAN := FALSE;
    v_official_cw_price NUMERIC(15, 2);
    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_cw_catatan TEXT;

    -- Payment Calculation
    v_total_bayar_terima NUMERIC(15, 2) := 0.00;

    -- Akuntansi
    v_journal_id UUID;
    v_acc_kas UUID;
    v_acc_pendapatan UUID;
    v_acc_hpp UUID;
    v_acc_persediaan UUID;
    v_total_hpp NUMERIC(15, 2) := 0.00;
BEGIN
    -- [1. IDENTIFIKASI PEMANGGIL & VALIDASI OTORISASI (SEC-01)]
    IF p_tenant_id IS NULL THEN
        RAISE EXCEPTION 'TENANT_REQUIRED: Tenant ID wajib disertakan untuk transaksi checkout.';
    END IF;

    v_caller_id := auth.uid();
    v_jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    v_jwt_role := COALESCE(
        v_jwt_claims->>'role',
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        'anon'
    );

    IF v_jwt_role = 'service_role' AND v_caller_id IS NULL THEN
        -- Jalur internal backend/service_role
        IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
            RAISE EXCEPTION 'TENANT_NOT_FOUND: Tenant "%" tidak ditemukan.', p_tenant_id;
        END IF;
        v_caller_role := 'service_role';
    ELSE
        -- Jalur pengguna terotentikasi
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Pengguna tidak terotentikasi. Sesi login kasir diperlukan untuk memproses checkout.';
        END IF;

        SELECT tenant_id, LOWER(TRIM(COALESCE(role, ''))) AS role, branch_id, COALESCE(is_active, FALSE) AS is_active
        INTO v_caller_tenant_id, v_caller_role, v_caller_branch_id, v_caller_is_active
        FROM public.profiles
        WHERE id = v_caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PROFILE_NOT_FOUND: Profil pengguna tidak ditemukan dalam database.';
        END IF;

        IF v_caller_is_active IS NOT TRUE THEN
            RAISE EXCEPTION 'USER_INACTIVE: Akun pengguna dinonaktifkan. Hubungi Administrator.';
        END IF;

        IF v_caller_role NOT IN ('super_admin', 'superadmin') THEN
            -- Proteksi Lintas Tenant
            IF v_caller_tenant_id IS DISTINCT FROM p_tenant_id THEN
                RAISE EXCEPTION 'TENANT_FORBIDDEN: Anda tidak memiliki akses transaksi ke tenant ini.';
            END IF;

            -- Proteksi Cabang: Jika kasir ditugaskan pada cabang spesifik, larang transaksi cabang lain
            IF v_caller_branch_id IS NOT NULL AND p_branch_id IS NOT NULL THEN
                IF v_caller_branch_id IS DISTINCT FROM p_branch_id THEN
                    RAISE EXCEPTION 'BRANCH_FORBIDDEN: Pengguna tidak memiliki akses transaksi ke cabang ini.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- Validasi Keberadaan Cabang
    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch_id);
    IF v_effective_branch_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.branches 
            WHERE id = v_effective_branch_id AND tenant_id = p_tenant_id
        ) THEN
            RAISE EXCEPTION 'BRANCH_NOT_FOUND: Cabang tidak ditemukan dalam lingkup tenant ini.';
        END IF;
    END IF;

    -- [2. EKSTRAKSI STRUK HEADER & ADVISORY LOCK (POS-04)]
    IF p_struk_payload IS NULL THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Struk payload tidak boleh kosong.';
    END IF;

    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', ''));
    IF v_id_struk = '' THEN
        RAISE EXCEPTION 'INVALID_ID_STRUK: Nomor struk wajib diisi.';
    END IF;

    -- PostgreSQL Transaction Advisory Lock per Tenant & Nomor Struk (Mencegah Race Condition Concurrency)
    PERFORM pg_advisory_xact_lock(hashtext('pos_checkout_' || p_tenant_id::text || '_' || v_id_struk));

    v_status_bayar := COALESCE(p_struk_payload->>'status_bayar', 'Selesai');
    v_metode_pembayaran := COALESCE(p_struk_payload->>'metode_pembayaran', 'Tunai');
    v_kasir := COALESCE(p_struk_payload->>'kasir', 'Kasir');
    v_diskon := COALESCE((p_struk_payload->>'diskon')::numeric, 0.00);
    v_pajak := COALESCE((p_struk_payload->>'pajak')::numeric, 0.00);
    v_nominal_bayar := COALESCE((p_struk_payload->>'nominal_bayar')::numeric, (p_struk_payload->>'total_bayar')::numeric, 0.00);
    v_tanggal := COALESCE((p_struk_payload->>'tanggal')::date, CURRENT_DATE);

    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;
    IF v_pajak < 0.00 THEN
        RAISE EXCEPTION 'INVALID_TAX: Pajak tidak boleh negatif.';
    END IF;

    -- Hash payload untuk pengujian kesesuaian idempotency
    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || '::' ||
        COALESCE(p_cafe_items::text, '') || '::' ||
        COALESCE(p_carwash_payload::text, '')
    );

    -- [3. VALIDASI IDEMPOTENCY & REKONSILIASI DETAIL DRAFT (POS-03, POS-04)]
    SELECT id, status_bayar, total_tagihan, total, nominal_bayar, payload_hash 
    INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk
    LIMIT 1;

    IF FOUND THEN
        IF v_existing_struk.status_bayar = 'Selesai' THEN
            -- Transaksi sudah lunas/selesai: Cek Replay
            IF v_existing_struk.payload_hash IS NOT NULL AND v_existing_struk.payload_hash <> v_current_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Nomor struk "%" telah digunakan pada transaksi selesai lain dengan payload berbeda.', v_id_struk;
            END IF;

            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'ALREADY_COMPLETED',
                'is_idempotent', TRUE,
                'was_replayed', TRUE,
                'struk_id', v_existing_struk.id,
                'id_struk', v_id_struk,
                'total_tagihan', v_existing_struk.total_tagihan,
                'message', 'Transaksi sudah berstatus Selesai sebelumnya (Idempotent OK). Stok bahan baku tidak dipotong ulang.'
            );
        ELSIF v_existing_struk.status_bayar = 'Pending' THEN
            -- Transaksi masih draft: Bersihkan line items lama agar tidak terjadi duplikasi detail! (POS-03)
            DELETE FROM public.cafe WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;
            DELETE FROM public.carwash WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;
        END IF;
    END IF;

    -- [4. VALIDASI ITEM CAFE / RETAIL & KUANTITAS POSITIF (POS-01)]
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_cafe_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_cafe_item->>'nama_menu', v_cafe_item->>'nama_produk', ''));
            IF v_nama_menu = '' THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama item menu tidak boleh kosong.';
            END IF;

            v_qty_menu := COALESCE((v_cafe_item->>'qty')::numeric, (v_cafe_item->>'jumlah')::numeric, 0.0000);
            
            -- Strict Quantity Check (POS-01)
            IF v_qty_menu <= 0.0000 THEN
                RAISE EXCEPTION 'INVALID_QUANTITY: Kuantitas item "%" tidak valid (harus lebih besar dari nol).', v_nama_menu;
            END IF;
            IF v_qty_menu > 10000.0000 THEN
                RAISE EXCEPTION 'INVALID_QUANTITY: Kuantitas item "%" melebihi batas wajar transaksi (maksimal 10.000).', v_nama_menu;
            END IF;

            v_harga_menu := COALESCE((v_cafe_item->>'harga')::numeric, 0.00);
            IF v_harga_menu < 0.00 THEN
                RAISE EXCEPTION 'INVALID_PRICE: Harga satuan item "%" tidak boleh negatif.', v_nama_menu;
            END IF;

            -- Verifikasi Harga terhadap Katalog Menu
            SELECT * INTO v_menu_catalog
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id
              AND LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu)
              AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
            ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
            LIMIT 1;

            IF FOUND THEN
                v_official_price := v_menu_catalog.harga;
                IF ABS(v_harga_menu - v_official_price) > 0.0100 THEN
                    RAISE EXCEPTION 'PRICE_MISMATCH: Harga menu "%" (Rp %) tidak sesuai dengan katalog resmi database (Rp %)',
                        v_nama_menu, v_harga_menu, v_official_price;
                END IF;
            ELSE
                -- Cek di stok_barang
                SELECT harga_jual INTO v_official_price
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND LOWER(TRIM(nama_produk)) = LOWER(v_nama_menu)
                  AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
                LIMIT 1;

                IF FOUND AND v_official_price IS NOT NULL AND v_official_price > 0.00 THEN
                    IF ABS(v_harga_menu - v_official_price) > 0.0100 THEN
                        RAISE EXCEPTION 'PRICE_MISMATCH: Harga item retail "%" (Rp %) tidak sesuai dengan katalog database (Rp %)',
                            v_nama_menu, v_harga_menu, v_official_price;
                    END IF;
                ELSE
                    RAISE EXCEPTION 'MENU_NOT_FOUND: Item "%" tidak terdaftar dalam katalog menu atau inventori resmi tenant.', v_nama_menu;
                END IF;
            END IF;

            v_item_subtotal := v_official_price * v_qty_menu;
            v_total_cafe := v_total_cafe + v_item_subtotal;
        END LOOP;
    END IF;

    -- [5. VALIDASI CARWASH & CEK CATALOG PRICING ANTI-BYPASS (POS-02)]
    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb AND p_carwash_payload <> 'null'::jsonb THEN
        v_has_carwash := TRUE;
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', p_carwash_payload->>'nama_paket', p_carwash_payload->>'model', ''));
        
        IF v_cw_paket = '' THEN
            RAISE EXCEPTION 'INVALID_CARWASH_PACKAGE: Nama paket carwash wajib dipilih dan tidak boleh kosong.';
        END IF;

        v_cw_harga := COALESCE((p_carwash_payload->>'harga')::numeric, (p_carwash_payload->>'biaya')::numeric, (p_carwash_payload->>'total')::numeric, 0.00);
        IF v_cw_harga <= 0.00 THEN
            RAISE EXCEPTION 'INVALID_CARWASH_PRICE: Tarif layanan carwash harus lebih besar dari nol (Rp %).', v_cw_harga;
        END IF;

        v_cw_catatan := TRIM(COALESCE(p_carwash_payload->>'catatan', p_carwash_payload->>'keterangan', ''));
        v_cw_is_custom := (LOWER(TRIM(COALESCE(p_carwash_payload->>'ukuran', ''))) = 'custom') OR (LOWER(TRIM(v_cw_paket)) = 'custom');

        IF v_cw_is_custom THEN
            -- Custom pricing WAJIB dibatasi hanya untuk Owner / Administrator (POS-02)
            IF v_caller_role NOT IN ('owner', 'admin', 'super_admin', 'superadmin', 'service_role') THEN
                RAISE EXCEPTION 'CUSTOM_PRICING_UNAUTHORIZED: Hanya Owner atau Administrator yang berwenang menetapkan tarif custom carwash.';
            END IF;
            IF v_cw_catatan = '' THEN
                RAISE EXCEPTION 'CUSTOM_PRICING_REASON_REQUIRED: Penetapan tarif custom carwash wajib menyertakan alasan/keterangan yang jelas.';
            END IF;
            v_total_carwash := v_cw_harga;
        ELSE
            -- Verifikasi ketat terhadap paket resmi carwash_packages
            SELECT COALESCE(price, tarif, 0.00) INTO v_official_cw_price
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
        END IF;
    END IF;

    -- [6. PERHITUNGAN TOTAL TAGIHAN & PEMBAYARAN]
    v_total_tagihan := GREATEST(0.00, (v_total_cafe + v_total_carwash - v_diskon + v_pajak));

    IF v_status_bayar = 'Selesai' THEN
        v_total_bayar_terima := v_nominal_bayar;
        IF v_total_bayar_terima < v_total_tagihan THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Nominal pembayaran (Rp %) kurang dari total tagihan (Rp %).',
                v_total_bayar_terima, v_total_tagihan;
        END IF;
        v_kembalian := GREATEST(0.00, v_total_bayar_terima - v_total_tagihan);
    ELSE
        v_kembalian := 0.00;
    END IF;

    -- [7. SIMPAN / UPDATE HEADER STRUK]
    INSERT INTO public.struk (
        tenant_id, branch_id, id_struk, total_tagihan, total, diskon,
        nominal_bayar, kembalian, metode_pembayaran, metode_bayar, status_bayar,
        kasir, tanggal, payload_hash, created_at
    ) VALUES (
        p_tenant_id, v_effective_branch_id, v_id_struk, v_total_tagihan, v_total_tagihan, v_diskon,
        v_nominal_bayar, v_kembalian, v_metode_pembayaran, v_metode_pembayaran, v_status_bayar,
        v_kasir, v_tanggal, v_current_hash, NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE
    SET total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        diskon = EXCLUDED.diskon,
        nominal_bayar = EXCLUDED.nominal_bayar,
        kembalian = EXCLUDED.kembalian,
        metode_pembayaran = EXCLUDED.metode_pembayaran,
        metode_bayar = EXCLUDED.metode_bayar,
        status_bayar = EXCLUDED.status_bayar,
        kasir = EXCLUDED.kasir,
        tanggal = EXCLUDED.tanggal,
        payload_hash = EXCLUDED.payload_hash
    RETURNING id INTO v_struk_uuid;

    -- [8. SIMPAN RINCIAN CARWASH (JIKA ADA)]
    IF v_has_carwash THEN
        INSERT INTO public.carwash (
            tenant_id, branch_id, id_struk, plat, plat_nomor, model, ukuran, paket,
            harga, status, keterangan, tanggal, created_at
        ) VALUES (
            p_tenant_id, v_effective_branch_id, v_id_struk,
            COALESCE(p_carwash_payload->>'plat_nomor', p_carwash_payload->>'plat', p_carwash_payload->>'nopol', '-'),
            COALESCE(p_carwash_payload->>'plat_nomor', p_carwash_payload->>'plat', p_carwash_payload->>'nopol', '-'),
            COALESCE(p_carwash_payload->>'model', '-'),
            COALESCE(p_carwash_payload->>'ukuran', 'Sedang'),
            v_cw_paket,
            v_total_carwash,
            COALESCE(p_carwash_payload->>'status', 'Diproses'),
            v_cw_catatan,
            v_tanggal, NOW()
        );
    END IF;

    -- [9. SIMPAN RINCIAN CAFE / RETAIL]
    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_cafe_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_cafe_item->>'nama_menu', v_cafe_item->>'nama_produk', ''));
            v_qty_menu := COALESCE((v_cafe_item->>'qty')::numeric, (v_cafe_item->>'jumlah')::numeric, 1.0000);
            v_harga_menu := COALESCE((v_cafe_item->>'harga')::numeric, 0.00);

            INSERT INTO public.cafe (
                tenant_id, branch_id, id_struk, nama_menu, qty, harga, harga_satuan, subtotal, total, catatan, tanggal, created_at
            ) VALUES (
                p_tenant_id, v_effective_branch_id, v_id_struk, v_nama_menu, v_qty_menu,
                v_harga_menu, v_harga_menu, (v_harga_menu * v_qty_menu), (v_harga_menu * v_qty_menu),
                COALESCE(v_cafe_item->>'catatan', ''),
                v_tanggal, NOW()
            );
        END LOOP;
    END IF;

    -- [10. HANYA POTONG STOK & POST JURNAL JIKA TRANSAKSI SUDAH SELESAI (POS-03, POS-04)]
    IF v_status_bayar = 'Selesai' THEN
        -- Mutasi Stok Tunggal Fisik (Anti-Double Deduction)
        IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
            FOR v_cafe_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
            LOOP
                v_nama_menu := TRIM(COALESCE(v_cafe_item->>'nama_menu', v_cafe_item->>'nama_produk', ''));
                v_qty_menu := COALESCE((v_cafe_item->>'qty')::numeric, (v_cafe_item->>'jumlah')::numeric, 1.0000);

                -- Cek resep bahan baku (BOM)
                IF EXISTS (SELECT 1 FROM public.resep WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu)) THEN
                    FOR v_recipe IN 
                        SELECT nama_bahan, jumlah 
                        FROM public.resep 
                        WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(v_nama_menu)
                    LOOP
                        IF v_recipe.jumlah <= 0.0000 THEN
                            RAISE EXCEPTION 'INVALID_RECIPE_QUANTITY: Kebutuhan bahan baku "%" dalam resep harus lebih besar dari nol.', v_recipe.nama_bahan;
                        END IF;

                        v_needed_qty := v_recipe.jumlah * v_qty_menu;

                        SELECT * INTO v_stok_record
                        FROM public.stok_barang
                        WHERE tenant_id = p_tenant_id
                          AND (
                            LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_recipe.nama_bahan))
                            OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_recipe.nama_bahan))
                          )
                          AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                        ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
                        LIMIT 1
                        FOR UPDATE;

                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Bahan baku "%" untuk menu "%" belum terdaftar di inventori.',
                                v_recipe.nama_bahan, v_nama_menu;
                        END IF;

                        IF v_stok_record.stok < v_needed_qty THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan baku "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                                v_recipe.nama_bahan, v_stok_record.stok, v_needed_qty;
                        END IF;

                        -- Kurangi hanya dari tabel fisik stok_barang
                        UPDATE public.stok_barang
                        SET stok = stok - v_needed_qty,
                            updated_at = NOW()
                        WHERE id = v_stok_record.id;

                        INSERT INTO public.barang_keluar (
                            tenant_id, branch_id, nama_barang, nama_produk, nama_bahan_baku, jumlah_keluar, alasan, created_at
                        ) VALUES (
                            p_tenant_id, v_effective_branch_id, v_recipe.nama_bahan, v_nama_menu, v_recipe.nama_bahan,
                            v_needed_qty, 'BOM Checkout Struk: ' || v_id_struk, NOW()
                        );

                        v_total_hpp := v_total_hpp + (COALESCE(v_stok_record.harga_beli, v_stok_record.harga_satuan, 0.00) * v_needed_qty);
                    END LOOP;
                ELSE
                    -- Barang retail langsung
                    SELECT * INTO v_stok_record
                    FROM public.stok_barang
                    WHERE tenant_id = p_tenant_id
                      AND (
                        LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_nama_menu))
                        OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_nama_menu))
                      )
                      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                    ORDER BY (branch_id = v_effective_branch_id) DESC, updated_at DESC
                    LIMIT 1
                    FOR UPDATE;

                    IF FOUND THEN
                        IF v_stok_record.stok < v_qty_menu THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk retail "%" tidak mencukupi (Tersedia: %, Diminta: %).',
                                v_nama_menu, v_stok_record.stok, v_qty_menu;
                        END IF;

                        UPDATE public.stok_barang
                        SET stok = stok - v_qty_menu,
                            updated_at = NOW()
                        WHERE id = v_stok_record.id;

                        INSERT INTO public.barang_keluar (
                            tenant_id, branch_id, nama_barang, nama_produk, nama_bahan_baku, jumlah_keluar, alasan, created_at
                        ) VALUES (
                            p_tenant_id, v_effective_branch_id, v_nama_menu, v_nama_menu, NULL,
                            v_qty_menu, 'Retail Checkout Struk: ' || v_id_struk, NOW()
                        );

                        v_total_hpp := v_total_hpp + (COALESCE(v_stok_record.harga_beli, v_stok_record.harga_satuan, 0.00) * v_qty_menu);
                    END IF;
                END IF;
            END LOOP;
        END IF;

        -- Posting Jurnal Akuntansi Otomatis
        IF v_total_tagihan > 0.00 THEN
            SELECT id INTO v_acc_kas FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
            SELECT id INTO v_acc_pendapatan FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;

            IF v_acc_kas IS NOT NULL AND v_acc_pendapatan IS NOT NULL THEN
                INSERT INTO public.journal_entries (
                    tenant_id, branch_id, entry_no, date, memo, status, total_amount, created_by, created_at
                ) VALUES (
                    p_tenant_id, v_effective_branch_id, 'JRN-' || v_id_struk, v_tanggal,
                    'Pendapatan Checkout POS: ' || v_id_struk, 'DRAFT',
                    v_total_tagihan, v_caller_id, NOW()
                )
                ON CONFLICT (tenant_id, entry_no) DO NOTHING
                RETURNING id INTO v_journal_id;

                IF v_journal_id IS NOT NULL THEN
                    INSERT INTO public.journal_entry_lines (
                        tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                    ) VALUES 
                        (p_tenant_id, v_journal_id, v_acc_kas, v_total_tagihan, 0.00, 'Penerimaan Kas Kasir', NOW()),
                        (p_tenant_id, v_journal_id, v_acc_pendapatan, 0.00, v_total_tagihan, 'Pendapatan Penjualan POS', NOW());

                    -- Transisi status ke POSTED (Immutability Enforced)
                    UPDATE public.journal_entries
                    SET status = 'POSTED'
                    WHERE id = v_journal_id;
                END IF;
            END IF;
        END IF;

        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'SUCCESS',
            'is_idempotent', FALSE,
            'was_replayed', FALSE,
            'struk_id', v_struk_uuid,
            'id_struk', v_id_struk,
            'total_tagihan', v_total_tagihan,
            'nominal_bayar', v_nominal_bayar,
            'kembalian', v_kembalian,
            'message', 'Transaksi checkout berhasil diselesaikan.'
        );
    ELSE
        -- Transaksi Draft / Pending
        RETURN jsonb_build_object(
            'status', 'DRAFT_SAVED',
            'is_idempotent', FALSE,
            'struk_id', v_struk_uuid,
            'id_struk', v_id_struk,
            'total_tagihan', v_total_tagihan,
            'message', 'Bill draft berhasil disimpan/diperbarui tanpa memotong inventori.'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_execute_checkout(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_execute_checkout(uuid, uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;

-- 6. PENGAMANAN fn_admin_generate_license_key
CREATE OR REPLACE FUNCTION public.fn_admin_generate_license_key(
    p_tier VARCHAR,
    p_max_branches INT,
    p_max_users INT,
    p_duration_days INT,
    p_notes TEXT DEFAULT NULL,
    p_is_test BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_tier VARCHAR(50);
    v_generated_key VARCHAR(64);
    v_rand_part VARCHAR(16);
    v_new_id UUID;
    v_caller_id UUID;
    v_caller_role VARCHAR(50);
    v_jwt_claims JSONB;
    v_jwt_role TEXT;
BEGIN
    -- Validasi caller: Hanya service_role atau Super Admin
    v_caller_id := auth.uid();
    v_jwt_claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
    v_jwt_role := COALESCE(
        v_jwt_claims->>'role',
        NULLIF(current_setting('request.jwt.claim.role', true), ''),
        CASE WHEN current_user = 'postgres' THEN 'service_role' ELSE 'anon' END
    );

    IF v_jwt_role <> 'service_role' THEN
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Pengguna tidak terotentikasi.';
        END IF;

        SELECT LOWER(TRIM(COALESCE(role, ''))) INTO v_caller_role
        FROM public.profiles
        WHERE id = v_caller_id;

        IF v_caller_role NOT IN ('super_admin', 'superadmin') THEN
            RAISE EXCEPTION 'UNAUTHORIZED_GENERATOR: Hanya Platform Super Administrator atau service role yang dapat menerbitkan serial lisensi.';
        END IF;
    END IF;

    v_clean_tier := LOWER(TRIM(COALESCE(p_tier, 'starter')));
    IF v_clean_tier NOT IN ('starter', 'pro', 'enterprise') THEN
        RAISE EXCEPTION 'INVALID_TIER: Tier harus berupa starter, pro, atau enterprise.';
    END IF;

    -- Bangkitkan serial kriptografis acak: RELAY-{TIER}-{RANDOM8}
    v_rand_part := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 8));
    v_generated_key := 'RELAY-' || UPPER(SUBSTRING(v_clean_tier, 1, 3)) || '-' || v_rand_part;

    INSERT INTO public.license_keys (
        key_code, tier, max_branches, max_users, duration_days,
        is_used, is_test, notes, created_at
    ) VALUES (
        v_generated_key, v_clean_tier, p_max_branches, p_max_users, p_duration_days,
        FALSE, COALESCE(p_is_test, FALSE), p_notes, NOW()
    );

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'license_key', v_generated_key,
        'tier', v_clean_tier,
        'max_branches', p_max_branches,
        'max_users', p_max_users,
        'duration_days', p_duration_days,
        'is_test', COALESCE(p_is_test, FALSE),
        'message', 'Kunci serial dinamis berhasil diterbitkan.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_admin_generate_license_key(varchar, int, int, int, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_admin_generate_license_key(varchar, int, int, int, text, boolean) TO service_role;
