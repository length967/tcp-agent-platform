import { Middleware } from '../types.ts'
import { jsonResponse } from '../middleware.ts'

/**
 * Get allowed origins based on environment
 */
function getAllowedOrigins(): string[] {
  const env = Deno.env.get('ENVIRONMENT') || 'development'
  const frontendUrl = Deno.env.get('FRONTEND_URL')
  
  if (env === 'development') {
    return [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ]
  }
  
  // Production: only allow the configured frontend URL
  return frontendUrl ? [frontendUrl] : []
}

/**
 * CORS configuration
 */
const corsHeaders = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Max-Age': '86400', // 24 hours
}

/**
 * Middleware that handles CORS
 */
export const withCors: Middleware = async (req, ctx, next) => {
  const origin = req.headers.get('origin')
  const allowedOrigins = getAllowedOrigins()
  
  // Check if origin is allowed
  const isAllowed = origin && allowedOrigins.includes(origin)
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    const headers: Record<string, string> = { ...corsHeaders }
    
    if (isAllowed) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Credentials'] = 'true'
    }
    
    return new Response(null, {
      status: 204,
      headers
    })
  }
  
  // For actual requests, proceed with the handler
  const response = await next(req, ctx)
  
  // Clone response to modify headers
  const newResponse = new Response(response.body, response)
  
  // Apply CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value)
  })
  
  if (isAllowed) {
    newResponse.headers.set('Access-Control-Allow-Origin', origin)
    newResponse.headers.set('Access-Control-Allow-Credentials', 'true')
  }
  
  return newResponse
}