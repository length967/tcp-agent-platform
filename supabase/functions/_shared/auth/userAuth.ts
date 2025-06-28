import { Middleware } from '../types.ts'
import { AuthenticationError, AuthorizationError } from '../errors.ts'
import { 
  Permissions, 
  Permission, 
  CompanyRoles, 
  ProjectRoles, 
  getCombinedPermissions,
  hasPermission 
} from '../permissions.ts'

/**
 * Extracts the JWT token from the Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  
  return parts[1]
}

/**
 * Middleware that validates user JWT and adds user context
 */
export const withUser: Middleware = async (req, ctx, next) => {
  const token = extractToken(req)
  
  if (!token) {
    throw new AuthenticationError('Missing or invalid Authorization header')
  }
  
  try {
    // Validate the JWT using Supabase Auth
    const { data: { user }, error } = await ctx.supabase.auth.getUser(token)
    
    if (error || !user) {
      throw new AuthenticationError('Invalid or expired token')
    }
    
    // Add user to context
    ctx.user = {
      id: user.id,
      email: user.email!,
      user_metadata: user.user_metadata || {}
    }
    
    return next(req, ctx)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error
    }
    throw new AuthenticationError('Token validation failed')
  }
}

/**
 * Middleware that extracts tenant context for authenticated users
 */
export const withTenant: Middleware = async (req, ctx, next) => {
  if (!ctx.user) {
    throw new AuthenticationError('User context missing')
  }
  
  try {
    // Get user's company information
    const { data: profile, error: profileError } = await ctx.supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', ctx.user.id)
      .single()
    
    if (profileError || !profile?.company_id) {
      throw new AuthenticationError('User is not associated with a company')
    }
    
    // Get company details
    const { data: company, error: companyError } = await ctx.supabase
      .from('companies')
      .select('id, name, slug, subscription_status, telemetry_retention_days, telemetry_update_interval_ms')
      .eq('id', profile.company_id)
      .single()
    
    if (companyError || !company) {
      throw new AuthenticationError('Company not found')
    }
    
    // Add tenant to context
    ctx.tenant = {
      id: company.id,
      name: company.name,
      slug: company.slug,
      plan: company.subscription_status || 'free',
      subscriptionStatus: company.subscription_status || 'free'
    }
    
    return next(req, ctx)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error
    }
    throw new AuthenticationError('Failed to load tenant context')
  }
}

/**
 * Middleware factory that checks if user has required subscription tier
 */
export function withSubscription(requiredPlans: string[]): Middleware {
  return async (req, ctx, next) => {
    if (!ctx.tenant) {
      throw new AuthenticationError('Tenant context missing')
    }
    
    const userPlan = ctx.tenant.plan.toLowerCase()
    const hasAccess = requiredPlans.some(plan => plan.toLowerCase() === userPlan)
    
    if (!hasAccess) {
      throw new AuthenticationError(
        `This feature requires one of the following plans: ${requiredPlans.join(', ')}`
      )
    }
    
    return next(req, ctx)
  }
}

/**
 * Middleware factory that validates resource ownership
 */
export function withResourceOwnership(
  resourceType: 'project' | 'agent' | 'transfer',
  getResourceId: (req: Request) => string | null
): Middleware {
  return async (req, ctx, next) => {
    if (!ctx.tenant) {
      throw new AuthenticationError('Tenant context missing')
    }
    
    const resourceId = getResourceId(req)
    if (!resourceId) {
      throw new AuthenticationError('Resource ID missing')
    }
    
    // Check ownership based on resource type
    let query
    switch (resourceType) {
      case 'project':
        query = ctx.supabase
          .from('projects')
          .select('id')
          .eq('id', resourceId)
          .eq('company_id', ctx.tenant.id)
        break
      
      case 'agent':
        query = ctx.supabase
          .from('agents')
          .select('id, project_id')
          .eq('id', resourceId)
        break
      
      case 'transfer':
        query = ctx.supabase
          .from('transfers')
          .select('id, project_id')
          .eq('id', resourceId)
        break
    }
    
    const { data, error } = await query.single()
    
    if (error || !data) {
      throw new AuthenticationError('Resource not found or access denied')
    }
    
    // For agents and transfers, verify project ownership
    if (resourceType !== 'project' && data.project_id) {
      const { data: project, error: projectError } = await ctx.supabase
        .from('projects')
        .select('id')
        .eq('id', data.project_id)
        .eq('company_id', ctx.tenant.id)
        .single()
      
      if (projectError || !project) {
        throw new AuthenticationError('Resource not found or access denied')
      }
    }
    
    return next(req, ctx)
  }
}

/**
 * Get user permissions based on company and project roles
 */
async function getUserPermissions(
  ctx: any,
  projectId?: string
): Promise<Permission[]> {
  const { user, supabase } = ctx
  
  if (!user) return []
  
  // 1. Get company role from JWT claims (fast)
  const companyRole = user.app_metadata?.company_role || null
  const companyId = user.app_metadata?.company_id
  
  // Company owners and admins have full access
  if (companyRole === 'owner' || companyRole === 'admin') {
    return CompanyRoles[companyRole]
  }
  
  // 2. For other roles, check project-specific role if applicable
  let projectRole = null
  if (projectId) {
    const { data: projectMember } = await supabase
      .from('project_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('project_id', projectId)
      .single()
    
    if (projectMember) {
      projectRole = projectMember.role
    }
  }
  
  // 3. Combine permissions
  return getCombinedPermissions(companyRole, projectRole)
}

/**
 * Middleware factory that checks if user has required permission
 */
export function withAuthorization(requiredPermission: Permission): Middleware {
  return async (req, ctx, next) => {
    if (!ctx.user || !ctx.tenant) {
      throw new AuthenticationError('Authentication required')
    }
    
    // Check for user suspension (critical security check)
    const { data: profile } = await ctx.supabase
      .from('user_profiles')
      .select('is_suspended')
      .eq('id', ctx.user.id)
      .single()
    
    if (profile?.is_suspended) {
      throw new AuthorizationError('Account is suspended')
    }
    
    // Extract project ID from URL if present
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const projectIndex = pathParts.indexOf('projects')
    const projectId = projectIndex !== -1 && pathParts[projectIndex + 1] || undefined
    
    // Get user permissions
    const userPermissions = await getUserPermissions(ctx, projectId)
    ctx.userPermissions = userPermissions // Pass down for UI logic
    
    // Check permission
    if (!hasPermission(userPermissions, requiredPermission)) {
      throw new AuthorizationError(
        `Missing required permission: ${requiredPermission}`
      )
    }
    
    return next(req, ctx)
  }
}

/**
 * Middleware factory that checks if user has any of the required permissions
 */
export function withAnyAuthorization(requiredPermissions: Permission[]): Middleware {
  return async (req, ctx, next) => {
    if (!ctx.user || !ctx.tenant) {
      throw new AuthenticationError('Authentication required')
    }
    
    // Check for user suspension
    const { data: profile } = await ctx.supabase
      .from('user_profiles')
      .select('is_suspended')
      .eq('id', ctx.user.id)
      .single()
    
    if (profile?.is_suspended) {
      throw new AuthorizationError('Account is suspended')
    }
    
    // Extract project ID from URL
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const projectIndex = pathParts.indexOf('projects')
    const projectId = projectIndex !== -1 && pathParts[projectIndex + 1] || undefined
    
    // Get user permissions
    const userPermissions = await getUserPermissions(ctx, projectId)
    ctx.userPermissions = userPermissions
    
    // Check if user has any of the required permissions
    const hasRequiredPermission = requiredPermissions.some(p => 
      hasPermission(userPermissions, p)
    )
    
    if (!hasRequiredPermission) {
      throw new AuthorizationError(
        `Missing one of required permissions: ${requiredPermissions.join(', ')}`
      )
    }
    
    return next(req, ctx)
  }
}