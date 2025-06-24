import { BaseService } from './base.service.ts'
import { NotFoundError, ValidationError } from '../errors.ts'
import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
  settings: z.record(z.any()).optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  settings: z.record(z.any()).optional(),
})

export class ProjectService extends BaseService {
  /**
   * List all projects the user has access to
   */
  async list(filters?: { company_id?: string }) {
    const userId = this.requireAuth()
    
    let query = this.supabase
      .from('projects')
      .select(`
        *,
        company:companies(id, name, slug),
        project_members!inner(role, permissions)
      `)
      .eq('project_members.user_id', userId)
    
    if (filters?.company_id) {
      query = query.eq('company_id', filters.company_id)
    }
    
    const { data, error } = await query.order('created_at', { ascending: false })
    
    if (error) this.handleDatabaseError(error)
    
    return data || []
  }
  
  /**
   * Get a single project by ID
   */
  async get(projectId: string) {
    await this.requirePermission('project', projectId, 'read')
    
    const { data, error } = await this.supabase
      .from('projects')
      .select(`
        *,
        company:companies(id, name, slug),
        project_members(user_id, role, permissions)
      `)
      .eq('id', projectId)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Project not found')
      }
      this.handleDatabaseError(error)
    }
    
    return data
  }
  
  /**
   * Create a new project
   */
  async create(companyId: string, data: z.infer<typeof createProjectSchema>) {
    const userId = this.requireAuth()
    await this.requirePermission('company', companyId, 'create_project')
    
    // Validate input
    const validated = createProjectSchema.parse(data)
    
    // Start transaction
    const { data: project, error: createError } = await this.supabase
      .from('projects')
      .insert({
        company_id: companyId,
        name: validated.name,
        slug: validated.slug,
        settings: validated.settings || {},
      })
      .select()
      .single()
    
    if (createError) {
      if (createError.code === '23505') {
        throw new ValidationError('A project with this slug already exists')
      }
      this.handleDatabaseError(createError)
    }
    
    // Add creator as admin
    const { error: memberError } = await this.supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: userId,
        role: 'admin',
        permissions: { all: true },
      })
    
    if (memberError) {
      // Rollback by deleting the project
      await this.supabase.from('projects').delete().eq('id', project.id)
      this.handleDatabaseError(memberError)
    }
    
    return project
  }
  
  /**
   * Update a project
   */
  async update(projectId: string, data: z.infer<typeof updateProjectSchema>) {
    await this.requirePermission('project', projectId, 'update')
    
    // Validate input
    const validated = updateProjectSchema.parse(data)
    
    const { data: project, error } = await this.supabase
      .from('projects')
      .update({
        ...validated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select()
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Project not found')
      }
      this.handleDatabaseError(error)
    }
    
    return project
  }
  
  /**
   * Delete a project
   */
  async delete(projectId: string) {
    await this.requirePermission('project', projectId, 'delete')
    
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
    
    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError('Project not found')
      }
      this.handleDatabaseError(error)
    }
  }
  
  /**
   * Get project statistics
   */
  async getStats(projectId: string) {
    await this.requirePermission('project', projectId, 'read')
    
    // Get agent count
    const { count: agentCount } = await this.supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
    
    // Get active transfer count
    const { count: activeTransferCount } = await this.supabase
      .from('transfers')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('status', ['pending', 'in_progress'])
    
    // Get member count
    const { count: memberCount } = await this.supabase
      .from('project_members')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
    
    return {
      agents: agentCount || 0,
      activeTransfers: activeTransferCount || 0,
      members: memberCount || 0,
    }
  }
}