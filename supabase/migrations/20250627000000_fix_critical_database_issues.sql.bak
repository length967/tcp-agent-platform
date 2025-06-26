-- Fix Critical Database Issues
-- This migration addresses missing tables, functions, and constraints

-- 1. Create ml_predictions table
CREATE TABLE IF NOT EXISTS ml_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    prediction_type TEXT NOT NULL, -- 'transfer_time', 'success_rate', 'optimal_chunk_size', etc.
    prediction_value JSONB NOT NULL,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    input_features JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for ml_predictions
CREATE INDEX idx_ml_predictions_transfer_id ON ml_predictions(transfer_id);
CREATE INDEX idx_ml_predictions_agent_id ON ml_predictions(agent_id);
CREATE INDEX idx_ml_predictions_created_at ON ml_predictions(created_at);
CREATE INDEX idx_ml_predictions_model_name ON ml_predictions(model_name);

-- 2. Update accept_invitation RPC function to match the call signature
-- Note: The function already exists with different parameters, so we'll drop and recreate
DROP FUNCTION IF EXISTS accept_invitation(TEXT, UUID);
DROP FUNCTION IF EXISTS accept_invitation(UUID);

CREATE OR REPLACE FUNCTION accept_invitation(invitation_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation invitations%ROWTYPE;
    v_user_id UUID;
    v_company_id UUID;
    v_project_id UUID;
    v_result JSONB;
BEGIN
    -- Get the current user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Find and validate the invitation
    SELECT * INTO v_invitation
    FROM invitations
    WHERE token = invitation_token
        AND status = 'pending'
        AND expires_at > NOW()
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invitation';
    END IF;

    -- Start transaction
    BEGIN
        -- Update invitation status
        UPDATE invitations
        SET 
            status = 'accepted',
            accepted_at = NOW()
        WHERE id = v_invitation.id;

        -- Get company and project IDs
        v_company_id := v_invitation.company_id;
        v_project_id := v_invitation.project_id;

        -- Add user to company if not already a member
        INSERT INTO company_members (company_id, user_id, role, is_active)
        VALUES (v_company_id, v_user_id, v_invitation.role, true)
        ON CONFLICT (company_id, user_id) 
        DO UPDATE SET 
            role = EXCLUDED.role,
            is_active = true,
            updated_at = NOW();

        -- Add user to project if specified
        IF v_project_id IS NOT NULL THEN
            INSERT INTO project_members (project_id, user_id, role)
            VALUES (v_project_id, v_user_id, v_invitation.role)
            ON CONFLICT (project_id, user_id) 
            DO UPDATE SET 
                role = EXCLUDED.role,
                updated_at = NOW();
        END IF;

        -- Update user's last seen activity
        UPDATE user_profiles
        SET 
            updated_at = NOW()
        WHERE id = v_user_id;

        -- Prepare result
        v_result := jsonb_build_object(
            'success', true,
            'company_id', v_company_id,
            'project_id', v_project_id,
            'role', v_invitation.role
        );

        RETURN v_result;

    EXCEPTION
        WHEN OTHERS THEN
            -- Rollback is automatic in plpgsql functions
            RAISE;
    END;
END;
$$;

-- 3. Create get_user_session_timeout RPC function
CREATE OR REPLACE FUNCTION get_user_session_timeout(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_timeout INTEGER;
    v_company_timeout INTEGER;
    v_company_enforced BOOLEAN;
    v_result INTEGER;
BEGIN
    -- Get user's personal session timeout preference
    SELECT session_timeout_minutes INTO v_user_timeout
    FROM user_profiles
    WHERE id = user_id;

    -- Get company's session timeout if user belongs to a company
    SELECT 
        c.session_timeout_minutes,
        c.enforce_session_timeout
    INTO 
        v_company_timeout,
        v_company_enforced
    FROM companies c
    INNER JOIN company_members cm ON cm.company_id = c.id
    WHERE cm.user_id = user_id
        AND cm.is_active = true
    ORDER BY c.created_at DESC
    LIMIT 1;

    -- Determine effective timeout
    IF v_company_enforced AND v_company_timeout IS NOT NULL THEN
        -- Company enforces timeout
        v_result := v_company_timeout;
    ELSIF v_user_timeout IS NOT NULL THEN
        -- User has personal preference
        v_result := v_user_timeout;
    ELSIF v_company_timeout IS NOT NULL THEN
        -- Use company default (not enforced)
        v_result := v_company_timeout;
    ELSE
        -- System default: 30 minutes
        v_result := 30;
    END IF;

    RETURN v_result;
END;
$$;

-- 4. Add missing foreign key constraints to ML telemetry tables
-- First, let's add the missing constraints to ml_telemetry table
ALTER TABLE ml_telemetry 
    DROP CONSTRAINT IF EXISTS ml_telemetry_transfer_id_fkey,
    DROP CONSTRAINT IF EXISTS ml_telemetry_agent_id_fkey;

ALTER TABLE ml_telemetry 
    ADD CONSTRAINT ml_telemetry_transfer_id_fkey 
    FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE;

ALTER TABLE ml_telemetry 
    ADD CONSTRAINT ml_telemetry_agent_id_fkey 
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- Add constraints to hourly_performance_metrics
ALTER TABLE hourly_performance_metrics 
    DROP CONSTRAINT IF EXISTS hourly_performance_metrics_agent_id_fkey;

ALTER TABLE hourly_performance_metrics 
    ADD CONSTRAINT hourly_performance_metrics_agent_id_fkey 
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;

-- Note: ml_model_performance and ml_model_drift tables don't have agent_id columns
-- They track model performance globally, not per-agent

-- 5. Grant necessary permissions
GRANT SELECT ON ml_predictions TO authenticated;
GRANT INSERT ON ml_predictions TO authenticated;
GRANT UPDATE ON ml_predictions TO authenticated;
GRANT DELETE ON ml_predictions TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION accept_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_session_timeout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_session_timeout(UUID) TO anon;

-- 6. Create RLS policies for ml_predictions
ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view predictions for transfers in their projects
CREATE POLICY "Users can view predictions for their project transfers"
    ON ml_predictions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM transfers t
            JOIN project_members pm ON pm.project_id = t.project_id
            WHERE t.id = ml_predictions.transfer_id
                AND pm.user_id = auth.uid()
        )
    );

-- Policy: Service role can insert predictions
CREATE POLICY "Service role can insert predictions"
    ON ml_predictions FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Policy: Service role can update predictions
CREATE POLICY "Service role can update predictions"
    ON ml_predictions FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE ml_predictions IS 'Stores ML model predictions for transfers';
COMMENT ON FUNCTION accept_invitation(UUID) IS 'Accepts a pending invitation and adds user to company/project';
COMMENT ON FUNCTION get_user_session_timeout(UUID) IS 'Returns effective session timeout for a user considering company policies';