import { useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { realtimeManager, RealtimeEvent } from '@/lib/realtime'
import { useToast } from '@/components/ui/use-toast'

export function useProjectRealtime(projectId: string | undefined) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.type) {
      case 'agent.status':
        // Invalidate agent queries to refetch latest data
        queryClient.invalidateQueries({ queryKey: ['agents'] })
        
        // Show toast for important status changes
        if (event.payload.status === 'offline') {
          toast({
            title: 'Agent went offline',
            description: `Agent ${event.payload.id} is now offline`,
            variant: 'destructive',
          })
        }
        break

      case 'transfer.status':
        // Invalidate transfer queries
        queryClient.invalidateQueries({ queryKey: ['transfers'] })
        queryClient.invalidateQueries({ queryKey: ['recentTransfers'] })
        
        // Show toast for completed or failed transfers
        if (event.payload.status === 'completed') {
          toast({
            title: 'Transfer completed',
            description: `Transfer ${event.payload.id} completed successfully`,
          })
        } else if (event.payload.status === 'failed') {
          toast({
            title: 'Transfer failed',
            description: `Transfer ${event.payload.id} failed`,
            variant: 'destructive',
          })
        }
        break

      case 'transfer.created':
        // Invalidate transfer queries to show new transfer
        queryClient.invalidateQueries({ queryKey: ['transfers'] })
        queryClient.invalidateQueries({ queryKey: ['recentTransfers'] })
        break

      case 'telemetry.update':
        // Invalidate telemetry queries
        queryClient.invalidateQueries({ queryKey: ['projectTelemetry', projectId] })
        queryClient.invalidateQueries({ queryKey: ['agentTelemetry', event.payload.agent_id] })
        break
    }
  }, [queryClient, toast, projectId])

  useEffect(() => {
    if (!projectId) return

    const unsubscribe = realtimeManager.subscribeToProject(projectId, handleRealtimeEvent)
    return unsubscribe
  }, [projectId, handleRealtimeEvent])
}

export function useAgentRealtime(agentId: string | undefined) {
  const queryClient = useQueryClient()

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    switch (event.type) {
      case 'agent.status':
        // Invalidate specific agent query
        queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
        queryClient.invalidateQueries({ queryKey: ['agents'] })
        break

      case 'telemetry.update':
        // Invalidate agent telemetry
        queryClient.invalidateQueries({ queryKey: ['agentTelemetry', agentId] })
        break
    }
  }, [queryClient, agentId])

  useEffect(() => {
    if (!agentId) return

    const unsubscribe = realtimeManager.subscribeToAgent(agentId, handleRealtimeEvent)
    return unsubscribe
  }, [agentId, handleRealtimeEvent])
}