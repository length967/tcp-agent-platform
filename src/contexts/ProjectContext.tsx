import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface Project {
  id: string
  name: string
  slug: string
  company_id: string
  settings?: Record<string, any>
  created_at: string
  updated_at: string
}

interface ProjectContextValue {
  currentProject: Project | null
  projects: Project[]
  setCurrentProject: (project: Project) => void
  isLoading: boolean
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null)

  // Fetch all projects
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await api.projects.list()
      return data.projects as Project[]
    }
  })

  // Set first project as current if none selected
  useEffect(() => {
    if (projects.length > 0 && !currentProject) {
      setCurrentProject(projects[0])
    }
  }, [projects, currentProject])

  // Save current project to localStorage
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem('currentProjectId', currentProject.id)
    }
  }, [currentProject])

  // Load saved project on mount
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId')
    if (savedProjectId && projects.length > 0) {
      const savedProject = projects.find(p => p.id === savedProjectId)
      if (savedProject) {
        setCurrentProject(savedProject)
      }
    }
  }, [projects])

  return (
    <ProjectContext.Provider value={{
      currentProject,
      projects,
      setCurrentProject,
      isLoading
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}

export function useProjectContext() {
  return useProject()
}