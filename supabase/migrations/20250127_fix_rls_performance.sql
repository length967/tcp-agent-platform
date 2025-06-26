-- Fix RLS Performance Issues
-- This migration wraps all auth.uid() calls with (select auth.uid()) to enable query plan caching
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- Drop all existing policies that have performance issues
-- We'll recreate them with optimized auth function calls

-- Companies table policies
DROP POLICY IF EXISTS "Users can view companies they are members of" ON companies;
CREATE POLICY "Users can view companies they are members of"
    ON companies FOR SELECT
    USING (id IN (
        SELECT company_id FROM company_members WHERE user_id = (select auth.uid())
    ));

DROP POLICY IF EXISTS "Company owners can update their companies" ON companies;
CREATE POLICY "Company owners can update their companies"
    ON companies FOR UPDATE
    USING (id IN (
        SELECT company_id FROM company_members 
        WHERE user_id = (select auth.uid()) AND role = 'owner'
    ));

-- Projects table policies  
DROP POLICY IF EXISTS "Users can view projects they are members of" ON projects;
CREATE POLICY "Users can view projects they are members of"
    ON projects FOR SELECT
    USING (
        id IN (SELECT project_id FROM project_members WHERE user_id = (select auth.uid()))
        OR
        company_id IN (SELECT company_id FROM company_members WHERE user_id = (select auth.uid()))
    );

DROP POLICY IF EXISTS "Project admins can manage projects" ON projects;
CREATE POLICY "Project admins can manage projects"
    ON projects FOR ALL
    USING (
        id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = (select auth.uid()) AND role IN ('owner', 'admin')
        )
    );

-- User profiles policies
DROP POLICY IF EXISTS "Users can view all profiles in their company" ON user_profiles;
CREATE POLICY "Users can view all profiles in their company"
    ON user_profiles FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = (select auth.uid())
        )
        OR id = (select auth.uid())
    );

DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
CREATE POLICY "Users can update their own profile"
    ON user_profiles FOR UPDATE
    USING (id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- Agents table policies
DROP POLICY IF EXISTS "Users can view agents in their projects" ON agents;
CREATE POLICY "Users can view agents in their projects"
    ON agents FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Project admins can manage agents" ON agents;
CREATE POLICY "Project admins can manage agents"
    ON agents FOR ALL
    USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = (select auth.uid()) AND role IN ('owner', 'admin')
        )
    );

-- Transfers table policies
DROP POLICY IF EXISTS "Users can view transfers in their projects" ON transfers;
CREATE POLICY "Users can view transfers in their projects"
    ON transfers FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Project members can create transfers" ON transfers;
CREATE POLICY "Project members can create transfers"
    ON transfers FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = (select auth.uid())
        )
    );

-- Company join requests policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_join_requests') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view their own join requests" ON company_join_requests';
        EXECUTE 'CREATE POLICY "Users can view their own join requests" ON company_join_requests
            FOR SELECT USING (user_id = (select auth.uid()))';

        EXECUTE 'DROP POLICY IF EXISTS "Company admins can view join requests" ON company_join_requests';
        EXECUTE 'CREATE POLICY "Company admins can view join requests" ON company_join_requests
            FOR SELECT USING (
                company_id IN (
                    SELECT company_id FROM company_members 
                    WHERE user_id = (select auth.uid()) 
                    AND role IN (''admin'', ''owner'')
                )
            )';

        EXECUTE 'DROP POLICY IF EXISTS "Users can create join requests" ON company_join_requests';
        EXECUTE 'CREATE POLICY "Users can create join requests" ON company_join_requests
            FOR INSERT WITH CHECK (user_id = (select auth.uid()))';

        EXECUTE 'DROP POLICY IF EXISTS "Company admins can update join requests" ON company_join_requests';
        EXECUTE 'CREATE POLICY "Company admins can update join requests" ON company_join_requests
            FOR UPDATE USING (
                company_id IN (
                    SELECT company_id FROM company_members 
                    WHERE user_id = (select auth.uid()) 
                    AND role IN (''admin'', ''owner'')
                )
            )';
    END IF;
END $$;

-- Telemetry data policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'telemetry_data') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view telemetry for their projects" ON telemetry_data';
        EXECUTE 'CREATE POLICY "Users can view telemetry for their projects" ON telemetry_data
            FOR SELECT USING (
                project_id IN (
                    SELECT project_id FROM project_members WHERE user_id = (select auth.uid())
                )
            )';

        EXECUTE 'DROP POLICY IF EXISTS "Users can insert telemetry for their projects" ON telemetry_data';
        EXECUTE 'CREATE POLICY "Users can insert telemetry for their projects" ON telemetry_data
            FOR INSERT WITH CHECK (
                project_id IN (
                    SELECT project_id FROM project_members WHERE user_id = (select auth.uid())
                )
            )';
    END IF;
END $$;

-- Agent registration tokens policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_registration_tokens') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view tokens for their projects" ON agent_registration_tokens';
        EXECUTE 'CREATE POLICY "Users can view tokens for their projects" ON agent_registration_tokens
            FOR SELECT USING (
                project_id IN (
                    SELECT pm.project_id FROM project_members pm
                    WHERE pm.user_id = (select auth.uid())
                )
            )';

        EXECUTE 'DROP POLICY IF EXISTS "Users can manage tokens for their projects" ON agent_registration_tokens';
        EXECUTE 'CREATE POLICY "Users can manage tokens for their projects" ON agent_registration_tokens
            FOR ALL USING (
                project_id IN (
                    SELECT pm.project_id FROM project_members pm
                    WHERE pm.user_id = (select auth.uid())
                )
            )';
    END IF;
END $$;

-- Audit logs policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view audit logs" ON audit_logs';
        EXECUTE 'CREATE POLICY "Users can view audit logs" ON audit_logs
            FOR SELECT USING (
                (actor_type = ''user'' AND actor_id = (select auth.uid()))
                OR
                (resource_type = ''company'' AND resource_id IN (
                    SELECT company_id FROM company_members cm
                    WHERE cm.user_id = (select auth.uid())
                ))
                OR
                (resource_type = ''project'' AND resource_id IN (
                    SELECT project_id FROM project_members pm
                    WHERE pm.user_id = (select auth.uid())
                ))
            )';
    END IF;
END $$;

-- Transfer files policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transfer_files') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view transfer files for their projects" ON transfer_files';
        EXECUTE 'CREATE POLICY "Users can view transfer files for their projects" ON transfer_files
            FOR SELECT USING (
                transfer_id IN (
                    SELECT t.id FROM transfers t
                    JOIN project_members pm ON t.project_id = pm.project_id
                    WHERE pm.user_id = (select auth.uid())
                )
            )';

        EXECUTE 'DROP POLICY IF EXISTS "Users can insert transfer files for their projects" ON transfer_files';
        EXECUTE 'CREATE POLICY "Users can insert transfer files for their projects" ON transfer_files
            FOR INSERT WITH CHECK (
                transfer_id IN (
                    SELECT t.id FROM transfers t
                    JOIN project_members pm ON t.project_id = pm.project_id
                    WHERE pm.user_id = (select auth.uid())
                )
            )';

        EXECUTE 'DROP POLICY IF EXISTS "Users can update transfer files for their projects" ON transfer_files';
        EXECUTE 'CREATE POLICY "Users can update transfer files for their projects" ON transfer_files
            FOR UPDATE USING (
                transfer_id IN (
                    SELECT t.id FROM transfers t
                    JOIN project_members pm ON t.project_id = pm.project_id
                    WHERE pm.user_id = (select auth.uid())
                )
            )';
    END IF;
END $$;

-- User preferences policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_preferences') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view their own preferences" ON user_preferences';
        EXECUTE 'CREATE POLICY "Users can view their own preferences" ON user_preferences
            FOR SELECT USING ((select auth.uid()) = user_id)';

        EXECUTE 'DROP POLICY IF EXISTS "Users can update their own preferences" ON user_preferences';
        EXECUTE 'CREATE POLICY "Users can update their own preferences" ON user_preferences
            FOR UPDATE USING ((select auth.uid()) = user_id)
            WITH CHECK ((select auth.uid()) = user_id)';

        EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own preferences" ON user_preferences';
        EXECUTE 'CREATE POLICY "Users can insert their own preferences" ON user_preferences
            FOR INSERT WITH CHECK ((select auth.uid()) = user_id)';
    END IF;
END $$;

-- User session settings policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_session_settings') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view their own session settings" ON user_session_settings';
        EXECUTE 'CREATE POLICY "Users can view their own session settings" ON user_session_settings
            FOR SELECT USING ((select auth.uid()) = user_id)';

        EXECUTE 'DROP POLICY IF EXISTS "Users can update their own session settings" ON user_session_settings';
        EXECUTE 'CREATE POLICY "Users can update their own session settings" ON user_session_settings
            FOR UPDATE USING ((select auth.uid()) = user_id)';
    END IF;
END $$;

-- User API keys policies (if table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_api_keys') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can view their own API keys" ON user_api_keys';
        EXECUTE 'CREATE POLICY "Users can view their own API keys" ON user_api_keys
            FOR SELECT USING ((select auth.uid()) = user_id)';

        EXECUTE 'DROP POLICY IF EXISTS "Users can manage their own API keys" ON user_api_keys';
        EXECUTE 'CREATE POLICY "Users can manage their own API keys" ON user_api_keys
            FOR ALL USING ((select auth.uid()) = user_id)
            WITH CHECK ((select auth.uid()) = user_id)';

        EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own API keys" ON user_api_keys';
        EXECUTE 'DROP POLICY IF EXISTS "Users can update their own API keys" ON user_api_keys';
    END IF;
END $$;

-- Company members policies
DROP POLICY IF EXISTS "Users can view company members" ON company_members;
CREATE POLICY "Users can view company members"
    ON company_members FOR SELECT
    USING (
        company_id IN (
            SELECT company_id FROM company_members WHERE user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Company admins can manage members" ON company_members;
CREATE POLICY "Company admins can manage members"
    ON company_members FOR ALL
    USING (
        company_id IN (
            SELECT company_id FROM company_members 
            WHERE user_id = (select auth.uid()) AND role IN ('owner', 'admin')
        )
    );

-- Project members policies
DROP POLICY IF EXISTS "Users can view project members" ON project_members;
CREATE POLICY "Users can view project members"
    ON project_members FOR SELECT
    USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = (select auth.uid())
        )
        OR project_id IN (
            SELECT p.id FROM projects p
            JOIN company_members cm ON p.company_id = cm.company_id
            WHERE cm.user_id = (select auth.uid())
        )
    );

DROP POLICY IF EXISTS "Project admins can manage members" ON project_members;
CREATE POLICY "Project admins can manage members"
    ON project_members FOR ALL
    USING (
        project_id IN (
            SELECT project_id FROM project_members 
            WHERE user_id = (select auth.uid()) AND role IN ('owner', 'admin')
        )
        OR project_id IN (
            SELECT p.id FROM projects p
            JOIN company_members cm ON p.company_id = cm.company_id
            WHERE cm.user_id = (select auth.uid()) AND cm.role IN ('owner', 'admin')
        )
    );

-- Update functions that use auth.uid() to use (select auth.uid()) for consistency
-- Note: This migration fixes RLS policies. Functions should also be updated to use
-- (select auth.uid()) for optimal performance, but that requires manual review of each function. 