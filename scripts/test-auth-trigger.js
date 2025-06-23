import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

async function testAuthTrigger() {
  console.log('Testing auth trigger and company creation...\n')

  try {
    // Create a test user
    console.log('1. Creating test user...')
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'test123456',
      options: {
        data: {
          full_name: 'Test User',
          company_name: 'Test Company'
        }
      }
    })

    if (signUpError) {
      console.log('   ✗ Error:', signUpError.message)
      return
    }

    console.log('   ✓ User created:', authData.user?.email)
    const userId = authData.user?.id

    // Check if user profile was created
    console.log('\n2. Checking user profile...')
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.log('   ✗ Error:', profileError.message)
    } else {
      console.log('   ✓ Profile created:', profile)
    }

    // Check if company was created
    console.log('\n3. Checking company creation...')
    const { data: companies, error: companiesError } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('name', 'Test Company')

    if (companiesError) {
      console.log('   ✗ Error:', companiesError.message)
    } else if (companies.length === 0) {
      console.log('   ✗ No company found')
    } else {
      console.log('   ✓ Company created:', companies[0])
      
      // Check company membership
      console.log('\n4. Checking company membership...')
      const { data: membership, error: membershipError } = await supabaseAdmin
        .from('company_members')
        .select('*')
        .eq('user_id', userId)
        .eq('company_id', companies[0].id)
        .single()

      if (membershipError) {
        console.log('   ✗ Error:', membershipError.message)
      } else {
        console.log('   ✓ Membership created with role:', membership.role)
      }

      // Check default project
      console.log('\n5. Checking default project...')
      const { data: projects, error: projectsError } = await supabaseAdmin
        .from('projects')
        .select('*')
        .eq('company_id', companies[0].id)

      if (projectsError) {
        console.log('   ✗ Error:', projectsError.message)
      } else if (projects.length === 0) {
        console.log('   ✗ No project found')
      } else {
        console.log('   ✓ Default project created:', projects[0])
      }
    }

    // Clean up - delete the test user
    console.log('\n6. Cleaning up...')
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.log('   ✗ Error deleting user:', deleteError.message)
    } else {
      console.log('   ✓ Test user deleted')
    }

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

testAuthTrigger()