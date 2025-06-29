import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Disable realtime for local development to prevent WebSocket connection errors
const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  // Completely disable realtime in local development
  ...(isLocalDev ? {} : {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  })
})

// Helper functions for auth
export const signUp = async ({
  email,
  password,
  fullName,
  companyName,
}: {
  email: string
  password: string
  fullName: string
  companyName: string
}) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        company_name: companyName,
      }
    }
  })

  if (error) throw error

  // Company creation will be handled by database trigger
  return data
}

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error
  return data
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

// Realtime subscriptions
export const subscribeToProject = (projectId: string, callbacks: {
  onAgentUpdate?: (payload: any) => void
  onTransferUpdate?: (payload: any) => void
  onTelemetry?: (payload: any) => void
}) => {
  // Skip realtime subscriptions in local development
  if (isLocalDev) {
    console.log('Realtime subscriptions disabled in local development')
    return () => {} // Return no-op cleanup function
  }

  const channel = supabase
    .channel(`project:${projectId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'agents',
        filter: `project_id=eq.${projectId}`
      },
      callbacks.onAgentUpdate || (() => {})
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'transfers',
        filter: `project_id=eq.${projectId}`
      },
      callbacks.onTransferUpdate || (() => {})
    )
    .on(
      'broadcast',
      {
        event: 'telemetry'
      },
      callbacks.onTelemetry || (() => {})
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}