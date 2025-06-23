import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'
import { generateAgentToken } from '../../_shared/auth/agentAuth.ts'
import { generateToken } from '../../_shared/auth/tokens.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import {
  createAgentSchema,
  updateAgentSchema,
  agentAuthenticateSchema,
  uuidSchema
} from '../../_shared/validation/schemas.ts'

export async function handleAgents(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // GET /agents - List agents for current project
  // POST /agents - Create new agent
  // GET /agents/:id - Get agent details
  // PUT /agents/:id - Update agent
  // DELETE /agents/:id - Delete agent
  // POST /agents/:id/register - Generate registration token
  // POST /agents/authenticate - Exchange registration token for JWT
  
  const method = req.method
  const agentId = pathParts[2] // After /api-gateway/agents/
  const action = pathParts[3] // After /api-gateway/agents/:id/
  
  // Get project context from user
  const projectId = ctx.user?.project_id
  if (!projectId) {
    // Try to get from request body for agent authentication
    if (method === 'POST' && agentId === 'authenticate') {
      // Allow authenticate endpoint without project context
    } else {
      throw new ApiError(400, 'No project context')
    }
  }
  
  const supabase = ctx.supabase!
  
  // Handle authenticate endpoint specially (no user auth required)
  if (method === 'POST' && agentId === 'authenticate') {
    return handleAgentAuthenticate(req, supabase)
  }
  
  switch (method) {
    case 'GET':
      if (agentId) {
        return getAgent(supabase, agentId, projectId!)
      }
      return listAgents(supabase, projectId!)
    
    case 'POST':
      if (agentId && action === 'register') {
        return generateRegistrationToken(supabase, agentId, projectId!, ctx.user!)
      }
      return createAgent(req, supabase, projectId!, ctx.user!)
    
    case 'PUT':
      if (!agentId) {
        throw new ApiError(400, 'Agent ID required')
      }
      return updateAgent(req, supabase, agentId, projectId!)
    
    case 'DELETE':
      if (!agentId) {
        throw new ApiError(400, 'Agent ID required')
      }
      return deleteAgent(supabase, agentId, projectId!)
    
    default:
      throw new ApiError(405, 'Method not allowed')
  }
}

async function listAgents(supabase: any, projectId: string): Promise<Response> {
  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new ApiError(500, 'Failed to list agents')
  }
  
  return new Response(
    JSON.stringify({ agents }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getAgent(supabase: any, agentId: string, projectId: string): Promise<Response> {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('project_id', projectId)
    .single()
  
  if (error || !agent) {
    throw new ApiError(404, 'Agent not found')
  }
  
  return new Response(
    JSON.stringify({ agent }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function createAgent(req: Request, supabase: any, projectId: string, user: any): Promise<Response> {
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = createAgentSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', {
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      })
    }
    throw new ApiError(400, 'Invalid request body')
  }
  
  const { name, platform, capabilities } = body
  
  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      name,
      platform,
      project_id: projectId,
      capabilities: capabilities || {},
      status: 'pending',
      settings: {
        transfer_settings: {
          chunk_size: 1024 * 1024, // 1MB default
          max_concurrent: 5,
          retry_attempts: 3
        }
      }
    })
    .select()
    .single()
  
  if (error) {
    throw new ApiError(500, 'Failed to create agent')
  }
  
  return new Response(
    JSON.stringify({ agent }),
    { 
      status: 201,
      headers: { 'Content-Type': 'application/json' } 
    }
  )
}

async function updateAgent(req: Request, supabase: any, agentId: string, projectId: string): Promise<Response> {
  // Validate agent ID
  try {
    uuidSchema.parse(agentId)
  } catch {
    throw new ApiError(400, 'Invalid agent ID')
  }
  
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = updateAgentSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', {
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      })
    }
    throw new ApiError(400, 'Invalid request body')
  }
  
  const { name, capabilities, settings } = body
  
  const updates: any = {}
  if (name !== undefined) updates.name = name
  if (capabilities !== undefined) updates.capabilities = capabilities
  if (settings !== undefined) updates.settings = settings
  
  const { data: agent, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', agentId)
    .eq('project_id', projectId)
    .select()
    .single()
  
  if (error) {
    throw new ApiError(500, 'Failed to update agent')
  }
  
  if (!agent) {
    throw new ApiError(404, 'Agent not found')
  }
  
  return new Response(
    JSON.stringify({ agent }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function deleteAgent(supabase: any, agentId: string, projectId: string): Promise<Response> {
  const { error } = await supabase
    .from('agents')
    .delete()
    .eq('id', agentId)
    .eq('project_id', projectId)
  
  if (error) {
    throw new ApiError(500, 'Failed to delete agent')
  }
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function generateRegistrationToken(
  supabase: any, 
  agentId: string, 
  projectId: string,
  user: any
): Promise<Response> {
  // Verify agent exists
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('project_id', projectId)
    .single()
  
  if (agentError || !agent) {
    throw new ApiError(404, 'Agent not found')
  }
  
  // Generate registration token (15 minute expiry)
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  
  // Store token
  const { error: tokenError } = await supabase
    .from('agent_registration_tokens')
    .insert({
      token,
      agent_id: agentId,
      project_id: projectId,
      expires_at: expiresAt.toISOString(),
      created_by: user.id
    })
  
  if (tokenError) {
    throw new ApiError(500, 'Failed to generate registration token')
  }
  
  // Update agent status to pending if it was inactive
  if (agent.status === 'inactive') {
    await supabase
      .from('agents')
      .update({ status: 'pending' })
      .eq('id', agentId)
  }
  
  return new Response(
    JSON.stringify({ 
      token,
      expires_at: expiresAt.toISOString(),
      agent_id: agentId
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function handleAgentAuthenticate(req: Request, supabase: any): Promise<Response> {
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = agentAuthenticateSchema.parse(rawBody)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', {
        errors: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      })
    }
    throw new ApiError(400, 'Invalid request body')
  }
  
  const { token, api_key } = body
  
  // Verify registration token
  const { data: tokenData, error: tokenError } = await supabase
    .from('agent_registration_tokens')
    .select('*, agents!inner(*)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()
  
  if (tokenError || !tokenData) {
    throw new ApiError(401, 'Invalid or expired registration token')
  }
  
  const agent = tokenData.agents
  
  // Generate and store API key hash
  const apiKeyHash = await hashApiKey(api_key)
  
  // Update agent with API key and activate
  const { error: updateError } = await supabase
    .from('agents')
    .update({
      api_key_hash: apiKeyHash,
      status: 'active',
      last_seen_at: new Date().toISOString()
    })
    .eq('id', agent.id)
  
  if (updateError) {
    throw new ApiError(500, 'Failed to activate agent')
  }
  
  // Delete used registration token
  await supabase
    .from('agent_registration_tokens')
    .delete()
    .eq('token', token)
  
  // Generate JWT for agent
  const jwt = await generateAgentToken(agent.id, agent.project_id)
  
  return new Response(
    JSON.stringify({
      jwt,
      agent: {
        id: agent.id,
        name: agent.name,
        project_id: agent.project_id
      }
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

// Simple hash function for API keys (in production, use bcrypt or similar)
async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}