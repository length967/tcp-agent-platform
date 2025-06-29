-- Temporarily disable the problematic trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create test user directly
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
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  'authenticated',
  'authenticated', 
  'mark.johns@me.com',
  crypt('testpass123', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Mark Johns"}',
  NOW(),
  NOW()
);

-- Create company manually
INSERT INTO companies (id, name, slug) VALUES 
('c1234567-1234-1234-1234-123456789012', 'Johns Tech Solutions', 'johns-tech-solutions');

-- Create user profile manually  
INSERT INTO user_profiles (id, full_name, email, company_id) VALUES
('28e8f697-64f9-4410-b723-b2c8b11dee8b', 'Mark Johns', 'mark.johns@me.com', 'c1234567-1234-1234-1234-123456789012');

-- Add user as company member
INSERT INTO company_members (company_id, user_id, role) VALUES
('c1234567-1234-1234-1234-123456789012', '28e8f697-64f9-4410-b723-b2c8b11dee8b', 'owner');

-- Create default project
INSERT INTO projects (id, company_id, name, slug) VALUES
('p1234567-1234-1234-1234-123456789012', 'c1234567-1234-1234-1234-123456789012', 'Default Project', 'default');

-- Add user as project member
INSERT INTO project_members (project_id, user_id, role, added_by) VALUES
('p1234567-1234-1234-1234-123456789012', '28e8f697-64f9-4410-b723-b2c8b11dee8b', 'owner', '28e8f697-64f9-4410-b723-b2c8b11dee8b');

-- Re-enable the trigger (but with a simple version that won't fail)
CREATE OR REPLACE FUNCTION handle_new_user_simple()
RETURNS TRIGGER AS $$
BEGIN
    -- Create user profile only
    INSERT INTO user_profiles (id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email)
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user_simple(); 
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create test user directly
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
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '28e8f697-64f9-4410-b723-b2c8b11dee8b',
  'authenticated',
  'authenticated', 
  'mark.johns@me.com',
  crypt('testpass123', gen_salt('bf')),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Mark Johns"}',
  NOW(),
  NOW()
);

-- Create company manually
INSERT INTO companies (id, name, slug) VALUES 
('c1234567-1234-1234-1234-123456789012', 'Johns Tech Solutions', 'johns-tech-solutions');

-- Create user profile manually  
INSERT INTO user_profiles (id, full_name, email, company_id) VALUES
('28e8f697-64f9-4410-b723-b2c8b11dee8b', 'Mark Johns', 'mark.johns@me.com', 'c1234567-1234-1234-1234-123456789012');

-- Add user as company member
INSERT INTO company_members (company_id, user_id, role) VALUES
('c1234567-1234-1234-1234-123456789012', '28e8f697-64f9-4410-b723-b2c8b11dee8b', 'owner');

-- Create default project
INSERT INTO projects (id, company_id, name, slug) VALUES
('p1234567-1234-1234-1234-123456789012', 'c1234567-1234-1234-1234-123456789012', 'Default Project', 'default');

-- Add user as project member
INSERT INTO project_members (project_id, user_id, role, added_by) VALUES
('p1234567-1234-1234-1234-123456789012', '28e8f697-64f9-4410-b723-b2c8b11dee8b', 'owner', '28e8f697-64f9-4410-b723-b2c8b11dee8b');

-- Re-enable the trigger (but with a simple version that won't fail)
CREATE OR REPLACE FUNCTION handle_new_user_simple()
RETURNS TRIGGER AS $$
BEGIN
    -- Create user profile only
    INSERT INTO user_profiles (id, full_name, email)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email)
    ON CONFLICT (id) DO NOTHING;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user_simple(); 