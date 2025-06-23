import { Middleware } from '../middleware.ts'
import { ApiError } from '../errors.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { ValidationError } from './schemas.ts'

/**
 * Middleware factory for request body validation
 */
export function validateBody<T>(schema: z.ZodSchema<T>): Middleware {
  return async (req, ctx, next) => {
    // Skip validation for GET and DELETE requests
    if (req.method === 'GET' || req.method === 'DELETE') {
      return next(req, ctx)
    }
    
    try {
      const contentType = req.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        throw new ApiError(400, 'Content-Type must be application/json')
      }
      
      const body = await req.json()
      const validated = schema.parse(body)
      
      // Add validated body to context
      ctx.validatedBody = validated
      
      return next(req, ctx)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', {
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        })
      }
      if (error instanceof SyntaxError) {
        throw new ApiError(400, 'Invalid JSON')
      }
      throw error
    }
  }
}

/**
 * Middleware factory for query parameter validation
 */
export function validateQuery<T>(schema: z.ZodSchema<T>): Middleware {
  return async (req, ctx, next) => {
    try {
      const url = new URL(req.url)
      const params: Record<string, any> = {}
      
      // Parse query parameters
      for (const [key, value] of url.searchParams) {
        // Handle arrays (multiple values with same key)
        if (params[key]) {
          if (!Array.isArray(params[key])) {
            params[key] = [params[key]]
          }
          params[key].push(value)
        } else {
          // Try to parse numeric values
          if (/^\d+$/.test(value)) {
            params[key] = parseInt(value, 10)
          } else if (value === 'true' || value === 'false') {
            params[key] = value === 'true'
          } else {
            params[key] = value
          }
        }
      }
      
      const validated = schema.parse(params)
      
      // Add validated query params to context
      ctx.validatedQuery = validated
      
      return next(req, ctx)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ApiError(400, 'Invalid query parameters', 'VALIDATION_ERROR', {
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        })
      }
      throw error
    }
  }
}

/**
 * Middleware factory for path parameter validation
 */
export function validateParams<T>(schema: z.ZodSchema<T>): Middleware {
  return async (req, ctx, next) => {
    try {
      // Path params should be extracted and added to context by route handlers
      const params = ctx.params || {}
      const validated = schema.parse(params)
      
      // Add validated params to context
      ctx.validatedParams = validated
      
      return next(req, ctx)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ApiError(400, 'Invalid path parameters', 'VALIDATION_ERROR', {
          errors: error.errors.map(err => ({
            path: err.path.join('.'),
            message: err.message
          }))
        })
      }
      throw error
    }
  }
}

/**
 * Combined validation middleware for all request aspects
 */
export interface ValidationSchemas<TBody = any, TQuery = any, TParams = any> {
  body?: z.ZodSchema<TBody>
  query?: z.ZodSchema<TQuery>
  params?: z.ZodSchema<TParams>
}

export function validate<TBody = any, TQuery = any, TParams = any>(
  schemas: ValidationSchemas<TBody, TQuery, TParams>
): Middleware {
  return async (req, ctx, next) => {
    // Validate in order: params -> query -> body
    
    if (schemas.params && ctx.params) {
      try {
        ctx.validatedParams = schemas.params.parse(ctx.params)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError(400, 'Invalid path parameters', 'VALIDATION_ERROR', {
            errors: error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message
            }))
          })
        }
        throw error
      }
    }
    
    if (schemas.query) {
      try {
        const url = new URL(req.url)
        const params: Record<string, any> = {}
        
        for (const [key, value] of url.searchParams) {
          if (params[key]) {
            if (!Array.isArray(params[key])) {
              params[key] = [params[key]]
            }
            params[key].push(value)
          } else {
            if (/^\d+$/.test(value)) {
              params[key] = parseInt(value, 10)
            } else if (value === 'true' || value === 'false') {
              params[key] = value === 'true'
            } else {
              params[key] = value
            }
          }
        }
        
        ctx.validatedQuery = schemas.query.parse(params)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError(400, 'Invalid query parameters', 'VALIDATION_ERROR', {
            errors: error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message
            }))
          })
        }
        throw error
      }
    }
    
    if (schemas.body && req.method !== 'GET' && req.method !== 'DELETE') {
      try {
        const contentType = req.headers.get('content-type')
        if (!contentType?.includes('application/json')) {
          throw new ApiError(400, 'Content-Type must be application/json')
        }
        
        const body = await req.json()
        ctx.validatedBody = schemas.body.parse(body)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', {
            errors: error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message
            }))
          })
        }
        if (error instanceof SyntaxError) {
          throw new ApiError(400, 'Invalid JSON')
        }
        throw error
      }
    }
    
    return next(req, ctx)
  }
}