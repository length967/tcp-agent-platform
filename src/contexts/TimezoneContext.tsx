import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { useQuery } from '@tanstack/react-query'
import { format, formatInTimeZone } from 'date-fns-tz'
import { format as formatDate } from 'date-fns'
import { api } from '@/lib/api'

// Comprehensive timezone list
export const TIMEZONES = [
  { value: 'UTC', label: 'UTC', offset: '+00:00' },
  { value: 'America/New_York', label: 'Eastern Time (US)', offset: 'EST/EDT' },
  { value: 'America/Chicago', label: 'Central Time (US)', offset: 'CST/CDT' },
  { value: 'America/Denver', label: 'Mountain Time (US)', offset: 'MST/MDT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)', offset: 'PST/PDT' },
  { value: 'America/Phoenix', label: 'Arizona (MST)', offset: 'MST' },
  { value: 'America/Anchorage', label: 'Alaska Time', offset: 'AKST/AKDT' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time', offset: 'HST' },
  { value: 'America/Toronto', label: 'Toronto (EST)', offset: 'EST/EDT' },
  { value: 'America/Vancouver', label: 'Vancouver (PST)', offset: 'PST/PDT' },
  { value: 'Europe/London', label: 'London (GMT)', offset: 'GMT/BST' },
  { value: 'Europe/Paris', label: 'Central European Time', offset: 'CET/CEST' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)', offset: 'CET/CEST' },
  { value: 'Europe/Rome', label: 'Rome (CET)', offset: 'CET/CEST' },
  { value: 'Europe/Madrid', label: 'Madrid (CET)', offset: 'CET/CEST' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET)', offset: 'CET/CEST' },
  { value: 'Europe/Stockholm', label: 'Stockholm (CET)', offset: 'CET/CEST' },
  { value: 'Europe/Zurich', label: 'Zurich (CET)', offset: 'CET/CEST' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)', offset: 'MSK' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 'JST' },
  { value: 'Asia/Shanghai', label: 'China Standard Time', offset: 'CST' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', offset: 'HKT' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 'SGT' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)', offset: 'KST' },
  { value: 'Asia/Kolkata', label: 'India Standard Time', offset: 'IST' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)', offset: 'GST' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)', offset: 'AEST/AEDT' },
  { value: 'Australia/Melbourne', label: 'Melbourne (AEST)', offset: 'AEST/AEDT' },
  { value: 'Australia/Perth', label: 'Perth (AWST)', offset: 'AWST' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST)', offset: 'NZST/NZDT' },
]

interface UserPreferences {
  timezone: string
  date_format: string
  time_format: '12h' | '24h'
  language: string
}

interface CompanySettings {
  timezone?: string
  default_timezone?: string
  enforce_timezone?: boolean
}

interface TimezoneContextValue {
  // User settings
  userTimezone: string
  userPreferences: UserPreferences | null
  
  // Company settings
  companyTimezone: string | null
  companySettings: CompanySettings | null
  
  // Effective timezone (what to actually use)
  effectiveTimezone: string
  
  // Utility functions
  formatDateTime: (date: Date | string, options?: {
    timezone?: string
    includeTimezone?: boolean
    format?: string
    useCompanyTime?: boolean
  }) => string
  
  formatDateTimeRange: (start: Date | string, end: Date | string, options?: {
    timezone?: string
    includeTimezone?: boolean
    useCompanyTime?: boolean
  }) => string
  
  formatRelativeTime: (date: Date | string, options?: {
    timezone?: string
    useCompanyTime?: boolean
  }) => string
  
  convertToUserTimezone: (date: Date | string) => Date
  convertToCompanyTimezone: (date: Date | string) => Date
  
  // Browser detection
  detectedTimezone: string
  
  // Loading states
  isLoading: boolean
}

const TimezoneContext = createContext<TimezoneContextValue | undefined>(undefined)

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { session, user } = useAuth()
  const [detectedTimezone, setDetectedTimezone] = useState<string>('UTC')

  // Detect browser timezone
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      setDetectedTimezone(detected)
    } catch (error) {
      console.warn('Could not detect timezone:', error)
      setDetectedTimezone('UTC')
    }
  }, [])

  // Fetch user preferences
  const { data: userPreferences, isLoading: preferencesLoading } = useQuery({
    queryKey: ['user', 'preferences'],
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-gateway/user/preferences`, {
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

  // Fetch company settings
  const { data: companySettings, isLoading: companyLoading } = useQuery({
    queryKey: ['company', 'settings'],
    queryFn: async () => {
      const response = await api.client.get('/company')
      if (!response.ok) return null
      const data = await response.json()
      // The API returns the company object directly, not nested under settings
      return data.company as CompanySettings | null
    },
    enabled: !!session
  })

  const userTimezone = userPreferences?.timezone || detectedTimezone
  const companyTimezone = companySettings?.timezone || companySettings?.default_timezone || null
  
  // Determine effective timezone
  const effectiveTimezone = companySettings?.enforce_timezone 
    ? (companyTimezone || userTimezone)
    : userTimezone

  // Utility functions
  const formatDateTime = (
    date: Date | string, 
    options: {
      timezone?: string
      includeTimezone?: boolean
      format?: string
      useCompanyTime?: boolean
    } = {}
  ): string => {
    const {
      timezone = options.useCompanyTime ? companyTimezone || effectiveTimezone : effectiveTimezone,
      includeTimezone = false,
      format: formatStr
    } = options

    const dateObj = typeof date === 'string' ? new Date(date) : date
    
    // Default format based on user preferences
    let defaultFormat = 'MMM d, yyyy'
    if (userPreferences?.time_format === '24h') {
      defaultFormat += ' HH:mm'
    } else {
      defaultFormat += ' h:mm a'
    }
    
    const finalFormat = formatStr || defaultFormat
    
    try {
      const formatted = formatInTimeZone(dateObj, timezone, finalFormat)
      
      if (includeTimezone) {
        const tzAbbr = formatInTimeZone(dateObj, timezone, 'zzz')
        return `${formatted} ${tzAbbr}`
      }
      
      return formatted
    } catch (error) {
      console.warn('Error formatting date:', error)
      return formatDate(dateObj, finalFormat)
    }
  }

  const formatDateTimeRange = (
    start: Date | string,
    end: Date | string,
    options: {
      timezone?: string
      includeTimezone?: boolean
      useCompanyTime?: boolean
    } = {}
  ): string => {
    const startFormatted = formatDateTime(start, options)
    const endFormatted = formatDateTime(end, options)
    
    const startDate = typeof start === 'string' ? new Date(start) : start
    const endDate = typeof end === 'string' ? new Date(end) : end
    
    // If same day, show date once
    if (startDate.toDateString() === endDate.toDateString()) {
      const dateStr = formatDateTime(start, { 
        ...options, 
        format: 'MMM d, yyyy' 
      })
      const startTime = formatDateTime(start, { 
        ...options, 
        format: userPreferences?.time_format === '24h' ? 'HH:mm' : 'h:mm a' 
      })
      const endTime = formatDateTime(end, { 
        ...options, 
        format: userPreferences?.time_format === '24h' ? 'HH:mm' : 'h:mm a' 
      })
      
      return `${dateStr}, ${startTime} - ${endTime}`
    }
    
    return `${startFormatted} - ${endFormatted}`
  }

  const formatRelativeTime = (
    date: Date | string,
    options: {
      timezone?: string
      useCompanyTime?: boolean
    } = {}
  ): string => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - dateObj.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMinutes < 1) return 'just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    // For older dates, show formatted date
    return formatDateTime(date, { 
      ...options, 
      format: 'MMM d, yyyy' 
    })
  }

  const convertToUserTimezone = (date: Date | string): Date => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    // This returns a Date object representing the same moment in time
    // The display will depend on how it's formatted
    return new Date(dateObj.getTime())
  }

  const convertToCompanyTimezone = (date: Date | string): Date => {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return new Date(dateObj.getTime())
  }

  const value: TimezoneContextValue = {
    userTimezone,
    userPreferences: userPreferences || null,
    companyTimezone,
    companySettings: companySettings || null,
    effectiveTimezone,
    formatDateTime,
    formatDateTimeRange,
    formatRelativeTime,
    convertToUserTimezone,
    convertToCompanyTimezone,
    detectedTimezone,
    isLoading: preferencesLoading || companyLoading
  }

  return (
    <TimezoneContext.Provider value={value}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  const context = useContext(TimezoneContext)
  if (!context) {
    throw new Error('useTimezone must be used within a TimezoneProvider')
  }
  return context
}

// Utility hook for timezone-aware queries
export function useTimezoneAwareQuery() {
  const { effectiveTimezone, userTimezone, companyTimezone } = useTimezone()
  
  return {
    // Add timezone context to query keys to invalidate when timezone changes
    getQueryKey: (baseKey: any[]) => [...baseKey, 'tz', effectiveTimezone],
    
    // Helper to add timezone info to API requests
    addTimezoneHeaders: (headers: Record<string, string> = {}) => ({
      ...headers,
      'X-User-Timezone': userTimezone,
      'X-Company-Timezone': companyTimezone || '',
      'X-Effective-Timezone': effectiveTimezone,
    })
  }
} 