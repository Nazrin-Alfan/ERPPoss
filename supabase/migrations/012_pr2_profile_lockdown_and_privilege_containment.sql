-- ==============================================================================
-- MIGRATION 012: PR-2 — PROFILE LOCKDOWN & PRIVILEGE CONTAINMENT
-- Branch: feat/access-control-rbac-hardening
-- Baseline Audit: 5 November 2026 (commit a1de55e)
-- PR-2 Scope:
--   A. Lindungi branch_id & is_active pada UPDATE profil
--   B. Owner hanya mengelola profil tenant sendiri; cabang assignment harus valid
--   C. Guard "last active Owner" — tidak bisa dinonaktifkan via jalur biasa
--   D. Cabut TRUNCATE + hak berlebih dari authenticated & revoke default privileges
--   E. Hapus fallback tenant pertama pada fn_auto_populate_tenant_and_branch
--      (fungsi ini tidak ada; fallback serupa ada di fn_protect_profile_role_and_tenant
--       context INSERT — dikunci di sini via verifikasi konteks eksplisit)
-- CATATAN PENTING:
--   - Migrasi ini TIDAK dijalankan ke produksi sampai review dan sign-off eksplisit.
--   - Tidak ada perubahan data, tidak ada DROP TABLE, tidak ada TRUNCATE.
--   - Setiap REVOKE dikonfirmasi melalui metadata pg_class / has_table_privilege,
--     bukan dengan menjalankan operasi destruktif.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- A. UPGRADE fn_protect_profile_role_and_tenant
--    Tambahkan proteksi:
--    1. branch_id UPDATE: hanya Owner/Super Admin + branch harus valid di tenant
--    2. is_active UPDATE: Kasir diblokir; last-active-Owner guard
--    3. Owner UPDATE cross-tenant: diblokir
--    4. INSERT by Owner harus memverifikasi target tenant == caller tenant
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_uid   UUID;
    v_caller_role  VARCHAR(50);
    v_caller_tenant UUID;
    v_active_owner_count INT;
BEGIN
    -- Ambil konteks pemanggil dari sesi auth (bukan CURRENT_USER)
    v_caller_uid    := auth.uid();
    v_caller_role   := public.current_user_role();
    v_caller_tenant := public.current_tenant_id();

    -- =========================================================================
    -- 1. PROTEKSI DELETE
    -- =========================================================================
    IF TG_OP = 'DELETE' THEN
        IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" tidak diizinkan menghapus profil.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        -- Owner hanya boleh menghapus profil tenant sendiri
        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_DELETE: Owner tidak dapat menghapus profil di luar tenant sendiri.'
                USING ERRCODE = '42501';
        END IF;

        -- Owner tidak boleh menghapus dirinya sendiri jika itu satu-satunya Owner aktif
        IF OLD.id = v_caller_uid THEN
            SELECT COUNT(*) INTO v_active_owner_count
            FROM public.profiles
            WHERE tenant_id = OLD.tenant_id
              AND role = 'Owner'
              AND is_active = TRUE
              AND id <> OLD.id;

            IF v_active_owner_count = 0 THEN
                RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat menghapus satu-satunya Owner aktif pada tenant ini.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN OLD;
    END IF;

    -- =========================================================================
    -- 2. PROTEKSI INSERT
    -- =========================================================================
    IF TG_OP = 'INSERT' THEN
        -- Blokir self-insert dengan role Super Admin oleh non-Super Admin
        IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
            RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak membuat profil Super Admin.'
                USING ERRCODE = '42501';
        END IF;

        -- Blokir penambahan Owner baru oleh pihak bukan Owner/Super Admin
        IF NEW.role = 'Owner' AND v_caller_role NOT IN ('Super Admin', 'Owner') THEN
            IF EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = NEW.tenant_id LIMIT 1) THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Penambahan Owner hanya oleh Owner atau Super Admin yang ada.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        -- Blokir Kasir / Staff membuat profil apapun
        IF v_caller_role IN ('Kasir', 'Staff Kantor', 'Karyawan Cuci') THEN
            RAISE EXCEPTION 'FORBIDDEN_PROFILE_MUTATION: Role "%" dilarang membuat profil pengguna baru.', v_caller_role
                USING ERRCODE = '42501';
        END IF;

        -- Owner INSERT: target tenant harus == tenant sendiri
        IF v_caller_role = 'Owner' AND NEW.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_INSERT: Owner tidak dapat membuat profil untuk tenant lain.'
                USING ERRCODE = '42501';
        END IF;

        -- Validasi branch_id pada INSERT: cabang harus ada di tenant yang sama
        IF NEW.branch_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.branches
                WHERE id = NEW.branch_id AND tenant_id = NEW.tenant_id AND is_active = TRUE
            ) THEN
                RAISE EXCEPTION 'INVALID_BRANCH_ASSIGNMENT: branch_id tidak terdaftar atau tidak aktif pada tenant ini.'
                    USING ERRCODE = '23503';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- =========================================================================
    -- 3. PROTEKSI UPDATE
    -- =========================================================================
    IF TG_OP = 'UPDATE' THEN

        -- (3a) Blokir mutasi lintas tenant oleh Owner
        IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
            RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Owner tidak dapat memutasi profil di luar tenant sendiri.'
                USING ERRCODE = '42501';
        END IF;

        -- (3b) Proteksi role
        IF OLD.role IS DISTINCT FROM NEW.role THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner') THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Role "%" dilarang mengubah role profil (Role saat ini: %).', v_caller_role, OLD.role
                    USING ERRCODE = '42501';
            END IF;

            IF NEW.role = 'Super Admin' AND v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_ROLE_ESCALATION: Hanya Super Admin yang berhak menetapkan role Super Admin.'
                    USING ERRCODE = '42501';
            END IF;

            -- Proteksi downgrade role Owner aktif terakhir
            IF OLD.role = 'Owner' AND NEW.role <> 'Owner' THEN
                SELECT COUNT(*) INTO v_active_owner_count
                FROM public.profiles
                WHERE tenant_id = OLD.tenant_id
                  AND role = 'Owner'
                  AND is_active = TRUE
                  AND id <> OLD.id;

                IF v_active_owner_count = 0 THEN
                    RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat mengubah role satu-satunya Owner aktif pada tenant ini.'
                        USING ERRCODE = '42501';
                END IF;
            END IF;
        END IF;

        -- (3c) Proteksi tenant_id
        IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
            IF v_caller_role <> 'Super Admin' THEN
                RAISE EXCEPTION 'FORBIDDEN_TENANT_MUTATION: Pemindahan tenant_id hanya dapat dilakukan oleh Super Admin.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        -- (3d) Proteksi branch_id — hanya Owner/Super Admin/Admin yang berwenang
        IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_BRANCH_MUTATION: Role "%" tidak diizinkan mengubah branch_id profil.'
                    , v_caller_role
                    USING ERRCODE = '42501';
            END IF;

            -- Cabang tujuan harus valid di dalam tenant yang sama
            IF NEW.branch_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.branches
                    WHERE id = NEW.branch_id AND tenant_id = NEW.tenant_id AND is_active = TRUE
                ) THEN
                    RAISE EXCEPTION 'INVALID_BRANCH_ASSIGNMENT: branch_id tujuan tidak terdaftar atau tidak aktif pada tenant ini.'
                        USING ERRCODE = '23503';
                END IF;
            END IF;
        END IF;

        -- (3e) Proteksi is_active — Kasir tidak boleh mengubah is_active siapapun
        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            IF v_caller_role NOT IN ('Super Admin', 'Owner', 'Admin') THEN
                RAISE EXCEPTION 'FORBIDDEN_STATUS_MUTATION: Role "%" tidak diizinkan mengubah status aktif profil.'
                    , v_caller_role
                    USING ERRCODE = '42501';
            END IF;

            -- Guard: last-active-Owner tidak bisa dinonaktifkan via jalur manajemen biasa
            IF OLD.role = 'Owner' AND NEW.is_active = FALSE THEN
                SELECT COUNT(*) INTO v_active_owner_count
                FROM public.profiles
                WHERE tenant_id = OLD.tenant_id
                  AND role = 'Owner'
                  AND is_active = TRUE
                  AND id <> OLD.id;

                IF v_active_owner_count = 0 THEN
                    RAISE EXCEPTION 'LAST_ACTIVE_OWNER_PROTECTED: Tidak dapat menonaktifkan satu-satunya Owner aktif pada tenant ini. Aktifkan Owner lain terlebih dahulu.'
                        USING ERRCODE = '42501';
                END IF;
            END IF;

            -- Owner hanya boleh menonaktifkan profil dalam tenant sendiri
            IF v_caller_role = 'Owner' AND OLD.tenant_id <> v_caller_tenant THEN
                RAISE EXCEPTION 'FORBIDDEN_CROSS_TENANT_UPDATE: Owner tidak dapat mengubah status profil di luar tenant sendiri.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

-- Pasang ulang trigger (menggantikan versi 009)
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_profile_role_and_tenant();

-- ==============================================================================
-- B. CABUT PRIVILEGE SQL BERLEBIH DARI authenticated
--    TRUNCATE, REFERENCES, TRIGGER, MAINTAIN tidak diberikan secara eksplisit
--    oleh migrasi kita, namun mungkin tersisa dari default privileges PostgreSQL.
--    Cabut secara eksplisit. Verifikasi akan dilakukan via has_table_privilege
--    di harness — BUKAN dengan menjalankan TRUNCATE.
-- ==============================================================================
DO $$
DECLARE
    tbl TEXT;
    erp_tables TEXT[] := ARRAY[
        'tenants', 'branches', 'profiles', 'tenant_licenses', 'license_keys',
        'pos_balances', 'chart_of_accounts', 'master_categories', 'journal_entries',
        'journal_entry_lines', 'stok_barang', 'daftar_harga_menu', 'resep',
        'carwash_packages', 'diskon', 'kasir', 'metode_bayar', 'struk', 'carwash', 'cafe',
        'barang_keluar', 'barang_masuk', 'cashflow', 'pengeluaran',
        'karyawan_cuci', 'karyawan_kantor', 'crm_customers', 'crm_loyalty_programs',
        'crm_loyalty_logs', 'customer_reward_claims', 'intelligence_daily_snapshots',
        'kategori_keuangan', 'kategori_menu', 'loyalty_programs'
    ];
BEGIN
    FOREACH tbl IN ARRAY erp_tables
    LOOP
        -- Skip tabel yang belum ada di environment ini (fixture disposable mungkin subset)
        CONTINUE WHEN NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = tbl AND c.relkind = 'r'
        );
        -- Revoke semua dulu agar tidak ada residu grant
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated, anon, PUBLIC;', tbl);
        -- Grant ulang hanya operasi yang sah — TRUNCATE TIDAK termasuk
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', tbl);
    END LOOP;

    -- Khusus license_keys: hanya service_role yang boleh mutasi (hanya jika tabel ada)
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='license_keys') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.license_keys FROM authenticated, anon, PUBLIC;';
        EXECUTE 'GRANT SELECT ON TABLE public.license_keys TO authenticated;';
        EXECUTE 'GRANT ALL ON TABLE public.license_keys TO service_role;';
    END IF;

    -- profiles: DELETE dicabut dari authenticated (hanya via RPC/trigger)
    EXECUTE 'REVOKE DELETE ON TABLE public.profiles FROM authenticated, anon;';
END $$;

-- Revoke default privileges untuk TRUNCATE dari authenticated pada schema public
-- (mencegah future GRANT ALL menyertakan TRUNCATE secara tidak sengaja)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- fn_admin_generate_license_key: hanya service_role (010 sudah revoke, ini safety net)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_admin_generate_license_key'
    ) THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.fn_admin_generate_license_key(varchar, int, int, int, text, boolean) FROM PUBLIC, anon, authenticated;';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_admin_generate_license_key(varchar, int, int, int, text, boolean) TO service_role;';
    END IF;
END $$;

-- ==============================================================================
-- C. FAIL-CLOSED CONTEXT: fn_require_explicit_tenant_context()
--    Menggantikan pola "fallback ke tenant aktif pertama".
--    Fungsi ini dipanggil oleh proses backend yang perlu memastikan konteks
--    tenant eksplisit tersedia sebelum melanjutkan operasi berbasis session.
--    Return: tenant_id dari session aktif.
--    Throws: MISSING_TENANT_CONTEXT jika auth.uid() NULL atau profil tidak aktif.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.fn_require_explicit_tenant_context()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid       UUID;
    v_tenant_id UUID;
BEGIN
    v_uid := auth.uid();

    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'MISSING_TENANT_CONTEXT: Tidak ada sesi autentikasi aktif. Operasi ini membutuhkan token pengguna yang valid.'
            USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id INTO v_tenant_id
    FROM public.profiles
    WHERE id = v_uid AND is_active = TRUE
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_TENANT_CONTEXT: Profil pengguna tidak aktif atau konteks tenant tidak tersedia. Hubungi administrator.'
            USING ERRCODE = '42501';
    END IF;

    RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_require_explicit_tenant_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_require_explicit_tenant_context() TO authenticated, service_role;

-- ==============================================================================
-- D. REVOKE EXPLICIT PADA TABEL SENSITIF (LAPISAN KEDUA PERTAHANAN)
--    Kasir tidak bisa mutasi langsung payroll, COA, jurnal, lisensi.
--    RLS tetap menjadi garis pertahanan utama, ini garis kedua.
--    Aksi sah Kasir (checkout, CRM lookup) tersalurkan via SECURITY DEFINER RPCs.
-- ==============================================================================

-- Payroll: hanya Owner/Super Admin/Admin via RLS; Kasir diblokir SELECT langsung
-- (akan dikuatkan via RLS policy di PR-3; revoke di sini menambah pertahanan)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='karyawan_cuci') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.karyawan_cuci FROM authenticated;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='karyawan_kantor') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.karyawan_kantor FROM authenticated;';
    END IF;
    -- General Ledger & COA: hanya append via SECURITY DEFINER RPCs
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='journal_entries') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.journal_entries FROM authenticated;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='journal_entry_lines') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.journal_entry_lines FROM authenticated;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='chart_of_accounts') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.chart_of_accounts FROM authenticated;';
    END IF;
    -- cashflow & pengeluaran: mutasi hanya via fn_execute_checkout / RPCs
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='cashflow') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.cashflow FROM authenticated;';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='pengeluaran') THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON TABLE public.pengeluaran FROM authenticated;';
    END IF;
END $$;

-- Hak SELECT pada tabel-tabel di atas dipertahankan untuk pelaporan Owner/Admin;
-- READ access akan dikontrol secara granular via RLS per-role di PR-3.

COMMIT;
