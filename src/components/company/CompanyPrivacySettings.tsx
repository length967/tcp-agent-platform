import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Shield, 
  Users, 
  Globe,
  Info,
  AlertCircle
} from 'lucide-react'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'

interface CompanyPrivacySettingsProps {
  companyId: string
  companyName: string
}

export function CompanyPrivacySettings({ 
  companyId, 
  companyName
}: CompanyPrivacySettingsProps) {
  const [emailDomain, setEmailDomain] = useState('')
  const [allowDomainSignup, setAllowDomainSignup] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Fetch current privacy settings
  const { data: privacyData, isLoading } = useQuery({
    queryKey: ['company', 'privacy', companyId],
    queryFn: api.company.getPrivacySettings
  })

  // Update local state when data is fetched
  useEffect(() => {
    if (privacyData?.privacy_settings) {
      setEmailDomain(privacyData.privacy_settings.email_domain || '')
      setAllowDomainSignup(privacyData.privacy_settings.allow_domain_signup || false)
    }
  }, [privacyData])

  const updateSettingsMutation = useMutation({
    mutationFn: api.company.updatePrivacySettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', 'privacy', companyId] })
      setHasChanges(false)
      toast({
        title: "Privacy settings updated",
        description: "Your company privacy settings have been successfully updated."
      })
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update privacy settings",
        variant: "destructive"
      })
    }
  })

  const handleEmailDomainChange = (value: string) => {
    setEmailDomain(value)
    setHasChanges(true)
  }

  const handleAllowDomainSignupChange = (value: boolean) => {
    setAllowDomainSignup(value)
    setHasChanges(true)
  }

  const handleSave = async () => {
    const updates: any = {}
    
    // Only include changed values
    if (emailDomain !== (privacyData?.privacy_settings?.email_domain || '')) {
      updates.email_domain = emailDomain || null
    }
    
    if (allowDomainSignup !== (privacyData?.privacy_settings?.allow_domain_signup || false)) {
      updates.allow_domain_signup = allowDomainSignup
    }
    
    await updateSettingsMutation.mutateAsync(updates)
  }

  const pendingRequestsCount = privacyData?.privacy_settings?.pending_requests_count || 0

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Company Privacy Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Company Privacy Settings
        </CardTitle>
        <CardDescription>
          Control domain-based access for {companyName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Requests Badge */}
        {pendingRequestsCount > 0 && (
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>You have pending join requests to review</span>
              <Badge variant="secondary">{pendingRequestsCount} pending</Badge>
            </AlertDescription>
          </Alert>
        )}

        {/* Email Domain */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emailDomain" className="text-base font-medium">
              Company Email Domain
            </Label>
            <p className="text-sm text-muted-foreground">
              Set your company's email domain (e.g., company.com) to enable automatic member joining
            </p>
            <Input
              id="emailDomain"
              type="text"
              placeholder="company.com"
              value={emailDomain}
              onChange={(e) => handleEmailDomainChange(e.target.value)}
              className="max-w-md"
            />
            {emailDomain && !emailDomain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,})+$/) && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Please enter a valid domain (e.g., company.com)
              </p>
            )}
          </div>
        </div>

        {/* Domain Auto-Join */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-purple-600" />
                <Label htmlFor="allowDomainSignup" className="text-base font-medium">
                  Allow Domain Auto-Join
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Users with {emailDomain || 'your domain'} email addresses can automatically join the company
              </p>
            </div>
            <Switch
              id="allowDomainSignup"
              checked={allowDomainSignup}
              onCheckedChange={handleAllowDomainSignupChange}
              disabled={!emailDomain}
            />
          </div>
          
          {allowDomainSignup && emailDomain && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Anyone with an @{emailDomain} email address will automatically become a member when they sign up.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Current Configuration Summary */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 className="font-medium mb-2">Current Configuration:</h4>
          <ul className="text-sm space-y-1">
            <li>
              • Email domain: {emailDomain || 'Not set'}
            </li>
            <li>
              • Domain auto-join: {allowDomainSignup && emailDomain ? 'Enabled' : 'Disabled'}
            </li>
            {allowDomainSignup && emailDomain && (
              <li>
                • New users with @{emailDomain} emails will automatically join as members
              </li>
            )}
          </ul>
        </div>

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline"
              onClick={() => {
                setEmailDomain(privacyData?.privacy_settings?.email_domain || '')
                setAllowDomainSignup(privacyData?.privacy_settings?.allow_domain_signup || false)
                setHasChanges(false)
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending || (!!emailDomain && !emailDomain.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,})+$/))}
            >
              {updateSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 