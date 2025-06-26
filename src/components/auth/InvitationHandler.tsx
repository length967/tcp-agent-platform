import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Building2, Users, Mail, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface InvitationHandlerProps {
  email: string
  invitationToken?: string
  onCompanySelected?: (companyId: string, companyName: string) => void
  onCreateNewCompany?: () => void
}

interface DomainCompany {
  company_id: string
  company_name: string
  can_auto_join: boolean
}

export function InvitationHandler({ 
  email, 
  invitationToken, 
  onCompanySelected, 
  onCreateNewCompany 
}: InvitationHandlerProps) {
  const [selectedOption, setSelectedOption] = useState<'join' | 'create' | null>(null)
  
  // Check for domain-based company access
  const { data: domainCompanies, isLoading: checkingDomain } = useQuery({
    queryKey: ['domain-companies', email],
    queryFn: async () => {
      if (!email || email.includes('@gmail.com') || email.includes('@yahoo.com')) {
        return []
      }
      
      try {
        const response = await api.auth.checkDomainAccess(email)
        return response.companies as DomainCompany[]
      } catch (error) {
        console.log('No domain companies found:', error)
        return []
      }
    },
    enabled: !!email && !invitationToken
  })

  // Check invitation details if token is provided
  const { data: invitationDetails, isLoading: checkingInvitation } = useQuery({
    queryKey: ['invitation', invitationToken],
    queryFn: async () => {
      if (!invitationToken) return null
      
      const response = await api.auth.getInvitationDetails(invitationToken)
      return response.invitation
    },
    enabled: !!invitationToken
  })

  useEffect(() => {
    // Auto-select if there's a valid invitation
    if (invitationDetails && !invitationDetails.expired) {
      setSelectedOption('join')
    }
  }, [invitationDetails])

  if (checkingDomain || checkingInvitation) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Checking Company Access
          </CardTitle>
          <CardDescription>
            We're checking if you can join an existing company...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Handle invitation flow
  if (invitationToken && invitationDetails) {
    if (invitationDetails.expired) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This invitation has expired. Please contact your team administrator for a new invitation.
          </AlertDescription>
        </Alert>
      )
    }

    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            You're Invited!
          </CardTitle>
          <CardDescription>
            You've been invited to join {invitationDetails.company_name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  {invitationDetails.company_name}
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Role: <Badge variant="secondary">{invitationDetails.role}</Badge>
                </p>
                {invitationDetails.project_name && (
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Project: {invitationDetails.project_name}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <Button 
            onClick={() => onCompanySelected?.(invitationDetails.company_id, invitationDetails.company_name)}
            className="w-full"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Accept Invitation
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Handle domain-based company access
  if (domainCompanies && domainCompanies.length > 0) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Join Your Company
          </CardTitle>
          <CardDescription>
            We found companies that match your email domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {domainCompanies.map((company) => (
            <div 
              key={company.company_id}
              className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
              onClick={() => setSelectedOption('join')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Building2 className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium">{company.company_name}</p>
                    <p className="text-sm text-gray-600">
                      {company.can_auto_join ? 'Auto-join enabled' : 'Requires approval'}
                    </p>
                  </div>
                </div>
                {selectedOption === 'join' && (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
              </div>
            </div>
          ))}
          
          <div className="flex gap-2">
            <Button 
              onClick={() => onCompanySelected?.(domainCompanies[0].company_id, domainCompanies[0].company_name)}
              disabled={!selectedOption}
              className="flex-1"
            >
              <Users className="w-4 h-4 mr-2" />
              Join Company
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setSelectedOption('create')}
              className="flex-1"
            >
              Create New
            </Button>
          </div>
          
          {selectedOption === 'create' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can create a new company, but you may want to check with your colleagues first 
                to avoid duplicate companies.
              </AlertDescription>
            </Alert>
          )}
          
          {selectedOption === 'create' && (
            <Button 
              onClick={onCreateNewCompany}
              variant="outline"
              className="w-full"
            >
              <Building2 className="w-4 h-4 mr-2" />
              Create New Company
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  // Default: No invitation or domain match - create new company
  return null
} 