import { RealtimeChannel, RealtimeClient } from '@supabase/realtime-js'

// Realtime event types
export type RealtimeEvent = 
  | { type: 'agent.status'; payload: { id: string; status: string; last_seen_at: string } }
  | { type: 'transfer.status'; payload: { id: string; status: string; progress?: number } }
  | { type: 'transfer.created'; payload: { id: string; name: string; source_agent_id?: string; destination_agent_id?: string } }
  | { type: 'telemetry.update'; payload: { agent_id: string; metrics: Record<string, any> } }

export class RealtimeManager {
  private client: RealtimeClient
  private channels: Map<string, RealtimeChannel> = new Map()
  private listeners: Map<string, Set<(event: RealtimeEvent) => void>> = new Map()

  constructor() {
    // Get the realtime URL from environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const realtimeUrl = supabaseUrl.replace('https://', 'wss://').replace('.supabase.co', '.supabase.co/realtime/v1')
    
    this.client = new RealtimeClient(realtimeUrl, {
      params: {
        apikey: supabaseKey,
      },
    })
  }

  // Subscribe to a specific project's realtime updates
  subscribeToProject(projectId: string, callback: (event: RealtimeEvent) => void): () => void {
    const channelName = `project:${projectId}`
    
    if (!this.channels.has(channelName)) {
      const channel = this.client.channel(channelName)
      
      // Subscribe to agent status changes
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: 'agent.status',
            payload: {
              id: payload.new.id,
              status: payload.new.status,
              last_seen_at: payload.new.last_seen_at,
            },
          }
          this.notifyListeners(channelName, event)
        }
      )

      // Subscribe to transfer status changes
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transfers',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: 'transfer.status',
            payload: {
              id: payload.new.id,
              status: payload.new.status,
              progress: payload.new.progress,
            },
          }
          this.notifyListeners(channelName, event)
        }
      )

      // Subscribe to new transfers
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transfers',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: 'transfer.created',
            payload: {
              id: payload.new.id,
              name: payload.new.name,
              source_agent_id: payload.new.source_agent_id,
              destination_agent_id: payload.new.destination_agent_id,
            },
          }
          this.notifyListeners(channelName, event)
        }
      )

      // Subscribe to telemetry updates
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_telemetry',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: 'telemetry.update',
            payload: {
              agent_id: payload.new.agent_id,
              metrics: payload.new.metrics,
            },
          }
          this.notifyListeners(channelName, event)
        }
      )

      channel.subscribe()
      this.channels.set(channelName, channel)
    }

    // Add listener
    if (!this.listeners.has(channelName)) {
      this.listeners.set(channelName, new Set())
    }
    this.listeners.get(channelName)!.add(callback)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(channelName)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.unsubscribeFromChannel(channelName)
        }
      }
    }
  }

  // Subscribe to agent-specific updates
  subscribeToAgent(agentId: string, callback: (event: RealtimeEvent) => void): () => void {
    const channelName = `agent:${agentId}`
    
    if (!this.channels.has(channelName)) {
      const channel = this.client.channel(channelName)
      
      // Subscribe to agent status changes
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `id=eq.${agentId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: 'agent.status',
            payload: {
              id: payload.new.id,
              status: payload.new.status,
              last_seen_at: payload.new.last_seen_at,
            },
          }
          this.notifyListeners(channelName, event)
        }
      )

      // Subscribe to telemetry for this agent
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_telemetry',
          filter: `agent_id=eq.${agentId}`,
        },
        (payload) => {
          const event: RealtimeEvent = {
            type: 'telemetry.update',
            payload: {
              agent_id: payload.new.agent_id,
              metrics: payload.new.metrics,
            },
          }
          this.notifyListeners(channelName, event)
        }
      )

      channel.subscribe()
      this.channels.set(channelName, channel)
    }

    // Add listener
    if (!this.listeners.has(channelName)) {
      this.listeners.set(channelName, new Set())
    }
    this.listeners.get(channelName)!.add(callback)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(channelName)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.unsubscribeFromChannel(channelName)
        }
      }
    }
  }

  private notifyListeners(channelName: string, event: RealtimeEvent) {
    const listeners = this.listeners.get(channelName)
    if (listeners) {
      listeners.forEach(callback => callback(event))
    }
  }

  private unsubscribeFromChannel(channelName: string) {
    const channel = this.channels.get(channelName)
    if (channel) {
      channel.unsubscribe()
      this.channels.delete(channelName)
    }
    this.listeners.delete(channelName)
  }

  // Clean up all subscriptions
  disconnect() {
    this.channels.forEach(channel => channel.unsubscribe())
    this.channels.clear()
    this.listeners.clear()
    this.client.disconnect()
  }
}

// Singleton instance - disabled in local development
const isLocalDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
export const realtimeManager = isLocalDev ? null : new RealtimeManager()