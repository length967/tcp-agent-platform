-- Fix ALL functions with search_path = public to use search_path = ''
-- This addresses the security warning that requires search_path to be an empty string
-- not 'public' to prevent search path injection attacks

-- Functions from 20250129_fix_security_definer_search_path.sql that need fixing
ALTER FUNCTION public.validate_file_upload SET search_path = '';
ALTER FUNCTION public.get_project_storage_usage SET search_path = '';
ALTER FUNCTION public.sync_user_email SET search_path = '';
ALTER FUNCTION public.get_company_timezone_info SET search_path = '';
ALTER FUNCTION public.update_user_preferences_updated_at SET search_path = '';
ALTER FUNCTION public.cleanup_expired_tokens SET search_path = '';
ALTER FUNCTION public.get_telemetry_settings SET search_path = '';
ALTER FUNCTION public.get_user_session_timeout SET search_path = '';
ALTER FUNCTION public.create_company_join_request SET search_path = '';
ALTER FUNCTION public.custom_access_token_hook SET search_path = '';
ALTER FUNCTION public.find_similar_companies SET search_path = '';
ALTER FUNCTION public.cleanup_expired_uploads SET search_path = '';
ALTER FUNCTION public.create_user_preferences SET search_path = '';
ALTER FUNCTION public.log_audit_event SET search_path = '';
ALTER FUNCTION public.handle_new_user SET search_path = '';
ALTER FUNCTION public.review_company_join_request SET search_path = '';

-- Functions from 20250130_01_rbac_and_invitations.sql that need fixing
ALTER FUNCTION public.is_company_member SET search_path = '';
ALTER FUNCTION public.get_company_role SET search_path = '';
ALTER FUNCTION public.get_project_role SET search_path = '';
ALTER FUNCTION public.get_effective_project_role SET search_path = '';
ALTER FUNCTION public.accept_invitation SET search_path = '';

-- Functions from 20250132_rls_performance_optimizations.sql that need fixing
ALTER FUNCTION public.user_company_ids SET search_path = '';
ALTER FUNCTION public.user_project_ids SET search_path = '';
ALTER FUNCTION public.has_permission SET search_path = '';

-- Function from 20250626_company_timezone_settings.sql that needs fixing
ALTER FUNCTION public.is_business_hours SET search_path = '';