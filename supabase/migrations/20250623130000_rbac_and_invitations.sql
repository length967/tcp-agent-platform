-- Step 1: Create ENUM types for roles
CREATE TYPE company_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE project_role AS ENUM ('admin', 'editor', 'viewer');

-- Step 2: Alter tables to use the new types
-- First, ensure existing data is compatible
UPDATE company_members SET role = 'member' WHERE role NOT IN ('owner', 'admin', 'member');
UPDATE project_members SET role = 'viewer' WHERE role NOT IN ('admin', 'editor', 'viewer');

-- Now alter the columns
ALTER TABLE company_members
  ALTER COLUMN role SET DATA TYPE company_role USING role::company_role;

ALTER TABLE project_members
  ALTER COLUMN role SET DATA TYPE project_role USING role::project_role;

-- Step 3: Create the invitations table
CREATE TABLE invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id),
  invitee_email TEXT NOT NULL,
  company_role company_role,
  project_role project_role,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'base64'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_pending_invite_per_company UNIQUE (company_id, invitee_email, status) 
    DEFERRABLE INITIALLY DEFERRED 
    WHERE (status = 'pending')
);

-- Create indexes
CREATE INDEX idx_invitations_token ON invitations(token) WHERE status = 'pending';
CREATE INDEX idx_invitations_company ON invitations(company_id);
CREATE INDEX idx_invitations_expires ON invitations(expires_at) WHERE status = 'pending';

COMMENT ON TABLE invitations IS 'Stores pending invitations for users to join companies or projects';

-- Step 4: Add suspension flag to user profiles
ALTER TABLE user_profiles
ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.is_suspended IS 'If true, user access is blocked regardless of role';

-- Step 5: Create Security Helper Functions for RLS

-- Checks if a user is a member of a given company
CREATE OR REPLACE FUNCTION is_company_member(p_company_id UUID)
RETURNS boolean 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id AND user_id = auth.uid()
  );
END;
$$;

-- Gets a user's role within a specific company
CREATE OR REPLACE FUNCTION get_company_role(p_company_id UUID)
RETURNS company_role 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role company_role;
BEGIN
  SELECT role INTO user_role FROM company_members
  WHERE company_id = p_company_id AND user_id = auth.uid();
  RETURN user_role;
END;
$$;

-- Gets a user's role for a specific project
CREATE OR REPLACE FUNCTION get_project_role(p_project_id UUID)
RETURNS project_role 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role project_role;
BEGIN
  SELECT role INTO user_role FROM project_members
  WHERE project_id = p_project_id AND user_id = auth.uid();
  RETURN user_role;
END;
$$;

-- Gets a user's effective role for a project (considering company role)
CREATE OR REPLACE FUNCTION get_effective_project_role(p_project_id UUID)
RETURNS text 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_id UUID;
  company_role_val company_role;
  project_role_val project_role;
BEGIN
  -- Get the project's company
  SELECT p.company_id INTO company_id FROM projects p WHERE p.id = p_project_id;
  
  -- Get company role
  company_role_val := get_company_role(company_id);
  
  -- Company owners and admins have full project access
  IF company_role_val IN ('owner', 'admin') THEN
    RETURN 'admin';
  END IF;
  
  -- Otherwise, return the project-specific role
  project_role_val := get_project_role(p_project_id);
  RETURN project_role_val::text;
END;
$$;

-- Step 6: Enable RLS on all relevant tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Step 7: RLS Policies for companies table
CREATE POLICY "Members can view their company"
  ON companies FOR SELECT
  USING (is_company_member(id));

CREATE POLICY "Admins can update company"
  ON companies FOR UPDATE
  USING (get_company_role(id) IN ('owner', 'admin'))
  WITH CHECK (get_company_role(id) IN ('owner', 'admin'));

-- Step 8: RLS Policies for projects table
CREATE POLICY "Company members can view projects"
  ON projects FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY "Company admins can manage projects"
  ON projects FOR ALL
  USING (get_company_role(company_id) IN ('owner', 'admin'))
  WITH CHECK (get_company_role(company_id) IN ('owner', 'admin'));

-- Step 9: RLS Policies for company_members table
CREATE POLICY "Members can view company members"
  ON company_members FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY "Admins can manage company members"
  ON company_members FOR INSERT
  USING (get_company_role(company_id) IN ('owner', 'admin'))
  WITH CHECK (get_company_role(company_id) IN ('owner', 'admin'));

CREATE POLICY "Admins can update company members"
  ON company_members FOR UPDATE
  USING (get_company_role(company_id) IN ('owner', 'admin'))
  WITH CHECK (get_company_role(company_id) IN ('owner', 'admin'));

CREATE POLICY "Admins can remove company members"
  ON company_members FOR DELETE
  USING (
    get_company_role(company_id) IN ('owner', 'admin')
    -- Cannot remove the owner
    AND role != 'owner'
  );

-- Step 10: RLS Policies for project_members table
CREATE POLICY "Project members can view members"
  ON project_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_members.project_id
      AND is_company_member(p.company_id)
    )
  );

CREATE POLICY "Project admins can manage members"
  ON project_members FOR ALL
  USING (
    get_effective_project_role(project_id) = 'admin'
  )
  WITH CHECK (
    get_effective_project_role(project_id) = 'admin'
  );

-- Step 11: RLS Policies for invitations table
CREATE POLICY "Admins can manage invitations"
  ON invitations FOR ALL
  USING (get_company_role(company_id) IN ('owner', 'admin'))
  WITH CHECK (get_company_role(company_id) IN ('owner', 'admin'));

CREATE POLICY "Invitees can view their pending invitation"
  ON invitations FOR SELECT
  USING (
    invitee_email = auth.jwt()->>'email' 
    AND status = 'pending'
  );

-- Step 12: RLS Policies for user_profiles table
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    -- Users cannot change their own suspension status
    id = auth.uid() 
    AND (is_suspended = (SELECT is_suspended FROM user_profiles WHERE id = auth.uid()))
  );

CREATE POLICY "Company admins can view member profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.user_id = user_profiles.id
      AND get_company_role(cm.company_id) IN ('owner', 'admin')
    )
  );

CREATE POLICY "Company admins can suspend members"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.user_id = user_profiles.id
      AND get_company_role(cm.company_id) IN ('owner', 'admin')
      -- Cannot suspend the owner
      AND cm.role != 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.user_id = user_profiles.id
      AND get_company_role(cm.company_id) IN ('owner', 'admin')
      AND cm.role != 'owner'
    )
  );

-- Step 13: Create function to accept invitations
CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_result JSONB;
BEGIN
  -- Find and lock the invitation
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > NOW()
  FOR UPDATE;

  -- Check if invitation exists and is valid
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Start transaction
  BEGIN
    -- Add user to company
    INSERT INTO company_members (company_id, user_id, role, joined_at)
    VALUES (v_invitation.company_id, p_user_id, COALESCE(v_invitation.company_role, 'member'), NOW())
    ON CONFLICT (company_id, user_id) DO NOTHING;

    -- Add user to project if specified
    IF v_invitation.project_id IS NOT NULL THEN
      INSERT INTO project_members (project_id, user_id, role, added_at, added_by)
      VALUES (v_invitation.project_id, p_user_id, COALESCE(v_invitation.project_role, 'viewer'), NOW(), v_invitation.inviter_id)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;

    -- Update user profile with company if not set
    UPDATE user_profiles
    SET company_id = v_invitation.company_id
    WHERE id = p_user_id AND company_id IS NULL;

    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = v_invitation.id;

    -- Return success
    RETURN jsonb_build_object(
      'success', true,
      'company_id', v_invitation.company_id,
      'project_id', v_invitation.project_id
    );

  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback will happen automatically
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$$;

-- Step 14: Create function to revoke expired invitations (can be called by a cron job)
CREATE OR REPLACE FUNCTION revoke_expired_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE invitations
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();
  
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

-- Step 15: Update triggers
CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();