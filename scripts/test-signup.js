import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSignup() {
  console.log('Testing signup process...\n')

  const testEmail = `test${Date.now()}@example.com`
  
  try {
    console.log('1. Creating user:', testEmail)
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: 'testpassword123',
      options: {
        data: {
          full_name: 'Test User',
          company_name: 'Test Company'
        }
      }
    })

    if (error) {
      console.error('   ✗ Signup error:', error)
      return
    }

    console.log('   ✓ User created successfully!')
    console.log('   User ID:', data.user?.id)
    console.log('   Email:', data.user?.email)
    
    console.log('\n2. Checking if company was created...')
    // Sign in to get authenticated session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: 'testpassword123'
    })

    if (signInError) {
      console.error('   ✗ Sign in error:', signInError)
      return
    }

    // Now check for companies
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('*')

    if (companiesError) {
      console.error('   ✗ Error fetching companies:', companiesError)
    } else {
      console.log('   ✓ Companies found:', companies.length)
      if (companies.length > 0) {
        console.log('   Company:', companies[0])
      }
    }

    // Check projects
    console.log('\n3. Checking projects...')
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')

    if (projectsError) {
      console.error('   ✗ Error fetching projects:', projectsError)
    } else {
      console.log('   ✓ Projects found:', projects.length)
      if (projects.length > 0) {
        console.log('   Project:', projects[0])
      }
    }

    // Sign out
    await supabase.auth.signOut()
    console.log('\n✓ Test completed successfully!')

  } catch (err) {
    console.error('Unexpected error:', err)
  }
}

testSignup()