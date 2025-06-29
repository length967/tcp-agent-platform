import { Context } from '../../_shared/middleware.ts'
import { BadRequestError, NotFoundError, AuthorizationError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'
import { 
  updateUserPreferencesSchema, 
  isValidTimezone,
  validateRequestBody 
} from '../../_shared/validation/schemas.ts'
import { 
  Permissions,
  canEditUserPreferences,
  hasPermission
} from '../../_shared/permissions.ts'

const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  avatar_url: z.string().url().optional().nullable(),
})

const changePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(8).max(100),
})

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expires_days: z.number().min(1).max(365).optional(),
  scopes: z.array(z.string()).optional(),
})

export async function handleUserSettings(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // GET /user/preferences - Get user preferences
  // PUT /user/preferences - Update user preferences
  // GET /user/profile - Get user profile
  // PUT /user/profile - Update user profile
  // PUT /user/password - Change password
  // GET /user/sessions - Get active sessions
  // DELETE /user/sessions/:id - Revoke session
  // GET /user/api-keys - List API keys
  // POST /user/api-keys - Create API key
  // DELETE /user/api-keys/:id - Revoke API key
  
  const method = req.method
  const resource = pathParts[2] // After /api-gateway/user/
  const resourceId = pathParts[3]
  
  const supabase = ctx.supabase!
  const userId = ctx.user!.id
  
  switch (resource) {
    case 'preferences':
      if (method === 'GET') {
        return getPreferences(supabase, userId)
      } else if (method === 'PUT') {
        return updatePreferences(req, supabase, userId, ctx)
      }
      break
    
    case 'profile':
      if (method === 'GET') {
        return getProfile(supabase, userId)
      } else if (method === 'PUT') {
        return updateProfile(req, supabase, userId)
      }
      break
    
    case 'password':
      if (method === 'PUT') {
        return changePassword(req, supabase, userId)
      }
      break
    
    case 'sessions':
      if (method === 'GET') {
        return getSessions(supabase, userId)
      } else if (method === 'DELETE' && resourceId) {
        return revokeSession(supabase, userId, resourceId)
      }
      break
    
    case 'api-keys':
      if (method === 'GET') {
        return getApiKeys(supabase, userId)
      } else if (method === 'POST') {
        return createApiKey(req, supabase, userId)
      } else if (method === 'DELETE' && resourceId) {
        return revokeApiKey(supabase, userId, resourceId)
      }
      break
  }
  
  return new Response(
    JSON.stringify({ error: 'Not found' }),
    { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function getPreferences(supabase: any, userId: string): Promise<Response> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error && error.code !== 'PGRST116') { // Not found error
    throw error
  }
  
  // Return defaults if no preferences exist
  const preferences = data || {
    theme: 'system',
    timezone: 'UTC',
    language: 'en',
    date_format: 'MM/DD/YYYY',
    time_format: '12h',
    email_notifications: true,
    email_marketing: false,
    email_security_alerts: true,
    email_weekly_digest: true,
    profile_visibility: 'team',
    show_email: false,
    activity_tracking: true,
    api_key_expires_days: 90,
    webhook_notifications: true,
    session_timeout_minutes: 1440,
  }
  
  return new Response(
    JSON.stringify({ preferences }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function updatePreferences(
  req: Request,
  supabase: any,
  userId: string,
  ctx?: any
): Promise<Response> {
  // Check permission to edit user preferences
  if (ctx?.userPermissions && !hasPermission(ctx.userPermissions, Permissions.USER_EDIT_PREFERENCES)) {
    throw new AuthorizationError('Insufficient permissions to edit user preferences')
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
  
  // Validate input with comprehensive timezone validation
  const validatedData = await validateRequestBody(req, updateUserPreferencesSchema)
  
  // Additional security validation for timezone
  if (validatedData.timezone && !isValidTimezone(validatedData.timezone)) {
    throw new BadRequestError('Invalid timezone provided')
  }
  
  // Check company timezone enforcement
  if (validatedData.timezone) {
    // Get user's company ID
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('company_id')
      .eq('id', userId)
      .single()
    
    if (userProfile?.company_id) {
      const { data: companySettings } = await supabase
        .from('companies')
        .select('enforce_timezone, default_timezone')
        .eq('id', userProfile.company_id)
        .single()
      
      if (companySettings?.enforce_timezone && 
          companySettings.default_timezone !== validatedData.timezone) {
        throw new AuthorizationError(
          'Company timezone enforcement is enabled. Cannot override company timezone.'
        )
      }
    }
  }
  
  // Upsert preferences
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: userId,
      ...validatedData
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ preferences: data }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function getProfile(supabase: any, userId: string): Promise<Response> {
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()
  
  if (profileError) {
    throw profileError
  }
  
  // Get auth user data for email
  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId)
  
  if (userError) {
    throw userError
  }
  
  return new Response(
    JSON.stringify({ 
      profile: {
        ...profile,
        email: user.email,
        email_confirmed: user.email_confirmed_at !== null,
        created_at: user.created_at,
      }
    }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function updateProfile(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body = await req.json()
  
  // Validate input
  const validatedData = updateProfileSchema.parse(body)
  
  const { data, error } = await supabase
    .from('user_profiles')
    .update(validatedData)
    .eq('id', userId)
    .select()
    .single()
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ profile: data }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function changePassword(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body = await req.json()
  
  // Validate input
  const { current_password, new_password } = changePasswordSchema.parse(body)
  
  // Get user email
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email')
    .eq('id', userId)
    .single()
  
  if (!profile?.email) {
    throw new BadRequestError('User email not found')
  }
  
  // Verify current password
  const { data: { user }, error: verifyError } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: current_password,
  })
  
  if (verifyError || !user) {
    throw new BadRequestError('Current password is incorrect')
  }
  
  // Update password
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    { password: new_password }
  )
  
  if (updateError) {
    throw updateError
  }
  
  // Log security event
  await supabase
    .from('audit_logs')
    .insert({
      user_id: userId,
      action: 'user.password_changed',
      resource_type: 'user',
      resource_id: userId,
      user_agent: req.headers.get('user-agent'),
    })
  
  return new Response(
    JSON.stringify({ success: true }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function getSessions(supabase: any, userId: string): Promise<Response> {
  // Get active sessions from our tracking table
  const { data: sessions, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('last_active', { ascending: false })
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ sessions: sessions || [] }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function revokeSession(
  supabase: any,
  userId: string,
  sessionId: string
): Promise<Response> {
  const { error } = await supabase
    .from('user_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ success: true }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function getApiKeys(supabase: any, userId: string): Promise<Response> {
  const { data: keys, error } = await supabase
    .from('user_api_keys')
    .select('id, name, key_prefix, last_used_at, expires_at, scopes, created_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ api_keys: keys || [] }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function createApiKey(
  req: Request,
  supabase: any,
  userId: string
): Promise<Response> {
  const body = await req.json()
  
  // Validate input
  const { name, expires_days = 90, scopes = [] } = createApiKeySchema.parse(body)
  
  // Generate API key using proper base64url encoding
  const keyBytes = new Uint8Array(32)
  crypto.getRandomValues(keyBytes)
  
  // Convert to base64url - this is the proper way to handle binary data
  // Using TextDecoder/TextEncoder would fail for non-UTF8 byte sequences
  const base64 = btoa(Array.from(keyBytes).map(b => String.fromCharCode(b)).join(''))
  const apiKey = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  
  const keyPrefix = apiKey.substring(0, 8)
  const keyHash = await bcrypt.hash(apiKey)
  
  // Calculate expiry
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expires_days)
  
  // Save to database
  const { data, error } = await supabase
    .from('user_api_keys')
    .insert({
      user_id: userId,
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      expires_at: expiresAt.toISOString(),
      scopes,
    })
    .select('id, name, key_prefix, expires_at, scopes, created_at')
    .single()
  
  if (error) {
    throw error
  }
  
  // Return the key only once
  return new Response(
    JSON.stringify({ 
      api_key: {
        ...data,
        key: `${keyPrefix}${apiKey.substring(8)}`, // Full key only shown once
      }
    }),
    { 
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}

async function revokeApiKey(
  supabase: any,
  userId: string,
  keyId: string
): Promise<Response> {
  const { error } = await supabase
    .from('user_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', userId)
  
  if (error) {
    throw error
  }
  
  return new Response(
    JSON.stringify({ success: true }),
    { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}