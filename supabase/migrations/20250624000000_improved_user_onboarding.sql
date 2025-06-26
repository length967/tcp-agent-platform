-- Enhanced user onboarding flow v3
-- This migration improves company creation logic to prevent unwanted duplicates

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved user onboarding function
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
        -- Handle invited user flow
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
    
    -- Extract email domain for company matching
    user_email_domain := split_part(NEW.email, '@', 2);
    
    -- Skip automatic company matching for common email providers
    IF user_email_domain NOT IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com') THEN
        -- Check if there's an existing company with this domain
        SELECT * INTO existing_company
        FROM companies 
        WHERE email_domain = user_email_domain
        AND allow_domain_signup = true
        LIMIT 1;
        
        IF existing_company.id IS NOT NULL THEN
            -- Add user to existing company as member
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
    
    -- Create company
    INSERT INTO companies (
        name, 
        slug, 
        email_domain,
        allow_domain_signup,
        subscription_status, 
        created_at
    )
    VALUES (
        company_name, 
        company_slug, 
        domain_to_store,
        domain_signup,
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

-- Add metadata column to user_profiles if it doesn't exist
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index for metadata queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_metadata ON user_profiles USING GIN (metadata);

-- Add similarity extension for fuzzy company name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Function to find similar companies
CREATE OR REPLACE FUNCTION find_similar_companies(company_name_input TEXT, user_email TEXT DEFAULT NULL)
RETURNS TABLE (
    company_id UUID,
    company_name TEXT,
    similarity_score REAL,
    email_domain TEXT,
    can_auto_join BOOLEAN,
    member_count INTEGER
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
        (SELECT COUNT(*)::INTEGER FROM company_members cm WHERE cm.company_id = c.id) as member_count
    FROM companies c
    WHERE 
        LOWER(c.name) = LOWER(company_name_input)
        OR similarity(LOWER(c.name), LOWER(company_name_input)) > 0.6
        OR (user_domain IS NOT NULL AND c.email_domain = user_domain)
    ORDER BY 
        similarity_score DESC,
        can_auto_join DESC,
        member_count DESC
    LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION find_similar_companies(TEXT, TEXT) TO authenticated; 