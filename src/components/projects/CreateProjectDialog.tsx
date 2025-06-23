import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/use-toast'
import { useNavigate } from 'react-router-dom'
import { useProjectContext } from '@/contexts/ProjectContext'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setCurrentProject } = useProjectContext()

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value)
    // Only auto-generate if user hasn't manually edited slug
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value))
    }
  }

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  // Create project mutation
  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug?: string }) => api.projects.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onOpenChange(false)
      setName('')
      setSlug('')
      toast({
        title: 'Project created',
        description: 'Your new project has been successfully created.',
      })
      // Set as current project and navigate to it
      setCurrentProject(data.project)
      navigate(`/dashboard/projects/${data.project.id}`)
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create project',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast({
        title: 'Error',
        description: 'Project name is required',
        variant: 'destructive',
      })
      return
    }

    createMutation.mutate({
      name: name.trim(),
      slug: slug.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project to organize your agents and transfers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                placeholder="My Project"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">
                Project Slug
                <span className="text-xs text-muted-foreground ml-2">
                  (URL-friendly identifier)
                </span>
              </Label>
              <Input
                id="slug"
                placeholder="my-project"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9-]+"
                title="Only lowercase letters, numbers, and hyphens allowed"
              />
              <p className="text-xs text-muted-foreground">
                This will be used in URLs and API calls
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}