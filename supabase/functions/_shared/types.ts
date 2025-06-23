import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { Database } from '../../../src/lib/database.types.ts'

export interface User {
  id: string
  email: string
  user_metadata: Record<string, any>
}

export interface Agent {
  id: string
  projectId: string
  name: string
}

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: string
  subscriptionStatus: string
}

export interface AppContext {
  supabase: SupabaseClient<Database>
  user?: User
  agent?: Agent
  tenant?: Tenant
  requestId: string
  startTime: number
}

export type Middleware = (
  req: Request,
  ctx: AppContext,
  next: (req: Request, ctx: AppContext) => Promise<Response>
) => Promise<Response>

export type Handler = (req: Request, ctx: AppContext) => Promise<Response>