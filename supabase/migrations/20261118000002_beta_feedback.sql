-- ==============================================================================
-- MIGRATION: 20261118000002_beta_feedback.sql
-- TUJUAN:
--   Menyediakan tabel penerima masukan pengguna beta (rating bintang 1-5 + pesan)
--   dengan isolasi RLS ketat: pengguna hanya bisa mengirim untuk dirinya sendiri,
--   dan hanya pengirim atau Super Admin yang dapat membaca/mengelola statusnya.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.beta_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id UUID NOT NULL DEFAULT auth.uid(),
    user_name TEXT,
    user_role TEXT,
    category TEXT NOT NULL DEFAULT 'FEATURE' CHECK (category IN ('BUG', 'FEATURE', 'UX', 'OTHER')),
    rating SMALLINT CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    page_path TEXT,
    message TEXT NOT NULL CHECK (char_length(btrim(message)) >= 5),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_status_created
    ON public.beta_feedback (status, created_at DESC);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.beta_feedback FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.beta_feedback TO authenticated, service_role;

DROP POLICY IF EXISTS beta_feedback_insert_policy ON public.beta_feedback;
CREATE POLICY beta_feedback_insert_policy ON public.beta_feedback
FOR INSERT TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND (
        tenant_id IS NULL
        OR tenant_id = public.current_tenant_id()
        OR EXISTS (
            SELECT 1 FROM public.tenant_memberships m
            WHERE m.tenant_id = beta_feedback.tenant_id AND m.user_id = auth.uid()
        )
    )
);

DROP POLICY IF EXISTS beta_feedback_select_policy ON public.beta_feedback;
CREATE POLICY beta_feedback_select_policy ON public.beta_feedback
FOR SELECT TO authenticated
USING (
    public.current_user_role() = 'Super Admin'
    OR user_id = auth.uid()
);

DROP POLICY IF EXISTS beta_feedback_update_policy ON public.beta_feedback;
CREATE POLICY beta_feedback_update_policy ON public.beta_feedback
FOR UPDATE TO authenticated
USING (public.current_user_role() = 'Super Admin')
WITH CHECK (public.current_user_role() = 'Super Admin');
