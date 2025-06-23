import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { handleProjects } from './routes/projects.ts'
import { handleAuth } from './routes/auth.ts'
import { handleAgents } from './routes/agents.ts'
import { handleTelemetry } from './routes/telemetry.ts'
import { handleTransfers } from './routes/transfers.ts'
import { handleTeam } from './routes/team.ts'
import { composeMiddleware } from '../_shared/middleware.ts'
import { withCors } from '../_shared/cors.ts'
import { withSecurity } from '../_shared/security.ts'
import { withUser, withTenant } from '../_shared/auth/userAuth.ts'
import { withAgent } from '../_shared/auth/agentAuth.ts'
import { withRateLimit } from '../_shared/rateLimit.ts'
import { withAuditLog } from '../_shared/audit/middleware.ts'
import { errorHandler } from '../_shared/errors.ts'

/**
 * Main API Gateway
 * Routes all API requests with appropriate middleware
 */
serve(async (req) => {
  try {
    const url = new URL(req.url)
    const path = url.pathname
    
    // Define middleware stacks for different endpoint types
    const userApiMiddleware = composeMiddleware(
      withCors,
      withSecurity,
      withRateLimit,
      withUser,
      withTenant,
      withAuditLog
    )
    
    const agentApiMiddleware = composeMiddleware(
      withCors,
      withSecurity,
      withRateLimit,
      withAgent,
      withAuditLog
    )
    
    const publicApiMiddleware = composeMiddleware(
      withCors,
      withSecurity,
      withRateLimit,
      withAuditLog
    )
    
    // Route to appropriate handler with middleware
    if (path.startsWith('/api-gateway/projects')) {
      return await userApiMiddleware(req, handleProjects)
    } 
    else if (path.startsWith('/api-gateway/agents')) {
      // Agent endpoints can use either user or agent auth
      if (path.includes('/authenticate')) {
        // authenticate endpoint doesn't require auth
        return await publicApiMiddleware(req, handleAgents)
      }
      // Other agent endpoints require user auth
      return await userApiMiddleware(req, handleAgents)
    }
    else if (path.startsWith('/api-gateway/telemetry')) {
      // Telemetry submission requires agent auth
      if (req.method === 'POST') {
        return await agentApiMiddleware(req, handleTelemetry)
      }
      // Telemetry viewing requires user auth
      return await userApiMiddleware(req, handleTelemetry)
    }
    else if (path.startsWith('/api-gateway/transfers')) {
      // Transfer endpoints can use either user or agent auth
      if (path.includes('/upload-url') || path.includes('/download-url')) {
        // Upload/download URLs can be requested by agents
        const authHeader = req.headers.get('authorization')
        if (authHeader?.startsWith('Agent ')) {
          return await agentApiMiddleware(req, handleTransfers)
        }
      }
      // Other transfer endpoints require user auth
      return await userApiMiddleware(req, handleTransfers)
    }
    else if (path.startsWith('/api-gateway/auth')) {
      return await publicApiMiddleware(req, handleAuth)
    }
    else if (path.startsWith('/api-gateway/team')) {
      // Team endpoints require user auth
      return await userApiMiddleware(req, handleTeam)
    }
    else {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
  } catch (error) {
    return errorHandler(error)
  }
})