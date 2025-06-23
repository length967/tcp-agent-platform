import { Middleware } from '../middleware.ts'
import { getAuditLogger } from './logger.ts'
import { ApiError } from '../errors.ts'

/**
 * Audit logging middleware
 * Logs all requests and their outcomes
 */
export const withAuditLog: Middleware = async (req, ctx, next) => {
  const auditLogger = getAuditLogger()
  const startTime = Date.now()
  
  try {
    // Process the request
    const response = await next(req, ctx)
    
    // Log successful requests
    const duration = Date.now() - startTime
    
    // Determine what kind of action this was
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const resource = pathParts[2] // After /api-gateway/
    const action = req.method.toLowerCase()
    
    // Log data access for successful requests
    if (response.status >= 200 && response.status < 300) {
      await auditLogger.logDataAccess(
        ctx,
        req,
        resource || 'unknown',
        ctx.params?.id || 'list',
        action,
        true
      )
    }
    
    // Add request metadata to response headers
    response.headers.set('X-Request-Id', ctx.requestId)
    response.headers.set('X-Response-Time', duration.toString())
    
    return response
  } catch (error) {
    const duration = Date.now() - startTime
    
    // Log the error
    if (error instanceof ApiError) {
      const url = new URL(req.url)
      const pathParts = url.pathname.split('/').filter(Boolean)
      const resource = pathParts[2]
      
      // Log authentication failures
      if (error.status === 401) {
        await auditLogger.logAuthentication(ctx, req, false, error.message)
      }
      // Log authorization failures
      else if (error.status === 403) {
        await auditLogger.logAuthorization(
          ctx,
          req,
          resource || 'unknown',
          req.method.toLowerCase(),
          false,
          error.message
        )
      }
      // Log rate limit violations
      else if (error.status === 429) {
        await auditLogger.logRateLimit(ctx, req, 0, 0)
      }
      // Log other errors
      else {
        await auditLogger.logSecurityEvent(
          ctx,
          req,
          'api_error',
          error.status >= 500 ? 'high' : 'medium',
          error.message,
          {
            status: error.status,
            code: error.code,
            duration
          }
        )
      }
    } else {
      // Log unexpected errors
      await auditLogger.logSecurityEvent(
        ctx,
        req,
        'unexpected_error',
        'critical',
        error instanceof Error ? error.message : 'Unknown error',
        {
          error: error instanceof Error ? error.stack : String(error),
          duration
        }
      )
    }
    
    throw error
  }
}

/**
 * Audit specific actions middleware factory
 */
export function auditAction(
  action: string,
  resourceType: string,
  severity: 'low' | 'medium' | 'high' = 'low'
): Middleware {
  return async (req, ctx, next) => {
    const auditLogger = getAuditLogger()
    
    // Log the action attempt
    await auditLogger.log({
      eventType: `${resourceType}_${action}`,
      eventCategory: 'data',
      severity,
      action,
      result: 'success',
      resourceType,
      resourceId: ctx.params?.id,
      metadata: {
        method: req.method,
        body: ctx.validatedBody ? 'validated' : 'none'
      }
    }, ctx, req)
    
    return next(req, ctx)
  }
}