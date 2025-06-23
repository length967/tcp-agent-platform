import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { Context } from '../middleware.ts'

export interface AuditEvent {
  eventType: string
  eventCategory: 'security' | 'data' | 'admin' | 'system'
  severity: 'low' | 'medium' | 'high' | 'critical'
  action: string
  result: 'success' | 'failure' | 'error'
  metadata?: Record<string, any>
  resourceType?: string
  resourceId?: string
  errorCode?: string
  errorMessage?: string
}

export class AuditLogger {
  private supabase: any
  
  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey)
  }
  
  async log(
    event: AuditEvent,
    ctx: Context,
    req: Request
  ): Promise<void> {
    try {
      // Extract request information
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                 req.headers.get('x-real-ip') ||
                 'unknown'
      
      const userAgent = req.headers.get('user-agent') || 'unknown'
      const url = new URL(req.url)
      
      // Determine actor information
      let actorType: string
      let actorId: string | null = null
      let actorEmail: string | null = null
      
      if (ctx.user) {
        actorType = 'user'
        actorId = ctx.user.id
        actorEmail = ctx.user.email
      } else if (ctx.agent) {
        actorType = 'agent'
        actorId = ctx.agent.id
      } else {
        actorType = 'anonymous'
      }
      
      // Call the database function to log the event
      const { error } = await this.supabase.rpc('log_audit_event', {
        p_event_type: event.eventType,
        p_event_category: event.eventCategory,
        p_severity: event.severity,
        p_actor_type: actorType,
        p_actor_id: actorId,
        p_actor_email: actorEmail,
        p_action: event.action,
        p_result: event.result,
        p_metadata: event.metadata,
        p_company_id: ctx.tenant?.company_id,
        p_project_id: ctx.user?.project_id || ctx.agent?.project_id,
        p_resource_type: event.resourceType,
        p_resource_id: event.resourceId,
        p_error_code: event.errorCode,
        p_error_message: event.errorMessage,
        p_ip_address: ip,
        p_user_agent: userAgent,
        p_request_id: ctx.requestId,
        p_request_method: req.method,
        p_request_path: url.pathname
      })
      
      if (error) {
        console.error('Failed to log audit event:', error)
      }
    } catch (error) {
      // Don't throw - audit logging should not break the request
      console.error('Audit logging error:', error)
    }
  }
  
  // Convenience methods for common events
  
  async logAuthentication(
    ctx: Context,
    req: Request,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      eventType: 'authentication',
      eventCategory: 'security',
      severity: success ? 'low' : 'medium',
      action: 'authenticate',
      result: success ? 'success' : 'failure',
      errorMessage,
      metadata: {
        method: req.headers.get('authorization') ? 'bearer_token' : 'anonymous'
      }
    }, ctx, req)
  }
  
  async logAuthorization(
    ctx: Context,
    req: Request,
    resource: string,
    action: string,
    allowed: boolean,
    reason?: string
  ): Promise<void> {
    await this.log({
      eventType: 'authorization',
      eventCategory: 'security',
      severity: allowed ? 'low' : 'high',
      action: `${action}_${resource}`,
      result: allowed ? 'success' : 'failure',
      resourceType: resource,
      errorMessage: reason,
      metadata: {
        required_permission: action,
        user_role: ctx.user?.role || 'none'
      }
    }, ctx, req)
  }
  
  async logDataAccess(
    ctx: Context,
    req: Request,
    resource: string,
    resourceId: string,
    action: string,
    success: boolean = true
  ): Promise<void> {
    await this.log({
      eventType: 'data_access',
      eventCategory: 'data',
      severity: 'low',
      action: `${action}_${resource}`,
      result: success ? 'success' : 'failure',
      resourceType: resource,
      resourceId
    }, ctx, req)
  }
  
  async logRateLimit(
    ctx: Context,
    req: Request,
    limit: number,
    remaining: number
  ): Promise<void> {
    await this.log({
      eventType: 'rate_limit',
      eventCategory: 'security',
      severity: remaining === 0 ? 'high' : 'low',
      action: 'rate_limit_check',
      result: remaining > 0 ? 'success' : 'failure',
      metadata: {
        limit,
        remaining,
        tier: ctx.user?.subscription_tier || 'anonymous'
      }
    }, ctx, req)
  }
  
  async logSecurityEvent(
    ctx: Context,
    req: Request,
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      eventType,
      eventCategory: 'security',
      severity,
      action: eventType,
      result: 'error',
      errorMessage: message,
      metadata
    }, ctx, req)
  }
}

// Singleton instance
let auditLogger: AuditLogger | null = null

export function getAuditLogger(): AuditLogger {
  if (!auditLogger) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    auditLogger = new AuditLogger(supabaseUrl, supabaseServiceKey)
  }
  return auditLogger
}