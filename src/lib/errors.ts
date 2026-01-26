/**
 * Centralized Error Handling System
 *
 * Custom error classes for different failure scenarios.
 * These errors provide typed error handling throughout the application.
 */

/**
 * Base error class for all application errors
 */
export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.statusCode = statusCode
    this.isOperational = isOperational
    this.context = context

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      ...(process.env.NODE_ENV !== 'production' && { context: this.context }),
    }
  }
}

/**
 * Authentication and Authorization Errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
    super(message, 'AUTH_REQUIRED', 401, true, context)
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Permission denied', context?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', 403, true, context)
  }
}

/**
 * Validation Errors
 */
export class ValidationError extends AppError {
  public readonly field?: string
  public readonly details?: Array<{ field: string; message: string }>

  constructor(
    message: string,
    field?: string,
    details?: Array<{ field: string; message: string }>,
    context?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', 400, true, context)
    this.field = field
    this.details = details
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field,
      details: this.details,
    }
  }
}

/**
 * Resource Not Found Errors
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string
  public readonly resourceId?: string

  constructor(
    resourceType: string,
    resourceId?: string,
    context?: Record<string, unknown>
  ) {
    const message = resourceId
      ? `${resourceType} with id '${resourceId}' not found`
      : `${resourceType} not found`
    super(message, 'NOT_FOUND', 404, true, context)
    this.resourceType = resourceType
    this.resourceId = resourceId
  }
}

export class TaskNotFoundError extends NotFoundError {
  constructor(taskId?: string, context?: Record<string, unknown>) {
    super('Task', taskId, context)
  }
}

/**
 * Sync and Data Consistency Errors
 */
export class SyncError extends AppError {
  public readonly operation?: 'push' | 'pull' | 'full'
  public readonly failedEntities?: string[]

  constructor(
    message: string,
    operation?: 'push' | 'pull' | 'full',
    failedEntities?: string[],
    context?: Record<string, unknown>
  ) {
    super(message, 'SYNC_ERROR', 500, true, context)
    this.operation = operation
    this.failedEntities = failedEntities
  }

  toJSON() {
    return {
      ...super.toJSON(),
      operation: this.operation,
      failedEntities: this.failedEntities,
    }
  }
}

export class ConflictError extends AppError {
  public readonly entityType: string
  public readonly entityId: string
  public readonly localVersion?: number
  public readonly serverVersion?: number

  constructor(
    entityType: string,
    entityId: string,
    localVersion?: number,
    serverVersion?: number,
    context?: Record<string, unknown>
  ) {
    super(
      `Conflict detected for ${entityType} '${entityId}': local version ${localVersion} vs server version ${serverVersion}`,
      'CONFLICT',
      409,
      true,
      context
    )
    this.entityType = entityType
    this.entityId = entityId
    this.localVersion = localVersion
    this.serverVersion = serverVersion
  }
}

/**
 * Network and Connectivity Errors
 */
export class NetworkError extends AppError {
  public readonly url?: string
  public readonly method?: string

  constructor(
    message: string = 'Network request failed',
    url?: string,
    method?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'NETWORK_ERROR', 503, true, context)
    this.url = url
    this.method = method
  }
}

export class OfflineError extends AppError {
  constructor(
    message: string = 'Operation requires network connectivity',
    context?: Record<string, unknown>
  ) {
    super(message, 'OFFLINE', 503, true, context)
  }
}

export class TimeoutError extends AppError {
  public readonly timeoutMs: number

  constructor(
    message: string = 'Operation timed out',
    timeoutMs: number = 0,
    context?: Record<string, unknown>
  ) {
    super(message, 'TIMEOUT', 504, true, context)
    this.timeoutMs = timeoutMs
  }
}

/**
 * Database and Transaction Errors
 */
export class TransactionError extends AppError {
  public readonly operation?: string
  public readonly rollbackSuccessful?: boolean

  constructor(
    message: string,
    operation?: string,
    rollbackSuccessful?: boolean,
    context?: Record<string, unknown>
  ) {
    super(message, 'TRANSACTION_ERROR', 500, true, context)
    this.operation = operation
    this.rollbackSuccessful = rollbackSuccessful
  }
}

export class DatabaseError extends AppError {
  public readonly query?: string
  public readonly table?: string

  constructor(
    message: string,
    table?: string,
    context?: Record<string, unknown>
  ) {
    super(message, 'DATABASE_ERROR', 500, true, context)
    this.table = table
  }
}

/**
 * Encryption Errors
 * Note: EncryptionRequiredError already exists in syncService.ts
 * This provides a consistent interface with other errors
 */
export class EncryptionError extends AppError {
  public readonly operation: 'encrypt' | 'decrypt'

  constructor(
    message: string,
    operation: 'encrypt' | 'decrypt',
    context?: Record<string, unknown>
  ) {
    super(message, 'ENCRYPTION_ERROR', 500, true, context)
    this.operation = operation
  }
}

/**
 * Rate Limiting Errors
 */
export class RateLimitError extends AppError {
  public readonly retryAfter: number

  constructor(
    retryAfter: number,
    message: string = 'Too many requests',
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMITED', 429, true, context)
    this.retryAfter = retryAfter
  }
}

/**
 * External Service Errors
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string
  public readonly originalError?: Error

  constructor(
    serviceName: string,
    message: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502, true, context)
    this.serviceName = serviceName
    this.originalError = originalError
  }
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Type guard to check if an error is operational (expected)
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational
  }
  return false
}

/**
 * Helper to create an appropriate error from a Supabase error
 */
export function fromSupabaseError(
  error: { message: string; code?: string; details?: string },
  table?: string
): AppError {
  const message = error.message || 'Database operation failed'
  const code = error.code || 'unknown'

  // Map common Supabase error codes to appropriate errors
  switch (code) {
    case '23505': // unique_violation
      return new ValidationError(`Duplicate entry: ${message}`, undefined, undefined, { table })
    case '23503': // foreign_key_violation
      return new ValidationError(`Invalid reference: ${message}`, undefined, undefined, { table })
    case '22P02': // invalid_text_representation
      return new ValidationError(`Invalid data format: ${message}`, undefined, undefined, { table })
    case 'PGRST116': // No rows returned
      return new NotFoundError('Record', undefined, { table })
    case '42501': // insufficient_privilege
      return new AuthorizationError(`Permission denied: ${message}`)
    default:
      return new DatabaseError(message, table, { code, details: error.details })
  }
}

/**
 * Helper to wrap async functions with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => AppError
): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (isAppError(error)) {
      throw error
    }
    if (errorMapper) {
      throw errorMapper(error)
    }
    if (error instanceof Error) {
      throw new AppError(error.message, 'UNKNOWN_ERROR', 500, false, { originalError: error.name })
    }
    throw new AppError('An unexpected error occurred', 'UNKNOWN_ERROR', 500, false)
  }
}

/**
 * Creates an error response object suitable for API responses
 */
export function toErrorResponse(error: unknown): {
  error: string
  code?: string
  details?: unknown
  statusCode: number
} {
  if (isAppError(error)) {
    return {
      error: error.message,
      code: error.code,
      details: process.env.NODE_ENV !== 'production' ? error.context : undefined,
      statusCode: error.statusCode,
    }
  }

  if (error instanceof Error) {
    return {
      error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
      statusCode: 500,
    }
  }

  return {
    error: 'An unexpected error occurred',
    statusCode: 500,
  }
}
