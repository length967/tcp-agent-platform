import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useProjectRealtime } from '@/hooks/useRealtime'
import { useProject } from '@/contexts/ProjectContext'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, ApiError } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { 
  Search, Plus, Server, Activity, AlertCircle, CheckCircle, 
  XCircle, RefreshCw, Key, Copy, Eye, EyeOff, Settings,
  Download, Upload, Cpu, HardDrive, Network, MoreVertical,
  Trash2
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { useTimezone } from '@/contexts/TimezoneContext'
import { 
  RelativeTime, 
  ShortDateTime,
  BusinessHoursIndicator 
} from '@/components/ui/timezone-display'

interface Agent {
  id: string
  name: string
  platform: string
  version?: string
  status: string
  last_seen_at?: string
  created_at: string
  capabilities?: Record<string, any>
  settings?: Record<string, any>
  connection_info?: {
    ip_address?: string
    hostname?: string
  }
}

interface AgentWithTelemetry extends Agent {
  latest_telemetry?: {
    cpu_usage?: number
    memory_usage?: number
    disk_usage?: number
    network_throughput?: {
      upload: number
      download: number
    }
  }
}

export default function Agents() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showNewAgentDialog, setShowNewAgentDialog] = useState(false)
  const [showTokenDialog, setShowTokenDialog] = useState(false)
  const [newAgentData, setNewAgentData] = useState({
    name: '',
    platform: 'linux'
  })
  const [generatedToken, setGeneratedToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Get current project from context
  const { currentProject } = useProject()
  const currentProjectId = currentProject?.id

  // Enable real-time updates for this project
  useProjectRealtime(currentProjectId)

  // Fetch agents
  const { data: agentsData, isLoading, error } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const data = await api.agents.list()
      return data.agents as AgentWithTelemetry[]
    },
    refetchInterval: 10000 // Refresh every 10 seconds for live status
  })

  // Create new agent
  const createAgentMutation = useMutation({
    mutationFn: async (data: { name: string; platform: string }) => {
      return await api.agents.create(data)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      setShowNewAgentDialog(false)
      setNewAgentData({ name: '', platform: 'linux' })
      generateTokenMutation.mutate(data.agent.id)
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error creating agent',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Generate registration token
  const generateTokenMutation = useMutation({
    mutationFn: async (agentId: string) => {
      return await api.agents.generateToken(agentId)
    },
    onSuccess: (data) => {
      setGeneratedToken(data.token)
      setShowTokenDialog(true)
      setShowToken(true)
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error generating token',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Delete agent
  const deleteAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      return await api.agents.delete(agentId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      toast({
        title: 'Agent deleted',
        description: 'The agent has been removed successfully.'
      })
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error deleting agent',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  const getStatusColor = (status: string, lastSeen?: string) => {
    if (!lastSeen) return 'destructive'
    
    const lastSeenDate = new Date(lastSeen)
    const minutesAgo = (Date.now() - lastSeenDate.getTime()) / 1000 / 60
    
    if (minutesAgo > 5) return 'secondary'
    if (status === 'active') return 'success'
    if (status === 'busy') return 'warning'
    return 'destructive'
  }

  const getStatusIcon = (status: string, lastSeen?: string) => {
    if (!lastSeen) return <XCircle className="w-4 h-4" />
    
    const lastSeenDate = new Date(lastSeen)
    const minutesAgo = (Date.now() - lastSeenDate.getTime()) / 1000 / 60
    
    if (minutesAgo > 5) return <XCircle className="w-4 h-4" />
    if (status === 'active') return <CheckCircle className="w-4 h-4" />
    if (status === 'busy') return <Activity className="w-4 h-4" />
    return <AlertCircle className="w-4 h-4" />
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: 'Copied to clipboard',
      description: 'The token has been copied to your clipboard.'
    })
  }

  const filteredAgents = agentsData?.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.platform?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error loading agents: {(error as ApiError).message}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-gray-500">Manage your file transfer agents</p>
        </div>
        <Button onClick={() => setShowNewAgentDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Agent
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search agents..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Server className="w-12 h-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No agents found</h3>
            <p className="text-gray-500 mb-4 text-center max-w-sm">
              {searchTerm ? 'No agents match your search.' : 'Get started by creating your first agent.'}
            </p>
            {!searchTerm && (
              <Button onClick={() => setShowNewAgentDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Agent
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => (
            <Card key={agent.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg bg-gray-100`}>
                      <Server className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {agent.platform} • v{agent.version || '1.0.0'}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => {
                        generateTokenMutation.mutate(agent.id)
                      }}>
                        <Key className="w-4 h-4 mr-2" />
                        Generate Token
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={() => deleteAgentMutation.mutate(agent.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Status</span>
                    <Badge variant={getStatusColor(agent.status, agent.last_seen_at)}>
                      {getStatusIcon(agent.status, agent.last_seen_at)}
                      <span className="ml-1 capitalize">
                        {agent.last_seen_at && new Date(agent.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000
                          ? agent.status
                          : 'Offline'}
                      </span>
                    </Badge>
                  </div>

                  {/* Last Seen */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Last seen</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {agent.last_seen_at 
                          ? <RelativeTime date={agent.last_seen_at} showTooltip={true} />
                          : 'Never'}
                      </span>
                      {agent.last_seen_at && (
                        <BusinessHoursIndicator 
                          date={agent.last_seen_at}
                          className="text-xs"
                        />
                      )}
                    </div>
                  </div>

                  {/* System Metrics */}
                  {agent.latest_telemetry && (
                    <div className="pt-2 space-y-2 border-t">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1">
                          <Cpu className="w-3 h-3" />
                          <span className="text-gray-500">CPU</span>
                        </div>
                        <span>{agent.latest_telemetry.cpu_usage?.toFixed(1) || 0}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-1">
                          <HardDrive className="w-3 h-3" />
                          <span className="text-gray-500">Memory</span>
                        </div>
                        <span>{agent.latest_telemetry.memory_usage?.toFixed(1) || 0}%</span>
                      </div>
                      {agent.latest_telemetry.network_throughput && (
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-1">
                            <Network className="w-3 h-3" />
                            <span className="text-gray-500">Network</span>
                          </div>
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="flex items-center">
                              <Upload className="w-3 h-3 mr-1" />
                              {(agent.latest_telemetry.network_throughput.upload / 1024 / 1024).toFixed(1)}MB/s
                            </span>
                            <span className="flex items-center">
                              <Download className="w-3 h-3 mr-1" />
                              {(agent.latest_telemetry.network_throughput.download / 1024 / 1024).toFixed(1)}MB/s
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Agent Dialog */}
      <Dialog open={showNewAgentDialog} onOpenChange={setShowNewAgentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
            <DialogDescription>
              Set up a new file transfer agent for your project.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="agentName">Agent Name</Label>
              <Input
                id="agentName"
                type="text"
                placeholder="e.g., Production Server 1"
                value={newAgentData.name}
                onChange={(e) => setNewAgentData({ ...newAgentData, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="platform">Platform</Label>
              <Select
                value={newAgentData.platform}
                onValueChange={(value) => setNewAgentData({ ...newAgentData, platform: value })}
              >
                <SelectTrigger id="platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="linux">Linux</SelectItem>
                  <SelectItem value="windows">Windows</SelectItem>
                  <SelectItem value="macos">macOS</SelectItem>
                  <SelectItem value="docker">Docker</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewAgentDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createAgentMutation.mutate(newAgentData)}
              disabled={!newAgentData.name.trim() || createAgentMutation.isPending}
            >
              {createAgentMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Agent'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registration Token Dialog */}
      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Agent Registration Token</DialogTitle>
            <DialogDescription>
              Use this token to register your agent. It will expire in 15 minutes.
            </DialogDescription>
          </DialogHeader>
          
          {generatedToken && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 mb-3">
                  Save this token securely. You won't be able to see it again.
                </p>
                <div className="flex items-center space-x-2">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={generatedToken}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(generatedToken)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <h4 className="font-medium">To register your agent:</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>Install the TCP Agent on your server</li>
                  <li>Run: <code className="bg-gray-100 px-1 py-0.5 rounded">tcp-agent register {generatedToken}</code></li>
                  <li>The agent will authenticate and start transferring files</li>
                </ol>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => {
              setShowTokenDialog(false)
              setGeneratedToken('')
              setShowToken(false)
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}