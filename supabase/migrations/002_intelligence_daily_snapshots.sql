-- ==============================================================================
-- RELAYPOS CLOUD ARCHITECTURE: INTELLIGENCE LAYER SNAPSHOTS DDL
-- Migration: 002_intelligence_daily_snapshots.sql
-- ==============================================================================

CREATE TABLE IF NOT EXISTS intelligence_daily_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    business_type VARCHAR(50) NOT NULL DEFAULT 'HYBRID', -- 'HYBRID', 'CARWASH', 'CAFE'
    financial_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    cashier_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    operational_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    synergy_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    inventory_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    external_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
    anomalies JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_intelligence_tenant_branch_date UNIQUE (tenant_id, branch_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_intelligence_snapshots_tenant_date 
ON intelligence_daily_snapshots(tenant_id, snapshot_date DESC);

-- Enable RLS for Multi-Tenant Isolation
ALTER TABLE intelligence_daily_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_intelligence_select ON intelligence_daily_snapshots
FOR SELECT
USING (
    tenant_id = current_tenant_id()
    AND (
        current_user_role() IN ('Owner', 'Super Admin')
        OR branch_id = current_branch_id()
        OR branch_id IS NULL
    )
);

CREATE POLICY rls_intelligence_insert ON intelligence_daily_snapshots
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id()
);
