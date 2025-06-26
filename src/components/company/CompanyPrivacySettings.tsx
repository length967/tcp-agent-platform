import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Shield, 
  Eye, 
  EyeOff, 
  Users, 
  Globe,
  Info
} from 'lucide-react'

interface CompanyPrivacySettingsProps {
  companyId: string
  companyName: string
  currentSettings: {
    discoverable: boolean
    allowJoinRequests: boolean
    requireAdminApproval: boolean
    allowDomainSignup: boolean
  }
}

export function CompanyPrivacySettings({ 
  companyId, 
  companyName, 
  currentSettings 
}: CompanyPrivacySettingsProps) {
  const [settings, setSettings] = useState(currentSettings)
  const [hasChanges, setHasChanges] = useState(false)
  
  const queryClient = useQueryClient()

  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: typeof settings) => {
      // This would be an API call to update company settings
      // For now, we'll simulate it
      return new Promise(resolve => setTimeout(resolve, 1000))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', companyId] })
      setHasChanges(false)
    }
  })

  const handleSettingChange = (key: keyof typeof settings, value: boolean) => {
    const newSettings = { ...settings, [key]: value }
    
    // Auto-adjust dependent settings
    if (key === 'discoverable' && !value) {
      // If not discoverable, can't allow join requests
      newSettings.allowJoinRequests = false
    }
    
    if (key === 'allowJoinRequests' && !value) {
      // If not allowing join requests, approval setting doesn't matter
      newSettings.requireAdminApproval = false
    }
    
    if (key === 'allowJoinRequests' && value && !settings.discoverable) {
      // If enabling join requests, must be discoverable
      newSettings.discoverable = true
    }
    
    setSettings(newSettings)
    setHasChanges(true)
  }

  const handleSave = async () => {
    try {
      await updateSettingsMutation.mutateAsync(settings)
    } catch (error) {
      console.error('Failed to update settings:', error)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Company Privacy & Join Settings
        </CardTitle>
        <CardDescription>
          Control how users can discover and join {companyName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Visibility */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {settings.discoverable ? (
                  <Eye className="w-4 h-4 text-green-600" />
                ) : (
                  <EyeOff className="w-4 h-4 text-gray-600" />
                )}
                <Label htmlFor="discoverable" className="text-base font-medium">
                  Company Discoverable
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Allow users to find your company when they search for similar names during signup
              </p>
            </div>
            <Switch
              id="discoverable"
              checked={settings.discoverable}
              onCheckedChange={(checked) => handleSettingChange('discoverable', checked)}
            />
          </div>
          
          {!settings.discoverable && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                When disabled, your company will be hidden from discovery. Users can only join through direct invitations.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Join Requests */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <Label htmlFor="allowJoinRequests" className="text-base font-medium">
                  Accept Join Requests
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Allow users to request to join your company (requires company to be discoverable)
              </p>
            </div>
            <Switch
              id="allowJoinRequests"
              checked={settings.allowJoinRequests}
              onCheckedChange={(checked) => handleSettingChange('allowJoinRequests', checked)}
              disabled={!settings.discoverable}
            />
          </div>
        </div>

        {/* Admin Approval */}
        {settings.allowJoinRequests && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-600" />
                  <Label htmlFor="requireAdminApproval" className="text-base font-medium">
                    Require Admin Approval
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Join requests must be approved by company admins before users can access the company
                </p>
              </div>
              <Switch
                id="requireAdminApproval"
                checked={settings.requireAdminApproval}
                onCheckedChange={(checked) => handleSettingChange('requireAdminApproval', checked)}
              />
            </div>
            
            {!settings.requireAdminApproval && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  When disabled, users will automatically join your company when they request access.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Domain Signup */}
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
                Users with matching email domains can automatically join without approval
              </p>
            </div>
            <Switch
              id="allowDomainSignup"
              checked={settings.allowDomainSignup}
              onCheckedChange={(checked) => handleSettingChange('allowDomainSignup', checked)}
            />
          </div>
        </div>

        {/* Current Configuration Summary */}
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 className="font-medium mb-2">Current Configuration:</h4>
          <ul className="text-sm space-y-1">
            <li>
              • Company is {settings.discoverable ? 'visible' : 'hidden'} in user searches
            </li>
            {settings.discoverable && (
              <li>
                • Join requests are {settings.allowJoinRequests ? 'accepted' : 'disabled'}
              </li>
            )}
            {settings.allowJoinRequests && (
              <li>
                • Admin approval is {settings.requireAdminApproval ? 'required' : 'not required'}
              </li>
            )}
            <li>
              • Domain auto-join is {settings.allowDomainSignup ? 'enabled' : 'disabled'}
            </li>
          </ul>
        </div>

        {/* Save Button */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button 
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
} 