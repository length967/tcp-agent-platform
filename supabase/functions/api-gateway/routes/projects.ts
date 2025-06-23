import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { 
  createProjectSchema, 
  updateProjectSchema,
  uuidSchema,
  paginationSchema
} from '../../_shared/validation/schemas.ts'

export async function handleProjects(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Routes:
  // GET /projects - List all projects for current user
  // GET /projects/:id - Get project details
  // POST /projects - Create new project
  // PUT /projects/:id - Update project
  // DELETE /projects/:id - Delete project
  
  const method = req.method
  const projectId = pathParts[2] // After /api-gateway/projects/
  
  const supabase = ctx.supabase!
  const user = ctx.user!
  
  // Get user's company
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  
  if (!profile?.company_id) {
    throw new ApiError(403, 'User not associated with a company')
  }
  
  switch (method) {
    case 'GET':
      if (projectId) {
        return getProject(supabase, projectId, profile.company_id)
      }
      return listProjects(supabase, profile.company_id)
    
    case 'POST':
      return createProject(req, supabase, profile.company_id, user.id)
    
    case 'PUT':
      if (!projectId) {
        throw new ApiError(400, 'Project ID required')
      }
      return updateProject(req, supabase, projectId, profile.company_id)
    
    case 'DELETE':
      if (!projectId) {
        throw new ApiError(400, 'Project ID required')
      }
      return deleteProject(supabase, projectId, profile.company_id)
    
    default:
      throw new ApiError(405, 'Method not allowed')
  }
}

async function listProjects(supabase: any, companyId: string): Promise<Response> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  
  if (error) {
    throw new ApiError(500, 'Failed to fetch projects')
  }
  
  return new Response(
    JSON.stringify({ projects }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function getProject(supabase: any, projectId: string, companyId: string): Promise<Response> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .single()
  
  if (error || !project) {
    throw new ApiError(404, 'Project not found')
  }
  
  return new Response(
    JSON.stringify({ project }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function createProject(req: Request, supabase: any, companyId: string, userId: string): Promise<Response> {
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = createProjectSchema.parse(rawBody)
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
  
  const { name, slug } = body
  
  // Generate slug if not provided
  const projectSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      name,
      slug: projectSlug,
      company_id: companyId,
      settings: {}
    })
    .select()
    .single()
  
  if (error) {
    if (error.code === '23505') { // Unique violation
      throw new ApiError(409, 'Project with this slug already exists')
    }
    throw new ApiError(500, 'Failed to create project')
  }
  
  // Add creator as project member
  await supabase
    .from('project_members')
    .insert({
      project_id: project.id,
      user_id: userId,
      role: 'owner'
    })
  
  return new Response(
    JSON.stringify({ project }),
    { 
      status: 201,
      headers: { 'Content-Type': 'application/json' } 
    }
  )
}

async function updateProject(req: Request, supabase: any, projectId: string, companyId: string): Promise<Response> {
  // Validate project ID
  try {
    uuidSchema.parse(projectId)
  } catch {
    throw new ApiError(400, 'Invalid project ID')
  }
  
  // Validate request body
  let body
  try {
    const rawBody = await req.json()
    body = updateProjectSchema.parse(rawBody)
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
  
  const { name, settings } = body
  
  const updates: any = {}
  if (name !== undefined) updates.name = name
  if (settings !== undefined) updates.settings = settings
  
  const { data: project, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .eq('company_id', companyId)
    .select()
    .single()
  
  if (error) {
    throw new ApiError(500, 'Failed to update project')
  }
  
  if (!project) {
    throw new ApiError(404, 'Project not found')
  }
  
  return new Response(
    JSON.stringify({ project }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}

async function deleteProject(supabase: any, projectId: string, companyId: string): Promise<Response> {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('company_id', companyId)
  
  if (error) {
    throw new ApiError(500, 'Failed to delete project')
  }
  
  return new Response(
    JSON.stringify({ success: true }),
    { headers: { 'Content-Type': 'application/json' } }
  )
}