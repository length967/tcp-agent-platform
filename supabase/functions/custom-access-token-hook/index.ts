import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the JWT from the Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse the request body
    const { user_id, claims } = await req.json()
    
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'No user_id provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the user's primary company membership
    const { data: membership, error: membershipError } = await adminClient
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', user_id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single()

    // Default claims if user has no company
    let customClaims = {
      company_id: null,
      company_role: null,
      permissions_version: 1,
    }

    if (membership && !membershipError) {
      customClaims = {
        company_id: membership.company_id,
        company_role: membership.role,
        permissions_version: claims?.app_metadata?.permissions_version || 1,
      }
    }

    // Return the custom claims to be added to the JWT
    return new Response(
      JSON.stringify({
        claims: {
          ...claims,
          app_metadata: {
            ...claims?.app_metadata,
            ...customClaims,
          },
        },
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  } catch (error) {
    console.error('Error in custom access token hook:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})