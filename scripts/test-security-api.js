import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const apiUrl = 'http://localhost:54321/functions/v1/api-gateway'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSecurityFlow() {
  console.log('Testing Security API Flow...\n')

  // Test 1: Try to access API without auth
  console.log('1. Testing unauthorized access:')
  try {
    const response = await fetch(`${apiUrl}/projects`, {
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await response.json()
    console.log(`   Status: ${response.status}`)
    console.log(`   Response:`, data)
  } catch (error) {
    console.log('   ✗ Error:', error.message)
  }

  // Test 2: Create a test user and authenticate
  console.log('\n2. Creating test user and authenticating:')
  const testEmail = `test${Date.now()}@example.com`
  const testPassword = 'testpassword123'
  
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        full_name: 'Security Test User',
        company_name: 'Security Test Company'
      }
    }
  })

  if (signUpError) {
    console.log('   ✗ Signup error:', signUpError.message)
    return
  }

  console.log('   ✓ User created successfully')

  // Sign in to get session
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  })

  if (signInError) {
    console.log('   ✗ Sign in error:', signInError.message)
    return
  }

  const session = signInData.session
  console.log('   ✓ Authenticated successfully')
  console.log('   Access token:', session.access_token.substring(0, 20) + '...')

  // Test 3: Access API with valid auth
  console.log('\n3. Testing authorized access to projects API:')
  try {
    const response = await fetch(`${apiUrl}/projects`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    })
    const data = await response.json()
    console.log(`   Status: ${response.status}`)
    console.log(`   Response:`, data)
    
    // Check security headers
    console.log('\n4. Security headers received:')
    const securityHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection',
      'Strict-Transport-Security',
      'Access-Control-Allow-Origin'
    ]
    
    securityHeaders.forEach(header => {
      const value = response.headers.get(header)
      if (value) {
        console.log(`   ✓ ${header}: ${value}`)
      } else {
        console.log(`   ✗ ${header}: Missing`)
      }
    })
  } catch (error) {
    console.log('   ✗ Error:', error.message)
  }

  // Test 4: Test rate limiting
  console.log('\n5. Testing rate limiting (making 10 rapid requests):')
  const requests = []
  for (let i = 0; i < 10; i++) {
    requests.push(
      fetch(`${apiUrl}/projects`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })
    )
  }
  
  const responses = await Promise.all(requests)
  const statusCodes = responses.map(r => r.status)
  console.log('   Response status codes:', statusCodes)
  
  const rateLimited = statusCodes.filter(code => code === 429).length
  if (rateLimited > 0) {
    console.log(`   ✓ Rate limiting working: ${rateLimited} requests were rate limited`)
  } else {
    console.log('   ℹ️  No rate limiting triggered (might need more requests)')
  }

  // Clean up
  console.log('\n6. Cleaning up test user...')
  await supabase.auth.signOut()
  console.log('   ✓ Test complete!')
}

testSecurityFlow().catch(console.error)