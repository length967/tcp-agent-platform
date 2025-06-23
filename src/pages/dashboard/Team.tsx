import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Edit2, UserX, Shield, Mail, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from '@/components/ui/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface TeamMember {
  company_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  email: string
  user: {
    id: string
    full_name: string | null
    avatar_url: string | null
    is_suspended: boolean
  }
}

interface Invitation {
  id: string
  company_id: string
  inviter_id: string
  invitee_email: string
  company_role: 'owner' | 'admin' | 'member'
  project_role?: 'admin' | 'editor' | 'viewer'
  project_id?: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  created_at: string
  expires_at: string
}

export default function Team() {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member')
  const queryClient = useQueryClient()

  // Fetch team data
  const { data, isLoading, error } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.team.list(),
  })

  // Invite member mutation
  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; company_role: 'admin' | 'member' }) =>
      api.team.inviteMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setInviteDialogOpen(false)
      setInviteEmail('')
      setInviteRole('member')
      toast({
        title: 'Invitation sent',
        description: 'The team member has been invited.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send invitation',
        variant: 'destructive',
      })
    },
  })

  // Update member mutation
  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.team.updateMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setEditDialogOpen(false)
      setSelectedMember(null)
      toast({
        title: 'Member updated',
        description: 'The team member has been updated.',
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
    mutationFn: (id: string) => api.team.removeMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      setDeleteDialogOpen(false)
      setSelectedMember(null)
      toast({
        title: 'Member removed',
        description: 'The team member has been removed.',
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

  // Revoke invitation mutation
  const revokeInvitationMutation = useMutation({
    mutationFn: (id: string) => api.team.revokeInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      toast({
        title: 'Invitation revoked',
        description: 'The invitation has been revoked.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to revoke invitation',
        variant: 'destructive',
      })
    },
  })

  const handleInvite = () => {
    inviteMutation.mutate({
      email: inviteEmail,
      company_role: inviteRole,
    })
  }

  const handleUpdateMember = () => {
    if (!selectedMember) return
    updateMemberMutation.mutate({
      id: selectedMember.user_id,
      data: {
        role: selectedMember.role === 'admin' ? 'member' : 'admin',
      },
    })
  }

  const handleSuspendMember = (member: TeamMember, suspend: boolean) => {
    updateMemberMutation.mutate({
      id: member.user_id,
      data: {
        is_suspended: suspend,
      },
    })
  }

  const handleRemoveMember = () => {
    if (!selectedMember) return
    removeMemberMutation.mutate(selectedMember.user_id)
  }

  const canInvite = data?.permissions?.includes('members:invite')
  const canManage = data?.permissions?.includes('members:manage')
  const canRemove = data?.permissions?.includes('members:remove')

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
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
          Error loading team data: {error.message}
        </div>
      </div>
    )
  }

  const members: TeamMember[] = data?.members || []
  const invitations: Invitation[] = data?.invitations || []

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage your team members and their roles
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Team Members */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Team Members</h2>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.user.avatar_url || undefined} />
                        <AvatarFallback>
                          {member.user.full_name?.[0]?.toUpperCase() || member.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {member.user.full_name || 'Unnamed User'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      <Shield className="mr-1 h-3 w-3" />
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {member.user.is_suspended ? (
                      <Badge variant="destructive">Suspended</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(member.joined_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {member.role !== 'owner' && canManage && (
                      <div className="flex justify-end gap-2">
                        {member.user.is_suspended ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSuspendMember(member, false)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSuspendMember(member, true)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMember(member)
                            setEditDialogOpen(true)
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {canRemove && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedMember(member)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Invitations</h2>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {invitation.invitee_email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{invitation.company_role}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(invitation.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(invitation.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {canInvite && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to add a new member to your team.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={!inviteEmail || inviteMutation.isPending}>
              {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Change the role for {selectedMember?.user.full_name || selectedMember?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>
              Current role: <Badge>{selectedMember?.role}</Badge>
            </p>
            <p className="mt-2">
              New role: <Badge>{selectedMember?.role === 'admin' ? 'member' : 'admin'}</Badge>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateMember} disabled={updateMemberMutation.isPending}>
              {updateMemberMutation.isPending ? 'Updating...' : 'Update Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedMember?.user.full_name || selectedMember?.email} from the team?
              They will lose access to all projects and resources.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              disabled={removeMemberMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMemberMutation.isPending ? 'Removing...' : 'Remove Member'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}