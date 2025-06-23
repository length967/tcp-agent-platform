import { Context } from '../middleware.ts'
import { ApiError } from '../errors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

// File upload restrictions
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024 // 5GB
const MAX_FILE_SIZE_BY_TIER = {
  free: 100 * 1024 * 1024,     // 100MB
  starter: 1024 * 1024 * 1024, // 1GB
  pro: 5 * 1024 * 1024 * 1024, // 5GB
  enterprise: 50 * 1024 * 1024 * 1024 // 50GB
}

// Allowed file types by category
const ALLOWED_CONTENT_TYPES = {
  // Documents
  'application/pdf': true,
  'application/msword': true,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
  'application/vnd.ms-excel': true,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
  'application/vnd.ms-powerpoint': true,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
  'text/plain': true,
  'text/csv': true,
  'application/json': true,
  'application/xml': true,
  'text/xml': true,
  
  // Images
  'image/jpeg': true,
  'image/png': true,
  'image/gif': true,
  'image/webp': true,
  'image/svg+xml': true,
  'image/tiff': true,
  
  // Videos
  'video/mp4': true,
  'video/quicktime': true,
  'video/x-msvideo': true,
  'video/x-ms-wmv': true,
  'video/webm': true,
  
  // Audio
  'audio/mpeg': true,
  'audio/wav': true,
  'audio/ogg': true,
  'audio/webm': true,
  'audio/aac': true,
  
  // Archives
  'application/zip': true,
  'application/x-rar-compressed': true,
  'application/x-7z-compressed': true,
  'application/x-tar': true,
  'application/gzip': true,
  
  // Other
  'application/octet-stream': true // Generic binary
}

// Dangerous file extensions to block
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js',
  '.jar', '.app', '.dmg', '.pkg', '.deb', '.rpm'
]

interface FileValidationOptions {
  size?: number
  contentType?: string
  fileName?: string
  projectId: string
  ctx: Context
}

/**
 * Validate file upload based on security rules
 */
export async function validateFileUpload(options: FileValidationOptions): Promise<void> {
  const { size, contentType, fileName, projectId, ctx } = options
  
  // Get user's subscription tier
  let tier = 'free'
  if (ctx.user) {
    const supabase = ctx.supabase!
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscription_tier')
      .eq('id', ctx.user.id)
      .single()
    
    tier = profile?.subscription_tier || 'free'
  }
  
  // Validate file size
  if (size !== undefined) {
    const maxSize = MAX_FILE_SIZE_BY_TIER[tier as keyof typeof MAX_FILE_SIZE_BY_TIER] || MAX_FILE_SIZE_BY_TIER.free
    if (size > maxSize) {
      throw new ApiError(413, `File size exceeds limit of ${maxSize / (1024 * 1024)}MB for ${tier} tier`)
    }
    
    if (size <= 0) {
      throw new ApiError(400, 'Invalid file size')
    }
  }
  
  // Validate content type
  if (contentType && !ALLOWED_CONTENT_TYPES[contentType]) {
    throw new ApiError(415, 'File type not allowed')
  }
  
  // Validate file extension
  if (fileName) {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new ApiError(415, 'File extension not allowed for security reasons')
    }
    
    // Additional validation for double extensions
    if (fileName.includes('..') || fileName.split('.').length > 3) {
      throw new ApiError(400, 'Suspicious filename detected')
    }
  }
  
  // Check storage quota
  await checkStorageQuota(projectId, size || 0, ctx)
}

/**
 * Check if project has enough storage quota
 */
async function checkStorageQuota(
  projectId: string, 
  fileSize: number,
  ctx: Context
): Promise<void> {
  const supabase = ctx.supabase!
  
  // Get current storage usage
  const { data: usage, error } = await supabase
    .rpc('get_project_storage_usage', { p_project_id: projectId })
  
  if (error) {
    console.error('Failed to check storage quota:', error)
    // Don't block upload on quota check failure
    return
  }
  
  // Get project limits
  const { data: project } = await supabase
    .from('projects')
    .select('settings')
    .eq('id', projectId)
    .single()
  
  const storageLimit = project?.settings?.storage_limit || 10 * 1024 * 1024 * 1024 // 10GB default
  
  if (usage + fileSize > storageLimit) {
    throw new ApiError(
      507, 
      `Storage quota exceeded. Used: ${usage / (1024 * 1024)}MB, Limit: ${storageLimit / (1024 * 1024)}MB`
    )
  }
}

interface SignedUrlOptions {
  bucket: string
  path: string
  operation: 'upload' | 'download'
  expiresIn?: number // seconds
  metadata?: Record<string, any>
}

/**
 * Generate a signed URL for secure file upload/download
 */
export async function generateSignedUrl(options: SignedUrlOptions): Promise<{
  url: string
  fields?: Record<string, string>
  expires_at: string
}> {
  const { bucket, path, operation, expiresIn = 3600, metadata } = options
  
  // Get Supabase storage client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  
  if (operation === 'upload') {
    // For uploads, we need to create a presigned POST URL
    // This is more secure as it allows us to set constraints
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path, {
        expiresIn,
        upsert: false
      })
    
    if (error || !data) {
      throw new ApiError(500, 'Failed to generate upload URL')
    }
    
    // Add metadata to signed URL if provided
    const fields: Record<string, string> = {}
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        fields[`x-amz-meta-${key}`] = String(value)
      })
    }
    
    return {
      url: data.signedUrl,
      fields,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
    }
  } else {
    // For downloads, create a simple signed URL
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)
    
    if (error || !data) {
      throw new ApiError(500, 'Failed to generate download URL')
    }
    
    return {
      url: data.signedUrl,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString()
    }
  }
}

/**
 * Scan file for malware (stub - would integrate with real AV service)
 */
export async function scanFile(filePath: string): Promise<{
  safe: boolean
  threats?: string[]
}> {
  // In production, this would integrate with a service like:
  // - ClamAV
  // - VirusTotal API
  // - AWS Macie
  // - Google Cloud DLP
  
  // For now, we'll do basic checks
  const fileName = filePath.split('/').pop() || ''
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'))
  
  // Check for known malicious patterns
  const maliciousPatterns = [
    /\.(exe|bat|cmd|com|pif|scr|vbs|js)$/i,
    /^\./, // Hidden files
    /\0/, // Null bytes
    /%00/, // URL encoded null bytes
  ]
  
  for (const pattern of maliciousPatterns) {
    if (pattern.test(fileName)) {
      return {
        safe: false,
        threats: ['Suspicious filename pattern detected']
      }
    }
  }
  
  return { safe: true }
}

/**
 * Sanitize filename to prevent directory traversal and other attacks
 */
export function sanitizeFileName(fileName: string): string {
  // Remove any directory traversal attempts
  let sanitized = fileName.replace(/\.\./g, '').replace(/[\/\\]/g, '_')
  
  // Remove control characters and non-printable characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '')
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'))
    sanitized = sanitized.substring(0, 255 - ext.length) + ext
  }
  
  // Ensure we have a valid filename
  if (!sanitized || sanitized === '.') {
    sanitized = 'unnamed_file'
  }
  
  return sanitized
}