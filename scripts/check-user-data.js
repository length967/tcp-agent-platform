import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkUserData() {
  console.log('Checking user data in database...\n')

  // Get all users
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
  
  if (usersError) {
    console.error('Error fetching users:', usersError)
    return
  }

  console.log(`Found ${users.users.length} users:\n`)

  for (const user of users.users) {
    console.log(`User: ${user.email} (${user.id})`)
    console.log(`Metadata:`, user.user_metadata)
    
    // Check user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.log('  ✗ No profile found:', profileError.message)
    } else {
      console.log('  ✓ Profile:', profile)
    }

    // Check company membership
    const { data: memberships, error: membershipError } = await supabase
      .from('company_members')
      .select('*, companies(*)')
      .eq('user_id', user.id)

    if (membershipError) {
      console.log('  ✗ Error checking memberships:', membershipError.message)
    } else if (memberships.length === 0) {
      console.log('  ✗ No company memberships')
    } else {
      console.log('  ✓ Company memberships:', memberships)
    }

    console.log('---')
  }
}

checkUserData()