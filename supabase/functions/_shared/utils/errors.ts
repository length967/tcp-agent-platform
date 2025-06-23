export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, public errors?: any) {
    super(400, message, 'VALIDATION_ERROR')
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(401, message, 'AUTHENTICATION_ERROR')
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Access denied') {
    super(403, message, 'AUTHORIZATION_ERROR')
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(404, message, 'NOT_FOUND')
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Too many requests') {
    super(429, message, 'RATE_LIMIT_EXCEEDED')
  }
}

export class ServerError extends ApiError {
  constructor(message: string = 'Internal server error') {
    super(500, message, 'INTERNAL_ERROR')
  }
}

export function handleError(error: unknown): Response {
  console.error('Error:', error)

  if (error instanceof ApiError) {
    return new Response(
      JSON.stringify({
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode
        }
      }),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  // Log unexpected errors but don't expose details
  if (error instanceof Error) {
    console.error('Unexpected error:', error.message, error.stack)
  }

  return new Response(
    JSON.stringify({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500
      }
    }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }
  )
}