import { useState } from 'react'
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
import { toast } from '@/components/ui/use-toast'
import { api } from '@/lib/api'
import { useTimezone, TIMEZONES } from '@/contexts/TimezoneContext'
import { 
  Building2, 
  Shield, 
  Users, 
  CreditCard,
  Settings,
  Clock,
  AlertCircle,
  Globe
} from 'lucide-react'

interface CompanyData {
  id: string
  name: string
  slug: string
  settings: Record<string, any>
  subscription_status: string
  subscription_ends_at: string | null
  session_timeout_minutes: number
  enforce_session_timeout: boolean
  default_timezone: string
  enforce_timezone: boolean
  business_hours_start: string
  business_hours_end: string
  business_days: number[]
  created_at: string
  updated_at: string
}

interface CompanyMember {
  user_id: string
  role: 'owner' | 'admin' | 'member'
  full_name: string | null
  email: string
  joined_at: string
}

export default function Company() {
  const { user } = useAuth()
  const { formatDateTime, detectedTimezone } = useTimezone()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')

  // Fetch company data
  const { data: company, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: async () => {
      const response = await api.client.get('/company')
      const data = await response.json()
      return data.company as CompanyData
    }
  })

  // Fetch company members to check user role
  const { data: members } = useQuery({
    queryKey: ['company', 'members'],
    queryFn: async () => {
      const response = await api.client.get('/company/members')
      const data = await response.json()
      return data.members as CompanyMember[]
    },
    enabled: !!company
  })

  // Check if current user is owner or admin
  const currentUserRole = members?.find(m => m.user_id === user?.id)?.role
  const canEditSettings = currentUserRole === 'owner' || currentUserRole === 'admin'

  // Update company mutation
  const updateCompany = useMutation({
    mutationFn: async (updates: Partial<CompanyData>) => {
      const response = await api.client.patch('/company', {
        json: updates
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update company')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company'] })
      toast({
        title: 'Company updated',
        description: 'Company settings have been saved successfully.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    }
  })

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading...</div>
  }

  if (!company) {
    return (
      <div className="border rounded-lg p-8 text-center">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">No Company Found</h3>
        <p className="text-gray-500">You are not associated with any company</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Company Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your company configuration and policies</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Basic information about your company</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input
                  id="company_name"
                  value={company.name}
                  onChange={(e) => {
                    if (canEditSettings) {
                      updateCompany.mutate({ name: e.target.value })
                    }
                  }}
                  disabled={!canEditSettings || updateCompany.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company_slug">Company Slug</Label>
                <Input
                  id="company_slug"
                  value={company.slug}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  The slug cannot be changed after creation
                </p>
              </div>

              <div className="space-y-2">
                <Label>Subscription Status</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{company.subscription_status}</span>
                  {company.subscription_ends_at && (
                    <span className="text-sm text-muted-foreground">
                      (Expires: {new Date(company.subscription_ends_at).toLocaleDateString()})
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Policies</CardTitle>
              <CardDescription>Configure security settings for all company members</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Session Management
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Default Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically log out users after inactivity
                      </p>
                    </div>
                    <Select
                      value={String(company.session_timeout_minutes || 30)}
                      onValueChange={(value) => {
                        if (canEditSettings) {
                          updateCompany.mutate({ session_timeout_minutes: parseInt(value) })
                        }
                      }}
                      disabled={!canEditSettings}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="240">4 hours</SelectItem>
                        <SelectItem value="480">8 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enforce Session Timeout</Label>
                      <p className="text-sm text-muted-foreground">
                        Prevent users from overriding the company timeout policy
                      </p>
                    </div>
                    <Switch
                      checked={company.enforce_session_timeout || false}
                      onCheckedChange={(checked) => {
                        if (canEditSettings) {
                          updateCompany.mutate({ enforce_session_timeout: checked })
                        }
                      }}
                      disabled={!canEditSettings}
                    />
                  </div>
                </div>

                {!canEditSettings && (
                  <div className="rounded-lg bg-muted p-4">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Only company owners and admins can modify security policies
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Timezone & Business Hours
                </h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Company Timezone</Label>
                    <Select
                      value={company.default_timezone || 'UTC'}
                      onValueChange={(value) => {
                        if (canEditSettings) {
                          updateCompany.mutate({ default_timezone: value })
                        }
                      }}
                      disabled={!canEditSettings}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
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
                    {company.default_timezone && (
                      <p className="text-sm text-muted-foreground">
                        Company time: {formatDateTime(new Date(), { 
                          timezone: company.default_timezone, 
                          includeTimezone: true 
                        })}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enforce Company Timezone</Label>
                      <p className="text-sm text-muted-foreground">
                        Require all users to use the company timezone for consistency
                      </p>
                    </div>
                    <Switch
                      checked={company.enforce_timezone || false}
                      onCheckedChange={(checked) => {
                        if (canEditSettings) {
                          updateCompany.mutate({ enforce_timezone: checked })
                        }
                      }}
                      disabled={!canEditSettings}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Business Hours Start</Label>
                      <Input
                        type="time"
                        value={company.business_hours_start || '09:00'}
                        onChange={(e) => {
                          if (canEditSettings) {
                            updateCompany.mutate({ business_hours_start: e.target.value })
                          }
                        }}
                        disabled={!canEditSettings}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Business Hours End</Label>
                      <Input
                        type="time"
                        value={company.business_hours_end || '17:00'}
                        onChange={(e) => {
                          if (canEditSettings) {
                            updateCompany.mutate({ business_hours_end: e.target.value })
                          }
                        }}
                        disabled={!canEditSettings}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Business Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: 1, label: 'Mon' },
                        { value: 2, label: 'Tue' },
                        { value: 3, label: 'Wed' },
                        { value: 4, label: 'Thu' },
                        { value: 5, label: 'Fri' },
                        { value: 6, label: 'Sat' },
                        { value: 7, label: 'Sun' }
                      ].map((day) => {
                        const isSelected = company.business_days?.includes(day.value) ?? [1,2,3,4,5].includes(day.value)
                        return (
                          <Button
                            key={day.value}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              if (!canEditSettings) return
                              const currentDays = company.business_days || [1,2,3,4,5]
                              const newDays = isSelected 
                                ? currentDays.filter(d => d !== day.value)
                                : [...currentDays, day.value].sort()
                              updateCompany.mutate({ business_days: newDays })
                            }}
                            disabled={!canEditSettings}
                            className="w-12 h-8"
                          >
                            {day.label}
                          </Button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Business hours are used for scheduling and notifications
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Other Security Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Additional security configurations will be available here
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Company Members</CardTitle>
              <CardDescription>View and manage company team members</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {members?.map((member) => (
                  <div key={member.user_id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{member.full_name || member.email}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined: {new Date(member.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize px-2 py-1 bg-muted rounded">
                        {member.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing & Subscription</CardTitle>
              <CardDescription>Manage your company's subscription and billing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-8">
                <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Billing Portal</h3>
                <p className="text-gray-500 mb-4">Manage your subscription, payment methods, and invoices</p>
                <Button disabled>
                  Open Billing Portal
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}