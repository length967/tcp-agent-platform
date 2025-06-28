-- Enhanced Audit Logging Infrastructure
-- Supplements existing audit_logs table with comprehensive change tracking
-- Based on best practices from GEMINI.md and Supabase audit patterns

-- Create audit schema to separate audit tables
CREATE SCHEMA IF NOT EXISTS audit;

-- Grant usage to authenticated users (for reading audit logs)
GRANT USAGE ON SCHEMA audit TO authenticated;

-- Create the change tracking table (supplements existing audit_logs)
CREATE TABLE IF NOT EXISTS audit.record_changes (
  id BIGSERIAL PRIMARY KEY,
  -- Core fields
  table_name TEXT NOT NULL,
  record_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  -- User and context
  user_id UUID,
  company_id UUID,
  project_id UUID,
  -- Change tracking
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  -- Request metadata (from session)
  ip_address INET,
  user_agent TEXT,
  request_id UUID DEFAULT gen_random_uuid(),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
-- BRIN index for time-based queries (extremely efficient for append-only tables)
CREATE INDEX idx_audit_record_changes_created_at_brin 
ON audit.record_changes USING BRIN(created_at);

-- Composite index for filtering by company
CREATE INDEX idx_audit_record_changes_company_lookup 
ON audit.record_changes(company_id, created_at DESC) 
WHERE company_id IS NOT NULL;

-- Index for user activity tracking
CREATE INDEX idx_audit_record_changes_user_lookup 
ON audit.record_changes(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

-- Index for record-specific history
CREATE INDEX idx_audit_record_changes_record_lookup 
ON audit.record_changes(table_name, record_id, created_at DESC) 
WHERE record_id IS NOT NULL;

-- Enable RLS on audit record changes
ALTER TABLE audit.record_changes ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only view audit logs for their companies
CREATE POLICY "Users can view their company audit changes"
  ON audit.record_changes FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids())
    OR
    user_id = (SELECT auth.uid()) -- Users can see their own actions
  );

-- Create function to log changes (called by triggers)
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_changed_fields TEXT[];
  v_user_id UUID;
  v_company_id UUID;
BEGIN
  -- Get current user and company from session
  v_user_id := COALESCE(
    current_setting('app.current_user_id', true)::UUID,
    auth.uid()
  );
  
  v_company_id := current_setting('app.current_company_id', true)::UUID;
  
  -- Prepare old and new values
  IF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  ELSE -- UPDATE
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    
    -- Calculate changed fields
    SELECT array_agg(key) INTO v_changed_fields
    FROM jsonb_each(v_old_values)
    WHERE v_old_values->key IS DISTINCT FROM v_new_values->key;
  END IF;
  
  -- Insert audit log
  INSERT INTO audit.record_changes (
    table_name,
    record_id,
    operation,
    user_id,
    company_id,
    old_values,
    new_values,
    changed_fields,
    ip_address,
    user_agent
  ) VALUES (
    TG_TABLE_NAME,
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    TG_OP,
    v_user_id,
    v_company_id,
    v_old_values,
    v_new_values,
    v_changed_fields,
    current_setting('app.current_ip', true)::INET,
    current_setting('app.current_user_agent', true)
  );
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for custom audit logging (for non-CRUD operations)
-- This logs to the existing audit_logs table for security events
CREATE OR REPLACE FUNCTION audit.log_security_event(
  p_event_type TEXT,
  p_action TEXT,
  p_result TEXT DEFAULT 'success',
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_log_id UUID;
BEGIN
  v_user_id := COALESCE(
    current_setting('app.current_user_id', true)::UUID,
    auth.uid()
  );
  
  INSERT INTO audit_logs (
    event_type,
    event_category,
    severity,
    actor_type,
    actor_id,
    ip_address,
    user_agent,
    company_id,
    project_id,
    resource_type,
    resource_id,
    action,
    result,
    metadata
  ) VALUES (
    p_event_type,
    CASE 
      WHEN p_event_type LIKE 'auth.%' THEN 'authentication'
      WHEN p_event_type LIKE 'member.%' THEN 'authorization'
      WHEN p_event_type LIKE 'data.%' THEN 'data_access'
      ELSE 'other'
    END,
    CASE 
      WHEN p_result = 'failure' THEN 'high'
      WHEN p_event_type LIKE '%delete%' THEN 'medium'
      ELSE 'low'
    END,
    CASE WHEN v_user_id IS NULL THEN 'anonymous' ELSE 'user' END,
    v_user_id,
    current_setting('app.current_ip', true)::INET,
    current_setting('app.current_user_agent', true),
    COALESCE(p_company_id, current_setting('app.current_company_id', true)::UUID),
    p_project_id,
    p_resource_type,
    p_resource_id,
    p_action,
    p_result,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission for custom logging
GRANT EXECUTE ON FUNCTION audit.log_security_event(TEXT, TEXT, TEXT, TEXT, UUID, JSONB, UUID, UUID) TO authenticated;

-- Apply audit triggers to critical tables
CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_company_members
  AFTER INSERT OR UPDATE OR DELETE ON company_members
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_project_members
  AFTER INSERT OR UPDATE OR DELETE ON project_members
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_agents
  AFTER INSERT OR UPDATE OR DELETE ON agents
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

CREATE TRIGGER audit_transfers
  AFTER INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- Create view for easier audit log querying
CREATE OR REPLACE VIEW audit.record_changes_view AS
SELECT 
  l.id,
  l.created_at,
  l.operation,
  l.table_name,
  l.record_id,
  -- User info
  l.user_id,
  u.email as user_email,
  u.raw_user_meta_data->>'full_name' as user_name,
  -- Company info
  l.company_id,
  c.name as company_name,
  -- Change info
  l.changed_fields,
  l.old_values,
  l.new_values,
  -- Request info
  l.ip_address,
  l.user_agent
FROM audit.record_changes l
LEFT JOIN auth.users u ON l.user_id = u.id
LEFT JOIN companies c ON l.company_id = c.id
ORDER BY l.created_at DESC;

-- Grant select on the view
GRANT SELECT ON audit.record_changes_view TO authenticated;

-- Create function to set session variables for audit context
-- This should be called at the beginning of each request
CREATE OR REPLACE FUNCTION audit.set_context(
  p_user_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Set session variables
  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.current_user_id', p_user_id::TEXT, true);
  END IF;
  
  IF p_company_id IS NOT NULL THEN
    PERFORM set_config('app.current_company_id', p_company_id::TEXT, true);
  END IF;
  
  IF p_ip_address IS NOT NULL THEN
    PERFORM set_config('app.current_ip', p_ip_address, true);
  END IF;
  
  IF p_user_agent IS NOT NULL THEN
    PERFORM set_config('app.current_user_agent', p_user_agent, true);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION audit.set_context(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION audit.set_context(UUID, UUID, TEXT, TEXT) TO service_role;

-- Add helpful comments
COMMENT ON SCHEMA audit IS 'Audit logging schema for tracking all system changes and user actions';
COMMENT ON TABLE audit.record_changes IS 'Table for tracking data changes (INSERT/UPDATE/DELETE) with before/after values';
COMMENT ON FUNCTION audit.log_change() IS 'Trigger function for automatically logging table changes';
COMMENT ON FUNCTION audit.log_security_event(TEXT, TEXT, TEXT, TEXT, UUID, JSONB, UUID, UUID) IS 'Function for logging security events to audit_logs table';
COMMENT ON FUNCTION audit.set_context(UUID, UUID, TEXT, TEXT) IS 'Sets session context for audit logging - call at start of each request';
COMMENT ON VIEW audit.record_changes_view IS 'Simplified view of record changes with user and company names';