import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Server, 
  FileText, 
  Clock, 
  Globe,
  Users,
  Activity,
  Calendar,
  Settings
} from 'lucide-react'
import { useTimezone } from '@/contexts/TimezoneContext'
import { 
  LongDateTime, 
  ShortDateTime, 
  RelativeTime, 
  BusinessHoursIndicator 
} from '@/components/ui/timezone-display'

// Mock data representing typical dashboard information
const mockDashboardData = {
  transfers: [
    {
      id: 'transfer-1',
      name: 'Production Backup',
      status: 'completed' as const,
      created_at: '2024-01-15T14:30:00Z',
      completed_at: '2024-01-15T15:45:00Z',
      agent_id: 'agent-nyc-1'
    },
    {
      id: 'transfer-2', 
      name: 'Database Sync',
      status: 'in_progress' as const,
      created_at: '2024-01-15T16:00:00Z',
      completed_at: null,
      agent_id: 'agent-lon-1'
    },
    {
      id: 'transfer-3',
      name: 'Log Archive',
      status: 'failed' as const,
      created_at: '2024-01-15T12:15:00Z',
      completed_at: null,
      agent_id: 'agent-tky-1'
    }
  ],
  agents: [
    {
      id: 'agent-nyc-1',
      name: 'NYC-Production-01',
      status: 'active',
      last_seen_at: '2024-01-15T17:22:00Z',
      location: 'New York'
    },
    {
      id: 'agent-lon-1', 
      name: 'LON-Backup-02',
      status: 'busy',
      last_seen_at: '2024-01-15T17:20:00Z',
      location: 'London'
    },
    {
      id: 'agent-tky-1',
      name: 'TKY-Archive-01', 
      status: 'offline',
      last_seen_at: '2024-01-15T16:45:00Z',
      location: 'Tokyo'
    }
  ],
  projects: [
    {
      id: 'project-1',
      name: 'E-commerce Platform',
      created_at: '2024-01-01T09:00:00Z',
      last_activity: '2024-01-15T17:00:00Z'
    }
  ]
}

export function DashboardTimezoneDemo() {
  const { userTimezone, companyTimezone, formatDateTime } = useTimezone()

  return (
    <div className="space-y-8 p-6">
      {/* Header with Timezone Info */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Timezone Integration</h1>
          <p className="text-muted-foreground mt-2">
            Demonstrating timezone-aware components across all dashboard views
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>Your timezone: <strong>{userTimezone}</strong></span>
          </div>
          {companyTimezone && companyTimezone !== userTimezone && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>Company: <strong>{companyTimezone}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Home - Transfer Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recent Transfer Activity
          </CardTitle>
          <CardDescription>
            Timestamps shown in your timezone with tooltips showing company/UTC times
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Transfer</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Created</th>
                  <th className="px-4 py-2 text-left font-medium">Completed</th>
                  <th className="px-4 py-2 text-left font-medium">Agent Location</th>
                </tr>
              </thead>
              <tbody>
                {mockDashboardData.transfers.map((transfer) => {
                  const agent = mockDashboardData.agents.find(a => a.id === transfer.agent_id)
                  return (
                    <tr key={transfer.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{transfer.name}</td>
                      <td className="px-4 py-2">
                        <Badge variant={
                          transfer.status === 'completed' ? 'success' :
                          transfer.status === 'failed' ? 'destructive' :
                          'warning'
                        }>
                          {transfer.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <ShortDateTime 
                          date={transfer.created_at} 
                          format="medium"
                          showTooltip={true}
                          showCompanyTime={true}
                        />
                      </td>
                      <td className="px-4 py-2">
                        {transfer.completed_at ? (
                          <RelativeTime 
                            date={transfer.completed_at} 
                            showTooltip={true}
                          />
                        ) : (
                          <span className="text-muted-foreground">In progress</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span>{agent?.location}</span>
                          <BusinessHoursIndicator 
                            timestamp={transfer.created_at}
                            agentId={transfer.agent_id}
                            size="sm"
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Agent Status Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Agent Health Monitoring
          </CardTitle>
          <CardDescription>
            Agent status with business hours awareness and timezone context
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mockDashboardData.agents.map((agent) => (
              <Card key={agent.id} className="border">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">{agent.name}</h3>
                      <Badge variant={
                        agent.status === 'active' ? 'success' :
                        agent.status === 'busy' ? 'warning' :
                        'secondary'
                      }>
                        {agent.status}
                      </Badge>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      Location: {agent.location}
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span>Last seen:</span>
                      <div className="flex items-center gap-2">
                        <RelativeTime 
                          date={agent.last_seen_at} 
                          showTooltip={true}
                        />
                        <BusinessHoursIndicator 
                          timestamp={agent.last_seen_at}
                          agentId={agent.id}
                          size="sm"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Project Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Project Timeline
          </CardTitle>
          <CardDescription>
            Project creation and activity timestamps with full timezone context
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockDashboardData.projects.map((project) => (
              <div key={project.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{project.name}</h3>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Created:</span>
                        <LongDateTime 
                          date={project.created_at} 
                          showTooltip={true}
                          showCompanyTime={true}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Last activity:</span>
                        <RelativeTime 
                          date={project.last_activity} 
                          showTooltip={true}
                        />
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity Timeline
          </CardTitle>
          <CardDescription>
            Recent system events with relative time displays
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-green-500 mt-2"></div>
              <div className="flex-1">
                <p className="text-sm">
                  <strong>NYC-Production-01</strong> completed backup transfer
                </p>
                <p className="text-xs text-muted-foreground">
                  <RelativeTime 
                    date="2024-01-15T15:45:00Z" 
                    showTooltip={true}
                  />
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-blue-500 mt-2"></div>
              <div className="flex-1">
                <p className="text-sm">
                  <strong>LON-Backup-02</strong> started database synchronization
                </p>
                <p className="text-xs text-muted-foreground">
                  <RelativeTime 
                    date="2024-01-15T16:00:00Z" 
                    showTooltip={true}
                  />
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="h-2 w-2 rounded-full bg-red-500 mt-2"></div>
              <div className="flex-1">
                <p className="text-sm">
                  <strong>TKY-Archive-01</strong> failed to connect for log archive
                </p>
                <p className="text-xs text-muted-foreground">
                  <RelativeTime 
                    date="2024-01-15T12:15:00Z" 
                    showTooltip={true}
                  />
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timezone Features Summary */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Timezone Integration Features
          </CardTitle>
          <CardDescription>
            Summary of timezone capabilities implemented across the dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium">User Experience</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• All timestamps display in user's preferred timezone</li>
                <li>• Tooltips show company and UTC times for context</li>
                <li>• Business hours indicators for global team coordination</li>
                <li>• Relative time displays ("2 hours ago") with timezone awareness</li>
                <li>• Automatic browser timezone detection with override options</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-medium">Technical Implementation</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• All data stored in UTC for consistency</li>
                <li>• Client-side timezone conversion using date-fns-tz</li>
                <li>• Company timezone settings for team coordination</li>
                <li>• Timezone context provider for consistent formatting</li>
                <li>• Reusable timezone display components</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default DashboardTimezoneDemo 