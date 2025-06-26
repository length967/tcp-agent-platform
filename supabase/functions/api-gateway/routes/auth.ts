import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

export async function handleAuth(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // POST /auth/check-domain-access - Check if user can join existing company by domain
  // GET /auth/invitation/:token - Get invitation details
  // POST /auth/find-similar-companies - Find companies with similar names
  // POST /auth/request-join-company - Request to join an existing company
  // POST /auth/review-join-request - Approve/reject join request (admin only)
  
  const method = req.method
  const endpoint = pathParts[2] // After /api-gateway/auth/
  
  const supabase = ctx.supabase!
  
  switch (method) {
    case 'POST':
      if (endpoint === 'check-domain-access') {
        return checkDomainAccess(req, supabase)
      }
      if (endpoint === 'find-similar-companies') {
        return findSimilarCompanies(req, supabase)
      }
      if (endpoint === 'request-join-company') {
        if (!ctx.user) {
          throw new ApiError(401, 'Authentication required')
        }
        return requestJoinCompany(req, supabase, ctx.user)
      }
      if (endpoint === 'review-join-request') {
        if (!ctx.user) {
          throw new ApiError(401, 'Authentication required')
        }
        return reviewJoinRequest(req, supabase, ctx.user)
      }
      break
    
    case 'GET':
      if (endpoint === 'invitation') {
        const token = pathParts[3] // /auth/invitation/:token
        if (!token) {
          throw new ApiError(400, 'Invitation token required')
        }
        return getInvitationDetails(supabase, token)
      }
      if (endpoint === 'join-requests') {
        if (!ctx.user) {
          throw new ApiError(401, 'Authentication required')
        }
        return getJoinRequests(req, supabase, ctx.user)
      }
      break
    
    default:
      throw new ApiError(405, 'Method not allowed')
  }
  
  throw new ApiError(404, 'Endpoint not found')
}

async function checkDomainAccess(req: Request, supabase: any): Promise<Response> {
  // Validate request body
  const body = await req.json()
  const { email } = z.object({
    email: z.string().email()
  }).parse(body)
  
  // Use the database function to check domain access
  const { data: companies, error } = await supabase
    .rpc('check_domain_company_access', { user_email: email })
  
  if (error) {
    throw new ApiError(500, `Failed to check domain access: ${error.message}`)
  }
  
  return new Response(
    JSON.stringify({ 
      companies: companies || [],
      hasAccess: companies && companies.length > 0
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function findSimilarCompanies(req: Request, supabase: any): Promise<Response> {
  // Validate request body
  const body = await req.json()
  const { companyName, userEmail } = z.object({
    companyName: z.string().min(1),
    userEmail: z.string().email().optional()
  }).parse(body)
  
  // Use the database function to find similar companies
  const { data: companies, error } = await supabase
    .rpc('find_similar_companies', { 
      company_name_input: companyName,
      user_email: userEmail 
    })
  
  if (error) {
    throw new ApiError(500, `Failed to find similar companies: ${error.message}`)
  }
  
  return new Response(
    JSON.stringify({ 
      companies: companies || []
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function requestJoinCompany(req: Request, supabase: any, user: any): Promise<Response> {
  // Validate request body
  const body = await req.json()
  const { companyId, message } = z.object({
    companyId: z.string().uuid(),
    message: z.string().optional()
  }).parse(body)
  
  // Get user profile for full name
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  
  // Create join request using database function
  const { data: requestId, error } = await supabase
    .rpc('create_company_join_request', {
      p_company_id: companyId,
      p_user_id: user.id,
      p_email: user.email,
      p_full_name: profile?.full_name,
      p_message: message
    })
  
  if (error) {
    throw new ApiError(400, error.message)
  }
  
  return new Response(
    JSON.stringify({ 
      success: true,
      requestId: requestId,
      message: 'Join request submitted successfully'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function reviewJoinRequest(req: Request, supabase: any, user: any): Promise<Response> {
  // Validate request body
  const body = await req.json()
  const { requestId, action, notes } = z.object({
    requestId: z.string().uuid(),
    action: z.enum(['approve', 'reject']),
    notes: z.string().optional()
  }).parse(body)
  
  // Review request using database function
  const { error } = await supabase
    .rpc('review_company_join_request', {
      p_request_id: requestId,
      p_reviewer_id: user.id,
      p_action: action,
      p_notes: notes
    })
  
  if (error) {
    throw new ApiError(400, error.message)
  }
  
  return new Response(
    JSON.stringify({ 
      success: true,
      message: `Join request ${action}d successfully`
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getInvitationDetails(supabase: any, token: string): Promise<Response> {
  // Get invitation details
  const { data: invitation, error } = await supabase
    .from('company_invitations')
    .select(`
      id,
      email,
      role,
      expires_at,
      accepted_at,
      companies:company_id (
        id,
        name
      ),
      projects:project_id (
        id,
        name
      )
    `)
    .eq('token', token)
    .single()
  
  if (error || !invitation) {
    throw new ApiError(404, 'Invitation not found')
  }
  
  const now = new Date()
  const expiresAt = new Date(invitation.expires_at)
  const isExpired = now > expiresAt
  const isAccepted = !!invitation.accepted_at
  
  return new Response(
    JSON.stringify({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        company_id: invitation.companies?.id,
        company_name: invitation.companies?.name,
        project_id: invitation.projects?.id,
        project_name: invitation.projects?.name,
        expires_at: invitation.expires_at,
        expired: isExpired,
        accepted: isAccepted
      }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getJoinRequests(req: Request, supabase: any, user: any): Promise<Response> {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') || 'pending'
  const companyId = url.searchParams.get('companyId')
  
  let query = supabase
    .from('company_join_requests')
    .select(`
      id,
      company_id,
      user_id,
      email,
      full_name,
      message,
      status,
      requested_at,
      reviewed_at,
      reviewer_notes,
      companies:company_id (
        id,
        name
      )
    `)
    .eq('status', status)
    .order('requested_at', { ascending: false })
  
  // If companyId provided, filter by company (for admin view)
  if (companyId) {
    query = query.eq('company_id', companyId)
  } else {
    // Otherwise show user's own requests
    query = query.eq('user_id', user.id)
  }
  
  const { data: requests, error } = await query
  
  if (error) {
    throw new ApiError(500, `Failed to get join requests: ${error.message}`)
  }
  
  return new Response(
    JSON.stringify({ 
      requests: requests || []
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}