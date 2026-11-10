import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createLocalClient,
  setActiveActorContext,
  resetActiveActorContext,
} from '../localDbEngine.js';

const MIGRATION_0004_PATH = path.resolve(
  process.cwd(),
  'supabase/migrations/20261107000004_qa_hardening_profile_role_and_secdef_lockdown.sql'
);

describe('Tahap 2 & 3 QA Suite — Database Hardening, Security & API Schema Contracts', () => {
  describe('Tahap 2: Migration 20261107000004 Security & Database Integrity Contract', () => {
    const sql = fs.readFileSync(MIGRATION_0004_PATH, 'utf8');

    it('enforces canonical role CHECK constraint on public.profiles', () => {
      expect(sql).toContain('ADD CONSTRAINT chk_profiles_canonical_role');
      expect(sql).toContain(
        "CHECK (role IN ('Super Admin', 'Owner', 'Admin', 'Kasir', 'Staff Kantor', 'Karyawan Cuci'))"
      );
    });

    it('normalizes legacy lowercase roles in current_user_role() to prevent RLS/trigger bypass', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.current_user_role()');
      expect(sql).toContain("WHEN 'kasir'         THEN 'Kasir'");
      expect(sql).toContain("WHEN 'owner'         THEN 'Owner'");
      expect(sql).toContain("WHEN 'superadmin'    THEN 'Super Admin'");
    });

    it('uses fail-closed whitelist in fn_protect_profile_role_and_tenant() on INSERT and UPDATE', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.fn_protect_profile_role_and_tenant()');
      const matches = sql.match(/IF v_caller_role NOT IN \('Super Admin', 'Owner', 'Admin'\) THEN/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('revokes PUBLIC and anon EXECUTE on all SECURITY DEFINER functions and sets search_path', () => {
      expect(sql).toContain('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon;');
      expect(sql).toContain('ALTER FUNCTION %s SET search_path = public, pg_temp;');
      expect(sql).toContain('CREATE POLICY license_keys_superadmin_policy ON public.license_keys');
    });
  });

  describe('Tahap 3A: API & RPC Schema-as-Contract Validation (api-testing)', () => {
    const TENANT_A = '11111111-1111-1111-1111-111111111111';
    const BRANCH_A1 = 'aaaaaaaa-1111-1111-1111-111111111111';
    let db;

    beforeEach(() => {
      db = createLocalClient();
      db.erp.resetDatabase();
      resetActiveActorContext();
    });

    it('validates fn_get_pos_inventory_stock response contract excludes HPP/harga_beli for Kasir', async () => {
      await db.from('stok_barang').insert({
        id: 'bbbbbbbb-1111-1111-1111-111111111111',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        id_barang: 'BRG-QA-01',
        nama_barang: 'Kopi Susu Botol',
        stok: 25,
        harga_jual: 18000,
        harga_beli: 9500,
      });

      setActiveActorContext({
        user_id: 'cccccccc-1111-1111-1111-111111111111',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        role: 'Kasir',
        is_active: true,
      });

      const { data, error } = await db.rpc('fn_get_pos_inventory_stock', {
        p_branch_id: BRANCH_A1,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      const row = data.find((r) => r.id_barang === 'BRG-QA-01') || data[0];
      expect(row).not.toHaveProperty('harga_beli');
      expect(row).not.toHaveProperty('hpp');
      expect(typeof row.id).toBe('string');
      expect(Number(row.stok)).toBe(25);
    });

    it('validates fn_get_active_carwash_crew response schema contract excludes payroll fields', async () => {
      await db.from('karyawan_cuci').insert({
        id: 'dddddddd-1111-1111-1111-111111111111',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        nama: 'Andi Crew',
        is_active: true,
        gaji_pokok: 2500000,
        kasbon: 100000,
      });

      setActiveActorContext({
        user_id: 'cccccccc-1111-1111-1111-111111111111',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        role: 'Kasir',
        is_active: true,
      });

      const { data, error } = await db.rpc('fn_get_active_carwash_crew', {
        p_branch_id: BRANCH_A1,
      });
      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      for (const crew of data) {
        expect(Object.keys(crew).sort()).toEqual(['branch_id', 'id', 'is_active', 'nama', 'tenant_id']);
        expect(crew).not.toHaveProperty('gaji_pokok');
        expect(crew).not.toHaveProperty('kasbon');
      }
    });

    it('validates redeem_customer_reward canonical 8-parameter contract rejects cross-tenant actor', async () => {
      setActiveActorContext({
        user_id: 'cccccccc-1111-1111-1111-111111111111',
        tenant_id: TENANT_A,
        branch_id: BRANCH_A1,
        role: 'Kasir',
        is_active: true,
      });

      await expect(
        db.rpc('redeem_customer_reward', {
          p_tenant_id: '99999999-9999-4999-9999-999999999999',
          p_plat: 'BK 1234 XY',
          p_reward_title: 'Free Carwash',
          p_notes: 'QA Test',
          p_nama_pelanggan: 'Budi',
          p_reward_type: 'CARWASH',
          p_id_struk: 'STRUK-QA-01',
          p_request_key: 'REQ-QA-01',
        })
      ).rejects.toThrow(/FORBIDDEN_CROSS_TENANT_REDEEM/);
    });
  });
});
