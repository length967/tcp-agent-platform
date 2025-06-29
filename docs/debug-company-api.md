# Company API Debug Guide

## Issue Summary
The Company page shows "No Company Found" even though the user has a company in the database.

## Debug Steps

### 1. Check Browser Network Tab
Open Developer Tools (F12) and go to the Network tab, then refresh the Company page.

Look for the API call to `/company` and check:
- Status code (should be 200)
- Response body (what data is returned)
- Request headers (especially Authorization header)

### 2. Test API Directly
Open a new terminal and test the API endpoint directly using curl:

```bash
# First, get your auth token from the browser
# In DevTools Console, run: 
# JSON.parse(localStorage.getItem('sb-fzbhqwzhpsajtunsppnn-auth-token')).access_token

# Then use it in this curl command:
curl -X GET \
  'http://localhost:54321/functions/v1/api-gateway/company' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE' \
  -H 'Content-Type: application/json' \
  -v
```

### 3. Check Supabase Functions Logs
In another terminal, check the function logs:
```bash
npx supabase functions logs --tail
```

### 4. Potential Issues to Check

1. **Route Matching Issue**
   - The API path might not be matching correctly
   - Check if the request is reaching the company-settings handler

2. **Middleware Chain Issue**
   - withUser might be failing
   - withTenant might be throwing an error
   - Context might not be passed correctly

3. **Company Query Issue**
   - The company query in getCompanySettings might be failing
   - RLS policies might be blocking the query

### 5. Quick Fix Attempts

1. **Check if functions are running:**
   ```bash
   npx supabase status
   ```

2. **Restart functions:**
   ```bash
   npx supabase functions serve --no-verify-jwt
   ```

3. **Check the actual error in the API response:**
   - Look at the response body in Network tab
   - It might contain an error message

### 6. Database Verification
Run this query in Supabase Studio SQL Editor:

```sql
-- Check user's company association
SELECT 
    u.id as user_id,
    u.email,
    up.company_id,
    c.*,
    cm.role
FROM auth.users u
JOIN user_profiles up ON u.id = up.id
JOIN companies c ON up.company_id = c.id
JOIN company_members cm ON u.id = cm.user_id AND c.id = cm.company_id
WHERE u.email = 'mark.johns@me.com';
```

## Expected vs Actual

**Expected:** 
- API returns company data with all settings

**Actual:** 
- API returns null or empty response causing "No Company Found" message

## Next Steps
Based on what you find in the Network tab and logs, we can pinpoint the exact issue.