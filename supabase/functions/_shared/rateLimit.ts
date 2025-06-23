import { Middleware } from './middleware.ts'
import { ApiError } from './errors.ts'

// In-memory store for rate limiting (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000)

interface RateLimitConfig {
  requests: number
  windowMs: number
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  free: { requests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
  pro: { requests: 1000, windowMs: 15 * 60 * 1000 }, // 1000 requests per 15 minutes
  enterprise: { requests: 10000, windowMs: 15 * 60 * 1000 }, // 10000 requests per 15 minutes
  anonymous: { requests: 20, windowMs: 15 * 60 * 1000 } // 20 requests per 15 minutes
}

/**
 * Rate limiting middleware
 */
export const withRateLimit: Middleware = async (req, ctx, next) => {
  // Get identifier (IP address or user ID)
  const identifier = ctx.user?.id || ctx.agent?.id || req.headers.get('x-forwarded-for') || 'anonymous'
  
  // Get rate limit tier
  const tier = ctx.user?.subscription_tier || 'free'
  const limits = DEFAULT_LIMITS[tier] || DEFAULT_LIMITS.free
  
  // Create rate limit key
  const key = `ratelimit:${identifier}:${req.url}`
  
  // Get current state
  const now = Date.now()
  const state = rateLimitStore.get(key) || { count: 0, resetAt: now + limits.windowMs }
  
  // Check if window has expired
  if (state.resetAt < now) {
    state.count = 0
    state.resetAt = now + limits.windowMs
  }
  
  // Increment count
  state.count++
  rateLimitStore.set(key, state)
  
  // Check if limit exceeded
  if (state.count > limits.requests) {
    const retryAfter = Math.ceil((state.resetAt - now) / 1000)
    
    const response = new Response(
      JSON.stringify({
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          status: 429
        }
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': limits.requests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(state.resetAt).toISOString(),
          'Retry-After': retryAfter.toString()
        }
      }
    )
    
    return response
  }
  
  // Process request
  const response = await next(req, ctx)
  
  // Add rate limit headers
  response.headers.set('X-RateLimit-Limit', limits.requests.toString())
  response.headers.set('X-RateLimit-Remaining', (limits.requests - state.count).toString())
  response.headers.set('X-RateLimit-Reset', new Date(state.resetAt).toISOString())
  
  return response
}