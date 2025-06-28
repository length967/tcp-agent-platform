-- Check if user has any projects
SELECT 
    p.*,
    pm.role,
    pm.user_id
FROM projects p
JOIN project_members pm ON p.id = pm.project_id
WHERE pm.user_id = (SELECT id FROM auth.users WHERE email = 'mark.johns@me.com');
