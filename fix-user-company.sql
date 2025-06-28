-- Check if user exists and their current company association
SELECT 
    u.id as user_id,
    u.email,
    up.company_id,
    c.name as company_name,
    cm.role as member_role
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
LEFT JOIN companies c ON up.company_id = c.id
LEFT JOIN company_members cm ON u.id = cm.user_id AND c.id = cm.company_id
WHERE u.email = 'mark.johns@me.com';

-- If the user doesn't have a company, create one and associate them
-- First, check if any companies exist
SELECT * FROM companies;

-- If no company exists for the user, uncomment and run these:
/*
-- Create a company
INSERT INTO companies (name, slug) 
VALUES ('Mark Johns Company', 'mark-johns-company')
ON CONFLICT (slug) DO NOTHING
RETURNING id;

-- Get the user id
WITH user_info AS (
    SELECT id FROM auth.users WHERE email = 'mark.johns@me.com'
),
company_info AS (
    SELECT id FROM companies WHERE slug = 'mark-johns-company'
)
-- Add user as company owner
INSERT INTO company_members (company_id, user_id, role)
SELECT company_info.id, user_info.id, 'owner'
FROM user_info, company_info
ON CONFLICT (company_id, user_id) DO NOTHING;

-- Update user profile with company_id
WITH company_info AS (
    SELECT id FROM companies WHERE slug = 'mark-johns-company'
)
UPDATE user_profiles
SET company_id = company_info.id
FROM company_info
WHERE user_profiles.id = (SELECT id FROM auth.users WHERE email = 'mark.johns@me.com');

-- Create a default project for the company
WITH company_info AS (
    SELECT id FROM companies WHERE slug = 'mark-johns-company'
),
user_info AS (
    SELECT id FROM auth.users WHERE email = 'mark.johns@me.com'
)
INSERT INTO projects (company_id, name, slug)
SELECT company_info.id, 'Default Project', 'default'
FROM company_info
ON CONFLICT (company_id, slug) DO NOTHING
RETURNING id;

-- Add user as project admin
WITH project_info AS (
    SELECT p.id 
    FROM projects p
    JOIN companies c ON p.company_id = c.id
    WHERE c.slug = 'mark-johns-company' AND p.slug = 'default'
),
user_info AS (
    SELECT id FROM auth.users WHERE email = 'mark.johns@me.com'
)
INSERT INTO project_members (project_id, user_id, role, added_by)
SELECT project_info.id, user_info.id, 'admin', user_info.id
FROM project_info, user_info
ON CONFLICT (project_id, user_id) DO NOTHING;
*/

-- Verify the fix
SELECT 
    u.id as user_id,
    u.email,
    up.company_id,
    c.name as company_name,
    cm.role as member_role,
    p.name as project_name,
    pm.role as project_role
FROM auth.users u
LEFT JOIN user_profiles up ON u.id = up.id
LEFT JOIN companies c ON up.company_id = c.id
LEFT JOIN company_members cm ON u.id = cm.user_id AND c.id = cm.company_id
LEFT JOIN projects p ON p.company_id = c.id
LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = u.id
WHERE u.email = 'mark.johns@me.com';