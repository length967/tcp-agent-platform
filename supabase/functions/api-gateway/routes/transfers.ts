import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import {
  createTransferSchema,
  updateTransferSchema,
  uuidSchema
} from '../../_shared/validation/schemas.ts'
import { generateSignedUrl, validateFileUpload } from '../../_shared/storage/security.ts'

export async function handleTransfers(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // GET /transfers - List transfers for current project
  // POST /transfers - Create new transfer
  // GET /transfers/:id - Get transfer details
  // PUT /transfers/:id - Update transfer status
  // DELETE /transfers/:id - Cancel/delete transfer
  // POST /transfers/:id/upload-url - Get signed upload URL
  // POST /transfers/:id/download-url - Get signed download URL
  
  const method = req.method
  const transferId = pathParts[2] // After /api-gateway/transfers/
  const action = pathParts[3] // After /api-gateway/transfers/:id/
  
  // Require either user or agent authentication
  if (!ctx.user && !ctx.agent) {
    throw new ApiError(401, 'Authentication required')
  }
  
  // Get project ID from query params or headers
  const projectId = url.searchParams.get('project_id') || req.headers.get('X-Project-ID')
  
  const supabase = ctx.supabase!
  
  // For listing transfers without a specific project, return all transfers the user has access to
  if (!projectId && method === 'GET' && !transferId) {
    return listAllUserTransfers(supabase, ctx)
  }
  
  if (!projectId && method !== 'GET') {
    throw new ApiError(400, 'Project ID required')
  }
  
  switch (method) {
    case 'GET':
      if (transferId) {
        return getTransfer(supabase, transferId, projectId, ctx)
      }
      return listTransfers(supabase, projectId, ctx)
    
    case 'POST':
      if (transferId && action === 'upload-url') {
        return generateUploadUrl(req, supabase, transferId, projectId, ctx)
      }
      if (transferId && action === 'download-url') {
        return generateDownloadUrl(req, supabase, transferId, projectId, ctx)
      }
      return createTransfer(req, supabase, projectId, ctx)
    
    case 'PUT':
      if (!transferId) {
        throw new ApiError(400, 'Transfer ID required')
      }
      return updateTransfer(req, supabase, transferId, projectId, ctx)
    
    case 'DELETE':
      if (!transferId) {
        throw new ApiError(400, 'Transfer ID required')
      }
      return deleteTransfer(supabase, transferId, projectId, ctx)
    
    default:
      throw new ApiError(405, 'Method not allowed')
  }
}

async function listTransfers(
  supabase: any, 
  projectId: string,
  ctx: Context
): Promise<Response> {
  const { data: transfers, error } = await supabase
    .from('transfers')
    .select(`
      *,
      source_agent:agents!source_agent_id(id, name),
      destination_agent:agents!destination_agent_id(id, name)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(100)
  
  if (error) {
    throw new ApiError(500, 'Failed to list transfers')
  }
  
  return new Response(
    JSON.stringify({ transfers }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function listAllUserTransfers(
  supabase: any,
  ctx: Context
): Promise<Response> {
  if (!ctx.user || !ctx.tenant) {
    throw new ApiError(401, 'User authentication required')
  }
  
  // Get all projects the user has access to
  const { data: userProjects, error: projectError } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', ctx.user.id)
  
  if (projectError) {
    throw new ApiError(500, `Failed to fetch user projects: ${projectError.message}`)
  }
  
  if (!userProjects || userProjects.length === 0) {
    return new Response(
      JSON.stringify({ transfers: [] }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }
  
  const projectIds = userProjects.map(p => p.project_id)
  
  // Get transfers from all user's projects
  const { data: transfers, error } = await supabase
    .from('transfers')
    .select(`
      *,
      project:projects(id, name),
      source_agent:agents!source_agent_id(id, name),
      destination_agent:agents!destination_agent_id(id, name)
    `)
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error) {
    throw new ApiError(500, `Failed to fetch transfers: ${error.message}`)
  }
  
  return new Response(
    JSON.stringify({ transfers: transfers || [] }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getTransfer(
  supabase: any, 
  transferId: string, 
  projectId: string,
  ctx: Context
): Promise<Response> {
  const { data: transfer, error } = await supabase
    .from('transfers')
    .select(`
      *,
      source_agent:agents!source_agent_id(id, name),
      destination_agent:agents!destination_agent_id(id, name),
      transfer_files(*)
    `)
    .eq('id', transferId)
    .eq('project_id', projectId)
    .single()
  
  if (error || !transfer) {
    throw new ApiError(404, 'Transfer not found')
  }
  
  return new Response(
    JSON.stringify({ transfer }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function createTransfer(
  req: Request, 
  supabase: any, 
  projectId: string,
  ctx: Context
): Promise<Response> {
  // Only users can create transfers
  if (!ctx.user) {
    throw new ApiError(403, 'Only users can create transfers')
  }
  
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = createTransferSchema.parse(rawBody)
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
  
  const { name, source_agent_id, destination_agent_id, files, settings } = body
  
  // Verify agents belong to project
  const agentIds = [source_agent_id, destination_agent_id].filter(Boolean)
  if (agentIds.length > 0) {
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .in('id', agentIds)
      .eq('project_id', projectId)
    
    if (agentError || agents.length !== agentIds.length) {
      throw new ApiError(400, 'Invalid agent IDs')
    }
  }
  
  // Create transfer
  const { data: transfer, error: transferError } = await supabase
    .from('transfers')
    .insert({
      name,
      project_id: projectId,
      source_agent_id,
      destination_agent_id,
      status: 'pending',
      settings: settings || {},
      created_by: ctx.user.id
    })
    .select()
    .single()
  
  if (transferError) {
    throw new ApiError(500, 'Failed to create transfer')
  }
  
  // Add files to transfer
  if (files && files.length > 0) {
    const fileRecords = files.map(file => ({
      transfer_id: transfer.id,
      file_path: file.path,
      file_name: file.name || file.path.split('/').pop(),
      file_size: file.size,
      metadata: file.metadata || {}
    }))
    
    const { error: filesError } = await supabase
      .from('transfer_files')
      .insert(fileRecords)
    
    if (filesError) {
      // Rollback transfer creation
      await supabase.from('transfers').delete().eq('id', transfer.id)
      throw new ApiError(500, 'Failed to add files to transfer')
    }
  }
  
  return new Response(
    JSON.stringify({ transfer }),
    { 
      status: 201,
      headers: { 'Content-Type': 'application/json' } 
    }
  )
}

async function updateTransfer(
  req: Request,
  supabase: any,
  transferId: string,
  projectId: string,
  ctx: Context
): Promise<Response> {
  // Validate transfer ID
  try {
    uuidSchema.parse(transferId)
  } catch {
    throw new ApiError(400, 'Invalid transfer ID')
  }
  
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = updateTransferSchema.parse(rawBody)
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
  
  const { status, progress, error: transferError } = body
  
  // Verify transfer exists and user has access
  const { data: existing, error: fetchError } = await supabase
    .from('transfers')
    .select('id, status')
    .eq('id', transferId)
    .eq('project_id', projectId)
    .single()
  
  if (fetchError || !existing) {
    throw new ApiError(404, 'Transfer not found')
  }
  
  // Check status transition is valid
  const validTransitions: Record<string, string[]> = {
    pending: ['in_progress', 'cancelled'],
    in_progress: ['completed', 'failed', 'cancelled', 'paused'],
    paused: ['in_progress', 'cancelled'],
    completed: [],
    failed: ['pending'],
    cancelled: []
  }
  
  if (status && !validTransitions[existing.status]?.includes(status)) {
    throw new ApiError(400, `Cannot transition from ${existing.status} to ${status}`)
  }
  
  // Build update object
  const updates: any = {}
  if (status !== undefined) updates.status = status
  if (progress !== undefined) updates.progress = progress
  if (transferError !== undefined) updates.error = transferError
  
  // Add completion timestamp if completing
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updates.completed_at = new Date().toISOString()
  }
  
  const { data: transfer, error: updateError } = await supabase
    .from('transfers')
    .update(updates)
    .eq('id', transferId)
    .eq('project_id', projectId)
    .select()
    .single()
  
  if (updateError) {
    throw new ApiError(500, 'Failed to update transfer')
  }
  
  return new Response(
    JSON.stringify({ transfer }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function deleteTransfer(
  supabase: any,
  transferId: string,
  projectId: string,
  ctx: Context
): Promise<Response> {
  // Only users can delete transfers
  if (!ctx.user) {
    throw new ApiError(403, 'Only users can delete transfers')
  }
  
  const { error } = await supabase
    .from('transfers')
    .delete()
    .eq('id', transferId)
    .eq('project_id', projectId)
  
  if (error) {
    throw new ApiError(500, 'Failed to delete transfer')
  }
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function generateUploadUrl(
  req: Request,
  supabase: any,
  transferId: string,
  projectId: string,
  ctx: Context
): Promise<Response> {
  // Validate request body
  const body = await req.json()
  const { file_path, file_size, content_type } = body
  
  if (!file_path) {
    throw new ApiError(400, 'file_path is required')
  }
  
  // Verify transfer exists and agent has access
  const { data: transfer, error: transferError } = await supabase
    .from('transfers')
    .select('id, source_agent_id, destination_agent_id, status')
    .eq('id', transferId)
    .eq('project_id', projectId)
    .single()
  
  if (transferError || !transfer) {
    throw new ApiError(404, 'Transfer not found')
  }
  
  // Only source agent can upload files
  if (ctx.agent && ctx.agent.id !== transfer.source_agent_id) {
    throw new ApiError(403, 'Only source agent can upload files')
  }
  
  // Validate file upload
  await validateFileUpload({
    size: file_size,
    contentType: content_type,
    projectId,
    ctx
  })
  
  // Generate signed upload URL
  const { url, fields, expires_at } = await generateSignedUrl({
    bucket: 'transfer-files',
    path: `${projectId}/${transferId}/${file_path}`,
    operation: 'upload',
    expiresIn: 3600, // 1 hour
    metadata: {
      transfer_id: transferId,
      uploaded_by: ctx.agent?.id || ctx.user?.id,
      content_type
    }
  })
  
  // Record file upload intent
  await supabase
    .from('transfer_files')
    .upsert({
      transfer_id: transferId,
      file_path,
      file_name: file_path.split('/').pop(),
      file_size,
      status: 'uploading',
      upload_started_at: new Date().toISOString()
    })
  
  return new Response(
    JSON.stringify({ 
      url,
      fields,
      expires_at,
      method: 'POST'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function generateDownloadUrl(
  req: Request,
  supabase: any,
  transferId: string,
  projectId: string,
  ctx: Context
): Promise<Response> {
  // Validate request body
  const body = await req.json()
  const { file_path } = body
  
  if (!file_path) {
    throw new ApiError(400, 'file_path is required')
  }
  
  // Verify transfer exists and user/agent has access
  const { data: transfer, error: transferError } = await supabase
    .from('transfers')
    .select('id, source_agent_id, destination_agent_id, status')
    .eq('id', transferId)
    .eq('project_id', projectId)
    .single()
  
  if (transferError || !transfer) {
    throw new ApiError(404, 'Transfer not found')
  }
  
  // Only destination agent or users can download files
  if (ctx.agent && ctx.agent.id !== transfer.destination_agent_id) {
    throw new ApiError(403, 'Only destination agent can download files')
  }
  
  // Verify file exists in transfer
  const { data: file, error: fileError } = await supabase
    .from('transfer_files')
    .select('id, status')
    .eq('transfer_id', transferId)
    .eq('file_path', file_path)
    .single()
  
  if (fileError || !file) {
    throw new ApiError(404, 'File not found in transfer')
  }
  
  // Generate signed download URL
  const { url, expires_at } = await generateSignedUrl({
    bucket: 'transfer-files',
    path: `${projectId}/${transferId}/${file_path}`,
    operation: 'download',
    expiresIn: 3600 // 1 hour
  })
  
  // Record download intent
  await supabase
    .from('transfer_file_downloads')
    .insert({
      transfer_file_id: file.id,
      downloaded_by: ctx.agent?.id || ctx.user?.id,
      downloaded_at: new Date().toISOString()
    })
  
  return new Response(
    JSON.stringify({ 
      url,
      expires_at,
      method: 'GET'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}