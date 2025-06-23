import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:54321'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const apiUrl = 'http://localhost:54321/functions/v1/api-gateway'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testAgentRegistration() {
  console.log('Testing Agent Registration Flow...\n')

  try {
    // Step 1: Create a test user
    console.log('1. Creating test user...')
    const testEmail = `test${Date.now()}@example.com`
    const testPassword = 'testpassword123'
    
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: 'Agent Test User',
          company_name: 'Agent Test Company'
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

    // Step 2: Create an agent
    console.log('\n2. Creating an agent...')
    const response = await fetch(`${apiUrl}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        name: 'Test Agent 1',
        platform: 'linux',
        capabilities: {
          transfer: true,
          compress: true,
          encrypt: true
        }
      })
    })

    const agentData = await response.json()
    if (!response.ok) {
      console.log('   ✗ Error creating agent:', agentData)
      return
    }

    const agent = agentData.agent
    console.log('   ✓ Agent created:', agent.id)
    console.log('   Name:', agent.name)
    console.log('   Status:', agent.status)

    // Step 3: Generate registration token
    console.log('\n3. Generating registration token...')
    const tokenResponse = await fetch(`${apiUrl}/agents/${agent.id}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    const tokenData = await tokenResponse.json()
    if (!tokenResponse.ok) {
      console.log('   ✗ Error generating token:', tokenData)
      return
    }

    console.log('   ✓ Registration token generated')
    console.log('   Token:', tokenData.token)
    console.log('   Expires at:', new Date(tokenData.expires_at).toLocaleString())

    // Step 4: Simulate agent authentication
    console.log('\n4. Simulating agent authentication...')
    const agentApiKey = 'test-agent-api-key-' + Date.now()
    
    const authResponse = await fetch(`${apiUrl}/agents/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token: tokenData.token,
        api_key: agentApiKey
      })
    })

    const authData = await authResponse.json()
    if (!authResponse.ok) {
      console.log('   ✗ Error authenticating agent:', authData)
      return
    }

    console.log('   ✓ Agent authenticated successfully')
    console.log('   JWT Token:', authData.jwt.substring(0, 50) + '...')
    console.log('   Agent ID:', authData.agent.id)

    // Step 5: Test telemetry submission
    console.log('\n5. Testing telemetry submission...')
    const telemetryResponse = await fetch(`${apiUrl}/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authData.jwt}`
      },
      body: JSON.stringify({
        metrics: {
          cpu_usage: 45.2,
          memory_usage: 2048,
          disk_usage: 10240,
          network_rx: 1024,
          network_tx: 512,
          active_transfers: 0
        }
      })
    })

    const telemetryData = await telemetryResponse.json()
    if (!telemetryResponse.ok) {
      console.log('   ✗ Error submitting telemetry:', telemetryData)
      return
    }

    console.log('   ✓ Telemetry submitted successfully')

    // Step 6: List agents
    console.log('\n6. Listing agents...')
    const listResponse = await fetch(`${apiUrl}/agents`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    const listData = await listResponse.json()
    if (!listResponse.ok) {
      console.log('   ✗ Error listing agents:', listData)
      return
    }

    console.log('   ✓ Agents listed successfully')
    console.log('   Total agents:', listData.agents.length)
    listData.agents.forEach(a => {
      console.log(`   - ${a.name} (${a.status})`)
    })

    console.log('\n✅ Agent registration system test completed successfully!')

  } catch (error) {
    console.error('Unexpected error:', error)
  }
}

testAgentRegistration().catch(console.error)