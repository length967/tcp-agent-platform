import { useTimezone } from '@/contexts/TimezoneContext'
import { cn } from '@/lib/utils'
import { Clock, Globe } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface TimezoneDisplayProps {
  date: Date | string
  format?: 'short' | 'medium' | 'long' | 'relative' | 'time-only' | 'date-only'
  showTimezone?: boolean
  useCompanyTime?: boolean
  className?: string
  showTooltip?: boolean
  tooltipContent?: string
}

export function TimezoneDisplay({
  date,
  format = 'medium',
  showTimezone = false,
  useCompanyTime = false,
  className,
  showTooltip = true,
  tooltipContent
}: TimezoneDisplayProps) {
  const { formatDateTime, formatRelativeTime, effectiveTimezone, companyTimezone } = useTimezone()

  const formatDate = () => {
    switch (format) {
      case 'short':
        return formatDateTime(date, { 
          format: 'MMM d, HH:mm',
          useCompanyTime,
          includeTimezone: showTimezone 
        })
      case 'medium':
        return formatDateTime(date, { 
          useCompanyTime,
          includeTimezone: showTimezone 
        })
      case 'long':
        return formatDateTime(date, { 
          format: 'EEEE, MMMM d, yyyy \'at\' h:mm a',
          useCompanyTime,
          includeTimezone: showTimezone 
        })
      case 'relative':
        return formatRelativeTime(date, { useCompanyTime })
      case 'time-only':
        return formatDateTime(date, { 
          format: 'h:mm a',
          useCompanyTime,
          includeTimezone: showTimezone 
        })
      case 'date-only':
        return formatDateTime(date, { 
          format: 'MMM d, yyyy',
          useCompanyTime 
        })
      default:
        return formatDateTime(date, { useCompanyTime, includeTimezone: showTimezone })
    }
  }

  const getTooltipContent = () => {
    if (tooltipContent) return tooltipContent
    
    const userTime = formatDateTime(date, { useCompanyTime: false, includeTimezone: true })
    const companyTime = companyTimezone ? formatDateTime(date, { useCompanyTime: true, includeTimezone: true }) : null
    const utcTime = formatDateTime(date, { timezone: 'UTC', includeTimezone: true })
    
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span className="font-medium">Your time:</span>
          <span>{userTime}</span>
        </div>
        {companyTime && companyTime !== userTime && (
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3" />
            <span className="font-medium">Company time:</span>
            <span>{companyTime}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span className="font-medium">UTC:</span>
          <span>{utcTime}</span>
        </div>
      </div>
    )
  }

  const displayText = formatDate()

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn(
              "inline-flex items-center gap-1 cursor-help",
              className
            )}>
              {displayText}
              {useCompanyTime && companyTimezone && (
                <Globe className="h-3 w-3 text-muted-foreground" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {getTooltipContent()}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {displayText}
      {useCompanyTime && companyTimezone && (
        <Globe className="h-3 w-3 text-muted-foreground" />
      )}
    </span>
  )
}

// Specialized components for common use cases
export function RelativeTime({ date, className, ...props }: Omit<TimezoneDisplayProps, 'format'>) {
  return <TimezoneDisplay date={date} format="relative" className={className} {...props} />
}

export function ShortDateTime({ date, className, ...props }: Omit<TimezoneDisplayProps, 'format'>) {
  return <TimezoneDisplay date={date} format="short" className={className} {...props} />
}

export function LongDateTime({ date, className, ...props }: Omit<TimezoneDisplayProps, 'format'>) {
  return <TimezoneDisplay date={date} format="long" className={className} {...props} />
}

export function TimeOnly({ date, className, ...props }: Omit<TimezoneDisplayProps, 'format'>) {
  return <TimezoneDisplay date={date} format="time-only" className={className} {...props} />
}

export function DateOnly({ date, className, ...props }: Omit<TimezoneDisplayProps, 'format'>) {
  return <TimezoneDisplay date={date} format="date-only" className={className} {...props} />
}

// Business hours indicator
export function BusinessHoursIndicator({ 
  date, 
  className 
}: { 
  date?: Date | string
  className?: string 
}) {
  // This would need to be connected to the company business hours
  // For now, just show a simple indicator
  const currentHour = new Date(date || new Date()).getHours()
  const isBusinessHours = currentHour >= 9 && currentHour < 17
  
  return (
    <div className={cn("flex items-center gap-1 text-xs", className)}>
      <div className={cn(
        "w-2 h-2 rounded-full",
        isBusinessHours ? "bg-green-500" : "bg-gray-400"
      )} />
      <span className="text-muted-foreground">
        {isBusinessHours ? "Business hours" : "After hours"}
      </span>
    </div>
  )
} 