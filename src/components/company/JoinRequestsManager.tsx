import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  Calendar,
  Mail
} from 'lucide-react'
import { format } from 'date-fns'

interface JoinRequest {
  id: string
  company_id: string
  user_id: string
  email: string
  full_name: string | null
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_at?: string | null
  reviewer_notes?: string | null
  user?: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  }
}

interface JoinRequestsManagerProps {
  companyId: string
  companyName: string
}

export function JoinRequestsManager({ companyId, companyName }: JoinRequestsManagerProps) {
  const [selectedRequest, setSelectedRequest] = useState<JoinRequest | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  
  const queryClient = useQueryClient()

  // Fetch join requests
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['team', 'join-requests', companyId],
    queryFn: async () => {
      const response = await api.team.getJoinRequests()
      // Filter by status on the client side since API returns all requests
      return response.join_requests.filter(req => req.status === statusFilter) as JoinRequest[]
    }
  })

  // Review request mutation
  const reviewMutation = useMutation({
    mutationFn: async ({ requestId, action, notes }: { 
      requestId: string
      action: 'approve' | 'reject'
      notes?: string 
    }) => {
      return api.team.reviewJoinRequest(requestId, { action, notes })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', 'join-requests'] })
      setSelectedRequest(null)
      setReviewNotes('')
    }
  })

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!selectedRequest) return
    
    try {
      await reviewMutation.mutateAsync({
        requestId: selectedRequest.id,
        action,
        notes: reviewNotes || undefined
      })
    } catch (error) {
      console.error('Failed to review request:', error)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Join Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const requests = requestsData || []

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Join Requests for {companyName}
          </CardTitle>
          <CardDescription>
            Manage requests from users who want to join your company
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Status Filter */}
          <div className="flex gap-2 mb-6">
            {(['pending', 'approved', 'rejected'] as const).map((status) => (
              <Button
                key={status}
                variant={statusFilter === status ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter(status)}
                className="capitalize"
              >
                {status === 'pending' && <Clock className="w-4 h-4 mr-1" />}
                {status === 'approved' && <CheckCircle className="w-4 h-4 mr-1" />}
                {status === 'rejected' && <XCircle className="w-4 h-4 mr-1" />}
                {status}
              </Button>
            ))}
          </div>

          {/* Requests List */}
          {requests.length === 0 ? (
            <Alert>
              <AlertDescription>
                No {statusFilter} join requests found.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <Card 
                  key={request.id}
                  className={`cursor-pointer transition-all ${
                    selectedRequest?.id === request.id 
                      ? 'border-blue-500 shadow-md' 
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedRequest(request)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{request.user?.full_name || request.full_name || 'Unknown User'}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-3 h-3" />
                            {request.user?.email || request.email}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(request.created_at), 'MMM d, yyyy h:mm a')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {request.message && (
                          <Badge variant="outline" className="text-xs">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            Has message
                          </Badge>
                        )}
                        <Badge 
                          variant={
                            request.status === 'approved' ? 'default' :
                            request.status === 'rejected' ? 'destructive' : 
                            'secondary'
                          }
                        >
                          {request.status}
                        </Badge>
                      </div>
                    </div>
                    
                    {request.message && (
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          "{request.message}"
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Panel */}
      {selectedRequest && selectedRequest.status === 'pending' && (
        <Card>
          <CardHeader>
            <CardTitle>Review Join Request</CardTitle>
            <CardDescription>
              Review {selectedRequest.user?.full_name || selectedRequest.full_name || 'Unknown'}'s request to join {companyName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Name:</strong> {selectedRequest.user?.full_name || selectedRequest.full_name || 'Unknown'}
              </div>
              <div>
                <strong>Email:</strong> {selectedRequest.user?.email || selectedRequest.email}
              </div>
              <div>
                <strong>Requested:</strong> {format(new Date(selectedRequest.created_at), 'MMM d, yyyy h:mm a')}
              </div>
            </div>
            
            {selectedRequest.message && (
              <div>
                <strong>Message from user:</strong>
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-sm">{selectedRequest.message}</p>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Review Notes (Optional)
              </label>
              <Textarea
                value={reviewNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReviewNotes(e.target.value)}
                placeholder="Add notes about your decision..."
                className="min-h-[80px]"
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                onClick={() => handleReview('approve')}
                disabled={reviewMutation.isPending}
                className="flex-1"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve Request
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleReview('reject')}
                disabled={reviewMutation.isPending}
                className="flex-1"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 