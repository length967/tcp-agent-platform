#!/usr/bin/env node

/**
 * Test script for Phase 0 migrations
 * Verifies that all security foundation migrations work correctly
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Create Supabase client with service role key (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testMigrations() {
  console.log('🔍 Testing Phase 0 migrations...\n');

  try {
    // Test 1: Check if RBAC types were created
    console.log('1️⃣ Testing RBAC types...');
    const { data: companyRoles, error: companyRoleError } = await supabase
      .rpc('get_enum_values', { enum_name: 'company_role' });
    
    if (companyRoleError) {
      console.error('❌ Failed to get company_role enum:', companyRoleError);
    } else {
      console.log('✅ company_role enum exists with values:', companyRoles);
    }

    // Test 2: Check if invitations table exists
    console.log('\n2️⃣ Testing invitations table...');
    const { error: invitationsError } = await supabase
      .from('invitations')
      .select('id')
      .limit(1);
    
    if (invitationsError) {
      console.error('❌ Failed to query invitations table:', invitationsError);
    } else {
      console.log('✅ Invitations table exists and is queryable');
    }

    // Test 3: Check if company columns exist
    console.log('\n3️⃣ Testing company columns...');
    const { data: companyColumns, error: columnsError } = await supabase
      .rpc('get_table_columns', { table_name: 'companies' });
    
    const requiredColumns = ['email_domain', 'allow_domain_signup'];
    const existingColumns = companyColumns?.map(col => col.column_name) || [];
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.error('❌ Missing company columns:', missingColumns);
    } else {
      console.log('✅ All required company columns exist');
    }

    // Test 4: Check if audit schema exists
    console.log('\n4️⃣ Testing audit infrastructure...');
    const { data: auditSchema, error: auditError } = await supabase
      .rpc('schema_exists', { schema_name: 'audit' });
    
    if (!auditSchema) {
      console.error('❌ Audit schema does not exist');
    } else {
      console.log('✅ Audit schema exists');
      
      // Check audit.logs table
      const { error: auditLogsError } = await supabase
        .from('audit.logs')
        .select('id')
        .limit(1);
      
      if (auditLogsError) {
        console.error('❌ Failed to query audit.logs table:', auditLogsError);
      } else {
        console.log('✅ Audit logs table exists and is queryable');
      }
    }

    // Test 5: Check RLS helper functions
    console.log('\n5️⃣ Testing RLS helper functions...');
    const helperFunctions = [
      'auth.user_company_ids',
      'auth.user_project_ids',
      'auth.has_permission'
    ];
    
    for (const func of helperFunctions) {
      const { data: funcExists, error: funcError } = await supabase
        .rpc('function_exists', { function_name: func });
      
      if (!funcExists) {
        console.error(`❌ Function ${func} does not exist`);
      } else {
        console.log(`✅ Function ${func} exists`);
      }
    }

    // Test 6: Check critical indexes
    console.log('\n6️⃣ Testing performance indexes...');
    const criticalIndexes = [
      'idx_company_members_user_company_active',
      'idx_project_members_user_project',
      'idx_audit_logs_created_at_brin'
    ];
    
    for (const idx of criticalIndexes) {
      const { data: indexExists, error: indexError } = await supabase
        .rpc('index_exists', { index_name: idx });
      
      if (!indexExists) {
        console.error(`❌ Index ${idx} does not exist`);
      } else {
        console.log(`✅ Index ${idx} exists`);
      }
    }

    console.log('\n✅ All Phase 0 migration tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Helper RPC functions that need to be created for testing
const helperFunctions = `
-- Helper function to get enum values
CREATE OR REPLACE FUNCTION get_enum_values(enum_name text)
RETURNS TABLE(value text) AS $$
BEGIN
  RETURN QUERY
  SELECT unnest(enum_range(NULL::text))::text
  FROM pg_type
  WHERE typname = enum_name;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get table columns
CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
RETURNS TABLE(column_name text, data_type text) AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::text, c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_name = $1
    AND c.table_schema = 'public';
END;
$$ LANGUAGE plpgsql;

-- Helper function to check if schema exists
CREATE OR REPLACE FUNCTION schema_exists(schema_name text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = $1
  );
END;
$$ LANGUAGE plpgsql;

-- Helper function to check if function exists
CREATE OR REPLACE FUNCTION function_exists(function_name text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname || '.' || p.proname = $1
  );
END;
$$ LANGUAGE plpgsql;

-- Helper function to check if index exists
CREATE OR REPLACE FUNCTION index_exists(index_name text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = $1
  );
END;
$$ LANGUAGE plpgsql;
`;

console.log('📝 Creating helper functions for testing...');
const { error: helperError } = await supabase.rpc('exec_sql', { sql: helperFunctions });
if (helperError) {
  console.log('⚠️  Some helper functions might already exist, continuing...');
}

// Run the tests
testMigrations().catch(console.error);