import { Context } from '../../_shared/middleware.ts'

export async function handleSessionConfig(req: Request, ctx: Context): Promise<Response> {
  const method = req.method
  
  // Only GET is supported for session config
  if (method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  const supabase = ctx.supabase!
  const userId = ctx.user!.id
  
  // Get company ID from user profile since withTenant middleware isn't used here
  let tenantId: string | null = null
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('id', userId)
    .single()
  
  if (profile?.company_id) {
    tenantId = profile.company_id
  }
  
  try {
    // Get user preferences
    const { data: userProfile, error: userError } = await supabase
      .from('user_profiles')
      .select('session_timeout_minutes')
      .eq('id', userId)
      .single()
    
    if (userError) {
      console.error('Error fetching user profile:', userError)
    }
    
    let companyTimeout = null
    let isCompanyEnforced = false
    
    // Get company settings if user has a tenant
    if (tenantId) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('session_timeout_minutes, enforce_session_timeout')
        .eq('id', tenantId)
        .single()
      
      if (!companyError && company) {
        companyTimeout = company.session_timeout_minutes
        isCompanyEnforced = company.enforce_session_timeout || false
      }
    }
    
    // Determine effective timeout
    let timeoutMinutes = 60 // Default to 60 minutes
    let source = 'default'
    
    if (isCompanyEnforced && companyTimeout !== null) {
      timeoutMinutes = companyTimeout
      source = 'company_enforced'
    } else if (userProfile?.session_timeout_minutes !== null) {
      timeoutMinutes = userProfile.session_timeout_minutes
      source = 'user'
    } else if (companyTimeout !== null) {
      timeoutMinutes = companyTimeout
      source = 'company'
    }
    
    return new Response(
      JSON.stringify({
        timeoutMinutes,
        isCompanyEnforced,
        companyTimeout,
        userTimeout: userProfile?.session_timeout_minutes || null,
        source
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in handleSessionConfig:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}