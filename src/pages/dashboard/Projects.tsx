import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings, Users, Folder, Activity, Calendar, MoreVertical } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import { useNavigate } from 'react-router-dom'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { useProjectContext } from '@/contexts/ProjectContext'

interface Project {
  id: string
  name: string
  slug: string
  company_id: string
  settings: any
  created_at: string
  updated_at: string
}

export default function Projects() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setCurrentProject } = useProjectContext()

  // Fetch projects
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
  })

  // Delete project mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({
        title: 'Project deleted',
        description: 'The project has been successfully deleted.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete project',
        variant: 'destructive',
      })
    },
  })

  const handleProjectClick = (project: Project) => {
    setCurrentProject(project)
    navigate(`/dashboard/projects/${project.id}`)
  }

  const handleDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate(projectId)
    }
  }

  const filteredProjects = data?.projects?.filter((project: Project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.slug.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center text-red-600">
          Error loading projects: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your projects and their settings
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Search */}
      <div className="max-w-md">
        <Input
          type="search"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <Card className="p-8 text-center">
          <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No projects found</h3>
          <p className="text-gray-500 mb-4">
            {searchQuery
              ? 'No projects match your search criteria'
              : 'Create your first project to get started'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project: Project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleProjectClick(project)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>/{project.slug}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/dashboard/projects/${project.id}/settings`)
                        }}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/dashboard/projects/${project.id}/members`)
                        }}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Members
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        className="text-destructive"
                      >
                        Delete Project
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Activity className="mr-2 h-4 w-4" />
                    <span>Active</span>
                  </div>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <div className="flex gap-2">
                  <Badge variant="secondary">
                    <Users className="mr-1 h-3 w-3" />
                    Team Project
                  </Badge>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  )
}