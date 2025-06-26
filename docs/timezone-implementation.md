# Timezone Implementation Guide

## Overview

The TCP Agent Platform implements comprehensive timezone handling to provide users with localized time displays while maintaining UTC storage in the backend. This ensures data consistency across global teams while providing excellent user experience.

## Architecture

### Core Principles

1. **UTC Storage**: All timestamps are stored in UTC in both PostgreSQL (Supabase) and ClickHouse
2. **User Preference**: Users can set their preferred timezone for personal views
3. **Company Settings**: Companies can set default timezones and business hours
4. **Flexible Display**: Components can show times in user, company, or UTC timezones as needed
5. **Contextual Awareness**: Business hours and scheduling respect company timezone settings

### Components

#### 1. TimezoneContext (`/src/contexts/TimezoneContext.tsx`)

**Features:**
- Automatic browser timezone detection
- User preference management
- Company timezone settings
- Timezone conversion utilities
- Smart timezone resolution (user vs company priority)

**Key Functions:**
```typescript
// Format dates with timezone awareness
formatDateTime(date, { timezone?, includeTimezone?, useCompanyTime? })

// Format date ranges intelligently
formatDateTimeRange(start, end, options)

// Relative time formatting
formatRelativeTime(date, options)

// Timezone conversion utilities
convertToUserTimezone(date)
convertToCompanyTimezone(date)
```

#### 2. TimezoneDisplay Component (`/src/components/ui/timezone-display.tsx`)

**Features:**
- Multiple format options (short, medium, long, relative, time-only, date-only)
- Tooltip showing multiple timezones
- Company timezone indicators
- Specialized components for common use cases

**Usage Examples:**
```tsx
// Basic usage
<TimezoneDisplay date={new Date()} />

// With timezone indicator
<TimezoneDisplay date={transfer.created_at} showTimezone />

// Company time for shared events
<TimezoneDisplay date={meeting.start_time} useCompanyTime />

// Specialized components
<RelativeTime date={lastSeen} />
<ShortDateTime date={event.timestamp} />
<BusinessHoursIndicator />
```

#### 3. Enhanced Settings UI

**User Settings:**
- Expanded timezone list with 30+ major timezones
- Automatic browser timezone detection with suggestions
- Real-time preview of current time
- Visual timezone offset indicators

**Company Settings:**
- Company default timezone
- Timezone enforcement option
- Business hours configuration
- Business days selection (Mon-Sun)

## Database Schema

### User Preferences
```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY,
  timezone VARCHAR(100) DEFAULT 'UTC',
  date_format VARCHAR(20) DEFAULT 'MM/DD/YYYY',
  time_format VARCHAR(10) DEFAULT '12h',
  -- ... other preferences
);
```

### Company Settings
```sql
ALTER TABLE companies ADD COLUMN
  default_timezone VARCHAR(100) DEFAULT 'UTC',
  enforce_timezone BOOLEAN DEFAULT false,
  business_hours_start TIME DEFAULT '09:00:00',
  business_hours_end TIME DEFAULT '17:00:00',
  business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5];
```

### Business Hours Functions
```sql
-- Check if current time is within business hours
SELECT is_business_hours(company_id, check_time);

-- Get complete company timezone info
SELECT * FROM get_company_timezone_info(company_id);
```

## Implementation Strategy

### Priority Hierarchy

1. **Company Enforced**: If `enforce_timezone = true`, use company timezone
2. **User Preference**: Use user's selected timezone
3. **Browser Detection**: Fall back to detected browser timezone
4. **UTC Default**: Ultimate fallback to UTC

### Use Cases

#### Personal Views (User Timezone Priority)
- Dashboard activity feeds
- Personal notifications
- Account activity logs
- Transfer history

#### Collaborative Views (Company Timezone Option)
- Scheduled transfers
- Team meetings
- Shared reports
- Business hour indicators

#### System Views (UTC/Explicit)
- Debug logs
- System events
- API timestamps
- Cross-timezone coordination

## Frontend Integration

### App Setup
```tsx
// App.tsx
<AuthProvider>
  <TimezoneProvider>
    <ProjectProvider>
      <AppContent />
    </ProjectProvider>
  </TimezoneProvider>
</AuthProvider>
```

### Dashboard Component Integration

All major dashboard components have been updated with timezone-aware displays:

#### DashboardHome.tsx
```tsx
import { useTimezone } from '@/contexts/TimezoneContext'
import { ShortDateTime, RelativeTime, BusinessHoursIndicator } from '@/components/ui/timezone-display'

// Current time display with user timezone
const { formatDateTime } = useTimezone()
<p>{formatDateTime(currentTime, 'long')}</p>

// Transfer table with timezone-aware timestamps
<ShortDateTime 
  date={transfer.created_at} 
  format="time-only"
  showTooltip={true}
/>

// Agent status with business hours context
<BusinessHoursIndicator 
  timestamp={agent.last_seen_at}
  agentId={agent.id}
  size="sm"
/>

// Activity timeline with relative times
<RelativeTime 
  date={eventTimestamp} 
  showTooltip={true}
/>
```

#### Transfers.tsx
```tsx
// Transfer creation and completion times in detail view
<LongDateTime date={transfer.created_at} />
<LongDateTime date={transfer.completed_at} />

// Relative completion times in tables
<RelativeTime 
  date={transfer.completed_at} 
  showTooltip={true}
/>
```

#### Agents.tsx
```tsx
// Agent last seen with business hours awareness
<div className="flex items-center gap-2">
  <RelativeTime date={agent.last_seen_at} showTooltip={true} />
  <BusinessHoursIndicator 
    timestamp={agent.last_seen_at}
    agentId={agent.id}
    size="sm"
  />
</div>
```

#### ProjectDetails.tsx
```tsx
// Project creation with company timezone context
<LongDateTime 
  date={project.created_at} 
  showTooltip={true}
  showCompanyTime={true}
/>
```

### Component Usage
```tsx
// In any component
const { formatDateTime, effectiveTimezone } = useTimezone()

// Format with user's preferences
const userTime = formatDateTime(timestamp)

// Format for company context
const companyTime = formatDateTime(timestamp, { useCompanyTime: true })

// Show with timezone indicator
<TimezoneDisplay 
  date={event.created_at} 
  showTimezone 
  showTooltip 
/>
```

### Query Integration
```tsx
// Timezone-aware queries
const { getQueryKey, addTimezoneHeaders } = useTimezoneAwareQuery()

const { data } = useQuery({
  queryKey: getQueryKey(['transfers']),
  queryFn: async () => {
    return api.get('/transfers', {
      headers: addTimezoneHeaders()
    })
  }
})
```

## API Integration

### Request Headers
The system automatically adds timezone context to API requests:
```
X-User-Timezone: America/New_York
X-Company-Timezone: Europe/London
X-Effective-Timezone: America/New_York
```

### Response Formatting
APIs can use these headers to:
- Format response timestamps appropriately
- Apply business hour logic
- Customize scheduling suggestions
- Provide timezone-aware analytics

## Telemetry Integration

### ClickHouse Timestamps
- All telemetry data stored in UTC
- Frontend converts for display using TimezoneContext
- Business hour analysis uses company timezone
- User dashboards show data in user timezone

### Example Usage
```tsx
// Telemetry dashboard
function TelemetryChart({ data }) {
  const { formatDateTime } = useTimezone()
  
  return (
    <Chart>
      {data.map(point => (
        <DataPoint 
          key={point.id}
          timestamp={formatDateTime(point.timestamp)}
          value={point.value}
        />
      ))}
    </Chart>
  )
}
```

## Best Practices

### 1. Always Store UTC
```typescript
// ✅ Good - Store UTC
const event = {
  timestamp: new Date().toISOString(), // UTC
  user_timezone: userTimezone
}

// ❌ Bad - Store local time
const event = {
  timestamp: new Date().toString() // Local time
}
```

### 2. Use Context for Display
```tsx
// ✅ Good - Use timezone context
const { formatDateTime } = useTimezone()
return <span>{formatDateTime(event.timestamp)}</span>

// ❌ Bad - Manual formatting
return <span>{new Date(event.timestamp).toLocaleString()}</span>
```

### 3. Provide Timezone Context
```tsx
// ✅ Good - Show timezone when ambiguous
<TimezoneDisplay 
  date={meeting.start_time} 
  showTimezone 
  useCompanyTime 
/>

// ❌ Bad - Ambiguous time display
<span>{meeting.start_time}</span>
```

### 4. Respect Business Hours
```tsx
// ✅ Good - Consider business hours for scheduling
const isBusinessTime = await isBusinessHours(companyId)
if (isBusinessTime) {
  scheduleTransfer(transfer)
} else {
  scheduleForNextBusinessDay(transfer)
}
```

## Testing Considerations

### Timezone Testing
1. **Multiple Timezones**: Test with users in different timezones
2. **DST Transitions**: Test during daylight saving time changes
3. **Business Hours**: Test business hour logic across timezones
4. **Edge Cases**: Test with unusual timezones (half-hour offsets, etc.)

### Test Data
```typescript
const testScenarios = [
  { userTz: 'America/New_York', companyTz: 'Europe/London' },
  { userTz: 'Asia/Tokyo', companyTz: 'America/Los_Angeles' },
  { userTz: 'Australia/Sydney', companyTz: 'UTC' },
  { userTz: 'Asia/Kolkata', companyTz: 'America/Chicago' } // Half-hour offset
]
```

## Migration Guide

### For Existing Data
1. All existing timestamps are already in UTC ✅
2. Add timezone preferences with UTC default ✅
3. Update components to use TimezoneDisplay ⏳
4. Add company timezone settings ⏳
5. Test across different timezone scenarios ⏳

### Rollout Strategy
1. **Phase 1**: Deploy timezone context and basic formatting
2. **Phase 2**: Update all timestamp displays to use new components
3. **Phase 3**: Add company timezone enforcement
4. **Phase 4**: Implement business hours features

## Future Enhancements

1. **Smart Scheduling**: Suggest optimal transfer times based on both user and recipient timezones
2. **Timezone Collaboration**: Show "good time to contact" indicators for team members
3. **Calendar Integration**: Sync with external calendars respecting timezone preferences
4. **Advanced Business Rules**: Complex business hour rules (holidays, different hours per day)
5. **Timezone Analytics**: Analyze transfer performance by time of day across timezones

## Conclusion

This timezone implementation provides a robust foundation for global teams while maintaining data integrity. The system prioritizes user experience while providing the flexibility needed for complex multi-timezone scenarios.

The key benefits:
- ✅ **Consistent Data**: All timestamps stored in UTC
- ✅ **User-Friendly**: Times displayed in user's preferred timezone
- ✅ **Business Aware**: Company timezone settings for collaboration
- ✅ **Flexible**: Multiple display options for different contexts
- ✅ **Scalable**: Easy to extend for future timezone features 