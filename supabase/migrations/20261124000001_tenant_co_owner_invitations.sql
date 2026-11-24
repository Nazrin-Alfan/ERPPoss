-- ==============================================================================
-- MIGRATION: Tenant Co-Owner Gmail Invitations (SaaS Best Practice Flow)
-- ==============================================================================
-- Enables Owners to invite Co-Owners by Gmail without creating a password.
-- When the invited user signs in with Google, pending invitations are claimed
-- atomically into tenant_memberships (and profiles for brand-new users) without
-- polluting operational staff tables (karyawan_kantor).

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Owner' CHECK (role IN ('Owner')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active pending invitations for the same Gmail in the same tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invitations_pending_unique
  ON public.tenant_invitations (tenant_id, lower(email))
  WHERE status = 'pending';

-- Fast lookup when a user logs in with Google
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_pending_email
  ON public.tenant_invitations (lower(email))
  WHERE status = 'pending';

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_invitations_select_owner" ON public.tenant_invitations;
CREATE POLICY "tenant_invitations_select_owner"
  ON public.tenant_invitations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active IS TRUE
        AND (
          p.role = 'Super Admin'
          OR (p.role = 'Owner' AND p.tenant_id = tenant_invitations.tenant_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = tenant_invitations.tenant_id
        AND tm.role = 'Owner'
    )
  );

DROP POLICY IF EXISTS "tenant_invitations_insert_owner" ON public.tenant_invitations;
CREATE POLICY "tenant_invitations_insert_owner"
  ON public.tenant_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    invited_by = (SELECT auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.is_active IS TRUE
          AND (
            p.role = 'Super Admin'
            OR (p.role = 'Owner' AND p.tenant_id = tenant_invitations.tenant_id)
          )
      )
      OR EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.user_id = (SELECT auth.uid())
          AND tm.tenant_id = tenant_invitations.tenant_id
          AND tm.role = 'Owner'
      )
    )
  );

DROP POLICY IF EXISTS "tenant_invitations_update_owner" ON public.tenant_invitations;
CREATE POLICY "tenant_invitations_update_owner"
  ON public.tenant_invitations
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active IS TRUE
        AND (
          p.role = 'Super Admin'
          OR (p.role = 'Owner' AND p.tenant_id = tenant_invitations.tenant_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.tenant_memberships tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = tenant_invitations.tenant_id
        AND tm.role = 'Owner'
    )
  )
  WITH CHECK (status IN ('pending', 'revoked'));

-- Atomically claim all valid pending Co-Owner invitations for the current authenticated user
CREATE OR REPLACE FUNCTION public.fn_claim_pending_co_owner_invitations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_user_email TEXT;
  v_user_meta JSONB;
  v_name TEXT;
  v_has_profile BOOLEAN := FALSE;
  v_inv RECORD;
  v_branch_id UUID;
  v_claimed_count INT := 0;
  v_primary_tenant_id UUID := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('claimed_count', 0, 'primary_tenant_id', NULL);
  END IF;

  SELECT email, raw_user_meta_data
  INTO v_user_email, v_user_meta
  FROM auth.users
  WHERE id = v_uid
  LIMIT 1;

  IF v_user_email IS NULL OR btrim(v_user_email) = '' THEN
    RETURN jsonb_build_object('claimed_count', 0, 'primary_tenant_id', NULL);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_uid
  ) INTO v_has_profile;

  v_name := COALESCE(
    NULLIF(btrim(v_user_meta->>'nama'), ''),
    NULLIF(btrim(v_user_meta->>'full_name'), ''),
    split_part(v_user_email, '@', 1)
  );

  FOR v_inv IN
    SELECT id, tenant_id, role
    FROM public.tenant_invitations
    WHERE lower(email) = lower(btrim(v_user_email))
      AND status = 'pending'
      AND expires_at > NOW()
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE tenant_id = v_inv.tenant_id
    ORDER BY is_main DESC, created_at ASC
    LIMIT 1;

    INSERT INTO public.tenant_memberships (user_id, tenant_id, branch_id, role, is_default)
    VALUES (v_uid, v_inv.tenant_id, v_branch_id, v_inv.role, NOT v_has_profile AND v_claimed_count = 0)
    ON CONFLICT (user_id, tenant_id) DO UPDATE SET
      role = CASE
        WHEN public.tenant_memberships.role = 'Super Admin' THEN 'Super Admin'
        ELSE EXCLUDED.role
      END;

    IF NOT v_has_profile THEN
      INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
      VALUES (v_uid, v_inv.tenant_id, v_branch_id, v_name, v_user_email, v_inv.role, TRUE)
      ON CONFLICT (id) DO NOTHING;
      v_has_profile := TRUE;
    END IF;

    UPDATE public.tenant_invitations
    SET status = 'accepted',
        accepted_by = v_uid,
        accepted_at = NOW()
    WHERE id = v_inv.id;

    IF v_primary_tenant_id IS NULL THEN
      v_primary_tenant_id := v_inv.tenant_id;
    END IF;
    v_claimed_count := v_claimed_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'claimed_count', v_claimed_count,
    'primary_tenant_id', v_primary_tenant_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_claim_pending_co_owner_invitations() TO authenticated;

-- Update Google OAuth onboarding/login RPC so invited Co-Owners auto-claim without registering a new store
CREATE OR REPLACE FUNCTION public.fn_complete_google_oauth_flow(
  p_mode text,
  p_tenant_name text DEFAULT NULL::text,
  p_business_type text DEFAULT 'HYBRID'::text,
  p_owner_name text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_existing_profile RECORD;
    v_claim JSONB;
    v_user_email TEXT;
    v_user_meta JSONB;
    v_name TEXT;
    v_tenant_name TEXT;
    v_business_type TEXT;
    v_tenant_id UUID := gen_random_uuid();
    v_branch_id UUID := gen_random_uuid();
    v_clean_slug TEXT;
    v_trial_key TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi tidak ditemukan.';
    END IF;

    SELECT id, tenant_id, role, is_active INTO v_existing_profile
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;

    IF FOUND THEN
        IF v_existing_profile.is_active IS FALSE THEN
            RETURN jsonb_build_object(
                'status', 'INACTIVE',
                'message', 'ACCOUNT_INACTIVE: Akun staf ini telah dinonaktifkan oleh Owner.'
            );
        END IF;
        PERFORM public.fn_claim_pending_co_owner_invitations();
        RETURN jsonb_build_object(
            'status', 'EXISTING_USER',
            'tenant_id', v_existing_profile.tenant_id,
            'role', v_existing_profile.role
        );
    END IF;

    -- Auto-claim pending Co-Owner Gmail invitation before rejecting as UNREGISTERED
    v_claim := public.fn_claim_pending_co_owner_invitations();
    IF COALESCE((v_claim->>'claimed_count')::int, 0) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'EXISTING_USER',
            'tenant_id', (v_claim->>'primary_tenant_id')::uuid,
            'role', 'Owner'
        );
    END IF;

    IF LOWER(COALESCE(btrim(p_mode), 'login')) <> 'register' THEN
        BEGIN
            DELETE FROM auth.identities WHERE user_id = v_uid;
            DELETE FROM auth.users WHERE id = v_uid;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;

        RETURN jsonb_build_object(
            'status', 'UNREGISTERED',
            'message', 'email belum memiliki tenant, silahkan klik DAFTAR untuk memulai'
        );
    END IF;

    SELECT email, raw_user_meta_data INTO v_user_email, v_user_meta
    FROM auth.users
    WHERE id = v_uid
    LIMIT 1;

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND';
    END IF;

    v_name := COALESCE(
        NULLIF(btrim(p_owner_name), ''),
        NULLIF(btrim(v_user_meta->>'nama'), ''),
        NULLIF(btrim(v_user_meta->>'full_name'), ''),
        split_part(v_user_email, '@', 1)
    );

    v_tenant_name := COALESCE(
        NULLIF(btrim(p_tenant_name), ''),
        v_name || '''s Store'
    );

    v_business_type := UPPER(COALESCE(NULLIF(btrim(p_business_type), ''), 'HYBRID'));
    IF v_business_type NOT IN ('HYBRID', 'CAFE', 'CARWASH') THEN
        v_business_type := 'HYBRID';
    END IF;

    v_clean_slug := lower(regexp_replace(v_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);
    v_trial_key := 'RLPOS-TRL-' || upper(substr(md5(random()::text), 1, 8));

    INSERT INTO public.tenants (id, nama, slug, plan, status, business_type, onboarding_completed)
    VALUES (v_tenant_id, v_tenant_name, v_clean_slug, 'trial', 'active', v_business_type, FALSE);

    INSERT INTO public.branches (id, tenant_id, nama, kode, alamat, is_main, is_active)
    VALUES (v_branch_id, v_tenant_id, 'Cabang Utama', 'MAIN', 'Pusat Operasional', TRUE, TRUE);

    PERFORM public.fn_initialize_tenant_defaults(v_tenant_id, v_branch_id);

    INSERT INTO public.tenant_licenses (
        tenant_id, license_key, plan, status, valid_until, max_branches, max_users, features
    ) VALUES (
        v_tenant_id, v_trial_key, 'trial', 'ACTIVE', NOW() + INTERVAL '30 days', 1, 10,
        jsonb_build_object('trial', true, 'trial_days', 30, 'auto_generated', true)
    ) ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, tenant_id, branch_id, nama, email, role, is_active)
    VALUES (v_uid, v_tenant_id, v_branch_id, v_name, v_user_email, 'Owner', TRUE)
    ON CONFLICT (id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        nama = EXCLUDED.nama,
        role = 'Owner',
        is_active = TRUE,
        updated_at = NOW()
    WHERE public.profiles.role <> 'Super Admin';

    RETURN jsonb_build_object(
        'status', 'REGISTERED_NEW_TENANT',
        'tenant_id', v_tenant_id
    );
END;
$function$;
