-- Create audit log table for security events (without partitioning for now)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Event metadata
    event_type TEXT NOT NULL,
    event_category TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Actor information
    actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system', 'anonymous')),
    actor_id UUID,
    actor_email TEXT,
    
    -- Request information
    ip_address INET,
    user_agent TEXT,
    request_id TEXT,
    request_method TEXT,
    request_path TEXT,
    
    -- Context
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    resource_type TEXT,
    resource_id UUID,
    
    -- Event details
    action TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'error')),
    error_code TEXT,
    error_message TEXT,
    
    -- Additional data
    metadata JSONB,
    
    -- Indexes for performance
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity) WHERE severity IN ('high', 'critical');
CREATE INDEX IF NOT EXISTS idx_audit_logs_result ON audit_logs(result) WHERE result = 'failure';

-- RLS policies for audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can insert audit logs
CREATE POLICY "Service role can insert audit logs" ON audit_logs
    FOR INSERT TO service_role
    WITH CHECK (true);

-- Users can view their own audit logs and company-wide logs if admin
CREATE POLICY "Users can view relevant audit logs" ON audit_logs
    FOR SELECT TO authenticated
    USING (
        -- User's own actions
        (actor_type = 'user' AND actor_id = auth.uid())
        OR
        -- Company admin can see all company logs
        EXISTS (
            SELECT 1 FROM company_members cm
            WHERE cm.user_id = auth.uid()
            AND cm.company_id = audit_logs.company_id
            AND cm.role IN ('admin', 'owner')
        )
        OR
        -- Project admin can see project logs
        EXISTS (
            SELECT 1 FROM project_members pm
            WHERE pm.user_id = auth.uid()
            AND pm.project_id = audit_logs.project_id
            AND pm.role IN ('admin', 'owner')
        )
    );

-- No one can update or delete audit logs (append-only)
CREATE POLICY "No one can update audit logs" ON audit_logs
    FOR UPDATE TO authenticated, anon, service_role
    USING (false);

CREATE POLICY "No one can delete audit logs" ON audit_logs
    FOR DELETE TO authenticated, anon, service_role
    USING (false);

-- Create function to log audit events
CREATE OR REPLACE FUNCTION log_audit_event(
    p_event_type TEXT,
    p_event_category TEXT,
    p_severity TEXT,
    p_actor_type TEXT,
    p_actor_id UUID,
    p_action TEXT,
    p_result TEXT,
    p_metadata JSONB DEFAULT NULL,
    p_company_id UUID DEFAULT NULL,
    p_project_id UUID DEFAULT NULL,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL,
    p_request_method TEXT DEFAULT NULL,
    p_request_path TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO audit_logs (
        event_type,
        event_category,
        severity,
        actor_type,
        actor_id,
        action,
        result,
        metadata,
        company_id,
        project_id,
        resource_type,
        resource_id,
        error_code,
        error_message,
        ip_address,
        user_agent,
        request_id,
        request_method,
        request_path
    ) VALUES (
        p_event_type,
        p_event_category,
        p_severity,
        p_actor_type,
        p_actor_id,
        p_action,
        p_result,
        p_metadata,
        p_company_id,
        p_project_id,
        p_resource_type,
        p_resource_id,
        p_error_code,
        p_error_message,
        p_ip_address,
        p_user_agent,
        p_request_id,
        p_request_method,
        p_request_path
    ) RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create views for common audit queries
CREATE OR REPLACE VIEW recent_security_events AS
SELECT 
    id,
    event_type,
    severity,
    timestamp,
    actor_type,
    actor_id,
    action,
    result,
    error_message,
    ip_address
FROM audit_logs
WHERE 
    event_category = 'security'
    AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

CREATE OR REPLACE VIEW failed_auth_attempts AS
SELECT 
    timestamp,
    actor_type,
    actor_email,
    ip_address,
    user_agent,
    error_message
FROM audit_logs
WHERE 
    event_type = 'authentication'
    AND result = 'failure'
    AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;