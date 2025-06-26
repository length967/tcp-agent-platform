import { Middleware } from '../middleware.ts'
import { BadRequestError, AuthorizationError } from '../errors.ts'
import { isValidTimezone } from '../validation/schemas.ts'

/**
 * Timezone security configuration
 */
interface TimezoneSecurityConfig {
  allowedTimezones?: string[]
  requireCompanyPermission?: boolean
  logTimezoneChanges?: boolean
}

/**
 * Validates timezone parameters in requests
 */
export function withTimezoneValidation(config: TimezoneSecurityConfig = {}): Middleware {
  return async (req, ctx, next) => {
    const {
      allowedTimezones,
      requireCompanyPermission = false,
      logTimezoneChanges = true
    } = config

    // Extract timezone from request body or query params
    let timezone: string | null = null
    let isTimezoneUpdate = false

    try {
      // Check request body for timezone
      if (req.method !== 'GET') {
        const body = await req.clone().json().catch(() => null)
        if (body?.timezone || body?.default_timezone) {
          timezone = body.timezone || body.default_timezone
          isTimezoneUpdate = true
        }
      }

      // Check query parameters for timezone
      const url = new URL(req.url)
      const queryTimezone = url.searchParams.get('timezone')
      if (queryTimezone) {
        timezone = queryTimezone
      }

    } catch (error) {
      // If we can't parse the body, continue - validation will catch it later
    }

    // Validate timezone if present
    if (timezone) {
      // Basic timezone validation
      if (!isValidTimezone(timezone)) {
        throw new BadRequestError(`Invalid timezone: ${timezone}`)
      }

      // Check against allowed timezones list
      if (allowedTimezones && !allowedTimezones.includes(timezone)) {
        throw new BadRequestError(`Timezone not allowed: ${timezone}`)
      }

      // Check company permissions for timezone enforcement
      if (requireCompanyPermission && isTimezoneUpdate && ctx.tenant) {
        const { data: companySettings } = await ctx.supabase!
          .from('companies')
          .select('enforce_timezone, default_timezone')
          .eq('id', ctx.tenant.id)
          .single()

        if (companySettings?.enforce_timezone && 
            companySettings.default_timezone !== timezone) {
          throw new AuthorizationError(
            'Company timezone enforcement is enabled. Users cannot override company timezone.'
          )
        }
      }

      // Log timezone changes for security monitoring
      if (logTimezoneChanges && isTimezoneUpdate) {
        console.log({
          action: 'timezone_change_attempt',
          user_id: ctx.user?.id,
          company_id: ctx.tenant?.id,
          old_timezone: ctx.user?.timezone,
          new_timezone: timezone,
          timestamp: new Date().toISOString(),
          ip_address: req.headers.get('x-forwarded-for') || 'unknown',
          user_agent: req.headers.get('user-agent') || 'unknown'
        })
      }
    }

    // Add timezone validation context
    ctx.timezoneValidation = {
      timezone,
      isTimezoneUpdate,
      isValid: timezone ? isValidTimezone(timezone) : true
    }

    return next(req, ctx)
  }
}

/**
 * Rate limiting for timezone-related operations
 */
export function withTimezoneRateLimit(): Middleware {
  const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
  const MAX_TIMEZONE_CHANGES = 10 // Max 10 timezone changes per hour
  const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour

  return async (req, ctx, next) => {
    const userId = ctx.user?.id
    if (!userId || req.method === 'GET') {
      return next(req, ctx)
    }

    // Check if this is a timezone update
    let isTimezoneUpdate = false
    try {
      const body = await req.clone().json().catch(() => null)
      isTimezoneUpdate = !!(body?.timezone || body?.default_timezone || body?.enforce_timezone)
    } catch {
      // Continue if we can't parse body
    }

    if (isTimezoneUpdate) {
      const now = Date.now()
      const userKey = `timezone_${userId}`
      const userLimit = rateLimitMap.get(userKey)

      if (userLimit) {
        if (now > userLimit.resetTime) {
          // Reset the counter
          rateLimitMap.set(userKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
        } else {
          userLimit.count++
          if (userLimit.count > MAX_TIMEZONE_CHANGES) {
            throw new BadRequestError(
              `Too many timezone changes. Please wait before making more changes.`
            )
          }
        }
      } else {
        rateLimitMap.set(userKey, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
      }
    }

    return next(req, ctx)
  }
}

/**
 * Validates business hours settings
 */
export function withBusinessHoursValidation(): Middleware {
  return async (req, ctx, next) => {
    if (req.method === 'GET') {
      return next(req, ctx)
    }

    try {
      const body = await req.clone().json().catch(() => null)
      if (body?.business_hours_start || body?.business_hours_end || body?.business_days) {
        // Validate business hours format
        if (body.business_hours_start && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(body.business_hours_start)) {
          throw new BadRequestError('Invalid business hours start time format')
        }

        if (body.business_hours_end && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(body.business_hours_end)) {
          throw new BadRequestError('Invalid business hours end time format')
        }

        // Validate business hours logic
        if (body.business_hours_start && body.business_hours_end) {
          const start = new Date(`2000-01-01T${body.business_hours_start}`)
          const end = new Date(`2000-01-01T${body.business_hours_end}`)
          
          if (start >= end) {
            throw new BadRequestError('Business hours end time must be after start time')
          }

          // Check for reasonable business hours (not more than 16 hours)
          const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
          if (diffHours > 16) {
            throw new BadRequestError('Business hours cannot exceed 16 hours per day')
          }
        }

        // Validate business days
        if (body.business_days) {
          if (!Array.isArray(body.business_days) || 
              body.business_days.length === 0 || 
              body.business_days.length > 7) {
            throw new BadRequestError('Business days must be an array of 1-7 days')
          }

          const validDays = body.business_days.every((day: any) => 
            Number.isInteger(day) && day >= 1 && day <= 7
          )
          
          if (!validDays) {
            throw new BadRequestError('Business days must be integers between 1 (Monday) and 7 (Sunday)')
          }

          // Check for duplicates
          const uniqueDays = [...new Set(body.business_days)]
          if (uniqueDays.length !== body.business_days.length) {
            throw new BadRequestError('Business days cannot contain duplicates')
          }
        }
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error
      }
      // Continue if we can't parse body - validation will catch it later
    }

    return next(req, ctx)
  }
}

/**
 * Audit logging for timezone-related security events
 */
export function withTimezoneAuditLog(): Middleware {
  return async (req, ctx, next) => {
    const startTime = Date.now()
    
    try {
      const response = await next(req, ctx)
      
      // Log successful timezone operations
      if (ctx.timezoneValidation?.isTimezoneUpdate && response.status < 400) {
        console.log({
          level: 'info',
          action: 'timezone_update_success',
          user_id: ctx.user?.id,
          company_id: ctx.tenant?.id,
          timezone: ctx.timezoneValidation.timezone,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        })
      }
      
      return response
    } catch (error) {
      // Log failed timezone operations
      if (ctx.timezoneValidation?.isTimezoneUpdate) {
        console.error({
          level: 'error',
          action: 'timezone_update_failed',
          user_id: ctx.user?.id,
          company_id: ctx.tenant?.id,
          timezone: ctx.timezoneValidation.timezone,
          error: error.message,
          duration_ms: Date.now() - startTime,
          timestamp: new Date().toISOString()
        })
      }
      
      throw error
    }
  }
} 