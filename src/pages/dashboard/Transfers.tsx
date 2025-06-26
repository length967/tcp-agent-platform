import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { useProjectRealtime } from '@/hooks/useRealtime'
import { useProject } from '@/contexts/ProjectContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Search,
  Plus,
  Upload,
  FileText,
  MoreVertical,
  Play,
  Pause,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  Server,
  ArrowRight,
  File,
  Trash2,
  Eye
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useTimezone } from '@/contexts/TimezoneContext'
import { 
  LongDateTime, 
  RelativeTime, 
  ShortDateTime,
  BusinessHoursIndicator 
} from '@/components/ui/timezone-display'

interface Transfer {
  id: string
  name: string
  source_agent_id?: string
  destination_agent_id?: string
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled'
  progress?: number
  error?: string
  created_at: string
  completed_at?: string
  source_agent?: { id: string; name: string }
  destination_agent?: { id: string; name: string }
  transfer_files?: Array<{
    id: string
    file_path: string
    file_name: string
    file_size: number
    status: string
  }>
}

export default function Transfers() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showNewTransferDialog, setShowNewTransferDialog] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null)
  const [newTransferData, setNewTransferData] = useState({
    name: '',
    source_agent_id: '',
    destination_agent_id: '',
    files: [] as Array<{ path: string; name: string; size: number }>
  })
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Get current project from context
  const { currentProject } = useProject()
  const currentProjectId = currentProject?.id

  // Enable real-time updates for this project
  useProjectRealtime(currentProjectId)

  // Fetch transfers
  const { data: transfers, isLoading } = useQuery({
    queryKey: ['transfers'],
    queryFn: async () => {
      const data = await api.transfers.list()
      return data.transfers as Transfer[]
    },
    refetchInterval: 5000 // Refresh every 5 seconds for progress updates
  })

  // Fetch agents for dropdowns
  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const data = await api.agents.list()
      return data.agents
    }
  })

  // Create transfer
  const createTransferMutation = useMutation({
    mutationFn: async (data: typeof newTransferData) => {
      return await api.transfers.create({
        name: data.name,
        source_agent_id: data.source_agent_id || undefined,
        destination_agent_id: data.destination_agent_id || undefined,
        files: data.files
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      setShowNewTransferDialog(false)
      setNewTransferData({
        name: '',
        source_agent_id: '',
        destination_agent_id: '',
        files: []
      })
      toast({
        title: 'Transfer created',
        description: 'The transfer has been created successfully.'
      })
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error creating transfer',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Update transfer status
  const updateTransferMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Parameters<typeof api.transfers.update>[1]) => {
      return await api.transfers.update(id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error updating transfer',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Delete transfer
  const deleteTransferMutation = useMutation({
    mutationFn: async (id: string) => {
      return await api.transfers.delete(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      toast({
        title: 'Transfer deleted',
        description: 'The transfer has been deleted successfully.'
      })
    },
    onError: (error: ApiError) => {
      toast({
        title: 'Error deleting transfer',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Filter transfers
  const filteredTransfers = transfers?.filter(transfer => {
    const matchesSearch = transfer.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || transfer.status === statusFilter
    return matchesSearch && matchesStatus
  }) || []

  // Group transfers by status
  const groupedTransfers = {
    active: filteredTransfers.filter(t => ['pending', 'in_progress', 'paused'].includes(t.status)),
    completed: filteredTransfers.filter(t => t.status === 'completed'),
    failed: filteredTransfers.filter(t => ['failed', 'cancelled'].includes(t.status))
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />
      case 'in_progress':
        return <RefreshCw className="w-4 h-4 animate-spin" />
      case 'paused':
        return <Pause className="w-4 h-4" />
      case 'completed':
        return <CheckCircle className="w-4 h-4" />
      case 'failed':
        return <AlertCircle className="w-4 h-4" />
      case 'cancelled':
        return <X className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const getStatusColor = (status: string): "default" | "secondary" | "destructive" | "success" | "warning" => {
    switch (status) {
      case 'pending':
        return 'secondary'
      case 'in_progress':
        return 'warning'
      case 'paused':
        return 'secondary'
      case 'completed':
        return 'success'
      case 'failed':
      case 'cancelled':
        return 'destructive'
      default:
        return 'default'
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newFiles = files.map(file => ({
      path: file.name,
      name: file.name,
      size: file.size
    }))
    setNewTransferData(prev => ({
      ...prev,
      files: [...prev.files, ...newFiles]
    }))
  }

  return (
    <div className="px-4 py-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transfers</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Manage and monitor file transfers</p>
        </div>
        <Button onClick={() => setShowNewTransferDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Transfer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search transfers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transfers List */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            Active
            <Badge variant="secondary" className="ml-1">
              {groupedTransfers.active.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            Completed
            <Badge variant="secondary" className="ml-1">
              {groupedTransfers.completed.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="failed" className="gap-2">
            Failed
            <Badge variant="secondary" className="ml-1">
              {groupedTransfers.failed.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Active Transfers */}
        <TabsContent value="active" className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              </CardContent>
            </Card>
          ) : groupedTransfers.active.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No active transfers</h3>
                <p className="text-gray-500 text-center max-w-sm">
                  Create a new transfer to start moving files between agents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedTransfers.active.map((transfer) => (
                <Card key={transfer.id} className="hover:ring-1 hover:ring-indigo-500/40 transition">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          transfer.status === 'in_progress' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20' : 'bg-gray-100 dark:bg-gray-800'
                        )}>
                          {getStatusIcon(transfer.status)}
                        </div>
                        <div>
                          <h3 className="font-medium">{transfer.name}</h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            {transfer.source_agent && (
                              <div className="flex items-center gap-1">
                                <Server className="w-3 h-3" />
                                {transfer.source_agent.name}
                              </div>
                            )}
                            {transfer.source_agent && transfer.destination_agent && (
                              <ArrowRight className="w-3 h-3" />
                            )}
                            {transfer.destination_agent && (
                              <div className="flex items-center gap-1">
                                <Server className="w-3 h-3" />
                                {transfer.destination_agent.name}
                              </div>
                            )}
                          </div>
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
                          {transfer.status === 'in_progress' && (
                            <DropdownMenuItem onClick={() => updateTransferMutation.mutate({ 
                              id: transfer.id, 
                              status: 'paused' 
                            })}>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          )}
                          {transfer.status === 'paused' && (
                            <DropdownMenuItem onClick={() => updateTransferMutation.mutate({ 
                              id: transfer.id, 
                              status: 'in_progress' 
                            })}>
                              <Play className="w-4 h-4 mr-2" />
                              Resume
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setSelectedTransfer(transfer)}>
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => updateTransferMutation.mutate({ 
                              id: transfer.id, 
                              status: 'cancelled' 
                            })}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    
                    {/* Progress */}
                    {transfer.status === 'in_progress' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Progress</span>
                          <span className="font-medium">{transfer.progress || 0}%</span>
                        </div>
                        <Progress value={transfer.progress || 0} className="h-2" />
                      </div>
                    )}
                    
                    {/* Files count */}
                    <div className="flex items-center justify-between mt-4 text-sm">
                      <span className="text-gray-500">
                        {transfer.transfer_files?.length || 0} files
                      </span>
                      <Badge variant={getStatusColor(transfer.status)}>
                        {transfer.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completed Transfers */}
        <TabsContent value="completed">
          {groupedTransfers.completed.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No completed transfers</h3>
                <p className="text-gray-500">Completed transfers will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedTransfers.completed.map((transfer) => (
                    <TableRow key={transfer.id}>
                      <TableCell className="font-medium">{transfer.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          {transfer.source_agent?.name || 'Local'}
                          <ArrowRight className="w-3 h-3" />
                          {transfer.destination_agent?.name || 'Local'}
                        </div>
                      </TableCell>
                      <TableCell>{transfer.transfer_files?.length || 0}</TableCell>
                      <TableCell>
                        {transfer.completed_at ? (
                          <RelativeTime 
                            date={transfer.completed_at} 
                            showTooltip={true}
                          />
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedTransfer(transfer)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Failed Transfers */}
        <TabsContent value="failed">
          {groupedTransfers.failed.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium mb-2">No failed transfers</h3>
                <p className="text-gray-500">Failed or cancelled transfers will appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupedTransfers.failed.map((transfer) => (
                <Card key={transfer.id} className="border-red-200 dark:border-red-900/50">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-red-100 text-red-600 dark:bg-red-900/20">
                          {getStatusIcon(transfer.status)}
                        </div>
                        <div>
                          <h3 className="font-medium">{transfer.name}</h3>
                          {transfer.error && (
                            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                              {transfer.error}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateTransferMutation.mutate({ 
                            id: transfer.id, 
                            status: 'pending' 
                          })}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retry
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTransferMutation.mutate(transfer.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Transfer Dialog */}
      <Dialog open={showNewTransferDialog} onOpenChange={setShowNewTransferDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Transfer</DialogTitle>
            <DialogDescription>
              Set up a new file transfer between agents or locations.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="transferName">Transfer Name</Label>
              <Input
                id="transferName"
                placeholder="e.g., Daily Backup"
                value={newTransferData.name}
                onChange={(e) => setNewTransferData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sourceAgent">Source Agent</Label>
                <Select
                  value={newTransferData.source_agent_id}
                  onValueChange={(value) => setNewTransferData(prev => ({ ...prev, source_agent_id: value }))}
                >
                  <SelectTrigger id="sourceAgent">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Local Files</SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="destAgent">Destination Agent</Label>
                <Select
                  value={newTransferData.destination_agent_id}
                  onValueChange={(value) => setNewTransferData(prev => ({ ...prev, destination_agent_id: value }))}
                >
                  <SelectTrigger id="destAgent">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Local Files</SelectItem>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="files">Files</Label>
              <div className="mt-2 space-y-2">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="fileInput"
                  />
                  <label htmlFor="fileInput" className="cursor-pointer">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Click to select files or drag and drop
                    </p>
                  </label>
                </div>
                
                {newTransferData.files.length > 0 && (
                  <div className="space-y-2">
                    {newTransferData.files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="flex items-center gap-2">
                          <File className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{file.name}</span>
                          <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setNewTransferData(prev => ({
                            ...prev,
                            files: prev.files.filter((_, i) => i !== index)
                          }))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTransferDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTransferMutation.mutate(newTransferData)}
              disabled={!newTransferData.name || createTransferMutation.isPending}
            >
              {createTransferMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Transfer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Details Dialog */}
      {selectedTransfer && (
        <Dialog open={!!selectedTransfer} onOpenChange={() => setSelectedTransfer(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTransfer.name}</DialogTitle>
              <DialogDescription>
                Transfer details and file information
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Status and Progress */}
              <div className="flex items-center justify-between">
                <Badge variant={getStatusColor(selectedTransfer.status)}>
                  {selectedTransfer.status.replace('_', ' ')}
                </Badge>
                {selectedTransfer.progress !== undefined && (
                  <span className="text-sm font-medium">{selectedTransfer.progress}% complete</span>
                )}
              </div>
              
              {selectedTransfer.progress !== undefined && (
                <Progress value={selectedTransfer.progress} className="h-2" />
              )}

              {/* Transfer Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium">
                    <LongDateTime date={selectedTransfer.created_at} />
                  </p>
                </div>
                {selectedTransfer.completed_at && (
                  <div>
                    <p className="text-gray-500">Completed</p>
                    <p className="font-medium">
                      <LongDateTime date={selectedTransfer.completed_at} />
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500">Source</p>
                  <p className="font-medium">{selectedTransfer.source_agent?.name || 'Local'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Destination</p>
                  <p className="font-medium">{selectedTransfer.destination_agent?.name || 'Local'}</p>
                </div>
              </div>

              {/* Files */}
              {selectedTransfer.transfer_files && selectedTransfer.transfer_files.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Files ({selectedTransfer.transfer_files.length})</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedTransfer.transfer_files.map((file) => (
                          <TableRow key={file.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <File className="w-4 h-4 text-gray-400" />
                                {file.file_name}
                              </div>
                            </TableCell>
                            <TableCell>{formatFileSize(file.file_size)}</TableCell>
                            <TableCell>
                              <Badge variant={getStatusColor(file.status)}>
                                {file.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {selectedTransfer.error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">Transfer Error</p>
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">{selectedTransfer.error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTransfer(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}