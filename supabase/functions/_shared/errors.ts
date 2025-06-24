/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Authentication Error class
 */
export class AuthenticationError extends ApiError {
  constructor(message: string, details?: any) {
    super(401, message, 'AUTHENTICATION_ERROR', details)
    this.name = 'AuthenticationError'
  }
}

/**
 * Authorization Error class
 */
export class AuthorizationError extends ApiError {
  constructor(message: string, details?: any) {
    super(403, message, 'AUTHORIZATION_ERROR', details)
    this.name = 'AuthorizationError'
  }
}

/**
 * Bad Request Error class
 */
export class BadRequestError extends ApiError {
  constructor(message: string, details?: any) {
    super(400, message, 'BAD_REQUEST', details)
    this.name = 'BadRequestError'
  }
}

/**
 * Not Found Error class
 */
export class NotFoundError extends ApiError {
  constructor(message: string, details?: any) {
    super(404, message, 'NOT_FOUND', details)
    this.name = 'NotFoundError'
  }
}

/**
 * Error handler for API responses
 */
export function errorHandler(error: unknown): Response {
  console.error('API Error:', error)
  
  if (error instanceof ApiError) {
    return new Response(
      JSON.stringify({
        error: {
          message: error.message,
          code: error.code,
          status: error.status,
          ...(error.details && { details: error.details })
        }
      }),
      {
        status: error.status,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  // Handle Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    const supabaseError = error as { code: string; message: string }
    return new Response(
      JSON.stringify({
        error: {
          message: supabaseError.message || 'Database error',
          code: supabaseError.code,
          status: 500
        }
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
  
  // Generic error
  return new Response(
    JSON.stringify({
      error: {
        message: 'Internal server error',
        status: 500
      }
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}