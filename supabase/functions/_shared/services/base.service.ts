import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../types.ts'
import { ApiError, ValidationError, NotFoundError, UnauthorizedError } from '../errors.ts'

/**
 * Base service class providing common functionality for all services
 */
export abstract class BaseService {
  protected supabase: SupabaseClient<Database>
  protected userId: string | null
  
  constructor(
    protected context: {
      supabase: SupabaseClient<Database>
      userId: string | null
      projectId?: string | null
      companyId?: string | null
    }
  ) {
    this.supabase = context.supabase
    this.userId = context.userId
  }
  
  /**
   * Get the current user ID, throwing if not authenticated
   */
  protected requireAuth(): string {
    if (!this.userId) {
      throw new UnauthorizedError('Authentication required')
    }
    return this.userId
  }
  
  /**
   * Get the current project ID from context
   */
  protected getProjectId(): string | null {
    return this.context.projectId || null
  }
  
  /**
   * Get the current company ID from context
   */
  protected getCompanyId(): string | null {
    return this.context.companyId || null
  }
  
  /**
   * Check if user has permission for a resource
   */
  protected async checkPermission(
    resourceType: 'project' | 'company' | 'agent' | 'transfer',
    resourceId: string,
    requiredPermission: string
  ): Promise<boolean> {
    const userId = this.requireAuth()
    
    // Implement permission checking logic based on resource type
    switch (resourceType) {
      case 'project':
        const { data: projectMember } = await this.supabase
          .from('project_members')
          .select('role, permissions')
          .eq('project_id', resourceId)
          .eq('user_id', userId)
          .single()
        
        if (!projectMember) return false
        
        // Check role-based permissions
        if (projectMember.role === 'admin') return true
        if (projectMember.role === 'editor' && requiredPermission !== 'delete') return true
        
        // Check specific permissions
        return projectMember.permissions?.[requiredPermission] === true
        
      case 'company':
        const { data: companyMember } = await this.supabase
          .from('company_members')
          .select('role, permissions')
          .eq('company_id', resourceId)
          .eq('user_id', userId)
          .single()
        
        if (!companyMember) return false
        
        // Company owners have all permissions
        if (companyMember.role === 'owner') return true
        if (companyMember.role === 'admin' && requiredPermission !== 'delete') return true
        
        return companyMember.permissions?.[requiredPermission] === true
        
      default:
        return false
    }
  }
  
  /**
   * Require permission for a resource, throwing if not authorized
   */
  protected async requirePermission(
    resourceType: 'project' | 'company' | 'agent' | 'transfer',
    resourceId: string,
    requiredPermission: string
  ): Promise<void> {
    const hasPermission = await this.checkPermission(resourceType, resourceId, requiredPermission)
    if (!hasPermission) {
      throw new UnauthorizedError(`Insufficient permissions for ${requiredPermission} on ${resourceType}`)
    }
  }
  
  /**
   * Handle database errors and convert to appropriate API errors
   */
  protected handleDatabaseError(error: any): never {
    console.error('Database error:', error)
    
    if (error.code === '23505') {
      throw new ValidationError('Resource already exists')
    }
    
    if (error.code === '23503') {
      throw new ValidationError('Referenced resource not found')
    }
    
    if (error.code === '22P02') {
      throw new ValidationError('Invalid input format')
    }
    
    throw new ApiError(500, 'Database operation failed')
  }
  
  /**
   * Paginate query results
   */
  protected paginate<T>(
    query: any,
    page: number = 1,
    pageSize: number = 20
  ): any {
    const offset = (page - 1) * pageSize
    return query.range(offset, offset + pageSize - 1)
  }
  
  /**
   * Apply common filters
   */
  protected applyFilters<T>(
    query: any,
    filters: Record<string, any>
  ): any {
    let filteredQuery = query
    
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          filteredQuery = filteredQuery.in(key, value)
        } else {
          filteredQuery = filteredQuery.eq(key, value)
        }
      }
    }
    
    return filteredQuery
  }
}