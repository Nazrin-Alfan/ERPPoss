-- Isolated PostgreSQL test fixture, never apply to a hosted database.
-- Tests execute the real checkout function against a deliberately minimal schema.
DO $$ BEGIN IF current_database() NOT LIKE 'erpposs_qa_%' THEN RAISE EXCEPTION 'Use a disposable erpposs_qa_* database only'; END IF; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
CREATE TABLE public.tenants(id uuid PRIMARY KEY);
CREATE TABLE public.branches(id uuid PRIMARY KEY, tenant_id uuid, is_active boolean DEFAULT true);
CREATE TABLE public.profiles(id uuid PRIMARY KEY, tenant_id uuid, branch_id uuid, role text, is_active boolean);
CREATE TABLE public.struk(
 id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,id_struk text,tanggal date,jam time,kasir text,
 nama_pelanggan text,catatan text,status_bayar text,status_pembayaran text,subtotal numeric,diskon numeric,
 diskon_cafe numeric,diskon_carwash numeric,pajak numeric,nominal_bayar numeric,bayar numeric,kembalian numeric,
 metode_bayar text,metode_pembayaran text,total_tagihan numeric,total numeric,payload_hash text,
 created_at timestamptz,waktu_dibuat timestamptz,updated_at timestamptz,
 UNIQUE(tenant_id,id_struk)
);
CREATE TABLE public.daftar_harga_menu(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,nama_menu text,daftar_menu text,harga numeric,updated_at timestamptz);
CREATE TABLE public.carwash_packages(id uuid,tenant_id uuid,nama_paket text,name text,price numeric,tarif numeric);
CREATE TABLE public.resep(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,nama_menu text,nama_bahan text,jumlah_dibutuhkan numeric,jumlah numeric,satuan text);
CREATE TABLE public.stok_barang(id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,nama_produk text,nama_barang text,stok numeric,stok_akhir numeric,harga_beli numeric,harga_satuan numeric,updated_at timestamptz);
CREATE TABLE public.barang_keluar(id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,id_barang text,id_bahan_baku uuid,nama_barang text,nama_produk text,nama_bahan_baku text,jumlah_keluar numeric,tanggal date,keterangan text,alasan text,created_at timestamptz);
CREATE TABLE public.cafe(id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,id_struk text,tanggal date,jam time,nama_menu text,qty numeric,harga_satuan numeric,subtotal numeric,status text,catatan text,created_at timestamptz);
CREATE TABLE public.carwash(id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,id_struk text,tanggal date,jam time,plat text,model text,variant text,ukuran text,paket text,harga numeric,anggota_1 text,anggota_2 text,shift text,status text,gaji_anggota numeric,no_telepon text,keterangan text,created_at timestamptz);
CREATE TABLE public.cashflow(id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,id_sumber text,tanggal date,keterangan_transaksi text,jenis text,kategori text,pemasukan numeric,pengeluaran numeric,pos text,apakah_stok boolean,created_at timestamptz);
CREATE TABLE public.chart_of_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,kode_akun text);
CREATE TABLE public.journal_entries(id uuid PRIMARY KEY,tenant_id uuid,branch_id uuid,entry_no text,date date,memo text,total_amount numeric,status text,created_at timestamptz);
CREATE TABLE public.journal_entry_lines(id uuid PRIMARY KEY,tenant_id uuid,journal_entry_id uuid,account_id uuid,debit numeric,credit numeric,memo text,created_at timestamptz);
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

INSERT INTO tenants VALUES ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
INSERT INTO branches(id,tenant_id) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222'),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111'),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222');
INSERT INTO profiles VALUES
 ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Owner',true),
 ('00000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Owner',true),
 ('00000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Kasir',true),
 ('00000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Owner',false),
 ('00000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Accountant',true),
 ('00000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Admin',true);
INSERT INTO daftar_harga_menu(tenant_id,nama_menu,harga) SELECT id,'QA Coffee',18000 FROM tenants;
INSERT INTO stok_barang SELECT gen_random_uuid(),id,NULL,'QA Beans','QA Beans',100,100,50000,50000,NULL FROM tenants;
INSERT INTO resep(tenant_id,nama_menu,nama_bahan,jumlah_dibutuhkan,satuan) SELECT id,'QA Coffee','QA Beans',0.02,'kg' FROM tenants;
INSERT INTO chart_of_accounts(tenant_id,kode_akun) SELECT t.id,c FROM tenants t CROSS JOIN unnest(ARRAY['1101','1102','1103','4101','4102','5101']) c;
