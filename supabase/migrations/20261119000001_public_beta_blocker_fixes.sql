-- ==============================================================================
-- Migration: 20261119000001_public_beta_blocker_fixes
-- Purpose:
--   1. Fix Blocker #2A: Add missing UNIQUE INDEX on master_categories(tenant_id, nama_kategori)
--      so fn_initialize_tenant_defaults / ON CONFLICT no longer throws SQLSTATE 42P10.
--   2. Fix Blocker #2B & #5 (Seed): Update fn_initialize_tenant_defaults to seed pos_balances
--      (SALDO CASH & SALDO REKENING Y) and complete starter Cafe ingredients + recipes for all 4
--      starter Cafe menus (Kopi Susu Aren, Americano Dingin, Roti Bakar Cokelat, Kentang Goreng Crispy).
--   3. Fix Blocker #1: Update fn_execute_checkout to validate Carwash prices against
--      tarif_matrix (ukuran + variant) instead of rejecting Medium/Large/XL/Body only prices.
--   4. Fix Blocker #5 (RPC): Keep PR-3 pos_balances RLS restricted to management and add
--      atomic SECURITY DEFINER RPC fn_record_cashier_money_exchange for Tukar Uang / Tarik Kas.
--   5. Align fn_enforce_tenant_branch_limit & fn_enforce_tenant_user_limit with 7-day grace period.
--   6. Idempotently backfill missing pos_balances and starter Cafe stock/recipes on existing tenants.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MASTER_CATEGORIES UNIQUE INDEX FOR ON CONFLICT (tenant_id, nama_kategori)
-- ------------------------------------------------------------------------------
DELETE FROM public.master_categories a
USING public.master_categories b
WHERE a.id > b.id
  AND a.tenant_id = b.tenant_id
  AND a.nama_kategori = b.nama_kategori;

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_categories_tenant_nama
    ON public.master_categories (tenant_id, nama_kategori);

-- ------------------------------------------------------------------------------
-- 2. POS_BALANCES SECURITY PRESERVED (PR-3 RLS)
-- ------------------------------------------------------------------------------
-- `pos_balances` remains restricted to management (`Super Admin`, `Owner`, `Admin`)
-- per PR-3 (PR3-03 / TC_PR3_02). Cashier money exchanges mutate `cashflow` and
-- `pos_balances` exclusively through the validated SECURITY DEFINER RPC below.

-- ------------------------------------------------------------------------------
-- 3. ATOMIC RPC: TUKAR UANG / TARIK KAS KASIR (CASHFLOW + POS_BALANCES)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_cashier_money_exchange(
    p_tenant_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_kasir TEXT DEFAULT 'KASIR',
    p_cash_out NUMERIC DEFAULT 0,
    p_qris_in NUMERIC DEFAULT 0,
    p_customer TEXT DEFAULT 'Umum',
    p_tanggal DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;
    v_cash_out NUMERIC(15, 2) := ROUND(COALESCE(p_cash_out, 0), 2);
    v_qris_in NUMERIC(15, 2) := ROUND(COALESCE(p_qris_in, 0), 2);
    v_admin_fee NUMERIC(15, 2);
    v_customer TEXT := COALESCE(NULLIF(BTRIM(p_customer), ''), 'Umum');
    v_kasir TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_kasir), ''), 'KASIR'));
    v_tanggal DATE := COALESCE(p_tanggal, CURRENT_DATE);
    v_tx_ref TEXT := 'EXCH-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    v_cash_row RECORD;
    v_bank_row RECORD;
    v_bank_pos TEXT := 'SALDO REKENING Y';
    v_new_cash_bal NUMERIC(15, 2);
    v_new_bank_bal NUMERIC(15, 2);
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles
    WHERE id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Akun staf tidak aktif.' USING ERRCODE = '42501';
    END IF;

    IF p_tenant_id IS NULL OR (
        v_caller_role <> 'super admin'
        AND v_caller_tenant IS DISTINCT FROM p_tenant_id
        AND NOT EXISTS (
            SELECT 1 FROM public.tenant_memberships m
            WHERE m.user_id = v_caller_id AND m.tenant_id = p_tenant_id
        )
    ) THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses mutasi kas lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;

    IF v_caller_role NOT IN ('super admin', 'owner', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan mencatat tukar uang.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL THEN
        SELECT id INTO v_effective_branch_id
        FROM public.branches
        WHERE tenant_id = p_tenant_id AND is_active IS TRUE
        ORDER BY is_main DESC NULLS LAST, created_at ASC
        LIMIT 1;
    END IF;

    IF v_caller_role = 'kasir' AND v_caller_branch IS NOT NULL AND v_effective_branch_id IS DISTINCT FROM v_caller_branch THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Kasir hanya dapat mencatat mutasi pada cabangnya sendiri.' USING ERRCODE = '42501';
    END IF;

    IF v_cash_out <= 0 OR v_qris_in <= 0 THEN
        RAISE EXCEPTION 'INVALID_EXCHANGE_AMOUNT: Nominal uang tunai dan transfer QRIS wajib lebih dari 0.';
    END IF;

    v_admin_fee := v_qris_in - v_cash_out;

    -- Lock or initialize SALDO CASH row
    SELECT id, balance INTO v_cash_row
    FROM public.pos_balances
    WHERE tenant_id = p_tenant_id
      AND pos = 'SALDO CASH'
      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
    ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
        VALUES (p_tenant_id, v_effective_branch_id, 'SALDO CASH', 'Kas Tunai Laci Kasir', 'CASH', 0.00, 'emerald', TRUE)
        RETURNING id, balance INTO v_cash_row;
    END IF;

    -- Lock or initialize bank account row (SALDO REKENING Y or fallback alias)
    SELECT id, pos, balance INTO v_bank_row
    FROM public.pos_balances
    WHERE tenant_id = p_tenant_id
      AND pos IN ('SALDO REKENING Y', 'SALDO REKENING OPERASIONAL')
      AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
    ORDER BY (pos = 'SALDO REKENING Y') DESC, (branch_id = v_effective_branch_id) DESC NULLS LAST, updated_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
        VALUES (p_tenant_id, v_effective_branch_id, 'SALDO REKENING Y', 'Rekening QRIS & Transfer Utama', 'BANK', 0.00, 'blue', TRUE)
        RETURNING id, pos, balance INTO v_bank_row;
    END IF;

    v_bank_pos := v_bank_row.pos;
    v_new_cash_bal := COALESCE(v_cash_row.balance, 0.00) - v_cash_out;
    v_new_bank_bal := COALESCE(v_bank_row.balance, 0.00) + v_qris_in;

    INSERT INTO public.cashflow (
        id, tenant_id, branch_id, id_cashflow, id_sumber, tanggal,
        keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
        pos, saldo_kas, apakah_stok, created_at
    ) VALUES
        (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id,
            v_tx_ref || '-CASH', v_tx_ref, v_tanggal,
            'Tukar Uang Cash Keluar (' || v_kasir || ') - Cust: ' || v_customer,
            'Pindah', 'Tukar Uang', 0.00, v_cash_out,
            'SALDO CASH', 0.00, FALSE, NOW()
        ),
        (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id,
            v_tx_ref || '-BANK', v_tx_ref, v_tanggal,
            'Tukar Uang QRIS Masuk (' || v_kasir || ') - Cust: ' || v_customer,
            'Pindah', 'Tukar Uang', v_cash_out, 0.00,
            v_bank_pos, 0.00, FALSE, NOW()
        );

    IF v_admin_fee > 0 THEN
        INSERT INTO public.cashflow (
            id, tenant_id, branch_id, id_cashflow, id_sumber, tanggal,
            keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
            pos, saldo_kas, apakah_stok, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id,
            v_tx_ref || '-FEE', v_tx_ref, v_tanggal,
            'Biaya Admin Tukar Uang (' || v_kasir || ') - Cust: ' || v_customer,
            'Pemasukan', 'Pendapatan Lain-lain', v_admin_fee, 0.00,
            v_bank_pos, 0.00, FALSE, NOW()
        );
    END IF;

    UPDATE public.pos_balances
    SET balance = v_new_cash_bal, updated_at = NOW()
    WHERE id = v_cash_row.id AND tenant_id = p_tenant_id;

    UPDATE public.pos_balances
    SET balance = v_new_bank_bal, updated_at = NOW()
    WHERE id = v_bank_row.id AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'reference_id', v_tx_ref,
        'cash_out', v_cash_out,
        'qris_in', v_qris_in,
        'admin_fee', v_admin_fee,
        'cash_balance', v_new_cash_bal,
        'bank_balance', v_new_bank_bal,
        'bank_pos', v_bank_pos
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_record_cashier_money_exchange(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_cashier_money_exchange(UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, DATE) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. UPDATE fn_initialize_tenant_defaults (IDEMPOTENT SEEDS + POS BALANCES + RECIPES)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_initialize_tenant_defaults(p_tenant_id UUID, p_branch_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_business_type TEXT := 'HYBRID';
    v_has_cafe BOOLEAN := TRUE;
    v_has_carwash BOOLEAN := TRUE;
BEGIN
    SELECT UPPER(COALESCE(business_type, 'HYBRID'))
    INTO v_business_type
    FROM public.tenants
    WHERE id = p_tenant_id;

    v_has_cafe := v_business_type IN ('HYBRID', 'CAFE');
    v_has_carwash := v_business_type IN ('HYBRID', 'CARWASH');

    -- 1. Chart of Accounts (COA) Standar Akuntansi Indonesia
    INSERT INTO public.chart_of_accounts (tenant_id, kode_akun, nama_akun, tipe, kategori, saldo_normal, saldo_awal, is_active)
    VALUES
        (p_tenant_id, '1101', 'Kas Tunai & Laci Kasir', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1102', 'Bank & QRIS Settlement', 'ASET', 'Kas & Bank', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '1103', 'Persediaan Bahan Baku & Stok', 'ASET', 'Persediaan', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '2101', 'Hutang Usaha & Operasional', 'KEWAJIBAN', 'Hutang Lancar', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '3101', 'Modal Disetor Pemilik', 'EKUITAS', 'Modal', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '3102', 'Prive / Penarikan Modal Pemilik', 'EKUITAS', 'Ekuitas', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '4101', 'Pendapatan Layanan Carwash', 'PENDAPATAN', 'Pendapatan Usaha', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '4102', 'Pendapatan Penjualan Cafe & F&B', 'PENDAPATAN', 'Pendapatan Usaha', 'KREDIT', 0.00, TRUE),
        (p_tenant_id, '5101', 'Beban Pokok Pendapatan (HPP)', 'BEBAN', 'Beban Pokok Penjualan', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '6101', 'Beban Gaji & Komisi Cuci', 'BEBAN', 'Beban Operasional', 'DEBIT', 0.00, TRUE),
        (p_tenant_id, '6102', 'Beban Operasional & Listrik Air', 'BEBAN', 'Beban Operasional', 'DEBIT', 0.00, TRUE)
    ON CONFLICT (tenant_id, kode_akun) DO NOTHING;

    -- 2. Kategori Master Keuangan (menggunakan unique index uq_master_categories_tenant_nama)
    INSERT INTO public.master_categories (tenant_id, nama_kategori, jenis, tipe_arus, boleh_kasir, is_active)
    VALUES
        (p_tenant_id, 'Operasional & Utilitas', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Gaji & Komisi Karyawan', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Bahan Baku & Dapur', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Belanja Perlengkapan Cuci', 'PENGELUARAN', 'OPERASI', TRUE, TRUE),
        (p_tenant_id, 'Pemeliharaan & Servis Alat', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Sewa Tempat & Bangunan', 'PENGELUARAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Prive & Penarikan Dana', 'PENGELUARAN', 'PENDANAAN', FALSE, TRUE),
        (p_tenant_id, 'Penjualan Cafe & Minuman', 'PEMASUKAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Layanan Jasa Cuci Mobil', 'PEMASUKAN', 'OPERASI', FALSE, TRUE),
        (p_tenant_id, 'Pendapatan Lain-lain', 'PEMASUKAN', 'OPERASI', FALSE, TRUE)
    ON CONFLICT (tenant_id, nama_kategori) DO NOTHING;

    -- 3. Akun Saldo Awal Laci & Rekening (pos_balances)
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
        VALUES
            (p_tenant_id, p_branch_id, 'SALDO CASH', 'Kas Tunai Laci Kasir', 'CASH', 0.00, 'emerald', TRUE),
            (p_tenant_id, p_branch_id, 'SALDO REKENING Y', 'Rekening QRIS & Transfer Utama', 'BANK', 0.00, 'blue', TRUE)
        ON CONFLICT (tenant_id, branch_id, pos) DO NOTHING;
    END IF;

    -- 4. CRM Program Loyalitas Bawaan
    IF p_branch_id IS NOT NULL AND v_has_carwash THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.crm_loyalty_programs
            WHERE tenant_id = p_tenant_id AND (branch_id = p_branch_id OR branch_id IS NULL)
        ) THEN
            INSERT INTO public.crm_loyalty_programs (
                tenant_id, branch_id, target_stamps, reward_type, reward_title, reward_description, is_active
            ) VALUES (
                p_tenant_id, p_branch_id, 5, 'FREE_WASH', 'Cuci 5x Gratis 1x', 'Reward loyalitas cuci kendaraan', TRUE
            );
        END IF;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        -- 5. Menu, Bahan Baku & Resep Lengkap Starter Cafe (untuk CAFE & HYBRID)
        IF v_has_cafe THEN
            INSERT INTO public.daftar_harga_menu (
                tenant_id, branch_id, id_menu, daftar_menu, nama_menu, harga, kategori, is_active
            ) VALUES
                (p_tenant_id, p_branch_id, 'Kopi Susu Aren', 'Kopi Susu Aren', 'Kopi Susu Aren', 18000.00, 'Kopi', TRUE),
                (p_tenant_id, p_branch_id, 'Americano Dingin', 'Americano Dingin', 'Americano Dingin', 15000.00, 'Kopi', TRUE),
                (p_tenant_id, p_branch_id, 'Roti Bakar Cokelat', 'Roti Bakar Cokelat', 'Roti Bakar Cokelat', 15000.00, 'Makanan', TRUE),
                (p_tenant_id, p_branch_id, 'Kentang Goreng Crispy', 'Kentang Goreng Crispy', 'Kentang Goreng Crispy', 16000.00, 'Snack', TRUE)
            ON CONFLICT (tenant_id, branch_id, daftar_menu) DO NOTHING;

            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan, stok, stok_akhir, harga_satuan, harga_beli, min_stok, gudang, kategori, is_active
            ) VALUES
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-KOPI', 'BB-KOPI', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 'kg', 100.00, 100.00, 150000.00, 150000.00, 5.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-SUSU', 'BB-SUSU', 'Susu Segar UHT', 'Susu Segar UHT', 'liter', 100.00, 100.00, 22000.00, 22000.00, 10.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-ROTI', 'BB-ROTI', 'Roti Tawar Tebal', 'Roti Tawar Tebal', 'porsi', 100.00, 100.00, 5000.00, 5000.00, 10.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-KENTANG', 'BB-KENTANG', 'Kentang Shoestring', 'Kentang Shoestring', 'kg', 50.00, 50.00, 32000.00, 32000.00, 5.00, 'CAFE', 'Bahan Baku', TRUE)
            ON CONFLICT (tenant_id, branch_id, nama_produk) DO NOTHING;

            INSERT INTO public.resep (
                id, tenant_id, id_menu, id_bahan_baku, daftar_menu, nama_menu, nama_bahan, nama_bahan_baku, jumlah, jumlah_dibutuhkan, jumlah_pemakaian, satuan
            ) VALUES
                (gen_random_uuid(), p_tenant_id, 'Kopi Susu Aren', 'BB-KOPI', 'Kopi Susu Aren', 'Kopi Susu Aren', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 0.02, 0.02, 0.02, 'kg'),
                (gen_random_uuid(), p_tenant_id, 'Kopi Susu Aren', 'BB-SUSU', 'Kopi Susu Aren', 'Kopi Susu Aren', 'Susu Segar UHT', 'Susu Segar UHT', 0.15, 0.15, 0.15, 'liter'),
                (gen_random_uuid(), p_tenant_id, 'Americano Dingin', 'BB-KOPI', 'Americano Dingin', 'Americano Dingin', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 0.02, 0.02, 0.02, 'kg'),
                (gen_random_uuid(), p_tenant_id, 'Roti Bakar Cokelat', 'BB-ROTI', 'Roti Bakar Cokelat', 'Roti Bakar Cokelat', 'Roti Tawar Tebal', 'Roti Tawar Tebal', 1.00, 1.00, 1.00, 'porsi'),
                (gen_random_uuid(), p_tenant_id, 'Kentang Goreng Crispy', 'BB-KENTANG', 'Kentang Goreng Crispy', 'Kentang Goreng Crispy', 'Kentang Shoestring', 'Kentang Shoestring', 0.20, 0.20, 0.20, 'kg')
            ON CONFLICT (tenant_id, id_menu, id_bahan_baku) DO NOTHING;
        END IF;

        -- 6. Paket & Stok Starter Carwash (untuk CARWASH & HYBRID)
        IF v_has_carwash THEN
            INSERT INTO public.carwash_packages (
                id, tenant_id, branch_id, name, nama_paket, description, keterangan, price, tarif, sort_order, komisi_skema, tarif_matrix, is_active
            )
            SELECT
                gen_random_uuid(), p_tenant_id, p_branch_id, v.nama_paket, v.nama_paket,
                v.keterangan, v.keterangan, v.base_price, v.base_price, v.sort_order, 'TIERED', v.tarif_matrix, TRUE
            FROM (
                VALUES
                    (
                        'PAKET CUCI BIASA',
                        'Cuci bersih body luar dan vakum interior standar',
                        50000.00::numeric, 1,
                        '{"Small":{"Regular":50000,"Body only":35000},"Medium":{"Regular":55000,"Body only":40000},"Large":{"Regular":60000,"Body only":45000},"Extra Large":{"Regular":80000,"Body only":80000}}'::jsonb
                    ),
                    (
                        'PAKET KACA BENING (CUCI + JAMUR KACA)',
                        'Cuci reguler ditambah pembersihan jamur kaca depan/samping',
                        150000.00::numeric, 2,
                        '{"Small":{"Regular":150000,"Body only":135000},"Medium":{"Regular":155000,"Body only":140000},"Large":{"Regular":160000,"Body only":145000},"Extra Large":{"Regular":180000,"Body only":180000}}'::jsonb
                    ),
                    (
                        'PAKET DAUN TALAS (CUCI + WAX KACA)',
                        'Cuci reguler ditambah coating efek daun talas pada kaca',
                        100000.00::numeric, 3,
                        '{"Small":{"Regular":100000,"Body only":85000},"Medium":{"Regular":105000,"Body only":90000},"Large":{"Regular":110000,"Body only":95000},"Extra Large":{"Regular":130000,"Body only":130000}}'::jsonb
                    ),
                    (
                        'PAKET JURAGAN (CUCI + JAMUR KACA + WAX KACA)',
                        'Treatment kaca lengkap jamur + wax hydrophobic',
                        200000.00::numeric, 4,
                        '{"Small":{"Regular":200000,"Body only":185000},"Medium":{"Regular":205000,"Body only":190000},"Large":{"Regular":210000,"Body only":195000},"Extra Large":{"Regular":230000,"Body only":230000}}'::jsonb
                    ),
                    (
                        'PAKET GLOW UP (CUCI + WAX BODY)',
                        'Cuci reguler ditambah wax kilap body mobil',
                        100000.00::numeric, 5,
                        '{"Small":{"Regular":100000,"Body only":85000},"Medium":{"Regular":110000,"Body only":95000},"Large":{"Regular":120000,"Body only":105000},"Extra Large":{"Regular":160000,"Body only":160000}}'::jsonb
                    ),
                    (
                        'PAKET PEJABAT (CUCI + JAMUR BODY + WAX BODY)',
                        'Pembersihan jamur body menyeluruh ditambah wax finishing',
                        180000.00::numeric, 6,
                        '{"Small":{"Regular":180000,"Body only":165000},"Medium":{"Regular":200000,"Body only":185000},"Large":{"Regular":220000,"Body only":205000},"Extra Large":{"Regular":300000,"Body only":300000}}'::jsonb
                    )
            ) AS v(nama_paket, keterangan, base_price, sort_order, tarif_matrix)
            WHERE NOT EXISTS (
                SELECT 1 FROM public.carwash_packages cp
                WHERE cp.tenant_id = p_tenant_id
                  AND LOWER(TRIM(COALESCE(cp.nama_paket, cp.name, ''))) = LOWER(TRIM(v.nama_paket))
            );

            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan, stok, stok_akhir, harga_satuan, harga_beli, min_stok, gudang, kategori, is_active
            ) VALUES
                (gen_random_uuid(), p_tenant_id, p_branch_id, 'BB-SHM', 'BB-SHM', 'Shampoo Carwash Touchless', 'Shampoo Carwash Touchless', 'liter', 200.00, 200.00, 35000.00, 35000.00, 20.00, 'CARWASH', 'Bahan Baku', TRUE)
            ON CONFLICT (tenant_id, branch_id, nama_produk) DO NOTHING;
        END IF;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_initialize_tenant_defaults(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_initialize_tenant_defaults(UUID, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. UPDATE fn_execute_checkout (RESOLVE CARWASH TIERED tarif_matrix BY UKURAN & VARIANT)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_execute_checkout(
    p_tenant_id uuid,
    p_branch_id uuid,
    p_struk_payload jsonb,
    p_cafe_items jsonb,
    p_carwash_payload jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_caller_id UUID;
    v_caller_tenant UUID;
    v_caller_branch UUID;
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_effective_branch_id UUID;
    v_uang_diterima NUMERIC(15, 2) := 0.00;
    v_tender_total NUMERIC(15, 2) := 0.00;
    v_non_cash NUMERIC(15, 2) := 0.00;
    v_nominal_cash NUMERIC(15, 2) := 0.00;
    v_nominal_qris NUMERIC(15, 2) := 0.00;
    v_nominal_transfer NUMERIC(15, 2) := 0.00;
    v_is_cash BOOLEAN;
    v_id_struk TEXT;
    v_tanggal DATE;
    v_jam TIME;
    v_status_bayar TEXT;
    v_nominal_bayar NUMERIC(15, 2) := 0.00;
    v_kembalian NUMERIC(15, 2) := 0.00;
    v_metode_bayar TEXT;
    v_kasir TEXT;
    v_customer TEXT;
    v_catatan TEXT;
    v_diskon NUMERIC(15, 2) := 0.00;
    v_pajak NUMERIC(15, 2) := 0.00;
    v_subtotal_kotor NUMERIC(15, 2) := 0.00;
    v_total_cafe NUMERIC(15, 2) := 0.00;
    v_total_carwash NUMERIC(15, 2) := 0.00;
    v_total_tagihan NUMERIC(15, 2) := 0.00;
    v_total_cogs NUMERIC(15, 2) := 0.00;
    v_redeem_loyalty BOOLEAN := FALSE;
    v_cw_plat TEXT := '';
    v_redeem_res JSONB := NULL;

    v_existing_struk RECORD;
    v_item JSONB;
    v_nama_menu TEXT;
    v_qty_menu NUMERIC(15, 4);
    v_harga_menu NUMERIC(15, 2);
    v_menu_record RECORD;

    v_resep_record RECORD;
    v_stock_record RECORD;
    v_needed NUMERIC(15, 4);
    v_item_cogs NUMERIC(15, 2);

    v_cw_record RECORD;
    v_cw_paket TEXT;
    v_cw_ukuran TEXT;
    v_cw_variant TEXT;
    v_cw_harga NUMERIC(15, 2);
    v_base_cw_price NUMERIC(15, 2);
    v_catalog_cw_price NUMERIC(15, 2);

    v_current_hash TEXT;
    v_advisory_key BIGINT;

    v_journal_id UUID;
    v_coa_kas UUID;
    v_coa_bank UUID;
    v_coa_inv UUID;
    v_coa_rev_cw UUID;
    v_coa_rev_cafe UUID;
    v_coa_cogs UUID;
    v_coa_tax UUID;
    v_net_cw NUMERIC(15, 2) := 0.00;
    v_net_cafe NUMERIC(15, 2) := 0.00;
    v_pos TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi pengguna diperlukan.' USING ERRCODE = '42501';
    END IF;
    SELECT tenant_id, branch_id, LOWER(TRIM(role)), is_active
    INTO v_caller_tenant, v_caller_branch, v_caller_role, v_caller_active
    FROM public.profiles WHERE id = v_caller_id;
    IF NOT FOUND OR v_caller_active IS NOT TRUE THEN
        RAISE EXCEPTION 'USER_INACTIVE: Keanggotaan aktif diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_tenant_id IS NULL OR v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_FORBIDDEN: Akses transaksi lintas tenant ditolak.' USING ERRCODE = '42501';
    END IF;
    IF v_caller_role NOT IN ('owner', 'admin', 'kasir') OR v_caller_role IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: Peran pengguna tidak diizinkan melakukan checkout.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.fn_assert_active_tenant_license(p_tenant_id);

    v_effective_branch_id := COALESCE(p_branch_id, v_caller_branch);
    IF v_effective_branch_id IS NULL OR
       (v_caller_role = 'kasir' AND v_effective_branch_id IS DISTINCT FROM v_caller_branch) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang transaksi tidak diizinkan.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.branches
                   WHERE id = v_effective_branch_id AND tenant_id = p_tenant_id AND is_active IS TRUE) THEN
        RAISE EXCEPTION 'BRANCH_FORBIDDEN: Cabang aktif dalam tenant diperlukan.' USING ERRCODE = '42501';
    END IF;
    IF p_struk_payload IS NULL OR jsonb_typeof(p_struk_payload) <> 'object' THEN
        RAISE EXCEPTION 'INVALID_PAYLOAD: Header transaksi wajib berupa object.';
    END IF;

    v_id_struk := TRIM(COALESCE(p_struk_payload->>'id_struk', p_struk_payload->>'nomor_struk', p_struk_payload->>'no_struk', ''));
    IF v_id_struk = '' THEN
        v_id_struk := 'STRUK-' || to_char(NOW(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(md5(random()::text), 1, 4));
    END IF;

    v_advisory_key := ('x' || substr(md5(p_tenant_id::text || ':' || v_id_struk), 1, 15))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    v_current_hash := md5(
        COALESCE(p_struk_payload::text, '') || '|' ||
        COALESCE(p_cafe_items::text, '') || '|' ||
        COALESCE(p_carwash_payload::text, '')
    );

    SELECT id, tenant_id, branch_id, id_struk, status_bayar, payload_hash, total_tagihan, nominal_bayar, uang_diterima, kembalian, total_cogs
    INTO v_existing_struk
    FROM public.struk
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    IF FOUND THEN
        IF v_existing_struk.branch_id IS DISTINCT FROM v_effective_branch_id THEN
            RAISE EXCEPTION 'BRANCH_FORBIDDEN: Transaksi berasal dari cabang berbeda.' USING ERRCODE = '42501';
        END IF;
        IF v_existing_struk.status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
            IF v_existing_struk.payload_hash IS NOT NULL AND v_existing_struk.payload_hash <> v_current_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Struk "%" telah diselesaikan dengan payload transaksi yang berbeda.', v_id_struk;
            END IF;

            RETURN jsonb_build_object(
                'success', TRUE,
                'status', 'ALREADY_COMPLETED',
                'id_struk', v_id_struk,
                'total_tagihan', v_existing_struk.total_tagihan,
                'nominal_bayar', v_existing_struk.nominal_bayar,
                'uang_diterima', v_existing_struk.uang_diterima,
                'kembalian', v_existing_struk.kembalian,
                'total_cogs', COALESCE(v_existing_struk.total_cogs, 0.00),
                'was_replayed', TRUE,
                'message', 'Transaksi sudah berstatus selesai, mutasi tidak diulang.'
            );
        END IF;
    END IF;

    v_tanggal := COALESCE(NULLIF(p_struk_payload->>'tanggal', '')::date, CURRENT_DATE);
    v_jam := COALESCE(NULLIF(p_struk_payload->>'jam', '')::time, CURRENT_TIME);
    v_status_bayar := COALESCE(NULLIF(p_struk_payload->>'status_bayar', ''), 'Selesai');
    v_diskon := COALESCE(NULLIF(p_struk_payload->>'diskon', '')::numeric, 0.00);
    v_pajak := COALESCE(NULLIF(p_struk_payload->>'pajak', '')::numeric, 0.00);
    v_nominal_bayar := COALESCE(NULLIF(p_struk_payload->>'nominal_bayar', '')::numeric, 0.00);
    v_metode_bayar := UPPER(TRIM(COALESCE(NULLIF(p_struk_payload->>'metode_bayar', ''), 'CASH')));
    v_kasir := COALESCE(NULLIF(p_struk_payload->>'kasir', ''), 'Kasir');
    v_customer := COALESCE(NULLIF(p_struk_payload->>'nama_pelanggan', ''), 'Pelanggan Umum');
    v_catatan := COALESCE(p_struk_payload->>'catatan', '');
    v_redeem_loyalty := COALESCE((p_struk_payload->>'redeem_loyalty')::boolean, FALSE);

    IF v_diskon < 0.00 THEN
        RAISE EXCEPTION 'INVALID_DISCOUNT: Diskon tidak boleh negatif.';
    END IF;

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);
            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            IF v_nama_menu = '' OR v_qty_menu <= 0 THEN
                RAISE EXCEPTION 'INVALID_ITEM: Nama menu dan kuantitas wajib valid.';
            END IF;

            SELECT harga INTO v_menu_record
            FROM public.daftar_harga_menu
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_menu, ''))) = LOWER(TRIM(v_nama_menu))
                   OR LOWER(TRIM(COALESCE(daftar_menu, ''))) = LOWER(TRIM(v_nama_menu)))
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1;

            IF FOUND THEN
                IF v_harga_menu <> v_menu_record.harga THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga menu "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_nama_menu, v_menu_record.harga, v_harga_menu;
                END IF;
            ELSE
                IF v_harga_menu < 0.00 THEN
                    RAISE EXCEPTION 'INVALID_PRICE: Harga menu tidak boleh negatif.';
                END IF;
            END IF;

            v_total_cafe := v_total_cafe + (v_harga_menu * v_qty_menu);
        END LOOP;
    END IF;

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        v_cw_paket := TRIM(COALESCE(p_carwash_payload->>'paket', ''));
        v_cw_plat := TRIM(COALESCE(p_carwash_payload->>'plat', p_carwash_payload->>'plat_nomor', ''));
        v_cw_ukuran := COALESCE(NULLIF(TRIM(p_carwash_payload->>'ukuran'), ''), 'Medium');
        v_cw_variant := COALESCE(NULLIF(TRIM(p_carwash_payload->>'variant'), ''), 'Regular');
        v_cw_harga := COALESCE(
            NULLIF(p_carwash_payload->>'harga', '')::numeric,
            NULLIF(p_carwash_payload->>'tarif', '')::numeric,
            0.00
        );

        IF v_cw_paket <> '' THEN
            SELECT price, tarif, tarif_matrix INTO v_cw_record
            FROM public.carwash_packages
            WHERE tenant_id = p_tenant_id
              AND (LOWER(TRIM(COALESCE(nama_paket, ''))) = LOWER(TRIM(v_cw_paket))
                   OR LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM(v_cw_paket)))
            LIMIT 1;

            IF FOUND AND LOWER(v_cw_ukuran) <> 'custom' THEN
                v_base_cw_price := COALESCE(v_cw_record.tarif, v_cw_record.price);
                IF v_cw_record.tarif_matrix IS NOT NULL AND jsonb_typeof(v_cw_record.tarif_matrix) = 'object' THEN
                    v_catalog_cw_price := COALESCE(
                        NULLIF(v_cw_record.tarif_matrix->v_cw_ukuran->>v_cw_variant, '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->v_cw_ukuran->>'Regular', '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->'Large'->>v_cw_variant, '')::numeric,
                        NULLIF(v_cw_record.tarif_matrix->'Large'->>'Regular', '')::numeric,
                        v_base_cw_price
                    );
                ELSE
                    v_catalog_cw_price := v_base_cw_price;
                END IF;

                IF v_catalog_cw_price IS NOT NULL AND v_catalog_cw_price > 0.00
                   AND v_cw_harga <> v_catalog_cw_price
                   AND v_cw_harga <> COALESCE(v_base_cw_price, -1.00) THEN
                    RAISE EXCEPTION 'PRICE_TAMPERING_DETECTED: Harga paket carwash "%" tidak sesuai katalog (Katalog: %, Dikirim: %).',
                        v_cw_paket, v_catalog_cw_price, v_cw_harga;
                END IF;
            END IF;
        END IF;

        IF v_cw_harga < 0.00 THEN
            RAISE EXCEPTION 'INVALID_PRICE: Tarif carwash tidak boleh negatif.';
        END IF;

        v_total_carwash := v_cw_harga;
    END IF;

    IF v_redeem_loyalty THEN
        IF v_cw_plat = '' OR v_total_carwash <= 0 THEN
            RAISE EXCEPTION 'LOYALTY_REWARD_UNAVAILABLE: Klaim hadiah loyalty memerlukan transaksi layanan cuci kendaraan.';
        END IF;

        v_redeem_res := public.redeem_customer_reward(
            p_tenant_id,
            v_cw_plat,
            NULL,
            'Klaim hadiah loyalty saat checkout POS (' || v_id_struk || ')',
            v_customer,
            v_id_struk,
            v_id_struk
        );

        v_diskon := v_diskon + v_total_carwash;
    END IF;

    v_subtotal_kotor := v_total_cafe + v_total_carwash;
    v_total_tagihan := GREATEST(0.00, v_subtotal_kotor - v_diskon + v_pajak);

    v_is_cash := v_metode_bayar IN ('CASH', 'TUNAI', 'SPLIT');
    v_nominal_qris := CASE WHEN v_metode_bayar IN ('SPLIT', 'QRIS') THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_qris', '')::numeric, 0.00) ELSE 0.00 END;
    v_nominal_transfer := CASE WHEN v_metode_bayar IN ('SPLIT', 'TRANSFER') THEN
        COALESCE(NULLIF(p_struk_payload->>'nominal_transfer', '')::numeric, 0.00) ELSE 0.00 END;

    IF v_metode_bayar = 'QRIS' AND v_nominal_qris = 0.00 THEN
        v_nominal_qris := v_total_tagihan;
    ELSIF v_metode_bayar = 'TRANSFER' AND v_nominal_transfer = 0.00 THEN
        v_nominal_transfer := v_total_tagihan;
    END IF;

    v_non_cash := CASE WHEN v_metode_bayar = 'SPLIT' THEN (v_nominal_qris + v_nominal_transfer) ELSE 0.00 END;
    v_uang_diterima := COALESCE(
        NULLIF(p_struk_payload->>'uang_diterima', '')::numeric,
        CASE WHEN v_metode_bayar = 'SPLIT' THEN COALESCE(NULLIF(p_struk_payload->>'nominal_cash', '')::numeric, v_nominal_bayar - v_non_cash) ELSE v_nominal_bayar END
    );

    IF v_uang_diterima = 'NaN'::numeric OR v_non_cash = 'NaN'::numeric OR
       v_uang_diterima < 0 OR v_non_cash < 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT: Nominal pembayaran wajib valid dan tidak negatif.';
    END IF;

    v_tender_total := v_uang_diterima + v_non_cash;

    IF v_status_bayar IN ('Selesai', 'Paid', 'Lunas') THEN
        IF v_tender_total < v_total_tagihan THEN
            RAISE EXCEPTION 'PAYMENT_UNDERPAID: Pembayaran kurang dari tagihan.';
        END IF;
        IF NOT v_is_cash AND v_tender_total <> v_total_tagihan THEN
            RAISE EXCEPTION 'INVALID_PAYMENT: Pembayaran non-tunai harus sesuai tagihan.';
        END IF;
        v_nominal_bayar := v_total_tagihan;
        v_kembalian := CASE WHEN v_is_cash THEN v_tender_total - v_total_tagihan ELSE 0.00 END;

        IF v_metode_bayar = 'SPLIT' THEN
            v_nominal_cash := GREATEST(0.00, v_total_tagihan - v_non_cash);
        ELSIF v_is_cash THEN
            v_nominal_cash := v_total_tagihan;
        ELSE
            v_nominal_cash := 0.00;
        END IF;
    ELSE
        v_nominal_bayar := LEAST(v_tender_total, v_total_tagihan);
        v_kembalian := 0.00;
        v_nominal_cash := 0.00;
    END IF;

    INSERT INTO public.struk (
        id, tenant_id, branch_id, id_struk, tanggal, jam, kasir,
        nama_pelanggan, catatan, status_bayar, status_pembayaran,
        subtotal, diskon, diskon_cafe, diskon_carwash,
        pajak, nominal_bayar, bayar, uang_diterima, kembalian,
        nominal_cash, nominal_qris, nominal_transfer,
        metode_bayar, metode_pembayaran, total_tagihan, total, payload_hash,
        created_at, waktu_dibuat, updated_at
    ) VALUES (
        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam, v_kasir,
        v_customer, v_catatan, v_status_bayar, v_status_bayar,
        v_subtotal_kotor, v_diskon, v_diskon, 0.00,
        v_pajak, v_nominal_bayar, v_nominal_bayar, v_uang_diterima, v_kembalian,
        v_nominal_cash, v_nominal_qris, v_nominal_transfer,
        v_metode_bayar, v_metode_bayar, v_total_tagihan, v_total_tagihan, v_current_hash,
        NOW(), NOW(), NOW()
    )
    ON CONFLICT (tenant_id, id_struk) DO UPDATE SET
        status_bayar = EXCLUDED.status_bayar,
        status_pembayaran = EXCLUDED.status_pembayaran,
        nominal_bayar = EXCLUDED.nominal_bayar,
        bayar = EXCLUDED.bayar,
        uang_diterima = EXCLUDED.uang_diterima,
        kembalian = EXCLUDED.kembalian,
        nominal_cash = EXCLUDED.nominal_cash,
        nominal_qris = EXCLUDED.nominal_qris,
        nominal_transfer = EXCLUDED.nominal_transfer,
        pajak = EXCLUDED.pajak,
        total_tagihan = EXCLUDED.total_tagihan,
        total = EXCLUDED.total,
        updated_at = NOW();

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);

            FOR v_resep_record IN
                SELECT nama_bahan, COALESCE(jumlah_dibutuhkan, jumlah) AS jumlah_per_porsi, satuan
                FROM public.resep
                WHERE tenant_id = p_tenant_id
                  AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            LOOP
                v_needed := v_resep_record.jumlah_per_porsi * v_qty_menu;

                SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                INTO v_stock_record
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                  AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_resep_record.nama_bahan))
                       OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_resep_record.nama_bahan)))
                ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, id
                LIMIT 1
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stock_record.stok < v_needed THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok bahan "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_resep_record.nama_bahan, v_stock_record.stok, v_needed;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_needed,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_needed,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    v_item_cogs := ROUND(v_needed * v_stock_record.unit_cost, 2);

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, id_struk,
                        nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, biaya_satuan, total_biaya,
                        tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id, v_id_struk,
                        v_resep_record.nama_bahan, v_resep_record.nama_bahan, v_resep_record.nama_bahan,
                        v_needed, v_stock_record.unit_cost, v_item_cogs,
                        v_tanggal, 'BOM Pemakaian POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END LOOP;

            IF NOT EXISTS (
                SELECT 1 FROM public.resep
                WHERE tenant_id = p_tenant_id AND LOWER(TRIM(nama_menu)) = LOWER(TRIM(v_nama_menu))
            ) THEN
                SELECT id, stok, stok_akhir, COALESCE(harga_beli, harga_satuan, 0.00) AS unit_cost
                INTO v_stock_record
                FROM public.stok_barang
                WHERE tenant_id = p_tenant_id
                  AND (branch_id = v_effective_branch_id OR branch_id IS NULL)
                  AND (LOWER(TRIM(COALESCE(nama_produk, ''))) = LOWER(TRIM(v_nama_menu))
                       OR LOWER(TRIM(COALESCE(nama_barang, ''))) = LOWER(TRIM(v_nama_menu)))
                ORDER BY (branch_id = v_effective_branch_id) DESC NULLS LAST, id
                LIMIT 1
                FOR UPDATE;

                IF FOUND THEN
                    IF v_stock_record.stok < v_qty_menu THEN
                        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Stok produk "%" tidak mencukupi (Tersedia: %, Dibutuhkan: %).',
                            v_nama_menu, v_stock_record.stok, v_qty_menu;
                    END IF;

                    UPDATE public.stok_barang
                    SET stok = stok - v_qty_menu,
                        stok_akhir = COALESCE(stok_akhir, stok) - v_qty_menu,
                        updated_at = NOW()
                    WHERE id = v_stock_record.id AND tenant_id = p_tenant_id;

                    v_item_cogs := ROUND(v_qty_menu * v_stock_record.unit_cost, 2);

                    INSERT INTO public.barang_keluar (
                        id, tenant_id, branch_id, id_barang, id_bahan_baku, id_struk,
                        nama_barang, nama_produk, nama_bahan_baku,
                        jumlah_keluar, biaya_satuan, total_biaya,
                        tanggal, keterangan, alasan, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_stock_record.id::text, v_stock_record.id, v_id_struk,
                        v_nama_menu, v_nama_menu, v_nama_menu,
                        v_qty_menu, v_stock_record.unit_cost, v_item_cogs,
                        v_tanggal, 'Penjualan Langsung POS Struk: ' || v_id_struk, 'POS_SALE', NOW()
                    );

                    v_total_cogs := v_total_cogs + v_item_cogs;
                END IF;
            END IF;
        END LOOP;
    END IF;

    UPDATE public.struk
    SET total_cogs = v_total_cogs,
        cogs_status = CASE WHEN v_total_cogs > 0 THEN 'SNAPSHOT_RECORDED' ELSE 'ZERO_OR_SERVICE' END
    WHERE tenant_id = p_tenant_id AND id_struk = v_id_struk;

    IF p_cafe_items IS NOT NULL AND jsonb_array_length(p_cafe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_cafe_items)
        LOOP
            v_nama_menu := TRIM(COALESCE(v_item->>'nama_menu', ''));
            v_qty_menu := COALESCE(NULLIF(v_item->>'qty', '')::numeric, 1.00);
            v_harga_menu := COALESCE(
                NULLIF(v_item->>'harga_satuan', '')::numeric,
                NULLIF(v_item->>'harga', '')::numeric,
                0.00
            );

            INSERT INTO public.cafe (
                id, tenant_id, branch_id, id_struk, tanggal, jam,
                nama_menu, qty, harga_satuan, subtotal, status, catatan, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
                v_nama_menu, v_qty_menu, v_harga_menu, (v_harga_menu * v_qty_menu), v_status_bayar, v_catatan, NOW()
            );
        END LOOP;
    END IF;

    IF p_carwash_payload IS NOT NULL AND p_carwash_payload <> '{}'::jsonb THEN
        INSERT INTO public.carwash (
            id, tenant_id, branch_id, id_struk, tanggal, jam, plat, model, variant, ukuran,
            paket, harga, anggota_1, anggota_2, shift, status, gaji_anggota,
            no_telepon, keterangan, created_at
        ) VALUES (
            gen_random_uuid(), p_tenant_id, v_effective_branch_id, v_id_struk, v_tanggal, v_jam,
            COALESCE(p_carwash_payload->>'plat', '-'),
            COALESCE(p_carwash_payload->>'model', 'Mobil'),
            COALESCE(p_carwash_payload->>'variant', 'Regular'),
            COALESCE(p_carwash_payload->>'ukuran', 'Medium'),
            COALESCE(p_carwash_payload->>'paket', 'Cuci Biasa'),
            v_total_carwash,
            p_carwash_payload->>'anggota_1',
            p_carwash_payload->>'anggota_2',
            COALESCE(p_carwash_payload->>'shift', 'Pagi'),
            v_status_bayar,
            COALESCE((p_carwash_payload->>'gaji_anggota')::numeric, 0.00),
            p_carwash_payload->>'no_telepon',
            p_carwash_payload->>'catatan_kendaraan',
            NOW()
        );
    END IF;

    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        IF v_metode_bayar = 'SPLIT' THEN
            IF v_nominal_cash > 0.00 THEN
                INSERT INTO public.cashflow (
                    id, tenant_id, branch_id, id_sumber, tanggal,
                    keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                    pos, apakah_stok, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-CASH-' || v_id_struk, v_tanggal,
                    'Penjualan Kasir POS (Tunai Split): ' || v_id_struk || ' (' || v_customer || ')',
                    'Pemasukan', 'Pendapatan Kasir', v_nominal_cash, 0.00,
                    'SALDO CASH', FALSE, NOW()
                );
            END IF;

            IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
                INSERT INTO public.cashflow (
                    id, tenant_id, branch_id, id_sumber, tanggal,
                    keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                    pos, apakah_stok, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-DIGITAL-' || v_id_struk, v_tanggal,
                    'Penjualan Kasir POS (Digital Split): ' || v_id_struk || ' (' || v_customer || ')',
                    'Pemasukan', 'Pendapatan Kasir', (v_nominal_qris + v_nominal_transfer), 0.00,
                    'SALDO REKENING (N)', FALSE, NOW()
                );
            END IF;
        ELSE
            v_pos := CASE
                WHEN v_metode_bayar IN ('CASH', 'TUNAI') THEN 'SALDO CASH'
                ELSE 'SALDO REKENING (N)'
            END;

            INSERT INTO public.cashflow (
                id, tenant_id, branch_id, id_sumber, tanggal,
                keterangan_transaksi, jenis, kategori, pemasukan, pengeluaran,
                pos, apakah_stok, created_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, v_effective_branch_id, 'CF-POS-' || v_id_struk, v_tanggal,
                'Penjualan Kasir POS: ' || v_id_struk || ' (' || v_customer || ')',
                'Pemasukan', 'Pendapatan Kasir', v_total_tagihan, 0.00,
                v_pos, FALSE, NOW()
            );
        END IF;
    END IF;

    IF UPPER(TRIM(v_status_bayar)) IN ('SELESAI', 'PAID', 'LUNAS') AND v_total_tagihan > 0.00 THEN
        SELECT id INTO v_coa_kas FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1101' LIMIT 1;
        SELECT id INTO v_coa_bank FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1102' LIMIT 1;
        SELECT id INTO v_coa_inv FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '1103' LIMIT 1;
        SELECT id INTO v_coa_rev_cw FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4101' LIMIT 1;
        SELECT id INTO v_coa_rev_cafe FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '4102' LIMIT 1;
        SELECT id INTO v_coa_cogs FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun = '5101' LIMIT 1;
        SELECT id INTO v_coa_tax FROM public.chart_of_accounts WHERE tenant_id = p_tenant_id AND kode_akun IN ('2102', '2103', '2101') LIMIT 1;

        IF (v_nominal_cash > 0.00 OR (v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_kas IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun kas (1101) belum dikonfigurasi pada bagan akun (COA).' USING ERRCODE = '28000';
        END IF;
        IF ((v_nominal_qris + v_nominal_transfer) > 0.00 OR (NOT v_is_cash AND v_metode_bayar <> 'SPLIT')) AND v_coa_bank IS NULL THEN
            RAISE EXCEPTION 'ACCOUNT_MAPPING_MISSING: Akun bank (1102) belum dikonfigurasi pada bagan akun (COA) untuk pembayaran digital.' USING ERRCODE = '28000';
        END IF;

        IF (v_coa_rev_cw IS NOT NULL OR v_coa_rev_cafe IS NOT NULL) THEN
            v_journal_id := gen_random_uuid();

            INSERT INTO public.journal_entries (
                id, tenant_id, branch_id, entry_no, date, memo, total_amount, status, created_at
            ) VALUES (
                v_journal_id, p_tenant_id, v_effective_branch_id, 'JE-POS-' || v_id_struk, v_tanggal,
                'Auto-journal Penjualan POS: ' || v_id_struk, v_total_tagihan, 'DRAFT', NOW()
            );

            IF v_metode_bayar = 'SPLIT' THEN
                IF v_nominal_cash > 0.00 THEN
                    INSERT INTO public.journal_entry_lines (
                        id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
                        v_nominal_cash, 0.00, 'Penerimaan Tunai Split POS ' || v_id_struk, NOW()
                    );
                END IF;
                IF (v_nominal_qris + v_nominal_transfer) > 0.00 THEN
                    INSERT INTO public.journal_entry_lines (
                        id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                    ) VALUES (
                        gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                        (v_nominal_qris + v_nominal_transfer), 0.00, 'Penerimaan Digital Split POS ' || v_id_struk, NOW()
                    );
                END IF;
            ELSIF v_is_cash THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_kas,
                    v_total_tagihan, 0.00, 'Penerimaan Tunai POS ' || v_id_struk, NOW()
                );
            ELSE
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_bank,
                    v_total_tagihan, 0.00, 'Penerimaan Digital POS ' || v_id_struk, NOW()
                );
            END IF;

            v_net_cw := CASE WHEN v_subtotal_kotor > 0 THEN ROUND((v_total_tagihan - v_pajak) * (v_total_carwash / v_subtotal_kotor), 2) ELSE 0.00 END;
            v_net_cafe := GREATEST(0.00, (v_total_tagihan - v_pajak) - v_net_cw);

            IF v_net_cw > 0.00 AND v_coa_rev_cw IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cw,
                    0.00, v_net_cw, 'Pendapatan Layanan Carwash ' || v_id_struk, NOW()
                );
            END IF;

            IF v_net_cafe > 0.00 AND v_coa_rev_cafe IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_rev_cafe,
                    0.00, v_net_cafe, 'Pendapatan Cafe ' || v_id_struk, NOW()
                );
            END IF;

            IF v_pajak > 0.00 THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES (
                    gen_random_uuid(), p_tenant_id, v_journal_id, COALESCE(v_coa_tax, v_coa_rev_cafe, v_coa_rev_cw),
                    0.00, v_pajak, 'Pajak Penjualan POS ' || v_id_struk, NOW()
                );
            END IF;

            IF v_total_cogs > 0.00 AND v_coa_cogs IS NOT NULL AND v_coa_inv IS NOT NULL THEN
                INSERT INTO public.journal_entry_lines (
                    id, tenant_id, journal_entry_id, account_id, debit, credit, memo, created_at
                ) VALUES
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_cogs, v_total_cogs, 0.00, 'HPP Bahan Baku POS ' || v_id_struk, NOW()),
                    (gen_random_uuid(), p_tenant_id, v_journal_id, v_coa_inv, 0.00, v_total_cogs, 'Pengurangan Persediaan POS ' || v_id_struk, NOW());
            END IF;

            UPDATE public.journal_entries
            SET status = 'POSTED'
            WHERE id = v_journal_id AND tenant_id = p_tenant_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'COMPLETED',
        'id_struk', v_id_struk,
        'subtotal', v_subtotal_kotor,
        'diskon', v_diskon,
        'pajak', v_pajak,
        'total_tagihan', v_total_tagihan,
        'nominal_bayar', v_nominal_bayar,
        'uang_diterima', v_uang_diterima,
        'kembalian', v_kembalian,
        'total_cogs', v_total_cogs,
        'loyalty_redemption', v_redeem_res,
        'was_replayed', FALSE
    );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6. ALIGN LICENSE QUOTA TRIGGERS WITH 7-DAY GRACE PERIOD
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_tenant_branch_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_max_branches INT;
    v_current_count INT;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.is_active = FALSE) THEN
        RETURN NEW;
    END IF;

    PERFORM 1 FROM public.tenants WHERE id = NEW.tenant_id FOR UPDATE;

    SELECT COALESCE(max_branches, 1) INTO v_max_branches
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id
      AND status = 'ACTIVE'
      AND (valid_until + INTERVAL '7 days') > NOW()
    ORDER BY valid_until DESC
    LIMIT 1;

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

CREATE OR REPLACE FUNCTION public.fn_enforce_tenant_user_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_max_users INT;
    v_current_count INT;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.is_active = FALSE) THEN
        RETURN NEW;
    END IF;

    PERFORM 1 FROM public.tenants WHERE id = NEW.tenant_id FOR UPDATE;

    SELECT COALESCE(max_users, 3) INTO v_max_users
    FROM public.tenant_licenses
    WHERE tenant_id = NEW.tenant_id
      AND status = 'ACTIVE'
      AND (valid_until + INTERVAL '7 days') > NOW()
    ORDER BY valid_until DESC
    LIMIT 1;

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

-- ------------------------------------------------------------------------------
-- 7. BACKFILL MISSING POS BALANCES & STARTER RECIPES FOR EXISTING CLOUD TENANTS
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT t.id AS tenant_id, b.id AS branch_id, UPPER(COALESCE(t.business_type, 'HYBRID')) AS btype
        FROM public.tenants t
        JOIN public.branches b ON b.tenant_id = t.id AND COALESCE(b.is_active, TRUE) = TRUE
        WHERE COALESCE(UPPER(t.status), 'ACTIVE') <> 'ARCHIVED'
    LOOP
        INSERT INTO public.pos_balances (tenant_id, branch_id, pos, label, tipe, balance, color, is_active)
        VALUES
            (v_rec.tenant_id, v_rec.branch_id, 'SALDO CASH', 'Kas Tunai Laci Kasir', 'CASH', 0.00, 'emerald', TRUE),
            (v_rec.tenant_id, v_rec.branch_id, 'SALDO REKENING Y', 'Rekening QRIS & Transfer Utama', 'BANK', 0.00, 'blue', TRUE)
        ON CONFLICT (tenant_id, branch_id, pos) DO NOTHING;

        IF v_rec.btype IN ('HYBRID', 'CAFE') THEN
            INSERT INTO public.stok_barang (
                id, tenant_id, branch_id, id_barang, id_bahan_baku, nama_produk, nama_barang, satuan, stok, stok_akhir, harga_satuan, harga_beli, min_stok, gudang, kategori, is_active
            ) VALUES
                (gen_random_uuid(), v_rec.tenant_id, v_rec.branch_id, 'BB-KOPI', 'BB-KOPI', 'Biji Kopi House Blend', 'Biji Kopi House Blend', 'kg', 100.00, 100.00, 150000.00, 150000.00, 5.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), v_rec.tenant_id, v_rec.branch_id, 'BB-SUSU', 'BB-SUSU', 'Susu Segar UHT', 'Susu Segar UHT', 'liter', 100.00, 100.00, 22000.00, 22000.00, 10.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), v_rec.tenant_id, v_rec.branch_id, 'BB-ROTI', 'BB-ROTI', 'Roti Tawar Tebal', 'Roti Tawar Tebal', 'porsi', 100.00, 100.00, 5000.00, 5000.00, 10.00, 'CAFE', 'Bahan Baku', TRUE),
                (gen_random_uuid(), v_rec.tenant_id, v_rec.branch_id, 'BB-KENTANG', 'BB-KENTANG', 'Kentang Shoestring', 'Kentang Shoestring', 'kg', 50.00, 50.00, 32000.00, 32000.00, 5.00, 'CAFE', 'Bahan Baku', TRUE)
            ON CONFLICT (tenant_id, branch_id, nama_produk) DO NOTHING;

            -- Ensure existing starter Cafe menus without any recipe get starter recipe bindings
            INSERT INTO public.resep (
                id, tenant_id, id_menu, id_bahan_baku, daftar_menu, nama_menu, nama_bahan, nama_bahan_baku, jumlah, jumlah_dibutuhkan, jumlah_pemakaian, satuan
            )
            SELECT
                gen_random_uuid(),
                m.tenant_id,
                COALESCE(NULLIF(TRIM(m.id_menu), ''), m.daftar_menu),
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 'BB-ROTI'
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%kentang%' THEN 'BB-KENTANG'
                    ELSE 'BB-KOPI'
                END,
                m.daftar_menu,
                COALESCE(m.nama_menu, m.daftar_menu),
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 'Roti Tawar Tebal'
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%kentang%' THEN 'Kentang Shoestring'
                    ELSE 'Biji Kopi House Blend'
                END,
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 'Roti Tawar Tebal'
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%kentang%' THEN 'Kentang Shoestring'
                    ELSE 'Biji Kopi House Blend'
                END,
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 1.00
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%kentang%' THEN 0.20
                    ELSE 0.02
                END,
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 1.00
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%kentang%' THEN 0.20
                    ELSE 0.02
                END,
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 1.00
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%kentang%' THEN 0.20
                    ELSE 0.02
                END,
                CASE
                    WHEN LOWER(COALESCE(m.nama_menu, m.daftar_menu)) LIKE '%roti%' THEN 'porsi'
                    ELSE 'kg'
                END
            FROM public.daftar_harga_menu m
            WHERE m.tenant_id = v_rec.tenant_id
              AND LOWER(COALESCE(m.nama_menu, m.daftar_menu)) IN (
                  'kopi susu aren', 'americano dingin', 'roti bakar cokelat', 'roti toast cokelat', 'kentang goreng crispy'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM public.resep r
                  WHERE r.tenant_id = m.tenant_id
                    AND LOWER(TRIM(COALESCE(r.nama_menu, ''))) = LOWER(TRIM(COALESCE(m.nama_menu, m.daftar_menu)))
              )
            ON CONFLICT (tenant_id, id_menu, id_bahan_baku) DO NOTHING;
        END IF;
    END LOOP;
END $$;
