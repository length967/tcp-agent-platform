-- Test script to create a user and company after migration
-- This can be run in the Supabase SQL editor for testing

-- First, create a test user through Supabase Auth
-- (This would normally happen through the signup form)

-- After user is created via auth signup, you can test the company creation:
-- Replace 'USER_ID_HERE' with the actual user ID from auth.users table

/*
Example usage after a user signs up:

SELECT create_company_with_owner(
  'Acme Corporation',
  'acme-corp',
  'USER_ID_HERE',
  'John Doe'
);
*/

-- Query to check the setup:
/*
SELECT 
  c.name as company_name,
  c.slug as company_slug,
  c.subscription_tier,
  cm.role as user_role,
  u.email as user_email,
  up.full_name
FROM companies c
JOIN company_members cm ON c.id = cm.company_id
JOIN auth.users u ON cm.user_id = u.id
JOIN user_profiles up ON u.id = up.id;
*/