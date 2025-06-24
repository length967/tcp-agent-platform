-- Add session timeout settings to user_profiles and companies

-- Add session_timeout_minutes to user_profiles (user preference)
ALTER TABLE user_profiles 
ADD COLUMN session_timeout_minutes INTEGER DEFAULT NULL;

-- Add session timeout settings to companies (company-wide settings)
ALTER TABLE companies 
ADD COLUMN session_timeout_minutes INTEGER DEFAULT 30,
ADD COLUMN enforce_session_timeout BOOLEAN DEFAULT false;

-- Add comment explaining the logic
COMMENT ON COLUMN user_profiles.session_timeout_minutes IS 'User preference for session timeout. NULL means use company default';
COMMENT ON COLUMN companies.session_timeout_minutes IS 'Company default session timeout in minutes';
COMMENT ON COLUMN companies.enforce_session_timeout IS 'If true, users cannot override company timeout settings';

-- Create function to get effective session timeout for a user
CREATE OR REPLACE FUNCTION get_user_session_timeout(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_timeout INTEGER;
  company_timeout INTEGER;
  company_enforce BOOLEAN;
BEGIN
  -- Get user and company settings
  SELECT 
    up.session_timeout_minutes,
    c.session_timeout_minutes,
    c.enforce_session_timeout
  INTO 
    user_timeout,
    company_timeout,
    company_enforce
  FROM user_profiles up
  LEFT JOIN company_members cm ON cm.user_id = up.id
  LEFT JOIN companies c ON c.id = cm.company_id
  WHERE up.id = user_id
  AND cm.is_active = true
  LIMIT 1;
  
  -- If company enforces timeout, use company setting
  IF company_enforce THEN
    RETURN COALESCE(company_timeout, 30);
  END IF;
  
  -- Otherwise use user preference if set, else company default, else system default (30 min)
  RETURN COALESCE(user_timeout, company_timeout, 30);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_session_timeout TO authenticated;