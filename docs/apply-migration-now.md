# Quick Migration Steps

Since you've just added the Supabase MCP server, you can apply the migration using the Supabase Dashboard:

1. **Open the SQL Editor**:
   https://supabase.com/dashboard/project/qalcyeaxuivvgqukrpzt/sql

2. **Copy and paste** the entire contents of:
   `/Users/mjohns/Software Development/srt-agent-v1/tcp-agent-platform/supabase/migrations/20250122_initial_schema.sql`

3. **Click "Run"** to execute the migration

## What This Creates:

- ✅ 8 tables with proper relationships
- ✅ Row Level Security policies for multi-tenancy
- ✅ Automatic timestamp triggers
- ✅ Helper functions for user/company creation
- ✅ Proper indexes for performance

## Verify Success:

After running, go to the Table Editor:
https://supabase.com/dashboard/project/qalcyeaxuivvgqukrpzt/editor

You should see all the new tables with RLS enabled (shield icon).

## Next Steps:

Once migration is complete:
1. Visit http://localhost:3000
2. Click "Sign up" to create a test account
3. The system will automatically create a company for you
4. You'll be redirected to the dashboard after email verification