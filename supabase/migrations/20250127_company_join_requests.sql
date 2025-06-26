-- Company join requests and privacy settings
-- This migration adds approval workflow for company joins and privacy controls

-- Add privacy settings to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS allow_join_requests BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS discoverable BOOLEAN DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS require_admin_approval BOOLEAN DEFAULT true;

-- Create company join requests table
CREATE TABLE IF NOT EXISTS company_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    message TEXT, -- Optional message from user
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewer_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate requests
    UNIQUE(company_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_join_requests_company_id ON company_join_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_company_join_requests_user_id ON company_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_company_join_requests_status ON company_join_requests(status);
CREATE INDEX IF NOT EXISTS idx_company_join_requests_requested_at ON company_join_requests(requested_at);

-- Add RLS policies for company_join_requests
ALTER TABLE company_join_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own join requests
CREATE POLICY "Users can view their own join requests" ON company_join_requests
    FOR SELECT USING (user_id = auth.uid());

-- Company admins can see requests for their companies
CREATE POLICY "Company admins can view join requests" ON company_join_requests
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM company_members 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'owner')
        )
    );

-- Users can create join requests
CREATE POLICY "Users can create join requests" ON company_join_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Company admins can update requests (approve/reject)
CREATE POLICY "Company admins can update join requests" ON company_join_requests
    FOR UPDATE USING (
        company_id IN (
            SELECT company_id FROM company_members 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'owner')
        )
    );

-- Function to update find_similar_companies to respect privacy settings
CREATE OR REPLACE FUNCTION find_similar_companies(company_name_input TEXT, user_email TEXT DEFAULT NULL)
RETURNS TABLE (
    company_id UUID,
    company_name TEXT,
    similarity_score REAL,
    email_domain TEXT,
    can_auto_join BOOLEAN,
    member_count INTEGER,
    allows_join_requests BOOLEAN,
    requires_approval BOOLEAN
) AS $$
DECLARE
    user_domain TEXT;
BEGIN
    -- Extract user domain if email provided
    IF user_email IS NOT NULL THEN
        user_domain := split_part(user_email, '@', 2);
    END IF;
    
    RETURN QUERY
    SELECT 
        c.id,
        c.name,
        similarity(LOWER(c.name), LOWER(company_name_input)) as similarity_score,
        c.email_domain,
        CASE 
            WHEN c.email_domain = user_domain AND c.allow_domain_signup = true THEN true
            ELSE false
        END as can_auto_join,
        (SELECT COUNT(*)::INTEGER FROM company_members cm WHERE cm.company_id = c.id) as member_count,
        c.allow_join_requests,
        c.require_admin_approval
    FROM companies c
    WHERE 
        -- Only show discoverable companies
        c.discoverable = true
        AND c.allow_join_requests = true
        AND (
            LOWER(c.name) = LOWER(company_name_input)
            OR similarity(LOWER(c.name), LOWER(company_name_input)) > 0.6
            OR (user_domain IS NOT NULL AND c.email_domain = user_domain)
        )
    ORDER BY 
        similarity_score DESC,
        can_auto_join DESC,
        member_count DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a company join request
CREATE OR REPLACE FUNCTION create_company_join_request(
    p_company_id UUID,
    p_user_id UUID,
    p_email TEXT,
    p_full_name TEXT DEFAULT NULL,
    p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    request_id UUID;
    company_settings RECORD;
BEGIN
    -- Check if company allows join requests
    SELECT allow_join_requests, require_admin_approval, discoverable
    INTO company_settings
    FROM companies 
    WHERE id = p_company_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company not found';
    END IF;
    
    IF NOT company_settings.allow_join_requests THEN
        RAISE EXCEPTION 'Company does not accept join requests';
    END IF;
    
    -- Check if user is already a member
    IF EXISTS (
        SELECT 1 FROM company_members 
        WHERE company_id = p_company_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'User is already a member of this company';
    END IF;
    
    -- Check if there's already a pending request
    IF EXISTS (
        SELECT 1 FROM company_join_requests 
        WHERE company_id = p_company_id AND user_id = p_user_id AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'Join request already pending for this company';
    END IF;
    
    -- Create the join request
    INSERT INTO company_join_requests (
        company_id,
        user_id,
        email,
        full_name,
        message,
        status
    ) VALUES (
        p_company_id,
        p_user_id,
        p_email,
        p_full_name,
        p_message,
        'pending'
    ) RETURNING id INTO request_id;
    
    RETURN request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve/reject join request
CREATE OR REPLACE FUNCTION review_company_join_request(
    p_request_id UUID,
    p_reviewer_id UUID,
    p_action TEXT, -- 'approve' or 'reject'
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    request_record RECORD;
    new_status TEXT;
BEGIN
    -- Validate action
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid action. Must be approve or reject';
    END IF;
    
    new_status := CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END;
    
    -- Get request details and verify reviewer permissions
    SELECT jr.*, c.id as company_id
    INTO request_record
    FROM company_join_requests jr
    JOIN companies c ON jr.company_id = c.id
    WHERE jr.id = p_request_id AND jr.status = 'pending';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Join request not found or already processed';
    END IF;
    
    -- Check if reviewer is admin/owner of the company
    IF NOT EXISTS (
        SELECT 1 FROM company_members 
        WHERE company_id = request_record.company_id 
        AND user_id = p_reviewer_id 
        AND role IN ('admin', 'owner')
    ) THEN
        RAISE EXCEPTION 'Insufficient permissions to review this request';
    END IF;
    
    -- Update the request
    UPDATE company_join_requests 
    SET 
        status = new_status,
        reviewed_at = NOW(),
        reviewed_by = p_reviewer_id,
        reviewer_notes = p_notes,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- If approved, add user to company
    IF p_action = 'approve' THEN
        INSERT INTO company_members (company_id, user_id, role, joined_at)
        VALUES (request_record.company_id, request_record.user_id, 'member', NOW());
        
        -- Update user profile with company_id
        UPDATE user_profiles 
        SET company_id = request_record.company_id 
        WHERE id = request_record.user_id;
        
        -- Ensure user has project access
        PERFORM ensure_user_project_access(request_record.user_id);
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_company_join_request(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION review_company_join_request(UUID, UUID, TEXT, TEXT) TO authenticated;

-- Update the user onboarding function to use join requests instead of direct joining
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_company_id UUID;
    new_project_id UUID;
    company_name TEXT;
    company_slug TEXT;
    invitation_token TEXT;
    existing_invitation RECORD;
    default_company_name TEXT;
    user_email_domain TEXT;
    existing_company RECORD;
    temp_slug TEXT;
    slug_counter INTEGER := 1;
BEGIN
    -- Create user profile first
    INSERT INTO user_profiles (id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)));
    
    -- Check if user was invited (has invitation token in metadata)
    invitation_token := NEW.raw_user_meta_data->>'invitation_token';
    
    IF invitation_token IS NOT NULL THEN
        -- Handle invited user flow (direct invitation bypasses join requests)
        SELECT * INTO existing_invitation 
        FROM company_invitations 
        WHERE token = invitation_token 
        AND expires_at > NOW() 
        AND accepted_at IS NULL;
        
        IF existing_invitation.id IS NOT NULL THEN
            -- Accept the invitation
            UPDATE company_invitations 
            SET accepted_at = NOW(), accepted_by = NEW.id
            WHERE id = existing_invitation.id;
            
            -- Add user to company
            INSERT INTO company_members (company_id, user_id, role, permissions)
            VALUES (existing_invitation.company_id, NEW.id, existing_invitation.role, existing_invitation.permissions);
            
            -- Update user profile with company
            UPDATE user_profiles 
            SET company_id = existing_invitation.company_id 
            WHERE id = NEW.id;
            
            -- Add to specific project if specified
            IF existing_invitation.project_id IS NOT NULL THEN
                INSERT INTO project_members (project_id, user_id, role, added_by)
                VALUES (existing_invitation.project_id, NEW.id, 'member', existing_invitation.invited_by);
            END IF;
            
            RETURN NEW;
        END IF;
    END IF;
    
    -- Check if user is joining via approved join request
    IF NEW.raw_user_meta_data->>'approved_join_request_id' IS NOT NULL THEN
        -- This will be handled by the review_company_join_request function
        -- Just create the user profile and let the approval process handle company membership
        RETURN NEW;
    END IF;
    
    -- Extract email domain for company matching
    user_email_domain := split_part(NEW.email, '@', 2);
    
    -- Skip automatic company matching for common email providers
    IF user_email_domain NOT IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com') THEN
        -- Check if there's an existing company with this domain that allows auto-join
        SELECT * INTO existing_company
        FROM companies 
        WHERE email_domain = user_email_domain
        AND allow_domain_signup = true
        AND discoverable = true
        LIMIT 1;
        
        IF existing_company.id IS NOT NULL THEN
            -- Add user to existing company as member (auto-join for domain)
            INSERT INTO company_members (company_id, user_id, role, joined_at)
            VALUES (existing_company.id, NEW.id, 'member', NOW());
            
            -- Update user profile with company_id
            UPDATE user_profiles 
            SET company_id = existing_company.id 
            WHERE id = NEW.id;
            
            -- Check if there are projects they can join
            PERFORM ensure_user_project_access(NEW.id);
            
            RETURN NEW;
        END IF;
    END IF;
    
    -- Handle solo user or new company creation flow
    company_name := NEW.raw_user_meta_data->>'company_name';
    
    -- If no company name provided, create a default one
    IF company_name IS NULL OR company_name = '' THEN
        -- Extract company name from email domain or use default
        IF user_email_domain IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com') THEN
            default_company_name := split_part(NEW.email, '@', 1) || '''s Workspace';
        ELSE
            default_company_name := INITCAP(split_part(user_email_domain, '.', 1)) || ' Workspace';
        END IF;
        company_name := default_company_name;
    END IF;
    
    -- Check if user explicitly confirmed they want to create a duplicate company
    IF NEW.raw_user_meta_data->>'forceCreateCompany' = 'true' THEN
        -- User explicitly wants to create a new company even if similar ones exist
        -- This flag would be set by the frontend after showing duplicate warnings
    ELSE
        -- Check if similar company names exist and STOP the process
        -- Let the frontend handle duplicate detection and user choice
        SELECT * INTO existing_company
        FROM companies 
        WHERE LOWER(name) = LOWER(company_name)
        OR similarity(LOWER(name), LOWER(company_name)) > 0.7
        LIMIT 1;
        
        IF existing_company.id IS NOT NULL THEN
            -- Store the attempted company name for frontend to use
            UPDATE user_profiles 
            SET 
                company_id = NULL,
                full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
                metadata = jsonb_build_object(
                    'attempted_company_name', company_name,
                    'similar_companies_found', true,
                    'needs_company_selection', true
                )
            WHERE id = NEW.id;
            
            RETURN NEW; -- Exit early, let frontend handle company selection
        END IF;
    END IF;
    
    -- Generate unique company slug
    company_slug := LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'));
    company_slug := TRIM(company_slug, '-'); -- Remove leading/trailing dashes
    
    -- Ensure unique slug
    temp_slug := company_slug;
    slug_counter := 1;
    WHILE EXISTS (SELECT 1 FROM companies WHERE slug = company_slug) LOOP
        company_slug := temp_slug || '-' || slug_counter;
        slug_counter := slug_counter + 1;
        
        -- Safety check
        IF slug_counter > 1000 THEN
            company_slug := temp_slug || '-' || substring(md5(random()::text) from 1 for 6);
            EXIT;
        END IF;
    END LOOP;
    
    -- Determine email domain settings
    DECLARE
        domain_signup BOOLEAN := false;
        domain_to_store TEXT := NULL;
    BEGIN
        -- Only allow domain signup for business domains (not personal email providers)
        IF user_email_domain NOT IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com') THEN
            domain_signup := true;
            domain_to_store := user_email_domain;
        END IF;
    END;
    
    -- Create company with default privacy settings
    INSERT INTO companies (
        name, 
        slug, 
        email_domain,
        allow_domain_signup,
        allow_join_requests,
        discoverable,
        require_admin_approval,
        subscription_status, 
        created_at
    )
    VALUES (
        company_name, 
        company_slug, 
        domain_to_store,
        domain_signup,
        true, -- allow_join_requests
        true, -- discoverable
        true, -- require_admin_approval
        'trial', 
        NOW()
    )
    RETURNING id INTO new_company_id;
    
    -- Add user as company owner
    INSERT INTO company_members (company_id, user_id, role, joined_at)
    VALUES (new_company_id, NEW.id, 'owner', NOW());
    
    -- Update user profile with company_id
    UPDATE user_profiles 
    SET company_id = new_company_id 
    WHERE id = NEW.id;
    
    -- Create default project
    INSERT INTO projects (company_id, name, slug, created_at)
    VALUES (new_company_id, 'My First Project', 'my-first-project', NOW())
    RETURNING id INTO new_project_id;
    
    -- Add user as project owner
    INSERT INTO project_members (project_id, user_id, role, added_at, added_by)
    VALUES (new_project_id, NEW.id, 'admin', NOW(), NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user(); 