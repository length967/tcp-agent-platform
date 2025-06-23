import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from '@/components/ui/use-toast'
import {
  UserPlus,
  Shield,
  Edit2,
  Trash2,
  Users,
} from 'lucide-react'

interface ProjectMembersTabProps {
  projectId: string
}

interface ProjectMember {
  project_id: string
  user_id: string
  role: 'admin' | 'editor' | 'viewer'
  added_at: string
  added_by: string
  user: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  }
}

export function ProjectMembersTab({ projectId }: ProjectMembersTabProps) {
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState<'admin' | 'editor' | 'viewer'>('viewer')
  const queryClient = useQueryClient()

  // Fetch project members
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const response = await api.client.get(`/v1/projects/${projectId}/members`)
      if (!response.ok) {
        throw new Error('Failed to fetch project members')
      }
      return response.json()
    },
  })

  // Fetch company members for adding to project
  const { data: companyMembersData } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.team.list(),
  })

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async (data: { user_id: string; role: string }) => {
      const response = await api.client.post(`/v1/projects/${projectId}/members`, {
        json: data
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add member')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
      setAddMemberDialogOpen(false)
      setSelectedUserId('')
      setSelectedRole('viewer')
      toast({
        title: 'Member added',
        description: 'The user has been added to the project.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add member',
        variant: 'destructive',
      })
    },
  })

  // Update member mutation
  const updateMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const response = await api.client.patch(`/v1/projects/${projectId}/members/${userId}`, {
        json: { role }
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update member')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
      setEditingMember(null)
      toast({
        title: 'Member updated',
        description: 'The member role has been updated.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update member',
        variant: 'destructive',
      })
    },
  })

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.client.delete(`/v1/projects/${projectId}/members/${userId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove member')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-members', projectId] })
      toast({
        title: 'Member removed',
        description: 'The user has been removed from the project.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove member',
        variant: 'destructive',
      })
    },
  })

  const handleAddMember = () => {
    if (!selectedUserId) {
      toast({
        title: 'Error',
        description: 'Please select a user',
        variant: 'destructive',
      })
      return
    }
    addMemberMutation.mutate({
      user_id: selectedUserId,
      role: selectedRole,
    })
  }

  const handleUpdateMember = (member: ProjectMember, newRole: string) => {
    updateMemberMutation.mutate({
      userId: member.user_id,
      role: newRole,
    })
  }

  const handleRemoveMember = (userId: string) => {
    if (confirm('Are you sure you want to remove this member from the project?')) {
      removeMemberMutation.mutate(userId)
    }
  }

  const projectMembers = membersData?.members || []
  const availableUsers = companyMembersData?.members?.filter(
    (member: any) => !projectMembers.some((pm: any) => pm.user_id === member.user_id)
  ) || []

  if (membersLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Project Members</CardTitle>
              <CardDescription>
                Manage who has access to this project
              </CardDescription>
            </div>
            <Button onClick={() => setAddMemberDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {projectMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No project members</h3>
              <p className="text-gray-500 mb-4">
                Add team members to collaborate on this project
              </p>
              <Button onClick={() => setAddMemberDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add First Member
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectMembers.map((member: ProjectMember) => (
                  <TableRow key={member.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.user.avatar_url || undefined} />
                          <AvatarFallback>
                            {member.user.full_name?.[0]?.toUpperCase() || 
                             member.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.user.full_name || 'Unnamed User'}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{member.user.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        <Shield className="mr-1 h-3 w-3" />
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(member.added_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingMember(member)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemoveMember(member.user_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project Member</DialogTitle>
            <DialogDescription>
              Select a team member to add to this project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user">Team Member</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger id="user">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((user) => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.user?.avatar_url || undefined} />
                          <AvatarFallback>
                            {user.user?.full_name?.[0]?.toUpperCase() || 
                             user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {user.user?.full_name || user.email}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Project Role</Label>
              <Select value={selectedRole} onValueChange={(v: any) => setSelectedRole(v)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      <span>Admin - Full project control</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex items-center gap-2">
                      <Edit2 className="h-4 w-4" />
                      <span>Editor - Create and manage resources</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Viewer - Read-only access</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddMemberDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={!selectedUserId || addMemberMutation.isPending}
            >
              {addMemberMutation.isPending ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      {editingMember && (
        <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change Member Role</DialogTitle>
              <DialogDescription>
                Update the role for {editingMember.user.full_name || editingMember.user.email}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-role">New Role</Label>
                <Select
                  value={editingMember.role}
                  onValueChange={(newRole) => handleUpdateMember(editingMember, newRole)}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingMember(null)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}