import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import { useProjectContext } from '@/contexts/ProjectContext'
import {
  Settings,
  Calendar,
  ArrowLeft,
  Save,
  Loader2,
} from 'lucide-react'
import { ProjectMembersTab } from '@/components/projects/ProjectMembersTab'
import { useTimezone } from '@/contexts/TimezoneContext'
import { LongDateTime } from '@/components/ui/timezone-display'

export default function ProjectDetails() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setCurrentProject } = useProjectContext()
  
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [editedSettings, setEditedSettings] = useState<any>({})

  // Fetch project details
  const { data, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: !!projectId,
  })
  
  // Update state when data changes
  useEffect(() => {
    if (data?.project) {
      setCurrentProject(data.project)
      setEditedName(data.project.name)
      setEditedSettings(data.project.settings || {})
    }
  }, [data, setCurrentProject])

  // Update project mutation
  const updateMutation = useMutation({
    mutationFn: (updates: { name?: string; settings?: any }) =>
      api.projects.update(projectId!, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setCurrentProject(data.project)
      setIsEditing(false)
      toast({
        title: 'Project updated',
        description: 'Your changes have been saved successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update project',
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    const updates: any = {}
    if (editedName !== data?.project.name) {
      updates.name = editedName
    }
    if (JSON.stringify(editedSettings) !== JSON.stringify(data?.project.settings)) {
      updates.settings = editedSettings
    }
    
    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates)
    } else {
      setIsEditing(false)
    }
  }

  const handleCancel = () => {
    setEditedName(data?.project.name || '')
    setEditedSettings(data?.project.settings || {})
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-4">
            The project you're looking for doesn't exist or you don't have access to it.
          </p>
          <Button onClick={() => navigate('/dashboard/projects')}>
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  const project = data.project

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard/projects')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground">/{project.slug}</p>
          </div>
        </div>
        {isEditing ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button onClick={() => setIsEditing(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Edit Project
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle>Project Information</CardTitle>
                <CardDescription>Basic details about your project</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="space-y-2">
                    <Label htmlFor="name">Project Name</Label>
                    <Input
                      id="name"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Name</p>
                      <p className="text-lg">{project.name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Slug</p>
                      <p className="font-mono text-sm">{project.slug}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Created</p>
                      <p className="text-sm">
                        <LongDateTime 
                          date={project.created_at} 
                          showTooltip={true}
                          showCompanyTime={true}
                        />
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Project Stats</CardTitle>
                <CardDescription>Overview of project resources</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">0</p>
                    <p className="text-sm text-muted-foreground">Agents</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">0</p>
                    <p className="text-sm text-muted-foreground">Transfers</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">0</p>
                    <p className="text-sm text-muted-foreground">Members</p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">
                      <Badge variant="secondary">Active</Badge>
                    </p>
                    <p className="text-sm text-muted-foreground">Status</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest events in this project</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No recent activity</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <ProjectMembersTab projectId={projectId!} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Settings</CardTitle>
              <CardDescription>Configure project-specific settings</CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Additional project settings can be configured here.
                  </p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No custom settings configured</p>
                  <p className="text-sm mt-2">
                    Click "Edit Project" to add custom settings
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions that affect your project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" disabled>
                Delete Project
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                Once deleted, a project cannot be recovered.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}