import { Middleware } from '../types.ts'
import { RateLimitError } from '../utils/errors.ts'

// In-memory rate limit store (for basic implementation)
// In production, use Redis or Upstash
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

// Rate limits by subscription tier
const RATE_LIMITS = {
  free: { requests: 100, windowMs: 60000 }, // 100 requests per minute
  starter: { requests: 500, windowMs: 60000 }, // 500 requests per minute
  professional: { requests: 1000, windowMs: 60000 }, // 1000 requests per minute
  enterprise: { requests: 5000, windowMs: 60000 }, // 5000 requests per minute
}

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredEntries, 60000)

/**
 * Get client identifier for rate limiting
 */
function getClientId(req: Request, ctx: AppContext): string {
  // Prefer user/tenant ID if authenticated
  if (ctx.tenant?.id) {
    return `tenant:${ctx.tenant.id}`
  }
  if (ctx.user?.id) {
    return `user:${ctx.user.id}`
  }
  
  // Fall back to IP address
  const forwardedFor = req.headers.get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0].trim() || 'unknown'
  return `ip:${ip}`
}

/**
 * Basic rate limiting middleware
 */
export const withRateLimit: Middleware = async (req, ctx, next) => {
  const clientId = getClientId(req, ctx)
  const now = Date.now()
  
  // Get rate limit based on subscription tier
  const tier = ctx.tenant?.plan || 'free'
  const limit = RATE_LIMITS[tier as keyof typeof RATE_LIMITS] || RATE_LIMITS.free
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(clientId)
  
  if (!entry || entry.resetAt < now) {
    // Create new entry
    entry = {
      count: 0,
      resetAt: now + limit.windowMs
    }
    rateLimitStore.set(clientId, entry)
  }
  
  // Increment count
  entry.count++
  
  // Check if limit exceeded
  if (entry.count > limit.requests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    const error = new RateLimitError(
      `Rate limit exceeded. Please retry after ${retryAfter} seconds.`
    )
    
    // Add rate limit headers to error response
    const response = new Response(
      JSON.stringify({
        error: {
          message: error.message,
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429
        }
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limit.requests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': entry.resetAt.toString(),
          'Retry-After': retryAfter.toString()
        }
      }
    )
    
    throw response
  }
  
  // Add rate limit headers to response
  const response = await next(req, ctx)
  const remaining = Math.max(0, limit.requests - entry.count)
  
  response.headers.set('X-RateLimit-Limit', limit.requests.toString())
  response.headers.set('X-RateLimit-Remaining', remaining.toString())
  response.headers.set('X-RateLimit-Reset', entry.resetAt.toString())
  
  return response
}

/**
 * Strict rate limiting for sensitive operations
 */
export function withStrictRateLimit(
  maxRequests: number,
  windowMs: number
): Middleware {
  return async (req, ctx, next) => {
    const clientId = getClientId(req, ctx)
    const now = Date.now()
    const key = `strict:${clientId}:${req.url}`
    
    let entry = rateLimitStore.get(key)
    
    if (!entry || entry.resetAt < now) {
      entry = {
        count: 0,
        resetAt: now + windowMs
      }
      rateLimitStore.set(key, entry)
    }
    
    entry.count++
    
    if (entry.count > maxRequests) {
      throw new RateLimitError(
        `Too many requests to this endpoint. Please try again later.`
      )
    }
    
    return next(req, ctx)
  }
}