# TCP Agent Platform Setup Documentation

## Overview
This document covers the work done to resolve team API errors and set up proper user authentication for the TCP Agent Platform.

## Initial Problem
- Team API endpoint returning 500 Internal Server Error: `GET http://127.0.0.1:54321/functions/v1/api-gateway/team`
- JavaScript error in auth-interceptor.ts: `events.forEach(...) is not a function` at line 240
- No test user data available for testing

## Root Cause Analysis
1. **Database Schema Missing**: After database resets, the public schema tables weren't being created
2. **Migration Issues**: Migrations weren't being applied consistently during `supabase db reset`
3. **User Creation Trigger Problems**: The `handle_new_user()` trigger was causing database errors
4. **Missing PostgreSQL Client**: `psql` command wasn't available for direct database access

## Solutions Implemented

### 1. Created Admin User Setup Scripts

#### `create_admin_user.sql`
- Comprehensive SQL script to create admin user after each database reset
- Creates user: `mark.johns@me.com` with password: `Dal3tplus1`
- Creates company: "Mediamasters" with enterprise subscription
- Sets maximum admin permissions across all areas
- Includes:
  - User in `auth.users` table with proper authentication
  - User identity in `auth.identities` table
  - Company with enterprise-level subscription (1 year validity)
  - User profile with full admin permissions
  - Company membership as owner role
  - Default project with user as project owner
  - User preferences and timezone settings

#### `setup_admin_user.sh`
- Shell script to execute the SQL script using `psql`
- Made executable with `chmod +x`
- Provides user-friendly output and instructions

### 2. Database Reset Process
- Successfully ran `supabase db reset` which applied all migrations:
  - 20250122_initial_schema.sql (core tables)
  - 20250127_company_join_requests.sql
  - 20250128_fix_rls_performance.sql
  - Multiple other migrations for RBAC, audit logging, etc.
- All migrations applied successfully with some policy notices (expected)

### 3. PostgreSQL Client Installation
- Installed PostgreSQL client tools via Homebrew: `brew install postgresql`
- This provides the `psql` command needed to execute SQL scripts directly
- Located at: `/opt/homebrew/bin/psql`

## Current State

### What's Working
- Local Supabase instance running on 127.0.0.1:54321
- Database schema properly migrated with all tables
- Edge Functions server running with CORS configured
- PostgreSQL client tools installed and available

### What's Pending
- Admin user creation script execution (interrupted during password prompt)
- Team API testing with authenticated user
- Verification that auth-interceptor.js error is resolved

### Files Created
1. `tcp-agent-platform/create_admin_user.sql` - Complete admin user setup script
2. `tcp-agent-platform/setup_admin_user.sh` - Executable shell script (chmod +x applied)

## Next Steps
1. Complete the admin user setup by running `./setup_admin_user.sh`
2. Enter the PostgreSQL password when prompted (likely "postgres")
3. Test user login with:
   - Email: mark.johns@me.com
   - Password: Dal3tplus1
4. Test the team API endpoint with authenticated user
5. Verify the auth-interceptor.js error is resolved

## Database Connection Details
- **Host**: 127.0.0.1
- **Port**: 54322 (PostgreSQL direct)
- **Database**: postgres
- **User**: postgres
- **API Port**: 54321 (Supabase API)

## Admin User Details
When setup is complete:
- **Email**: mark.johns@me.com
- **Password**: Dal3tplus1
- **Company**: Mediamasters
- **Role**: Owner (maximum permissions)
- **Subscription**: Enterprise (1 year)
- **Features**: All premium features enabled

## Commands Reference
```bash
# Reset database and apply migrations
supabase db reset

# Setup admin user (after each reset)
./setup_admin_user.sh

# Or run SQL directly
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f create_admin_user.sql

# Test team API (after authentication)
curl -H 'Authorization: Bearer [JWT_TOKEN]' http://127.0.0.1:54321/functions/v1/api-gateway/team
```

## Technical Notes
- The SQL script uses `ON CONFLICT` clauses making it safe to run multiple times
- All UUIDs are hardcoded for consistency
- Enterprise subscription includes max limits and all premium features
- User has full admin permissions across company, projects, and system settings 