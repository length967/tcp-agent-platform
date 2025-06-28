-- Fix security vulnerability: Add search_path to all SECURITY DEFINER functions
-- This prevents search path attacks by ensuring functions use a fixed schema search path
-- Also fix user creation issues by disabling RLS during initial user data creation

-- Function: validate_file_upload
CREATE OR REPLACE FUNCTION public.validate_file_upload(p_transfer_id uuid, p_agent_id uuid, p_file_size bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_transfer RECORD;
    v_project_usage BIGINT;
    v_project_limit BIGINT;
BEGIN
    -- Get transfer details
    SELECT t.*, p.settings
    INTO v_transfer
    FROM transfers t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = p_transfer_id;

    -- Check if transfer exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    -- Check if agent is the source agent
    IF v_transfer.source_agent_id != p_agent_id THEN
        RAISE EXCEPTION 'Only source agent can upload files';
    END IF;

    -- Check transfer status
    IF v_transfer.status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Transfer is not active';
    END IF;

    -- Check storage quota
    v_project_usage := get_project_storage_usage(v_transfer.project_id);
    v_project_limit := COALESCE((v_transfer.settings->>'storage_limit')::BIGINT, 10737418240); -- 10GB default

    IF v_project_usage + p_file_size > v_project_limit THEN
        RAISE EXCEPTION 'Storage quota exceeded';
    END IF;

    RETURN TRUE;
END;
$function$;

-- Function: get_project_storage_usage
CREATE OR REPLACE FUNCTION public.get_project_storage_usage(p_project_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    total_usage BIGINT;
BEGIN
    -- Calculate total storage used by all transfer files in the project
    SELECT COALESCE(SUM(tf.file_size), 0)
    INTO total_usage
    FROM transfer_files tf
    JOIN transfers t ON tf.transfer_id = t.id
    WHERE t.project_id = p_project_id
    AND tf.status IN ('uploaded', 'completed');

    RETURN total_usage;
END;
$function$;

-- Function: sync_user_email
CREATE OR REPLACE FUNCTION public.sync_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Update email in user_profiles when auth.users email changes
  UPDATE user_profiles
  SET email = NEW.email
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

-- Function: get_company_timezone_info
CREATE OR REPLACE FUNCTION public.get_company_timezone_info(company_id uuid)
RETURNS TABLE(timezone character varying, enforce_timezone boolean, business_hours_start time without time zone, business_hours_end time without time zone, business_days integer[], is_business_hours boolean, local_time timestamp with time zone)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(c.default_timezone, 'UTC') as timezone,
    c.enforce_timezone,
    c.business_hours_start,
    c.business_hours_end,
    c.business_days,
    is_business_hours(c.id) as is_business_hours,
    (NOW() AT TIME ZONE COALESCE(c.default_timezone, 'UTC')) as local_time
  FROM companies c
  WHERE c.id = company_id;
END;
$function$;

-- Function: update_user_preferences_updated_at
CREATE OR REPLACE FUNCTION public.update_user_preferences_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- Function: cleanup_expired_tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM agent_registration_tokens
    WHERE expires_at < NOW();
END;
$function$;

-- Function: get_telemetry_settings
CREATE OR REPLACE FUNCTION public.get_telemetry_settings(company_id uuid)
RETURNS TABLE(retention_days integer, update_interval_ms integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        CASE subscription_status
            WHEN 'free' THEN 7
            WHEN 'starter' THEN 30
            WHEN 'professional' THEN 90
            WHEN 'enterprise' THEN 365
            ELSE 7
        END as retention_days,
        CASE subscription_status
            WHEN 'free' THEN 30000      -- 30 seconds
            WHEN 'starter' THEN 5000     -- 5 seconds
            WHEN 'professional' THEN 1000 -- 1 second
            WHEN 'enterprise' THEN 100   -- 100ms
            ELSE 30000
        END as update_interval_ms
    FROM companies
    WHERE id = company_id;
END;
$function$;

-- Function: get_user_session_timeout
CREATE OR REPLACE FUNCTION public.get_user_session_timeout(user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- Function: create_company_join_request
CREATE OR REPLACE FUNCTION public.create_company_join_request(p_company_id uuid, p_user_id uuid, p_email text, p_full_name text DEFAULT NULL::text, p_message text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- Function: custom_access_token_hook
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- Function: find_similar_companies
CREATE OR REPLACE FUNCTION public.find_similar_companies(company_name_input text, user_email text DEFAULT NULL::text)
RETURNS TABLE(company_id uuid, company_name text, similarity_score real, email_domain text, can_auto_join boolean, member_count integer, allows_join_requests boolean, requires_approval boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$;

-- Function: cleanup_expired_uploads
CREATE OR REPLACE FUNCTION public.cleanup_expired_uploads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    -- Mark files as failed if upload didn't complete within 24 hours
    UPDATE transfer_files
    SET
        status = 'failed',
        error_message = 'Upload timeout'
    WHERE
        status = 'uploading'
        AND upload_started_at < NOW() - INTERVAL '24 hours';
END;
$function$;

-- Function: create_user_preferences
CREATE OR REPLACE FUNCTION public.create_user_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Temporarily disable RLS for this operation since we're creating initial user data
  SET LOCAL row_security = off;
  
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

-- Function: log_audit_event
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_event_type text, 
    p_event_category text, 
    p_severity text, 
    p_actor_type text, 
    p_actor_id uuid, 
    p_action text, 
    p_result text, 
    p_metadata jsonb DEFAULT NULL::jsonb, 
    p_company_id uuid DEFAULT NULL::uuid, 
    p_project_id uuid DEFAULT NULL::uuid, 
    p_resource_type text DEFAULT NULL::text, 
    p_resource_id uuid DEFAULT NULL::uuid, 
    p_error_code text DEFAULT NULL::text, 
    p_error_message text DEFAULT NULL::text, 
    p_ip_address inet DEFAULT NULL::inet, 
    p_user_agent text DEFAULT NULL::text, 
    p_request_id text DEFAULT NULL::text, 
    p_request_method text DEFAULT NULL::text, 
    p_request_path text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO audit_logs (
        event_type,
        event_category,
        severity,
        actor_type,
        actor_id,
        action,
        result,
        metadata,
        company_id,
        project_id,
        resource_type,
        resource_id,
        error_code,
        error_message,
        ip_address,
        user_agent,
        request_id,
        request_method,
        request_path
    ) VALUES (
        p_event_type,
        p_event_category,
        p_severity,
        p_actor_type,
        p_actor_id,
        p_action,
        p_result,
        p_metadata,
        p_company_id,
        p_project_id,
        p_resource_type,
        p_resource_id,
        p_error_code,
        p_error_message,
        p_ip_address,
        p_user_agent,
        p_request_id,
        p_request_method,
        p_request_path
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$function$;

-- Function: handle_new_user (updated to fix user creation RLS issues)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    new_company_id UUID;
    new_project_id UUID;
    company_name TEXT;
    company_slug TEXT;
BEGIN
    -- Temporarily disable RLS for this operation since we're creating initial user data
    SET LOCAL row_security = off;
    
    -- Create user profile with email
    INSERT INTO public.user_profiles (id, full_name, avatar_url, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        NEW.email
    );

    -- Create company if provided in metadata
    IF NEW.raw_user_meta_data->>'company_name' IS NOT NULL THEN
        company_name := NEW.raw_user_meta_data->>'company_name';
        company_slug := LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'));

        -- Ensure unique slug
        WHILE EXISTS (SELECT 1 FROM public.companies WHERE slug = company_slug) LOOP
            company_slug := company_slug || '-' || substring(md5(random()::text) from 1 for 4);
        END LOOP;

        -- Create company
        INSERT INTO public.companies (name, slug)
        VALUES (company_name, company_slug)
        RETURNING id INTO new_company_id;

        -- Add user as owner of the company
        INSERT INTO public.company_members (company_id, user_id, role)
        VALUES (new_company_id, NEW.id, 'owner');

        -- Update user profile with company_id
        UPDATE public.user_profiles
        SET company_id = new_company_id
        WHERE id = NEW.id;

        -- Create default project
        INSERT INTO public.projects (company_id, name, slug)
        VALUES (new_company_id, 'Default Project', 'default')
        RETURNING id INTO new_project_id;

        -- Add user as admin of default project (not owner - that's a company role)
        INSERT INTO public.project_members (project_id, user_id, role, added_by)
        VALUES (new_project_id, NEW.id, 'admin', NEW.id);
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log error but don't prevent user creation
        RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$function$;

-- Function: review_company_join_request
CREATE OR REPLACE FUNCTION public.review_company_join_request(
    p_request_id uuid, 
    p_reviewer_id uuid, 
    p_action text, 
    p_notes text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
$function$; 