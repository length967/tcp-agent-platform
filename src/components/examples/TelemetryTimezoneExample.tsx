import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  TimezoneDisplay, 
  RelativeTime, 
  ShortDateTime, 
  BusinessHoursIndicator 
} from '@/components/ui/timezone-display'
import { useTimezone } from '@/contexts/TimezoneContext'
import { Clock, Globe, Activity, Zap } from 'lucide-react'

// Mock telemetry data (would come from ClickHouse)
const mockTelemetryData = [
  {
    id: '1',
    timestamp: '2025-01-26T14:30:00.000Z', // UTC timestamp from ClickHouse
    agent_id: 'agent-001',
    transfer_id: 'transfer-123',
    bytes_transferred: 1024000,
    throughput_mbps: 85.2,
    status: 'completed'
  },
  {
    id: '2', 
    timestamp: '2025-01-26T09:15:00.000Z',
    agent_id: 'agent-002',
    transfer_id: 'transfer-124',
    bytes_transferred: 2048000,
    throughput_mbps: 120.5,
    status: 'in_progress'
  },
  {
    id: '3',
    timestamp: '2025-01-25T22:45:00.000Z',
    agent_id: 'agent-001', 
    transfer_id: 'transfer-125',
    bytes_transferred: 512000,
    throughput_mbps: 45.8,
    status: 'failed'
  }
]

export function TelemetryTimezoneExample() {
  const { 
    effectiveTimezone, 
    userTimezone, 
    companyTimezone,
    formatDateTime,
    formatDateTimeRange 
  } = useTimezone()
  
  const [showCompanyTime, setShowCompanyTime] = useState(false)
  const [timeFormat, setTimeFormat] = useState<'relative' | 'absolute'>('relative')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timezone-Aware Telemetry Dashboard
          </CardTitle>
          <CardDescription>
            Example showing how telemetry data is displayed with proper timezone handling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Timezone Controls */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center space-x-2">
              <Switch
                id="company-time"
                checked={showCompanyTime}
                onCheckedChange={setShowCompanyTime}
              />
              <Label htmlFor="company-time" className="flex items-center gap-1">
                <Globe className="h-4 w-4" />
                Show Company Time
              </Label>
            </div>
            
            <Select value={timeFormat} onValueChange={(value: 'relative' | 'absolute') => setTimeFormat(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relative">Relative</SelectItem>
                <SelectItem value="absolute">Absolute</SelectItem>
              </SelectContent>
            </Select>
            
            <div className="text-sm text-muted-foreground">
              Current timezone: <strong>{effectiveTimezone}</strong>
              {companyTimezone && companyTimezone !== userTimezone && (
                <span className="ml-2">
                  (Company: <strong>{companyTimezone}</strong>)
                </span>
              )}
            </div>
          </div>

          {/* Current Time Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4" />
                    Your Time
                  </div>
                  <div className="text-lg">
                    <TimezoneDisplay 
                      date={new Date()} 
                      showTimezone 
                      format="long"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {companyTimezone && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Globe className="h-4 w-4" />
                      Company Time
                    </div>
                    <div className="text-lg">
                      <TimezoneDisplay 
                        date={new Date()} 
                        showTimezone 
                        format="long"
                        useCompanyTime
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4" />
                    Business Hours
                  </div>
                  <BusinessHoursIndicator />
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Telemetry Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transfer Activity</CardTitle>
          <CardDescription>
            All timestamps converted from UTC storage to your preferred timezone
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockTelemetryData.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="font-medium">Transfer {record.transfer_id}</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      record.status === 'completed' ? 'bg-green-100 text-green-800' :
                      record.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {record.status}
                    </span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground">
                    Agent: {record.agent_id} • 
                    {(record.bytes_transferred / 1024 / 1024).toFixed(1)} MB • 
                    {record.throughput_mbps} Mbps
                  </div>
                </div>
                
                <div className="text-right space-y-1">
                  <div className="font-medium">
                    {timeFormat === 'relative' ? (
                      <RelativeTime 
                        date={record.timestamp} 
                        useCompanyTime={showCompanyTime}
                      />
                    ) : (
                      <ShortDateTime 
                        date={record.timestamp} 
                        showTimezone 
                        useCompanyTime={showCompanyTime}
                      />
                    )}
                  </div>
                  
                  {/* Show additional timezone info on hover */}
                  <div className="text-xs text-muted-foreground">
                    <TimezoneDisplay 
                      date={record.timestamp}
                      format="time-only"
                      useCompanyTime={!showCompanyTime}
                      showTooltip
                      tooltipContent={
                        <div className="space-y-1">
                          <div>Your time: {formatDateTime(record.timestamp, { includeTimezone: true })}</div>
                          {companyTimezone && (
                            <div>Company time: {formatDateTime(record.timestamp, { useCompanyTime: true, includeTimezone: true })}</div>
                          )}
                          <div>UTC: {formatDateTime(record.timestamp, { timezone: 'UTC', includeTimezone: true })}</div>
                        </div>
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Time Range Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Time Range Analysis</CardTitle>
          <CardDescription>
            Example of how to display time ranges with timezone awareness
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm font-medium mb-2">Analysis Period:</div>
              <div className="text-lg">
                {formatDateTimeRange(
                  mockTelemetryData[mockTelemetryData.length - 1].timestamp,
                  mockTelemetryData[0].timestamp,
                  { 
                    useCompanyTime: showCompanyTime,
                    includeTimezone: true 
                  }
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="text-sm font-medium mb-2">Peak Activity</div>
                <div>
                  <TimezoneDisplay 
                    date={mockTelemetryData[1].timestamp}
                    format="medium"
                    showTimezone
                    useCompanyTime={showCompanyTime}
                  />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  120.5 Mbps throughput
                </div>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="text-sm font-medium mb-2">Last Failure</div>
                <div>
                  <RelativeTime 
                    date={mockTelemetryData[2].timestamp}
                    useCompanyTime={showCompanyTime}
                  />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Transfer timeout error
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 