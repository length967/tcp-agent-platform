import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

// Common validation schemas
export const uuidSchema = z.string().uuid()
export const emailSchema = z.string().email()
export const slugSchema = z.string().regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')

// Timezone validation schemas
const VALID_TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
  'America/Toronto', 'America/Vancouver',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
  'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Zurich',
  'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore',
  'Asia/Seoul', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
  'Pacific/Auckland'
] as const

export const timezoneSchema = z.enum(VALID_TIMEZONES as [string, ...string[]])

export const timeFormatSchema = z.enum(['12h', '24h'])

export const businessDaysSchema = z.array(z.number().int().min(1).max(7)).min(1).max(7)

export const businessHoursSchema = z.object({
  start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, 'Invalid time format (HH:MM:SS)'),
  end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, 'Invalid time format (HH:MM:SS)')
}).refine(data => {
  const startTime = new Date(`2000-01-01T${data.start}`)
  const endTime = new Date(`2000-01-01T${data.end}`)
  return startTime < endTime
}, {
  message: "End time must be after start time"
})

// User preferences schemas with timezone validation
export const updateUserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  timezone: timezoneSchema.optional(),
  language: z.string().length(2).optional(),
  date_format: z.string().optional(),
  time_format: timeFormatSchema.optional(),
  email_notifications: z.boolean().optional(),
  email_marketing: z.boolean().optional(),
  email_security_alerts: z.boolean().optional(),
  email_weekly_digest: z.boolean().optional(),
  profile_visibility: z.enum(['public', 'team', 'private']).optional(),
  show_email: z.boolean().optional(),
  activity_tracking: z.boolean().optional(),
  api_key_expires_days: z.number().min(1).max(365).optional(),
  webhook_notifications: z.boolean().optional(),
  session_timeout_minutes: z.number().min(15).max(10080).optional(), // 15 min to 7 days
})

// Company timezone settings schemas
export const updateCompanyTimezoneSchema = z.object({
  default_timezone: timezoneSchema.optional(),
  enforce_timezone: z.boolean().optional(),
  business_hours_start: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
  business_hours_end: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/).optional(),
  business_days: businessDaysSchema.optional()
}).refine(data => {
  // If both start and end times are provided, validate they make sense
  if (data.business_hours_start && data.business_hours_end) {
    const startTime = new Date(`2000-01-01T${data.business_hours_start}`)
    const endTime = new Date(`2000-01-01T${data.business_hours_end}`)
    return startTime < endTime
  }
  return true
}, {
  message: "Business hours end time must be after start time"
})

// Pagination schemas
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc')
})

// Project schemas
export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema.optional(),
  settings: z.record(z.unknown()).optional()
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z.record(z.unknown()).optional()
})

// Agent schemas
export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.enum(['linux', 'windows', 'darwin']),
  capabilities: z.object({
    transfer: z.boolean().optional(),
    compress: z.boolean().optional(),
    encrypt: z.boolean().optional()
  }).optional()
})

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capabilities: z.record(z.boolean()).optional(),
  settings: z.object({
    transfer_settings: z.object({
      chunk_size: z.number().int().positive().optional(),
      max_concurrent: z.number().int().positive().max(50).optional(),
      retry_attempts: z.number().int().min(0).max(10).optional()
    }).optional()
  }).optional()
})

export const agentAuthenticateSchema = z.object({
  token: z.string().length(64),
  api_key: z.string().min(20).max(200)
})

// Telemetry schemas
export const telemetryMetricsSchema = z.object({
  cpu_usage: z.number().min(0).max(100),
  memory_usage: z.number().min(0),
  disk_usage: z.number().min(0),
  network_rx: z.number().min(0),
  network_tx: z.number().min(0),
  active_transfers: z.number().int().min(0),
  custom_metrics: z.record(z.number()).optional()
})

export const submitTelemetrySchema = z.object({
  metrics: telemetryMetricsSchema,
  timestamp: z.string().datetime().optional()
})

export const batchTelemetrySchema = z.object({
  telemetry: z.array(z.object({
    metrics: telemetryMetricsSchema,
    timestamp: z.string().datetime().optional()
  })).min(1).max(1000)
})

// Transfer schemas
export const createTransferSchema = z.object({
  source_agent_id: uuidSchema,
  destination_agent_id: uuidSchema,
  source_path: z.string().min(1).max(4096),
  destination_path: z.string().min(1).max(4096),
  settings: z.object({
    compress: z.boolean().optional(),
    encrypt: z.boolean().optional(),
    verify_checksum: z.boolean().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    bandwidth_limit: z.number().positive().optional()
  }).optional()
})

export const updateTransferSchema = z.object({
  status: z.enum(['pending', 'queued', 'in_progress', 'paused', 'completed', 'failed', 'cancelled']).optional(),
  progress: z.object({
    bytes_transferred: z.number().min(0),
    total_bytes: z.number().min(0),
    current_file: z.string().optional(),
    speed: z.number().min(0).optional()
  }).optional()
})

// Team/User schemas
export const inviteUserSchema = z.object({
  email: emailSchema,
  role: z.enum(['viewer', 'member', 'admin', 'owner']),
  project_ids: z.array(uuidSchema).optional()
})

export const updateUserRoleSchema = z.object({
  role: z.enum(['viewer', 'member', 'admin', 'owner'])
})

// API Key schemas
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  expires_at: z.string().datetime().optional()
})

// File transfer security schemas
export const requestUploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  file_size: z.number().int().positive().max(5 * 1024 * 1024 * 1024), // 5GB max
  content_type: z.string(),
  transfer_id: uuidSchema.optional()
})

export const requestDownloadUrlSchema = z.object({
  file_id: uuidSchema,
  expires_in: z.number().int().positive().max(3600).optional() // Max 1 hour
})

// Helper function to validate timezone string
export function isValidTimezone(timezone: string): boolean {
  try {
    // Test if timezone is valid by attempting to format a date
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

// Helper function to validate request body
export async function validateRequestBody<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await req.json()
    return schema.parse(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid request body', error.errors)
    }
    throw new ValidationError('Invalid JSON in request body')
  }
}

// Helper function to validate query parameters
export function validateQueryParams<T>(
  url: URL,
  schema: z.ZodSchema<T>
): T {
  const params: Record<string, any> = {}
  
  for (const [key, value] of url.searchParams) {
    // Handle numeric values
    if (/^\d+$/.test(value)) {
      params[key] = parseInt(value, 10)
    } else if (value === 'true' || value === 'false') {
      params[key] = value === 'true'
    } else {
      params[key] = value
    }
  }
  
  try {
    return schema.parse(params)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid query parameters', error.errors)
    }
    throw error
  }
}

// Custom validation error class
export class ValidationError extends Error {
  constructor(
    message: string,
    public errors?: z.ZodError['errors']
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}