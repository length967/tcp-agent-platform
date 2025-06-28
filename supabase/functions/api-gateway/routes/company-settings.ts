import { Context } from '../../_shared/middleware.ts'
import { BadRequestError, NotFoundError, AuthorizationError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { 
  updateCompanyTimezoneSchema, 
  isValidTimezone,
  validateRequestBody 
} from '../../_shared/validation/schemas.ts'
import { 
  withTimezoneValidation, 
  withTimezoneRateLimit, 
  withBusinessHoursValidation,
  withTimezoneAuditLog 
} from '../../_shared/security/timezoneValidation.ts'
import { 
  Permissions,
  canEditCompanyTimezone,
  canViewCompanyTimezone,
  canEnforceTimezone,
  canEditBusinessHours,
  hasPermission
} from '../../_shared/permissions.ts'

// Company update schema with security constraints
const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  default_timezone: z.string().optional(),
  enforce_timezone: z.boolean().optional(),
  business_hours_start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
  business_hours_end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
  business_days: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional(),
  session_timeout_minutes: z.number().min(15).max(10080).optional(),
  enforce_session_timeout: z.boolean().optional()
})

// Privacy settings schema with security constraints
const updatePrivacySettingsSchema = z.object({
  email_domain: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,})+$/).optional(),
  allow_domain_signup: z.boolean().optional()
})

export async function handleCompanySettings(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // GET /company - Get company settings
  // PATCH /company - Update company settings (admin/owner only)
  // GET /company/timezone-info - Get company timezone information
  // GET /company/privacy - Get company privacy settings
  // PATCH /company/privacy - Update company privacy settings (owner only)
  
  const method = req.method
  const resource = pathParts[1] // After /api-gateway/
  const subResource = pathParts[2]
  
  const supabase = ctx.supabase!
  const userId = ctx.user!.id
  const tenantId = ctx.tenant!.id
  
  switch (method) {
    case 'GET':
      if (subResource === 'timezone-info') {
        // Check permission to view company timezone info
        await validateCompanyPermissions(supabase, userId, tenantId, [
          Permissions.TIMEZONE_VIEW_COMPANY,
          Permissions.COMPANY_VIEW_SETTINGS
        ], ctx)
        return getCompanyTimezoneInfo(supabase, tenantId)
      }
      if (subResource === 'privacy') {
        // Check permission to view company privacy settings
        await validateCompanyPermissions(supabase, userId, tenantId, [
          Permissions.COMPANY_VIEW_SETTINGS,
          Permissions.COMPANY_VIEW
        ], ctx)
        return getCompanyPrivacySettings(supabase, tenantId)
      }
      // Check permission to view company settings
      await validateCompanyPermissions(supabase, userId, tenantId, [
        Permissions.COMPANY_VIEW_SETTINGS,
        Permissions.COMPANY_VIEW
      ], ctx)
      return getCompanySettings(supabase, tenantId)
    
    case 'PATCH':
      if (subResource === 'privacy') {
        // Only owners can update privacy settings
        await validateCompanyPermissions(supabase, userId, tenantId, [
          Permissions.COMPANY_EDIT_PRIVACY,
          Permissions.COMPANY_MANAGE_SECURITY
        ], ctx)
        return updateCompanyPrivacySettings(req, supabase, tenantId, userId, ctx)
      }
      // Check specific permissions for company settings updates
      await validateCompanyPermissions(supabase, userId, tenantId, [
        Permissions.COMPANY_EDIT_SETTINGS,
        Permissions.TIMEZONE_EDIT_COMPANY
      ], ctx)
      return updateCompanySettings(req, supabase, tenantId, ctx)
    
    default:
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        }
      )
  }
}

async function validateCompanyPermissions(
  supabase: any, 
  userId: string, 
  companyId: string,
  requiredPermissions: string[] = [],
  ctx?: Context
): Promise<void> {
  // First check basic company membership
  const { data: membership, error } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()
  
  if (error || !membership) {
    throw new AuthorizationError('User is not a member of this company')
  }
  
  // Check for user suspension
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_suspended')
    .eq('id', userId)
    .single()
  
  if (profile?.is_suspended) {
    throw new AuthorizationError('Account is suspended')
  }
  
  // If specific permissions are required and context is available, use RBAC
  if (requiredPermissions.length > 0 && ctx?.userPermissions) {
    const hasRequiredPermission = requiredPermissions.some(permission =>
      hasPermission(ctx.userPermissions!, permission)
    )
    
    if (!hasRequiredPermission) {
      throw new AuthorizationError(
        `Missing required permissions: ${requiredPermissions.join(', ')}`
      )
    }
  } else {
    // Fallback to role-based check for backwards compatibility
    if (!['admin', 'owner'].includes(membership.role)) {
      throw new AuthorizationError('Insufficient permissions to modify company settings')
    }
  }
  
  // Special check for owner-only permissions
  const ownerOnlyPermissions = [
    Permissions.COMPANY_EDIT_PRIVACY,
    Permissions.COMPANY_MANAGE_SECURITY
  ]
  
  if (requiredPermissions.some(p => ownerOnlyPermissions.includes(p))) {
    if (membership.role !== 'owner') {
      throw new AuthorizationError('Only company owners can perform this action')
    }
  }
}

async function getCompanySettings(supabase: any, companyId: string): Promise<Response> {
  const { data: company, error } = await supabase
    .from('companies')
    .select(`
      id,
      name,
      slug,
      subscription_status,
      subscription_ends_at,
      default_timezone,
      enforce_timezone,
      business_hours_start,
      business_hours_end,
      business_days,
      session_timeout_minutes,
      enforce_session_timeout,
      created_at,
      updated_at
    `)
    .eq('id', companyId)
    .single()
  
  if (error) {
    throw new NotFoundError('Company not found')
  }
  
  return new Response(
    JSON.stringify({ company }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function getCompanyTimezoneInfo(supabase: any, companyId: string): Promise<Response> {
  const { data: timezoneInfo, error } = await supabase
    .rpc('get_company_timezone_info', { company_id: companyId })
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ timezone_info: timezoneInfo[0] || null }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function updateCompanySettings(
  req: Request,
  supabase: any,
  companyId: string,
  ctx?: Context
): Promise<Response> {
  // Validate input with comprehensive validation
  const validatedData = await validateRequestBody(req, updateCompanySchema)
  
  // Additional RBAC checks for specific operations
  if (ctx?.userPermissions) {
    // Check timezone-specific permissions
    if ((validatedData.default_timezone || validatedData.enforce_timezone !== undefined) && 
        !canEditCompanyTimezone(ctx.userPermissions)) {
      throw new AuthorizationError('Insufficient permissions to modify company timezone settings')
    }
    
    // Check timezone enforcement permission
    if (validatedData.enforce_timezone !== undefined && 
        !canEnforceTimezone(ctx.userPermissions)) {
      throw new AuthorizationError('Insufficient permissions to enforce company timezone')
    }
    
    // Check business hours permissions
    if ((validatedData.business_hours_start || validatedData.business_hours_end || 
         validatedData.business_days) && 
        !canEditBusinessHours(ctx.userPermissions)) {
      throw new AuthorizationError('Insufficient permissions to modify business hours')
    }
  }
  
  // Security validations
  if (validatedData.default_timezone && !isValidTimezone(validatedData.default_timezone)) {
    throw new BadRequestError('Invalid timezone provided')
  }
  
  // Validate business hours logic
  if (validatedData.business_hours_start && validatedData.business_hours_end) {
    const startTime = new Date(`2000-01-01T${validatedData.business_hours_start}`)
    const endTime = new Date(`2000-01-01T${validatedData.business_hours_end}`)
    
    if (startTime >= endTime) {
      throw new BadRequestError('Business hours end time must be after start time')
    }
  }
  
  // Validate business days
  if (validatedData.business_days) {
    const uniqueDays = [...new Set(validatedData.business_days)]
    if (uniqueDays.length !== validatedData.business_days.length) {
      throw new BadRequestError('Business days cannot contain duplicates')
    }
  }
  
  // Validate session timeout
  if (validatedData.session_timeout_minutes) {
    if (validatedData.session_timeout_minutes < 15 || validatedData.session_timeout_minutes > 10080) {
      throw new BadRequestError('Session timeout must be between 15 minutes and 7 days')
    }
  }
  
  // Update company settings
  const { data: company, error } = await supabase
    .from('companies')
    .update({
      ...validatedData,
      updated_at: new Date().toISOString()
    })
    .eq('id', companyId)
    .select()
    .single()
  
  if (error) {
    throw error
  }
  
  // Log the security-sensitive change
  console.log({
    action: 'company_settings_updated',
    company_id: companyId,
    changes: Object.keys(validatedData),
    has_timezone_changes: !!(validatedData.default_timezone || validatedData.enforce_timezone),
    timestamp: new Date().toISOString()
  })
  
  return new Response(
    JSON.stringify({ 
      company,
      message: 'Company settings updated successfully'
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function getCompanyPrivacySettings(supabase: any, companyId: string): Promise<Response> {
  const { data: company, error } = await supabase
    .from('companies')
    .select(`
      id,
      name,
      email_domain,
      allow_domain_signup
    `)
    .eq('id', companyId)
    .single()
  
  if (error) {
    throw new NotFoundError('Company not found')
  }
  
  // Get pending join requests count
  const { count: pendingRequests } = await supabase
    .from('company_join_requests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'pending')
  
  return new Response(
    JSON.stringify({ 
      privacy_settings: {
        email_domain: company.email_domain,
        allow_domain_signup: company.allow_domain_signup,
        pending_requests_count: pendingRequests || 0
      }
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function updateCompanyPrivacySettings(
  req: Request,
  supabase: any,
  companyId: string,
  userId: string,
  ctx?: Context
): Promise<Response> {
  // Validate input
  const validatedData = await validateRequestBody(req, updatePrivacySettingsSchema)
  
  // If setting email domain, validate it's unique
  if (validatedData.email_domain) {
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .eq('email_domain', validatedData.email_domain)
      .neq('id', companyId)
      .single()
    
    if (existingCompany) {
      throw new BadRequestError('This email domain is already registered to another company')
    }
  }
  
  // Update company privacy settings
  const { data: company, error } = await supabase
    .from('companies')
    .update({
      ...validatedData,
      updated_at: new Date().toISOString()
    })
    .eq('id', companyId)
    .select()
    .single()
  
  if (error) {
    throw error
  }
  
  // Log the security-sensitive change using the enhanced audit logging
  if (ctx?.supabase) {
    await ctx.supabase.rpc('log_audit_event', {
      p_event_type: 'company.privacy_settings_updated',
      p_event_category: 'security',
      p_severity: 'medium',
      p_actor_type: 'user',
      p_actor_id: userId,
      p_action: 'update_privacy_settings',
      p_result: 'success',
      p_metadata: {
        changes: Object.keys(validatedData),
        old_values: {
          email_domain: company.email_domain,
          allow_domain_signup: company.allow_domain_signup
        },
        new_values: validatedData
      },
      p_company_id: companyId,
      p_resource_type: 'company',
      p_resource_id: companyId
    })
  }
  
  return new Response(
    JSON.stringify({ 
      company,
      message: 'Privacy settings updated successfully'
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
} 