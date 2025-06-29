-- Disable the trigger temporarily
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Insert test user directly into auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  'authenticated',
  'authenticated',
  'mark.johns@me.com',
  crypt('testpass123', gen_salt('bf')),
  NOW(),
  NULL,
  '',
  NULL,
  '',
  NULL,
  '',
  '',
  NULL,
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Mark Johns", "company_name": "Johns Tech Solutions", "admin_level": "system", "email_verified": true, "is_super_admin": true, "role": "system_admin", "saas_admin": true}',
  false,
  NOW(),
  NOW(),
  NULL,
  NULL,
  '',
  '',
  NULL,
  '',
  0,
  NULL,
  '',
  NULL,
  false,
  NULL
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data,
  updated_at = NOW();

-- Create company
INSERT INTO companies (id, name, slug, created_at, updated_at, settings, subscription_status)
VALUES (
  'c1234567-1234-1234-1234-123456789012',
  'Johns Tech Solutions',
  'johns-tech-solutions',
  NOW(),
  NOW(),
  '{}',
  'active'
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- Create user profile
INSERT INTO user_profiles (id, full_name, email, company_id, created_at, updated_at, preferences)
VALUES (
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  'Mark Johns',
  'mark.johns@me.com',
  'c1234567-1234-1234-1234-123456789012',
  NOW(),
  NOW(),
  '{}'
) ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  company_id = EXCLUDED.company_id,
  updated_at = NOW();

-- Add user as company member
INSERT INTO company_members (company_id, user_id, role, joined_at, permissions)
VALUES (
  'c1234567-1234-1234-1234-123456789012',
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  'owner',
  NOW(),
  '{}'
) ON CONFLICT (company_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions;

-- Create default project
INSERT INTO projects (id, company_id, name, slug, created_at, updated_at, settings)
VALUES (
  'p1234567-1234-1234-1234-123456789012',
  'c1234567-1234-1234-1234-123456789012',
  'Default Project',
  'default',
  NOW(),
  NOW(),
  '{}'
) ON CONFLICT (company_id, slug) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

-- Add user as project member
INSERT INTO project_members (project_id, user_id, role, added_at, added_by, permissions)
VALUES (
  'p1234567-1234-1234-1234-123456789012',
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  'owner',
  NOW(),
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  '{}'
) ON CONFLICT (project_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions;

-- Re-enable the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user(); 