import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function cleanupTestUsers() {
  console.log('Cleaning up test users...\n')

  // Get all test users
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
  
  if (usersError) {
    console.error('Error fetching users:', usersError)
    return
  }

  const testUsers = users.users.filter(u => u.email?.includes('test') && u.email?.includes('@example.com'))
  
  console.log(`Found ${testUsers.length} test users to delete\n`)

  for (const user of testUsers) {
    console.log(`Deleting user: ${user.email}`)
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) {
      console.error('  ✗ Error:', error.message)
    } else {
      console.log('  ✓ Deleted')
    }
  }
  
  console.log('\nCleanup complete!')
}

cleanupTestUsers()