import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { Context, Middleware } from '../middleware.ts'
import { ApiError } from '../errors.ts'
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

// Use Supabase JWT secret
const JWT_SECRET = Deno.env.get('JWT_SECRET') || Deno.env.get('SUPABASE_JWT_SECRET') || 'super-secret-jwt-token-with-at-least-32-characters-long'

interface AgentToken {
  agent_id: string
  project_id: string
  type: 'agent'
  iat: number
  exp: number
}

/**
 * Extract agent token from request
 */
function extractAgentToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  
  return authHeader.substring(7)
}

/**
 * Verify agent JWT token
 */
async function verifyAgentToken(token: string): Promise<AgentToken> {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET)
    const { payload } = await jose.jwtVerify(token, secret)
    
    const decoded = payload as unknown as AgentToken
    
    // Ensure it's an agent token
    if (decoded.type !== 'agent') {
      throw new Error('Invalid token type')
    }
    
    return decoded
  } catch (error) {
    throw new ApiError(401, 'Invalid agent token')
  }
}

/**
 * Agent authentication middleware
 * Validates agent JWT tokens and adds agent context
 */
export const withAgent: Middleware = async (req, ctx, next) => {
  const token = extractAgentToken(req)
  
  if (!token) {
    throw new ApiError(401, 'Missing agent authentication token')
  }
  
  // Verify token
  const agentToken = await verifyAgentToken(token)
  
  // Create supabase client with service role
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  // Verify agent exists and is active
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentToken.agent_id)
    .eq('project_id', agentToken.project_id)
    .single()
  
  if (agentError || !agent) {
    throw new ApiError(401, 'Agent not found or inactive')
  }
  
  if (agent.status !== 'active') {
    throw new ApiError(403, 'Agent is not active')
  }
  
  // Add agent to context
  ctx.agent = {
    id: agent.id,
    name: agent.name,
    project_id: agent.project_id,
    version: agent.version,
    capabilities: agent.capabilities
  }
  
  ctx.supabase = supabase
  
  return next(req, ctx)
}

/**
 * Generate agent JWT token
 */
export async function generateAgentToken(agentId: string, projectId: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET)
  
  const jwt = await new jose.SignJWT({
    agent_id: agentId,
    project_id: projectId,
    type: 'agent'
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret)
  
  return jwt
}

/**
 * Validate agent belongs to project
 */
export async function validateAgentProject(
  supabase: any,
  agentId: string,
  projectId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('project_id', projectId)
    .single()
  
  return !error && !!data
}