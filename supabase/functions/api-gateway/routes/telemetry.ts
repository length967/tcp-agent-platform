import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import {
  submitTelemetrySchema,
  batchTelemetrySchema,
  uuidSchema
} from '../../_shared/validation/schemas.ts'

export async function handleTelemetry(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // POST /telemetry - Submit telemetry data (agent auth)
  // POST /telemetry/batch - Submit batch telemetry data (agent auth)
  // GET /telemetry/agent/:id - Get telemetry for specific agent (user auth)
  // GET /telemetry/project/:id - Get aggregated telemetry for project (user auth)
  
  const method = req.method
  const resource = pathParts[2] // After /api-gateway/telemetry/
  const resourceId = pathParts[3]
  
  const supabase = ctx.supabase!
  
  switch (method) {
    case 'POST':
      // These endpoints require agent authentication
      if (!ctx.agent) {
        throw new ApiError(401, 'Agent authentication required')
      }
      
      if (resource === 'batch') {
        return submitBatchTelemetry(req, supabase, ctx.agent)
      }
      return submitTelemetry(req, supabase, ctx.agent)
    
    case 'GET':
      // These endpoints require user authentication
      if (!ctx.user) {
        throw new ApiError(401, 'User authentication required')
      }
      
      if (resource === 'agent' && resourceId) {
        return getAgentTelemetry(supabase, resourceId, ctx.user.project_id!)
      }
      if (resource === 'project' && resourceId) {
        return getProjectTelemetry(supabase, resourceId, ctx.user)
      }
      
      throw new ApiError(400, 'Invalid telemetry endpoint')
    
    default:
      throw new ApiError(405, 'Method not allowed')
  }
}

async function submitTelemetry(req: Request, supabase: any, agent: any): Promise<Response> {
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = submitTelemetrySchema.parse(rawBody)
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
  
  const { metrics, timestamp } = body
  
  // Insert telemetry data
  const { error } = await supabase
    .from('agent_telemetry')
    .insert({
      agent_id: agent.id,
      project_id: agent.project_id,
      timestamp: timestamp || new Date().toISOString(),
      metrics
    })
  
  if (error) {
    throw new ApiError(500, 'Failed to store telemetry')
  }
  
  // Update agent last seen
  await supabase
    .from('agents')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', agent.id)
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function submitBatchTelemetry(req: Request, supabase: any, agent: any): Promise<Response> {
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = batchTelemetrySchema.parse(rawBody)
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
  
  const { telemetry } = body
  
  // Prepare batch insert
  const records = telemetry.map(t => ({
    agent_id: agent.id,
    project_id: agent.project_id,
    timestamp: t.timestamp || new Date().toISOString(),
    metrics: t.metrics
  }))
  
  // Insert batch telemetry
  const { error } = await supabase
    .from('agent_telemetry')
    .insert(records)
  
  if (error) {
    throw new ApiError(500, 'Failed to store telemetry batch')
  }
  
  // Update agent last seen
  await supabase
    .from('agents')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', agent.id)
  
  return new Response(
    JSON.stringify({ 
      success: true,
      count: records.length 
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getAgentTelemetry(
  supabase: any, 
  agentId: string, 
  projectId: string
): Promise<Response> {
  // Verify agent belongs to project
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('project_id', projectId)
    .single()
  
  if (agentError || !agent) {
    throw new ApiError(404, 'Agent not found')
  }
  
  // Get telemetry for last 24 hours by default
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  const { data: telemetry, error } = await supabase
    .from('agent_telemetry')
    .select('*')
    .eq('agent_id', agentId)
    .gte('timestamp', since)
    .order('timestamp', { ascending: false })
    .limit(1000)
  
  if (error) {
    throw new ApiError(500, 'Failed to fetch telemetry')
  }
  
  return new Response(
    JSON.stringify({ telemetry }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getProjectTelemetry(
  supabase: any, 
  projectId: string,
  user: any
): Promise<Response> {
  // Verify user has access to project
  const { data: member, error: memberError } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()
  
  if (memberError || !member) {
    throw new ApiError(403, 'Access denied')
  }
  
  // Get aggregated telemetry for all agents in project
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  
  // Get all agents in project
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('id, name')
    .eq('project_id', projectId)
  
  if (agentsError) {
    throw new ApiError(500, 'Failed to fetch agents')
  }
  
  // Get telemetry for each agent
  const telemetryPromises = agents.map(async (agent: any) => {
    const { data, error } = await supabase
      .from('agent_telemetry')
      .select('*')
      .eq('agent_id', agent.id)
      .gte('timestamp', since)
      .order('timestamp', { ascending: false })
      .limit(100)
    
    return {
      agent_id: agent.id,
      agent_name: agent.name,
      telemetry: error ? [] : data
    }
  })
  
  const agentTelemetry = await Promise.all(telemetryPromises)
  
  // Calculate aggregate metrics
  const aggregates = {
    total_agents: agents.length,
    active_agents: agentTelemetry.filter(a => a.telemetry.length > 0).length,
    total_data_points: agentTelemetry.reduce((sum, a) => sum + a.telemetry.length, 0)
  }
  
  return new Response(
    JSON.stringify({ 
      aggregates,
      agents: agentTelemetry
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}