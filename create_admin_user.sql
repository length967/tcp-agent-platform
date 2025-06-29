-- Create Admin User Script
-- Run this after each database reset to create mark.johns@me.com with full admin permissions

-- First, ensure required extensions are available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the user in auth.users table
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'authenticated',
  'authenticated',
  'mark.johns@me.com',
  crypt('Dal3tplus1', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Mark Johns", "avatar_url": null}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- Create identity for the user
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '{"sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890", "email": "mark.johns@me.com", "email_verified": true, "phone_verified": false}',
  'email',
  NOW(),
  NOW(),
  NOW()
) ON CONFLICT (provider, provider_id) DO NOTHING;

-- Create the company with premium subscription
INSERT INTO companies (
  id,
  name,
  slug,
  subscription_status,
  subscription_ends_at,
  settings,
  created_at,
  updated_at
) VALUES (
  'c0mpany1-2345-6789-abcd-ef1234567890',
  'Mediamasters',
  'mediamasters',
  'enterprise',
  NOW() + INTERVAL '1 year',
  '{"max_users": 1000, "max_projects": 100, "max_storage_gb": 1000, "ai_features": true, "priority_support": true, "custom_branding": true, "sso_enabled": true, "audit_logs": true, "advanced_analytics": true}',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  subscription_status = EXCLUDED.subscription_status,
  subscription_ends_at = EXCLUDED.subscription_ends_at,
  settings = EXCLUDED.settings,
  updated_at = NOW();

-- Create user profile
INSERT INTO user_profiles (
  id,
  full_name,
  email,
  company_id,
  avatar_url,
  preferences,
  created_at,
  updated_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Mark Johns',
  'mark.johns@me.com',
  'c0mpany1-2345-6789-abcd-ef1234567890',
  null,
  '{"theme": "dark", "notifications": true, "timezone": "UTC", "language": "en"}',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  company_id = EXCLUDED.company_id,
  preferences = EXCLUDED.preferences,
  updated_at = NOW();

-- Add user as company owner with maximum permissions
INSERT INTO company_members (
  company_id,
  user_id,
  role,
  permissions,
  joined_at,
  is_active
) VALUES (
  'c0mpany1-2345-6789-abcd-ef1234567890',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'owner',
  '{"admin": true, "billing": true, "user_management": true, "project_management": true, "agent_management": true, "transfer_management": true, "analytics": true, "settings": true, "api_access": true, "audit_logs": true}',
  NOW(),
  true
) ON CONFLICT (company_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  is_active = EXCLUDED.is_active;

-- Create a default project
INSERT INTO projects (
  id,
  company_id,
  name,
  slug,
  settings,
  created_at,
  updated_at
) VALUES (
  'pr0ject1-2345-6789-abcd-ef1234567890',
  'c0mpany1-2345-6789-abcd-ef1234567890',
  'Default Project',
  'default',
  '{"max_agents": 100, "max_concurrent_transfers": 50, "retention_days": 365, "encryption_enabled": true, "compression_enabled": true}',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  settings = EXCLUDED.settings,
  updated_at = NOW();

-- Add user as project owner
INSERT INTO project_members (
  project_id,
  user_id,
  role,
  permissions,
  added_at,
  added_by,
  is_active
) VALUES (
  'pr0ject1-2345-6789-abcd-ef1234567890',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'owner',
  '{"admin": true, "agent_management": true, "transfer_management": true, "analytics": true, "settings": true, "member_management": true}',
  NOW(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  true
) ON CONFLICT (project_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  is_active = EXCLUDED.is_active;

-- Create user preferences
INSERT INTO user_preferences (
  user_id,
  session_timeout_minutes,
  theme,
  notifications_enabled,
  email_notifications,
  timezone,
  language,
  created_at,
  updated_at
) VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  480, -- 8 hours
  'dark',
  true,
  '{"transfer_complete": true, "agent_offline": true, "system_alerts": true, "weekly_reports": true}',
  'UTC',
  'en',
  NOW(),
  NOW()
) ON CONFLICT (user_id) DO UPDATE SET
  session_timeout_minutes = EXCLUDED.session_timeout_minutes,
  theme = EXCLUDED.theme,
  notifications_enabled = EXCLUDED.notifications_enabled,
  email_notifications = EXCLUDED.email_notifications,
  timezone = EXCLUDED.timezone,
  language = EXCLUDED.language,
  updated_at = NOW();

-- Add company timezone settings
INSERT INTO company_timezone_settings (
  company_id,
  default_timezone,
  allowed_timezones,
  enforce_timezone,
  created_at,
  updated_at
) VALUES (
  'c0mpany1-2345-6789-abcd-ef1234567890',
  'UTC',
  '["UTC", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"]',
  false,
  NOW(),
  NOW()
) ON CONFLICT (company_id) DO UPDATE SET
  default_timezone = EXCLUDED.default_timezone,
  allowed_timezones = EXCLUDED.allowed_timezones,
  enforce_timezone = EXCLUDED.enforce_timezone,
  updated_at = NOW();

-- Print confirmation
SELECT 
  'User created successfully!' as message,
  u.email,
  up.full_name,
  c.name as company_name,
  cm.role as company_role,
  c.subscription_status
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
JOIN companies c ON up.company_id = c.id
JOIN company_members cm ON c.id = cm.company_id AND u.id = cm.user_id
WHERE u.email = 'mark.johns@me.com'; 