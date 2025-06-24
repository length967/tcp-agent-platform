-- Create custom access token hook for JWT claims
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_company_role TEXT;
  user_company_id UUID;
  claims JSONB;
BEGIN
  -- Get user's company membership
  SELECT cm.role::TEXT, cm.company_id 
  INTO user_company_role, user_company_id
  FROM company_members cm
  WHERE cm.user_id = (event->>'user_id')::UUID
  AND cm.is_active = true
  LIMIT 1;

  -- Build custom claims
  claims := event->'claims';
  
  -- Add company information to app_metadata
  IF user_company_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata}', 
      COALESCE(claims->'app_metadata', '{}'::JSONB) || 
      jsonb_build_object(
        'company_id', user_company_id,
        'company_role', user_company_role
      )
    );
  END IF;

  -- Return modified claims
  RETURN jsonb_build_object('claims', claims);
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent authentication
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Note: The actual hook configuration needs to be done in the Supabase dashboard
-- or via the Supabase CLI config. This function just defines what the hook will do.