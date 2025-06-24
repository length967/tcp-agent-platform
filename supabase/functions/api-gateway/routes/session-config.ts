import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'

export async function handleSessionConfig(req: Request, ctx: Context): Promise<Response> {
  const { supabase, user } = ctx
  
  // Ensure user is authenticated
  if (!user) {
    throw new ApiError(401, 'Authentication required')
  }
  
  if (req.method !== 'GET') {
    throw new ApiError(405, 'Method not allowed')
  }
  
  try {
    // Get effective session timeout using the database function
    const { data: timeoutData, error: timeoutError } = await supabase
      .rpc('get_user_session_timeout', { user_id: user.id })
      .single()
    
    if (timeoutError) {
      console.error('Error fetching session timeout:', timeoutError)
      throw new ApiError(500, 'Failed to fetch session configuration')
    }
    
    // Get company enforcement status
    const { data: companyData, error: companyError } = await supabase
      .from('company_members')
      .select(`
        company:companies!inner(
          session_timeout_minutes,
          enforce_session_timeout
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    
    if (companyError && companyError.code !== 'PGRST116') {
      console.error('Error fetching company data:', companyError)
    }
    
    // Get user's personal preference
    const { data: userPrefs, error: prefsError } = await supabase
      .from('user_profiles')
      .select('session_timeout_minutes')
      .eq('id', user.id)
      .single()
    
    if (prefsError) {
      console.error('Error fetching user preferences:', prefsError)
    }
    
    // Determine if timeout is enforced by company
    const isCompanyEnforced = companyData?.company?.enforce_session_timeout || false
    const companyTimeout = companyData?.company?.session_timeout_minutes
    const userTimeout = userPrefs?.session_timeout_minutes
    
    // Build response
    const response = {
      timeoutMinutes: timeoutData || 30, // Fallback to 30 minutes
      isCompanyEnforced,
      companyTimeout,
      userTimeout,
      source: isCompanyEnforced 
        ? 'company' 
        : (userTimeout !== null ? 'user' : (companyTimeout !== null ? 'company_default' : 'system')),
      // Include last activity timestamp for client sync
      lastActivity: new Date().toISOString()
    }
    
    return new Response(JSON.stringify(response), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    })
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    console.error('Unexpected error in session config:', error)
    throw new ApiError(500, 'Internal server error')
  }
}