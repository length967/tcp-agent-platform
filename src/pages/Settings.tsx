import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import { 
  User, 
  Shield, 
  Bell, 
  Palette, 
  Key, 
  Monitor,
  Clock,
  Mail,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Calendar,
  AlertCircle,
  Building2
} from 'lucide-react'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { useTimezone, TIMEZONES } from '@/contexts/TimezoneContext'

interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  timezone: string
  language: string
  date_format: string
  time_format: '12h' | '24h'
  email_notifications: boolean
  email_marketing: boolean
  email_security_alerts: boolean
  email_weekly_digest: boolean
  profile_visibility: 'public' | 'team' | 'private'
  show_email: boolean
  activity_tracking: boolean
  api_key_expires_days: number
  webhook_notifications: boolean
  session_timeout_minutes: number
}

interface UserProfile {
  id: string
  email: string
  email_confirmed: boolean
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

interface UserSession {
  id: string
  device_name: string | null
  ip_address: string | null
  user_agent: string | null
  location: string | null
  last_active: string
  expires_at: string
  created_at: string
}

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  expires_at: string
  scopes: string[]
  created_at: string
  revoked_at: string | null
}

export default function Settings() {
  const { session } = useAuth()
  const { detectedTimezone, formatDateTime } = useTimezone()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('profile')
  const [showNewApiKey, setShowNewApiKey] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })
  const [sessionConfig, setSessionConfig] = useState<{
    timeoutMinutes: number
    isCompanyEnforced: boolean
    companyTimeout: number | null
    userTimeout: number | null
    source: string
  } | null>(null)

  // Fetch session configuration
  useQuery({
    queryKey: ['session', 'config'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/session/config`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to fetch session config')
      const data = await response.json()
      setSessionConfig(data)
      return data
    },
    enabled: !!session
  })

  // Fetch user preferences
  const { data: preferencesData } = useQuery({
    queryKey: ['user', 'preferences'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/preferences`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to fetch preferences')
      const data = await response.json()
      return data.preferences as UserPreferences
    },
    enabled: !!session
  })

  // Fetch user profile
  const { data: profileData } = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/profile`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to fetch profile')
      const data = await response.json()
      return data.profile as UserProfile
    },
    enabled: !!session
  })

  // Fetch active sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['user', 'sessions'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/sessions`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to fetch sessions')
      const data = await response.json()
      return data.sessions as UserSession[]
    },
    enabled: !!session && activeTab === 'security'
  })

  // Fetch API keys
  const { data: apiKeysData } = useQuery({
    queryKey: ['user', 'api-keys'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/api-keys`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to fetch API keys')
      const data = await response.json()
      return data.api_keys as ApiKey[]
    },
    enabled: !!session && activeTab === 'api'
  })

  // Update preferences mutation
  const updatePreferences = useMutation({
    mutationFn: async (updates: Partial<UserPreferences>) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/preferences`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })
      if (!response.ok) throw new Error('Failed to update preferences')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'preferences'] })
      toast({
        title: 'Preferences updated',
        description: 'Your preferences have been saved successfully.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update preferences. Please try again.',
        variant: 'destructive'
      })
    }
  })

  // Update profile mutation
  const updateProfile = useMutation({
    mutationFn: async (updates: { full_name?: string; avatar_url?: string | null }) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })
      if (!response.ok) throw new Error('Failed to update profile')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'profile'] })
      toast({
        title: 'Profile updated',
        description: 'Your profile has been saved successfully.',
      })
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update profile. Please try again.',
        variant: 'destructive'
      })
    }
  })

  // Change password mutation
  const changePassword = useMutation({
    mutationFn: async (data: { current_password: string; new_password: string }) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/password`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to change password')
      }
      return response.json()
    },
    onSuccess: () => {
      toast({
        title: 'Password changed',
        description: 'Your password has been updated successfully.',
      })
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  // Revoke session mutation
  const revokeSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to revoke session')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'sessions'] })
      toast({
        title: 'Session revoked',
        description: 'The session has been terminated.',
      })
    }
  })

  // Create API key mutation
  const createApiKey = useMutation({
    mutationFn: async (data: { name: string; expires_days?: number; scopes?: string[] }) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/api-keys`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })
      if (!response.ok) throw new Error('Failed to create API key')
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user', 'api-keys'] })
      setShowNewApiKey(data.api_key.key)
      toast({
        title: 'API key created',
        description: 'Your API key has been created. Make sure to copy it now!',
      })
    }
  })

  // Revoke API key mutation
  const revokeApiKey = useMutation({
    mutationFn: async (keyId: string) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/v1/user/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        }
      })
      if (!response.ok) throw new Error('Failed to revoke API key')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'api-keys'] })
      toast({
        title: 'API key revoked',
        description: 'The API key has been revoked.',
      })
    }
  })

  // Apply theme preference
  useEffect(() => {
    if (preferencesData?.theme) {
      const root = window.document.documentElement
      root.classList.remove('light', 'dark')
      if (preferencesData.theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        root.classList.add(systemTheme)
      } else {
        root.classList.add(preferencesData.theme)
      }
    }
  }, [preferencesData?.theme])

  const handlePasswordSubmit = () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast({
        title: 'Error',
        description: 'New passwords do not match',
        variant: 'destructive'
      })
      return
    }
    changePassword.mutate({
      current_password: passwordForm.current_password,
      new_password: passwordForm.new_password
    })
  }

  const copyApiKey = (key: string) => {
    navigator.clipboard.writeText(key)
    toast({
      title: 'Copied',
      description: 'API key copied to clipboard',
    })
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account settings and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="display" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Display
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your account profile information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="flex items-center gap-2">
                  <Input value={profileData?.email || ''} disabled />
                  {profileData?.email_confirmed && (
                    <Badge variant="secondary">Verified</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profileData?.full_name || ''}
                  onChange={(e) => {
                    updateProfile.mutate({ full_name: e.target.value })
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== profileData?.full_name) {
                      updateProfile.mutate({ full_name: e.target.value })
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatar_url">Avatar URL</Label>
                <Input
                  id="avatar_url"
                  type="url"
                  value={profileData?.avatar_url || ''}
                  onChange={(e) => {
                    updateProfile.mutate({ avatar_url: e.target.value || null })
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== profileData?.avatar_url) {
                      updateProfile.mutate({ avatar_url: e.target.value || null })
                    }
                  }}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Privacy</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Profile Visibility</Label>
                    <p className="text-sm text-muted-foreground">Control who can see your profile</p>
                  </div>
                  <Select
                    value={preferencesData?.profile_visibility}
                    onValueChange={(value: 'public' | 'team' | 'private') => {
                      updatePreferences.mutate({ profile_visibility: value })
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="team">Team Only</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show Email</Label>
                    <p className="text-sm text-muted-foreground">Allow team members to see your email</p>
                  </div>
                  <Switch
                    checked={preferencesData?.show_email}
                    onCheckedChange={(checked) => {
                      updatePreferences.mutate({ show_email: checked })
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Activity Tracking</Label>
                    <p className="text-sm text-muted-foreground">Allow tracking of your activity for analytics</p>
                  </div>
                  <Switch
                    checked={preferencesData?.activity_tracking}
                    onCheckedChange={(checked) => {
                      updatePreferences.mutate({ activity_tracking: checked })
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="display">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Customize how the application appears to you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select
                  value={preferencesData?.theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') => {
                    updatePreferences.mutate({ theme: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select
                  value={preferencesData?.timezone}
                  onValueChange={(value) => {
                    updatePreferences.mutate({ timezone: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {/* Show detected timezone first if not already selected */}
                    {detectedTimezone && detectedTimezone !== preferencesData?.timezone && (
                      <>
                        <SelectItem value={detectedTimezone}>
                          🌍 {TIMEZONES.find(tz => tz.value === detectedTimezone)?.label || detectedTimezone} (Detected)
                        </SelectItem>
                        <div className="border-b my-1" />
                      </>
                    )}
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{tz.label}</span>
                          <span className="text-xs text-muted-foreground ml-2">{tz.offset}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {preferencesData?.timezone && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Current time: {formatDateTime(new Date(), { includeTimezone: true })}
                    </p>
                    {detectedTimezone && detectedTimezone !== preferencesData.timezone && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        💡 Your browser timezone is {TIMEZONES.find(tz => tz.value === detectedTimezone)?.label || detectedTimezone}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Date Format</Label>
                <Select
                  value={preferencesData?.date_format}
                  onValueChange={(value) => {
                    updatePreferences.mutate({ date_format: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time Format</Label>
                <Select
                  value={preferencesData?.time_format}
                  onValueChange={(value: '12h' | '24h') => {
                    updatePreferences.mutate({ time_format: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                    <SelectItem value="24h">24-hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={preferencesData?.language}
                  onValueChange={(value) => {
                    updatePreferences.mutate({ language: value })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="fr">Français</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Control how you receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email Notifications
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>General Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive email notifications for general updates</p>
                    </div>
                    <Switch
                      checked={preferencesData?.email_notifications}
                      onCheckedChange={(checked) => {
                        updatePreferences.mutate({ email_notifications: checked })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Security Alerts</Label>
                      <p className="text-sm text-muted-foreground">Important security notifications about your account</p>
                    </div>
                    <Switch
                      checked={preferencesData?.email_security_alerts}
                      onCheckedChange={(checked) => {
                        updatePreferences.mutate({ email_security_alerts: checked })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Weekly Digest</Label>
                      <p className="text-sm text-muted-foreground">Summary of your weekly activity</p>
                    </div>
                    <Switch
                      checked={preferencesData?.email_weekly_digest}
                      onCheckedChange={(checked) => {
                        updatePreferences.mutate({ email_weekly_digest: checked })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Marketing Emails</Label>
                      <p className="text-sm text-muted-foreground">Product updates and announcements</p>
                    </div>
                    <Switch
                      checked={preferencesData?.email_marketing}
                      onCheckedChange={(checked) => {
                        updatePreferences.mutate({ email_marketing: checked })
                      }}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Other Notifications</h3>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Webhook Notifications</Label>
                    <p className="text-sm text-muted-foreground">Send notifications to configured webhooks</p>
                  </div>
                  <Switch
                    checked={preferencesData?.webhook_notifications}
                    onCheckedChange={(checked) => {
                      updatePreferences.mutate({ webhook_notifications: checked })
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update your account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current_password">Current Password</Label>
                  <div className="relative">
                    <Input
                      id="current_password"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordForm.current_password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="new_password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordForm.new_password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordForm.confirm_password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button 
                  onClick={handlePasswordSubmit}
                  disabled={changePassword.isPending || !passwordForm.current_password || !passwordForm.new_password}
                >
                  {changePassword.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    'Change Password'
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your security preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">Automatically log out after inactivity</p>
                    </div>
                    <Select
                      value={String(preferencesData?.session_timeout_minutes || sessionConfig?.timeoutMinutes || 30)}
                      onValueChange={(value) => {
                        updatePreferences.mutate({ session_timeout_minutes: parseInt(value) })
                      }}
                      disabled={sessionConfig?.isCompanyEnforced}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="240">4 hours</SelectItem>
                        <SelectItem value="1440">24 hours</SelectItem>
                        <SelectItem value="10080">7 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {sessionConfig?.isCompanyEnforced && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-4">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            Company Policy Enforced
                          </p>
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            Your session timeout is set to {sessionConfig.companyTimeout} minutes by your company's security policy.
                            This setting cannot be changed.
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1 mt-2">
                            <Building2 className="h-3 w-3" />
                            Contact your company administrator to modify this policy
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {!sessionConfig?.isCompanyEnforced && sessionConfig?.source === 'company_default' && (
                    <p className="text-xs text-muted-foreground">
                      Using company default of {sessionConfig.companyTimeout} minutes. You can customize this setting.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>Manage your active login sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sessionsData?.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4" />
                          <span className="font-medium">{session.device_name || 'Unknown Device'}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {session.ip_address || 'Unknown IP'} • {session.location || 'Unknown Location'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last active: {format(new Date(session.last_active), 'PPp')}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => revokeSession.mutate(session.id)}
                        disabled={revokeSession.isPending}
                      >
                        Revoke
                      </Button>
                    </div>
                  ))}
                  {(!sessionsData || sessionsData.length === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-4">No active sessions</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="api">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Key Settings</CardTitle>
                <CardDescription>Configure default settings for API keys</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Default Expiration</Label>
                    <p className="text-sm text-muted-foreground">How long new API keys are valid</p>
                  </div>
                  <Select
                    value={String(preferencesData?.api_key_expires_days)}
                    onValueChange={(value) => {
                      updatePreferences.mutate({ api_key_expires_days: parseInt(value) })
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="180">180 days</SelectItem>
                      <SelectItem value="365">1 year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>Manage your API keys for programmatic access</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button
                    onClick={() => {
                      const name = prompt('Enter a name for the API key:')
                      if (name) {
                        createApiKey.mutate({ 
                          name,
                          expires_days: preferencesData?.api_key_expires_days || 90
                        })
                      }
                    }}
                  >
                    <Key className="mr-2 h-4 w-4" />
                    Create New API Key
                  </Button>

                  {showNewApiKey && (
                    <div className="p-4 border rounded-lg bg-muted">
                      <p className="text-sm font-medium mb-2">Your new API key:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-background rounded text-xs break-all">{showNewApiKey}</code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyApiKey(showNewApiKey)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Make sure to copy this key now. You won't be able to see it again!
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => setShowNewApiKey(null)}
                      >
                        Done
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {apiKeysData?.map((key) => (
                      <div key={key.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{key.name}</span>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{key.key_prefix}...</code>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Created: {format(new Date(key.created_at), 'PP')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Expires: {format(new Date(key.expires_at), 'PP')}
                            </span>
                            {key.last_used_at && (
                              <span>Last used: {format(new Date(key.last_used_at), 'PP')}</span>
                            )}
                          </div>
                          {key.scopes.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {key.scopes.map((scope) => (
                                <Badge key={scope} variant="secondary" className="text-xs">
                                  {scope}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm('Are you sure you want to revoke this API key?')) {
                              revokeApiKey.mutate(key.id)
                            }
                          }}
                          disabled={revokeApiKey.isPending || !!key.revoked_at}
                        >
                          {key.revoked_at ? 'Revoked' : 'Revoke'}
                        </Button>
                      </div>
                    ))}
                    {(!apiKeysData || apiKeysData.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No API keys created</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}