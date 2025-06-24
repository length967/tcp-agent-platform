import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '../types.ts'
import { ProjectService } from './project.service.ts'

export interface ServiceContext {
  supabase: SupabaseClient<Database>
  userId: string | null
  projectId?: string | null
  companyId?: string | null
}

/**
 * Service factory to create service instances with context
 */
export class ServiceFactory {
  constructor(private context: ServiceContext) {}
  
  /**
   * Get or create a project service instance
   */
  get projects(): ProjectService {
    return new ProjectService(this.context)
  }
  
  /**
   * Create a new factory with updated context
   */
  withContext(updates: Partial<ServiceContext>): ServiceFactory {
    return new ServiceFactory({
      ...this.context,
      ...updates,
    })
  }
}

/**
 * Create a service factory from a request
 */
export function createServiceFactory(
  supabase: SupabaseClient<Database>,
  userId: string | null,
  additionalContext?: Partial<ServiceContext>
): ServiceFactory {
  return new ServiceFactory({
    supabase,
    userId,
    ...additionalContext,
  })
}

// Re-export services
export { ProjectService } from './project.service.ts'
export { BaseService } from './base.service.ts'