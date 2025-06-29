-- Fix remaining functions with mutable search paths
-- This migration addresses security warnings about functions without explicit search_path settings
-- Setting search_path = '' prevents search path injection attacks

-- Function: audit.log_security_event
ALTER FUNCTION audit.log_security_event SET search_path = '';

-- Function: audit.log_change
ALTER FUNCTION audit.log_change SET search_path = '';

-- Function: audit.set_context
ALTER FUNCTION audit.set_context SET search_path = '';

-- Function: public.update_updated_at_column
ALTER FUNCTION public.update_updated_at_column SET search_path = '';

-- Function: public.revoke_expired_invitations
ALTER FUNCTION public.revoke_expired_invitations SET search_path = '';

-- Function: public.cleanup_old_telemetry
ALTER FUNCTION public.cleanup_old_telemetry SET search_path = '';

-- Function: public.refresh_realtime_stats
ALTER FUNCTION public.refresh_realtime_stats SET search_path = '';

-- Function: public.create_monthly_partition
ALTER FUNCTION public.create_monthly_partition SET search_path = '';

-- Note: The following functions were already fixed in the previous migration:
-- - public.handle_new_user
-- - public.update_user_preferences_updated_at
-- - public.get_project_storage_usage
-- - public.sync_user_email
-- - public.get_company_timezone_info
-- - public.validate_file_upload
-- - public.cleanup_expired_tokens
-- - public.get_telemetry_settings
-- - public.get_user_session_timeout
-- - public.create_company_join_request
-- - public.custom_access_token_hook
-- - public.find_similar_companies
-- - public.cleanup_expired_uploads
-- - public.create_user_preferences
-- - public.log_audit_event
-- - public.review_company_join_request