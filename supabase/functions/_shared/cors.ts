import { Middleware } from './middleware.ts'

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  // For development - allow all localhost variations
  'http://localhost:54321',
  'http://127.0.0.1:54321',
]

// For development only - allow all origins
const isDevelopment = Deno.env.get('ENVIRONMENT') === 'development' || !Deno.env.get('ENVIRONMENT')

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours
}

/**
 * CORS middleware
 */
export const withCors: Middleware = async (req, ctx, next) => {
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('origin')
    const headers = { ...corsHeaders }
    
    // In development, allow all origins
    if (isDevelopment && origin) {
      headers['Access-Control-Allow-Origin'] = origin
    } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
    }
    
    return new Response('ok', { headers })
  }
  
  // Process request and add CORS headers to response
  const response = await next(req, ctx)
  
  const origin = req.headers.get('origin')
  
  // In development, allow all origins
  if (isDevelopment && origin) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  
  // Add other CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}