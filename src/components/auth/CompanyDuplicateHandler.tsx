import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Building2, 
  Users, 
  AlertTriangle, 
  CheckCircle, 
  ExternalLink,
  Shield,
  Globe
} from 'lucide-react'

interface CompanyDuplicateHandlerProps {
  attemptedCompanyName: string
  userEmail: string
  onRequestJoinCompany: (companyId: string, companyName: string, requiresApproval: boolean) => void
  onCreateNewCompany: (confirmedName: string) => void
  onBack: () => void
}

interface SimilarCompany {
  company_id: string
  company_name: string
  similarity_score: number
  email_domain: string | null
  can_auto_join: boolean
  member_count: number
  allows_join_requests: boolean
  requires_approval: boolean
}

export function CompanyDuplicateHandler({
  attemptedCompanyName,
  userEmail,
  onRequestJoinCompany,
  onCreateNewCompany,
  onBack
}: CompanyDuplicateHandlerProps) {
  const [selectedAction, setSelectedAction] = useState<'join' | 'create' | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<SimilarCompany | null>(null)
  const [showConfirmCreate, setShowConfirmCreate] = useState(false)

  // Find similar companies
  const { data: similarCompanies, isLoading } = useQuery({
    queryKey: ['similar-companies', attemptedCompanyName, userEmail],
    queryFn: async () => {
      const response = await api.auth.findSimilarCompanies({
        companyName: attemptedCompanyName,
        userEmail
      })
      return response.companies as SimilarCompany[]
    }
  })

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Checking for Similar Companies
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

  const exactMatches = similarCompanies?.filter(c => c.similarity_score === 1) || []
  const similarMatches = similarCompanies?.filter(c => c.similarity_score < 1 && c.similarity_score > 0.7) || []
  const domainMatches = similarCompanies?.filter(c => c.can_auto_join) || []

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          Similar Companies Found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We found companies with similar names. Would you like to join one of them instead?
        </p>
      </div>

      {/* Exact Matches - Highest Priority */}
      {exactMatches.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Exact Name Match Found
            </CardTitle>
            <CardDescription>
              A company with the exact name "{attemptedCompanyName}" already exists.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {exactMatches.map((company) => (
              <div 
                key={company.company_id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedCompany?.company_id === company.company_id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 hover:border-gray-300 bg-white dark:bg-gray-800'
                }`}
                onClick={() => {
                  setSelectedCompany(company)
                  setSelectedAction('join')
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium">{company.company_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          {company.member_count} members
                        </Badge>
                        {company.can_auto_join && (
                          <Badge variant="outline" className="text-xs text-green-600">
                            <Globe className="w-3 h-3 mr-1" />
                            Your domain
                          </Badge>
                        )}
                        {company.requires_approval && !company.can_auto_join && (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            Requires approval
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedCompany?.company_id === company.company_id && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Domain Matches - High Priority */}
      {domainMatches.length > 0 && exactMatches.length === 0 && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-600" />
              Your Company Domain
            </CardTitle>
            <CardDescription>
              Companies from your email domain that you can join automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {domainMatches.map((company) => (
              <div 
                key={company.company_id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedCompany?.company_id === company.company_id
                    ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
                    : 'border-blue-200 hover:border-blue-300 bg-white dark:bg-gray-800'
                }`}
                onClick={() => {
                  setSelectedCompany(company)
                  setSelectedAction('join')
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium">{company.company_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          {company.member_count} members
                        </Badge>
                        <Badge variant="outline" className="text-xs text-green-600">
                          <Shield className="w-3 h-3 mr-1" />
                          Auto-join enabled
                        </Badge>
                        {company.requires_approval && (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            Requires approval
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedCompany?.company_id === company.company_id && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Similar Matches - Medium Priority */}
      {similarMatches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Similar Company Names
            </CardTitle>
            <CardDescription>
              These companies have similar names to "{attemptedCompanyName}".
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {similarMatches.map((company) => (
              <div 
                key={company.company_id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedCompany?.company_id === company.company_id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => {
                  setSelectedCompany(company)
                  setSelectedAction('join')
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-gray-600" />
                    <div>
                      <p className="font-medium">{company.company_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          {company.member_count} members
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {Math.round(company.similarity_score * 100)}% similar
                        </Badge>
                        {company.requires_approval && (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            Requires approval
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedCompany?.company_id === company.company_id && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Create New Company Option */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Create "{attemptedCompanyName}" Anyway
          </CardTitle>
          <CardDescription>
            Create a new company with this name if you're sure it should be separate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            className={`p-4 border rounded-lg cursor-pointer transition-all ${
              selectedAction === 'create'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-950'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => {
              setSelectedAction('create')
              setSelectedCompany(null)
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-purple-600" />
                <div>
                  <p className="font-medium">Create new company</p>
                  <p className="text-sm text-gray-600">
                    You'll be the owner of a separate "{attemptedCompanyName}" company
                  </p>
                </div>
              </div>
              {selectedAction === 'create' && (
                <CheckCircle className="w-5 h-5 text-purple-600" />
              )}
            </div>
          </div>
          
          {selectedAction === 'create' && !showConfirmCreate && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Creating multiple companies with similar names can be confusing for your team. 
                Are you sure this should be a separate company?
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          Back
        </Button>
        
        {selectedAction === 'join' && selectedCompany && (
          <Button 
            onClick={() => onRequestJoinCompany(
              selectedCompany.company_id, 
              selectedCompany.company_name,
              selectedCompany.requires_approval
            )}
            className="flex-1"
          >
            <Users className="w-4 h-4 mr-2" />
            {selectedCompany.can_auto_join 
              ? `Join ${selectedCompany.company_name}` 
              : selectedCompany.requires_approval
                ? `Request to Join ${selectedCompany.company_name}`
                : `Join ${selectedCompany.company_name}`
            }
          </Button>
        )}
        
        {selectedAction === 'create' && (
          <Button 
            onClick={() => {
              if (showConfirmCreate) {
                onCreateNewCompany(attemptedCompanyName)
              } else {
                setShowConfirmCreate(true)
              }
            }}
            variant={showConfirmCreate ? "default" : "outline"}
            className="flex-1"
          >
            <Building2 className="w-4 h-4 mr-2" />
            {showConfirmCreate ? 'Confirm Create New Company' : 'Create New Company'}
          </Button>
        )}
      </div>
    </div>
  )
} 