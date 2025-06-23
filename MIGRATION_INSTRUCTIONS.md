# Database Migration Instructions

## Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/qalcyeaxuivvgqukrpzt

2. Navigate to the SQL Editor (in the left sidebar)

3. Copy the entire contents of `supabase/migrations/20250122_initial_schema.sql`

4. Paste it into the SQL editor

5. Click "Run" to execute the migration

## Option 2: Using Supabase CLI

1. First, you need your database password from the Supabase dashboard:
   - Go to Settings → Database
   - Copy the database password

2. Create a `.env` file with:
   ```
   SUPABASE_DB_URL=postgresql://postgres.qalcyeaxuivvgqukrpzt:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

3. Run:
   ```bash
   npx supabase db push --db-url "$SUPABASE_DB_URL"
   ```

## Option 3: Using psql

1. Install PostgreSQL client if not already installed

2. Connect directly:
   ```bash
   psql "postgresql://postgres.qalcyeaxuivvgqukrpzt:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" < supabase/migrations/20250122_initial_schema.sql
   ```

## Verify Migration

After running the migration, you can verify it worked by:

1. Going to the Table Editor in Supabase dashboard
2. You should see the following tables:
   - companies
   - projects
   - user_profiles
   - company_members
   - project_members
   - agents
   - agent_heartbeats
   - transfers

## Next Steps

Once the migration is complete:

1. The authentication system is ready to use
2. Visit http://localhost:3000 to see the login page
3. Create a new account to test the signup flow
4. The system will automatically create a company for new users