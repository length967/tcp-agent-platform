import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function testDatabase() {
  console.log('Testing database setup...\n')

  try {
    // Test 1: Check companies table
    console.log('1. Testing companies table:')
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')
    
    if (companiesError) {
      console.log('   ✗ Error:', companiesError.message)
    } else {
      console.log(`   ✓ Success: ${companies.length} companies found`)
    }

    // Test 2: Check projects table
    console.log('\n2. Testing projects table:')
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
    
    if (projectsError) {
      console.log('   ✗ Error:', projectsError.message)
    } else {
      console.log(`   ✓ Success: ${projects.length} projects found`)
    }

    // Test 3: Check agents table
    console.log('\n3. Testing agents table:')
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
    
    if (agentsError) {
      console.log('   ✗ Error:', agentsError.message)
    } else {
      console.log(`   ✓ Success: ${agents.length} agents found`)
    }

    // Test 4: Check transfers table
    console.log('\n4. Testing transfers table:')
    const { data: transfers, error: transfersError } = await supabase
      .from('transfers')
      .select('*')
    
    if (transfersError) {
      console.log('   ✗ Error:', transfersError.message)
    } else {
      console.log(`   ✓ Success: ${transfers.length} transfers found`)
    }

    // Test 5: Check agent_telemetry table
    console.log('\n5. Testing agent_telemetry table:')
    const { data: telemetry, error: telemetryError } = await supabase
      .from('agent_telemetry')
      .select('*')
      .limit(1)
    
    if (telemetryError) {
      console.log('   ✗ Error:', telemetryError.message)
    } else {
      console.log(`   ✓ Success: agent_telemetry table accessible`)
    }

    // Test 6: Check active_transfers table
    console.log('\n6. Testing active_transfers table:')
    const { data: activeTransfers, error: activeTransfersError } = await supabase
      .from('active_transfers')
      .select('*')
    
    if (activeTransfersError) {
      console.log('   ✗ Error:', activeTransfersError.message)
    } else {
      console.log(`   ✓ Success: ${activeTransfers.length} active transfers found`)
    }

    // Test 7: Check user_profiles table
    console.log('\n7. Testing user_profiles table:')
    const { data: profiles, error: profilesError } = await supabase
      .from('user_profiles')
      .select('*')
    
    if (profilesError) {
      console.log('   ✗ Error:', profilesError.message)
    } else {
      console.log(`   ✓ Success: ${profiles.length} user profiles found`)
    }

    // Test 8: Check materialized view
    console.log('\n8. Testing project_realtime_stats view:')
    const { data: stats, error: statsError } = await supabase
      .from('project_realtime_stats')
      .select('*')
    
    if (statsError) {
      console.log('   ✗ Error:', statsError.message)
    } else {
      console.log(`   ✓ Success: materialized view accessible`)
    }

    console.log('\n✓ Database test complete!')

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

testDatabase()