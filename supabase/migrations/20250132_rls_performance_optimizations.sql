-- RLS Performance Optimizations
-- Based on best practices from GEMINI.md and Supabase documentation

-- Create optimized helper function for getting user's company IDs
-- This uses SECURITY DEFINER and wraps auth.uid() for query plan caching
CREATE OR REPLACE FUNCTION public.user_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT company_id 
  FROM company_members 
  WHERE user_id = (SELECT auth.uid())
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_company_ids() TO authenticated;

-- Create optimized helper function for getting user's project IDs
CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT project_id 
  FROM project_members 
  WHERE user_id = (SELECT auth.uid())
  UNION
  SELECT id 
  FROM projects 
  WHERE company_id IN (SELECT public.user_company_ids())
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.user_project_ids() TO authenticated;

-- Create performance indexes for RLS policies
-- These indexes are critical for query performance with RLS

-- Company members index (user_id, company_id) for fast lookups
CREATE INDEX IF NOT EXISTS idx_company_members_user_company 
ON company_members(user_id, company_id);

-- Project members index for fast lookups
CREATE INDEX IF NOT EXISTS idx_project_members_user_project 
ON project_members(user_id, project_id);

-- Skip companies created_by index as column doesn't exist yet

-- Projects index for company lookups
CREATE INDEX IF NOT EXISTS idx_projects_company_id 
ON projects(company_id);

-- Agents index for project lookups
CREATE INDEX IF NOT EXISTS idx_agents_project_id 
ON agents(project_id);

-- Transfers index for project lookups
CREATE INDEX IF NOT EXISTS idx_transfers_project_id 
ON transfers(project_id);

-- Skip audit_logs indexes as table doesn't exist yet

-- Update existing RLS policies to use optimized functions
-- This significantly improves performance by enabling query plan caching

-- Drop existing company policies to recreate with optimizations
DROP POLICY IF EXISTS "Members can view their company" ON companies;
DROP POLICY IF EXISTS "Admins can update company" ON companies;

-- Recreate company policies with optimized functions
CREATE POLICY "Members can view their company"
  ON companies FOR SELECT
  USING (id IN (SELECT public.user_company_ids()));

CREATE POLICY "Admins can update company"
  ON companies FOR UPDATE
  USING (
    id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = (SELECT auth.uid()) 
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = (SELECT auth.uid()) 
        AND role IN ('owner', 'admin')
    )
  );

-- Drop existing project policies to recreate with optimizations
DROP POLICY IF EXISTS "Company members can view projects" ON projects;
DROP POLICY IF EXISTS "Company admins can manage projects" ON projects;

-- Recreate project policies with optimized functions
CREATE POLICY "Company members can view projects"
  ON projects FOR SELECT
  USING (
    company_id IN (SELECT public.user_company_ids())
    OR
    id IN (
      SELECT project_id FROM project_members 
      WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Company admins can manage projects"
  ON projects FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = (SELECT auth.uid()) 
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM company_members 
      WHERE user_id = (SELECT auth.uid()) 
        AND role IN ('owner', 'admin')
    )
  );

-- Create helper function to check if user has specific permission
-- This centralizes permission logic and improves maintainability
CREATE OR REPLACE FUNCTION public.has_permission(p_permission text, p_company_id uuid DEFAULT NULL, p_project_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_company_role company_role;
  v_project_role project_role;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check company-level permissions
  IF p_company_id IS NOT NULL THEN
    SELECT role INTO v_company_role
    FROM company_members
    WHERE user_id = v_user_id 
      AND company_id = p_company_id;
    
    -- Company owners have all permissions
    IF v_company_role = 'owner' THEN
      RETURN true;
    END IF;
    
    -- Check specific company permissions based on role
    -- This would be expanded based on your permission matrix
    IF v_company_role = 'admin' AND p_permission IN (
      'company:update', 'members:invite', 'members:remove', 
      'projects:create', 'projects:delete'
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check project-level permissions
  IF p_project_id IS NOT NULL THEN
    -- Get company ID for the project
    SELECT company_id INTO p_company_id
    FROM projects
    WHERE id = p_project_id;
    
    -- Check if user is company admin (has full project access)
    SELECT role INTO v_company_role
    FROM company_members
    WHERE user_id = v_user_id 
      AND company_id = p_company_id;
    
    IF v_company_role IN ('owner', 'admin') THEN
      RETURN true;
    END IF;
    
    -- Check project-specific role
    SELECT role INTO v_project_role
    FROM project_members
    WHERE user_id = v_user_id 
      AND project_id = p_project_id;
    
    -- Check specific project permissions based on role
    IF v_project_role = 'admin' AND p_permission IN (
      'project:update', 'project:delete', 'agents:create', 
      'agents:delete', 'transfers:create', 'transfers:delete'
    ) THEN
      RETURN true;
    END IF;
    
    IF v_project_role IN ('admin', 'editor') AND p_permission IN (
      'agents:update', 'transfers:update'
    ) THEN
      RETURN true;
    END IF;
    
    IF v_project_role IN ('admin', 'editor', 'viewer') AND p_permission IN (
      'project:read', 'agents:read', 'transfers:read'
    ) THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid, uuid) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.user_company_ids() IS 'Returns all active company IDs for the current user - optimized for RLS policies';
COMMENT ON FUNCTION public.user_project_ids() IS 'Returns all accessible project IDs for the current user - includes direct membership and company access';
COMMENT ON FUNCTION public.has_permission(text, uuid, uuid) IS 'Checks if current user has specific permission in company or project context';