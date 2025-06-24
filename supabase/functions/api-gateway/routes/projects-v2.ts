import { Context } from '../../_shared/middleware.ts'
import { ApiError } from '../../_shared/errors.ts'
import { createServiceFactory } from '../../_shared/services/index.ts'
import { createProjectSchema, updateProjectSchema } from '../../_shared/services/project.service.ts'

export async function handleProjects(req: Request, ctx: Context): Promise<Response> {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  const method = req.method
  const projectId = pathParts[2] // After /api-gateway/projects/
  
  // Create service factory with context
  const services = createServiceFactory(ctx.supabase!, ctx.user?.id || null, {
    companyId: ctx.company?.id,
  })
  
  try {
    switch (method) {
      case 'GET':
        if (projectId) {
          const project = await services.projects.get(projectId)
          return new Response(JSON.stringify({ project }), {
            headers: { 'Content-Type': 'application/json' },
          })
        }
        
        // List projects with optional company filter
        const searchParams = url.searchParams
        const companyId = searchParams.get('company_id') || undefined
        
        const projects = await services.projects.list({ company_id: companyId })
        return new Response(JSON.stringify({ projects }), {
          headers: { 'Content-Type': 'application/json' },
        })
      
      case 'POST':
        const createData = await req.json()
        
        // Get company ID from context or request
        const companyId = ctx.company?.id || createData.company_id
        if (!companyId) {
          throw new ApiError(400, 'Company ID is required')
        }
        
        const project = await services.projects.create(companyId, createData)
        return new Response(JSON.stringify({ project }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      
      case 'PUT':
      case 'PATCH':
        if (!projectId) {
          throw new ApiError(400, 'Project ID is required')
        }
        
        const updateData = await req.json()
        const updatedProject = await services.projects.update(projectId, updateData)
        return new Response(JSON.stringify({ project: updatedProject }), {
          headers: { 'Content-Type': 'application/json' },
        })
      
      case 'DELETE':
        if (!projectId) {
          throw new ApiError(400, 'Project ID is required')
        }
        
        await services.projects.delete(projectId)
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      
      default:
        throw new ApiError(405, 'Method not allowed')
    }
  } catch (error) {
    // Error handling is done by the middleware
    throw error
  }
}