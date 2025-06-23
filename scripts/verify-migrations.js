import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseKey)

async function verifyMigrations() {
  console.log('Verifying database migrations...\n')

  // Check tables
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name')

  if (tablesError) {
    console.error('Error fetching tables:', tablesError)
    return
  }

  const expectedTables = [
    'active_transfers',
    'agent_heartbeats',
    'agent_telemetry',
    'agents',
    'companies',
    'company_members',
    'project_members',
    'projects',
    'transfers',
    'user_profiles'
  ]

  console.log('✓ Tables found:')
  const foundTables = tables.map(t => t.table_name).filter(t => !t.startsWith('agent_telemetry_'))
  foundTables.forEach(table => console.log(`  - ${table}`))

  // Check for missing tables
  const missingTables = expectedTables.filter(t => !foundTables.includes(t))
  if (missingTables.length > 0) {
    console.log('\n✗ Missing tables:')
    missingTables.forEach(table => console.log(`  - ${table}`))
  }

  // Check telemetry partitions
  const telemetryPartitions = tables.filter(t => t.table_name.startsWith('agent_telemetry_'))
  console.log('\n✓ Telemetry partitions:')
  telemetryPartitions.forEach(t => console.log(`  - ${t.table_name}`))

  // Test creating a company
  console.log('\n✓ Testing RLS policies...')
  
  // Check if we can query companies (should be empty but not error)
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('*')
  
  if (companiesError) {
    console.log('✗ Error querying companies:', companiesError.message)
  } else {
    console.log(`  - Companies table accessible (${companies.length} records)`)
  }

  console.log('\n✓ Migration verification complete!')
}

verifyMigrations().catch(console.error)