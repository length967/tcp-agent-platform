-- Update custom access token hook to include session timeout
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_company_role TEXT;
  user_company_id UUID;
  user_timeout_minutes INTEGER;
  claims JSONB;
  new_exp BIGINT;
BEGIN
  -- Get user's company membership
  SELECT cm.role::TEXT, cm.company_id 
  INTO user_company_role, user_company_id
  FROM company_members cm
  WHERE cm.user_id = (event->>'user_id')::UUID
  AND cm.is_active = true
  LIMIT 1;

  -- Get user's effective session timeout
  SELECT get_user_session_timeout((event->>'user_id')::UUID)
  INTO user_timeout_minutes;
  
  -- If no timeout found, use default 30 minutes
  IF user_timeout_minutes IS NULL THEN
    user_timeout_minutes := 30;
  END IF;

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
  
  -- Calculate new expiration time based on session timeout
  -- Note: JWT exp is in seconds since epoch
  new_exp := EXTRACT(EPOCH FROM NOW() + (user_timeout_minutes || ' minutes')::INTERVAL)::BIGINT;
  
  -- Update the exp claim to match the session timeout
  claims := jsonb_set(claims, '{exp}', to_jsonb(new_exp));
  
  -- Add session timeout info to app_metadata for client reference
  claims := jsonb_set(claims, '{app_metadata,session_timeout_minutes}', to_jsonb(user_timeout_minutes));

  -- Return modified claims
  RETURN jsonb_build_object('claims', claims);
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent authentication
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;
END;
$$;

-- Note: After deploying this migration, you need to configure Supabase to use this hook
-- This can be done in the Supabase dashboard under Authentication > Hooks
-- Set the "Custom access token hook" to use this function