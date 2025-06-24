import { supabase } from './supabase'
import { createAuthenticatedFetch, tokenRefreshManager } from './auth-interceptor'

const API_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'

// Create authenticated fetch instance
const authenticatedFetch = createAuthenticatedFetch(fetch)

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Get current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError || !session) {
    throw new ApiError(401, 'Not authenticated')
  }
  
  const url = `${API_URL}/api-gateway${endpoint}`
  
  const response = await authenticatedFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers
    }
  })
  
  const data = await response.json()
  
  if (!response.ok) {
    // Handle authentication errors
    if (response.status === 401) {
      // Session expired or invalid - sign out
      await supabase.auth.signOut()
      window.location.href = '/auth/login'
    }
    
    throw new ApiError(
      response.status,
      data.error?.message || 'API request failed',
      data.error?.code
    )
  }
  
  return data
}

/**
 * API client for the TCP Agent Platform
 */
export const api = {
  // Raw client for custom requests
  client: {
    get: async (endpoint: string) => {
      const response = await apiRequest(endpoint)
      return {
        ok: true,
        json: async () => response
      }
    },
    post: async (endpoint: string, options: { json?: any } = {}) => {
      try {
        const response = await apiRequest(endpoint, {
          method: 'POST',
          body: options.json ? JSON.stringify(options.json) : undefined
        })
        return {
          ok: true,
          json: async () => response
        }
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            json: async () => ({ error: error.message })
          }
        }
        throw error
      }
    },
    patch: async (endpoint: string, options: { json?: any } = {}) => {
      try {
        const response = await apiRequest(endpoint, {
          method: 'PATCH',
          body: options.json ? JSON.stringify(options.json) : undefined
        })
        return {
          ok: true,
          json: async () => response
        }
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            json: async () => ({ error: error.message })
          }
        }
        throw error
      }
    },
    delete: async (endpoint: string) => {
      try {
        const response = await apiRequest(endpoint, {
          method: 'DELETE'
        })
        return {
          ok: true,
          json: async () => response
        }
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            json: async () => ({ error: error.message })
          }
        }
        throw error
      }
    }
  },
  
  // Projects
  projects: {
    list: () => apiRequest<{ projects: any[] }>('/projects'),
    
    get: (id: string) => apiRequest<{ project: any }>(`/projects/${id}`),
    
    create: (data: { name: string; slug?: string; settings?: any }) =>
      apiRequest<{ project: any }>('/projects', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    
    update: (id: string, data: { name?: string; settings?: any }) =>
      apiRequest<{ project: any }>(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    
    delete: (id: string) =>
      apiRequest(`/projects/${id}`, {
        method: 'DELETE'
      })
  },
  
  // Agents
  agents: {
    list: () => 
      apiRequest<{ agents: any[] }>('/agents'),
    
    get: (id: string) => 
      apiRequest<{ agent: any }>(`/agents/${id}`),
    
    create: (data: { name: string; platform: string; capabilities?: any }) =>
      apiRequest<{ agent: any }>('/agents', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    
    update: (id: string, data: { name?: string; capabilities?: any; settings?: any }) =>
      apiRequest<{ agent: any }>(`/agents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    
    delete: (id: string) =>
      apiRequest(`/agents/${id}`, {
        method: 'DELETE'
      }),
    
    generateToken: (id: string) =>
      apiRequest<{ token: string; expires_at: string; agent_id: string }>(`/agents/${id}/register`, {
        method: 'POST'
      })
  },
  
  // Transfers
  transfers: {
    list: () => 
      apiRequest<{ transfers: any[] }>('/transfers'),
    
    get: (id: string) => 
      apiRequest<{ transfer: any }>(`/transfers/${id}`),
    
    create: (data: {
      name: string
      source_agent_id?: string
      destination_agent_id?: string
      files?: Array<{ path: string; name?: string; size?: number; metadata?: any }>
      settings?: any
    }) =>
      apiRequest<{ transfer: any }>('/transfers', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    
    update: (id: string, data: {
      status?: 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled'
      progress?: number
      error?: string
    }) =>
      apiRequest<{ transfer: any }>(`/transfers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    
    delete: (id: string) =>
      apiRequest(`/transfers/${id}`, {
        method: 'DELETE'
      }),
    
    getUploadUrl: (id: string, data: {
      file_path: string
      file_size?: number
      content_type?: string
    }) =>
      apiRequest<{ 
        url: string
        fields?: Record<string, string>
        expires_at: string
        method: string 
      }>(`/transfers/${id}/upload-url`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    
    getDownloadUrl: (id: string, data: { file_path: string }) =>
      apiRequest<{ 
        url: string
        expires_at: string
        method: string 
      }>(`/transfers/${id}/download-url`, {
        method: 'POST',
        body: JSON.stringify(data)
      })
  },
  
  // Telemetry
  telemetry: {
    getAgentTelemetry: (agentId: string) =>
      apiRequest<{ telemetry: any[] }>(`/telemetry/agent/${agentId}`),
    
    getProjectTelemetry: (projectId: string) =>
      apiRequest<{ aggregates: any; agents: any[] }>(`/telemetry/project/${projectId}`)
  },
  
  // Session Management
  session: {
    getConfig: () => 
      apiRequest<{
        timeoutMinutes: number
        isCompanyEnforced: boolean
        companyTimeout: number | null
        userTimeout: number | null
        source: 'company' | 'user' | 'company_default' | 'system'
        lastActivity: string
      }>('/session/config')
  },
  
  // Team Management
  team: {
    list: () => 
      apiRequest<{ 
        members: any[]; 
        invitations: any[]; 
        permissions: string[] 
      }>('/team'),
    
    inviteMember: (data: {
      email: string;
      company_role?: 'owner' | 'admin' | 'member';
      project_role?: 'admin' | 'editor' | 'viewer';
      project_id?: string;
    }) => 
      apiRequest<{ invitation: any }>('/team/invitations', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    
    revokeInvitation: (invitationId: string) =>
      apiRequest(`/team/invitations/${invitationId}`, {
        method: 'DELETE'
      }),
    
    updateMember: (memberId: string, data: {
      role?: 'admin' | 'member';
      is_suspended?: boolean;
    }) =>
      apiRequest(`/team/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),
    
    removeMember: (memberId: string) =>
      apiRequest(`/team/members/${memberId}`, {
        method: 'DELETE'
      }),
    
    acceptInvitation: (token: string) =>
      apiRequest<{ 
        success: boolean; 
        company_id?: string; 
        project_id?: string 
      }>('/team/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token })
      })
  }
}