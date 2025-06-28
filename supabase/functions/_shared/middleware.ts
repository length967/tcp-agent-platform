import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export interface Context {
  supabase?: SupabaseClient
  user?: any
  agent?: any
  tenant?: any
  userPermissions?: string[]
  requestId: string
  startTime: number
  validatedBody?: any
  validatedQuery?: any
  validatedParams?: any
  params?: Record<string, string>
}

export type Handler = (req: Request, ctx: Context) => Promise<Response>
export type Middleware = (req: Request, ctx: Context, next: Handler) => Promise<Response>

/**
 * Creates a Supabase client with the service role key for bypassing RLS
 */
function createSupabaseClient(req: Request): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Generates a unique request ID for tracing
 */
function generateRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Composes multiple middleware functions into a single handler
 */
export function composeMiddleware(
  ...middlewares: Middleware[]
): (req: Request, handler: Handler) => Promise<Response> {
  return async function (req: Request, handler: Handler): Promise<Response> {
    const initialCtx: Context = {
      supabase: createSupabaseClient(req),
      requestId: generateRequestId(),
      startTime: Date.now()
    }

    // Create the middleware chain
    const chain = middlewares.reduceRight(
      (next, middleware) => {
        return async (req: Request, ctx: Context) => {
          return middleware(req, ctx, next)
        }
      },
      handler
    )

    try {
      return await chain(req, initialCtx)
    } catch (error) {
      console.error('Middleware error:', error)
      
      // Include CORS headers in error responses
      const origin = req.headers.get('origin')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400'
      }
      
      // In development, allow all origins
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin
      }
      
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers }
      )
    }
  }
}

/**
 * Wraps a handler with middleware
 */
export function withMiddleware(
  handler: Handler,
  ...middlewares: Middleware[]
): (req: Request) => Promise<Response> {
  const composed = composeMiddleware(...middlewares)
  return (req: Request) => composed(req, handler)
}

/**
 * Helper to create a JSON response
 */
export function jsonResponse(
  data: any,
  status: number = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  })
}

/**
 * Helper to log request completion
 */
export function logRequest(ctx: Context, status: number, message?: string) {
  const duration = Date.now() - ctx.startTime
  console.log({
    requestId: ctx.requestId,
    userId: ctx.user?.id,
    agentId: ctx.agent?.id,
    tenantId: ctx.tenant?.id,
    duration,
    status,
    message
  })
}