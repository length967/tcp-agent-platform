-- Add missing columns to companies table that are referenced in functions
-- Following best practices from GEMINI.md

-- Add email_domain column for domain-based auto-join
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS email_domain TEXT;

-- Add allow_domain_signup for controlling domain-based signup
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS allow_domain_signup BOOLEAN DEFAULT false;

-- Add indexes for performance (following RLS best practices)
CREATE INDEX IF NOT EXISTS idx_companies_email_domain 
ON companies(email_domain) 
WHERE email_domain IS NOT NULL;

-- Add check constraint to ensure email_domain is a valid domain format
ALTER TABLE companies 
ADD CONSTRAINT check_email_domain_format 
CHECK (email_domain IS NULL OR email_domain ~ '^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$');

-- Add comment for documentation
COMMENT ON COLUMN companies.email_domain IS 'Domain for automatic user association (e.g., company.com)';
COMMENT ON COLUMN companies.allow_domain_signup IS 'Whether users with matching email domain can auto-join';

-- Update the handle_new_user function to use the new columns correctly
-- This ensures the function won't fail due to missing columns
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  domain_name text;
  existing_company_id uuid;
  new_company_id uuid;
  invitation_company_id uuid;
  invitation_token text;
BEGIN
  -- Check for invitation token in metadata
  invitation_token := NEW.raw_user_meta_data->>'invitation_token';
  
  IF invitation_token IS NOT NULL THEN
    -- Get company ID from valid invitation
    SELECT company_id INTO invitation_company_id
    FROM invitations
    WHERE token = invitation_token
      AND status = 'pending'
      AND expires_at > now();
    
    IF invitation_company_id IS NOT NULL THEN
      existing_company_id := invitation_company_id;
    END IF;
  END IF;

  -- If no invitation, check for domain-based signup
  IF existing_company_id IS NULL AND NEW.email IS NOT NULL THEN
    -- Extract domain from email
    domain_name := lower(split_part(NEW.email, '@', 2));
    
    -- Skip personal email domains
    IF domain_name NOT IN ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 
                          'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com',
                          'ymail.com', 'qq.com', '163.com', '126.com') THEN
      -- Check if a company exists with this domain and allows domain signup
      SELECT id INTO existing_company_id
      FROM companies
      WHERE email_domain = domain_name 
        AND allow_domain_signup = true
      LIMIT 1;
    END IF;
  END IF;

  -- Create or use existing company
  IF existing_company_id IS NOT NULL THEN
    new_company_id := existing_company_id;
  ELSE
    -- Create a new company
    INSERT INTO companies (name, created_by)
    VALUES (
      COALESCE(
        NEW.raw_user_meta_data->>'company_name',
        split_part(NEW.email, '@', 1) || '''s Company'
      ),
      NEW.id
    )
    RETURNING id INTO new_company_id;

    -- Add the user as owner of the new company
    INSERT INTO company_members (company_id, user_id, role, joined_at)
    VALUES (new_company_id, NEW.id, 'owner', now());
  END IF;

  -- Create user profile
  INSERT INTO public.user_profiles (id, email, full_name, company_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    new_company_id
  );

  -- If existing company and user is not already a member, add them
  IF existing_company_id IS NOT NULL THEN
    INSERT INTO company_members (company_id, user_id, role, joined_at)
    VALUES (existing_company_id, NEW.id, 'member', now())
    ON CONFLICT (company_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;