import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProjectContext } from '@/contexts/ProjectContext'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ChevronDown,
  Plus,
  Settings,
  Folder,
  Check,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectSwitcherProps {
  className?: string
  variant?: 'select' | 'dropdown'
}

export function ProjectSwitcher({ className, variant = 'dropdown' }: ProjectSwitcherProps) {
  const navigate = useNavigate()
  const { currentProject, setCurrentProject } = useProjectContext()
  const [isOpen, setIsOpen] = useState(false)

  // Fetch all projects
  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.projects.list(),
  })

  const projects = data?.projects || []

  const handleProjectSelect = (projectId: string) => {
    const project = projects.find(p => p.id === projectId)
    if (project) {
      setCurrentProject(project)
      navigate(`/dashboard/projects/${project.id}`)
    }
    setIsOpen(false)
  }

  const handleCreateProject = () => {
    navigate('/dashboard/projects')
    setIsOpen(false)
  }

  const handleProjectSettings = () => {
    if (currentProject) {
      navigate(`/dashboard/projects/${currentProject.id}`)
    }
    setIsOpen(false)
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading projects...</span>
      </div>
    )
  }

  if (variant === 'select') {
    return (
      <Select
        value={currentProject?.id || ''}
        onValueChange={handleProjectSelect}
      >
        <SelectTrigger className={cn("w-[200px]", className)}>
          <SelectValue placeholder="Select a project">
            {currentProject && (
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[10px]">
                    {currentProject.name[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{currentProject.name}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Projects</SelectLabel>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[10px]">
                      {project.name[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span>{project.name}</span>
                  {project.id === currentProject?.id && (
                    <Check className="h-3 w-3 ml-auto" />
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-between min-w-[200px]", className)}
        >
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            <span className="truncate">
              {currentProject ? currentProject.name : 'Select Project'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[250px]">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {projects.length === 0 ? (
          <div className="p-2 text-center text-sm text-muted-foreground">
            No projects yet
          </div>
        ) : (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => handleProjectSelect(project.id)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {project.name[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    /{project.slug}
                  </div>
                </div>
                {project.id === currentProject?.id && (
                  <Check className="h-4 w-4 ml-auto" />
                )}
              </div>
            </DropdownMenuItem>
          ))
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem onClick={handleCreateProject} className="cursor-pointer">
          <Plus className="h-4 w-4 mr-2" />
          Create New Project
        </DropdownMenuItem>
        
        {currentProject && (
          <DropdownMenuItem onClick={handleProjectSettings} className="cursor-pointer">
            <Settings className="h-4 w-4 mr-2" />
            Project Settings
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}