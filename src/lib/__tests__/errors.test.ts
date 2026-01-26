import { describe, it, expect } from '@jest/globals'
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  TaskNotFoundError,
  SyncError,
  ConflictError,
  NetworkError,
  OfflineError,
  TimeoutError,
  TransactionError,
  DatabaseError,
  EncryptionError,
  RateLimitError,
  ExternalServiceError,
  isAppError,
  isOperationalError,
  fromSupabaseError,
  toErrorResponse,
  withErrorHandling,
} from '@/lib/errors'

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create a base error with all properties', () => {
      const error = new AppError('Test error', 'TEST_ERROR', 400, true, { foo: 'bar' })

      expect(error.message).toBe('Test error')
      expect(error.code).toBe('TEST_ERROR')
      expect(error.statusCode).toBe(400)
      expect(error.isOperational).toBe(true)
      expect(error.context).toEqual({ foo: 'bar' })
      expect(error.name).toBe('AppError')
    })

    it('should have default values', () => {
      const error = new AppError('Test', 'TEST')

      expect(error.statusCode).toBe(500)
      expect(error.isOperational).toBe(true)
      expect(error.context).toBeUndefined()
    })

    it('should serialize to JSON correctly', () => {
      const error = new AppError('Test', 'TEST', 400, true, { detail: 'info' })
      const json = error.toJSON()

      expect(json.name).toBe('AppError')
      expect(json.message).toBe('Test')
      expect(json.code).toBe('TEST')
      expect(json.statusCode).toBe(400)
    })
  })

  describe('AuthenticationError', () => {
    it('should create with default message', () => {
      const error = new AuthenticationError()

      expect(error.message).toBe('Authentication required')
      expect(error.code).toBe('AUTH_REQUIRED')
      expect(error.statusCode).toBe(401)
    })

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid token')

      expect(error.message).toBe('Invalid token')
    })
  })

  describe('AuthorizationError', () => {
    it('should create with default message', () => {
      const error = new AuthorizationError()

      expect(error.message).toBe('Permission denied')
      expect(error.code).toBe('PERMISSION_DENIED')
      expect(error.statusCode).toBe(403)
    })
  })

  describe('ValidationError', () => {
    it('should create with field information', () => {
      const error = new ValidationError('Invalid email', 'email')

      expect(error.message).toBe('Invalid email')
      expect(error.field).toBe('email')
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(400)
    })

    it('should accept validation details', () => {
      const details = [
        { field: 'email', message: 'Invalid format' },
        { field: 'password', message: 'Too short' },
      ]
      const error = new ValidationError('Multiple validation errors', undefined, details)

      expect(error.details).toEqual(details)
    })

    it('should include field and details in JSON', () => {
      const error = new ValidationError('Invalid', 'name', [{ field: 'name', message: 'Required' }])
      const json = error.toJSON()

      expect(json.field).toBe('name')
      expect(json.details).toHaveLength(1)
    })
  })

  describe('NotFoundError', () => {
    it('should create with resource type and id', () => {
      const error = new NotFoundError('User', '123')

      expect(error.message).toBe("User with id '123' not found")
      expect(error.resourceType).toBe('User')
      expect(error.resourceId).toBe('123')
      expect(error.statusCode).toBe(404)
    })

    it('should create without id', () => {
      const error = new NotFoundError('Config')

      expect(error.message).toBe('Config not found')
      expect(error.resourceId).toBeUndefined()
    })
  })

  describe('TaskNotFoundError', () => {
    it('should be a specialized NotFoundError', () => {
      const error = new TaskNotFoundError('task-123')

      expect(error.message).toBe("Task with id 'task-123' not found")
      expect(error.resourceType).toBe('Task')
      expect(error instanceof NotFoundError).toBe(true)
    })
  })

  describe('SyncError', () => {
    it('should include operation and failed entities', () => {
      const error = new SyncError('Sync failed', 'push', ['entity-1', 'entity-2'])

      expect(error.operation).toBe('push')
      expect(error.failedEntities).toEqual(['entity-1', 'entity-2'])
      expect(error.code).toBe('SYNC_ERROR')
    })

    it('should include operation info in JSON', () => {
      const error = new SyncError('Failed', 'pull', ['e1'])
      const json = error.toJSON()

      expect(json.operation).toBe('pull')
      expect(json.failedEntities).toEqual(['e1'])
    })
  })

  describe('ConflictError', () => {
    it('should include version information', () => {
      const error = new ConflictError('Task', 'task-1', 5, 7)

      expect(error.entityType).toBe('Task')
      expect(error.entityId).toBe('task-1')
      expect(error.localVersion).toBe(5)
      expect(error.serverVersion).toBe(7)
      expect(error.statusCode).toBe(409)
    })
  })

  describe('NetworkError', () => {
    it('should include URL and method', () => {
      const error = new NetworkError('Request failed', '/api/tasks', 'POST')

      expect(error.url).toBe('/api/tasks')
      expect(error.method).toBe('POST')
      expect(error.statusCode).toBe(503)
    })
  })

  describe('OfflineError', () => {
    it('should have appropriate defaults', () => {
      const error = new OfflineError()

      expect(error.message).toBe('Operation requires network connectivity')
      expect(error.code).toBe('OFFLINE')
      expect(error.statusCode).toBe(503)
    })
  })

  describe('TimeoutError', () => {
    it('should include timeout duration', () => {
      const error = new TimeoutError('Request timed out', 30000)

      expect(error.timeoutMs).toBe(30000)
      expect(error.statusCode).toBe(504)
    })
  })

  describe('TransactionError', () => {
    it('should include operation and rollback status', () => {
      const error = new TransactionError('TX failed', 'batch_insert', true)

      expect(error.operation).toBe('batch_insert')
      expect(error.rollbackSuccessful).toBe(true)
    })
  })

  describe('DatabaseError', () => {
    it('should include table information', () => {
      const error = new DatabaseError('Insert failed', 'tasks')

      expect(error.table).toBe('tasks')
      expect(error.code).toBe('DATABASE_ERROR')
    })
  })

  describe('EncryptionError', () => {
    it('should include operation type', () => {
      const encryptError = new EncryptionError('Key missing', 'encrypt')
      const decryptError = new EncryptionError('Invalid data', 'decrypt')

      expect(encryptError.operation).toBe('encrypt')
      expect(decryptError.operation).toBe('decrypt')
    })
  })

  describe('RateLimitError', () => {
    it('should include retry-after duration', () => {
      const error = new RateLimitError(60)

      expect(error.retryAfter).toBe(60)
      expect(error.statusCode).toBe(429)
      expect(error.message).toBe('Too many requests')
    })
  })

  describe('ExternalServiceError', () => {
    it('should include service name and original error', () => {
      const originalError = new Error('API timeout')
      const error = new ExternalServiceError('OpenAI', 'API call failed', originalError)

      expect(error.serviceName).toBe('OpenAI')
      expect(error.originalError).toBe(originalError)
      expect(error.statusCode).toBe(502)
    })
  })
})

describe('Helper Functions', () => {
  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      expect(isAppError(new AppError('test', 'TEST'))).toBe(true)
      expect(isAppError(new ValidationError('test'))).toBe(true)
      expect(isAppError(new NetworkError())).toBe(true)
    })

    it('should return false for regular errors', () => {
      expect(isAppError(new Error('test'))).toBe(false)
      expect(isAppError('string error')).toBe(false)
      expect(isAppError(null)).toBe(false)
    })
  })

  describe('isOperationalError', () => {
    it('should return true for operational errors', () => {
      expect(isOperationalError(new ValidationError('test'))).toBe(true)
    })

    it('should return false for non-operational errors', () => {
      const error = new AppError('test', 'TEST', 500, false)
      expect(isOperationalError(error)).toBe(false)
    })

    it('should return false for non-AppErrors', () => {
      expect(isOperationalError(new Error('test'))).toBe(false)
    })
  })

  describe('fromSupabaseError', () => {
    it('should map unique violation to ValidationError', () => {
      const error = fromSupabaseError({ message: 'duplicate key', code: '23505' })

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.message).toContain('Duplicate entry')
    })

    it('should map foreign key violation to ValidationError', () => {
      const error = fromSupabaseError({ message: 'FK violation', code: '23503' })

      expect(error).toBeInstanceOf(ValidationError)
      expect(error.message).toContain('Invalid reference')
    })

    it('should map not found to NotFoundError', () => {
      const error = fromSupabaseError({ message: 'no rows', code: 'PGRST116' })

      expect(error).toBeInstanceOf(NotFoundError)
    })

    it('should map permission error to AuthorizationError', () => {
      const error = fromSupabaseError({ message: 'access denied', code: '42501' })

      expect(error).toBeInstanceOf(AuthorizationError)
    })

    it('should default to DatabaseError for unknown codes', () => {
      const error = fromSupabaseError({ message: 'unknown error', code: 'UNKNOWN' })

      expect(error).toBeInstanceOf(DatabaseError)
    })
  })

  describe('toErrorResponse', () => {
    it('should format AppError correctly', () => {
      const error = new ValidationError('Invalid input', 'field1')
      const response = toErrorResponse(error)

      expect(response.error).toBe('Invalid input')
      expect(response.code).toBe('VALIDATION_ERROR')
      expect(response.statusCode).toBe(400)
    })

    it('should handle regular Error', () => {
      const error = new Error('Something went wrong')
      const response = toErrorResponse(error)

      expect(response.statusCode).toBe(500)
    })

    it('should handle unknown error types', () => {
      const response = toErrorResponse('string error')

      expect(response.error).toBe('An unexpected error occurred')
      expect(response.statusCode).toBe(500)
    })
  })

  describe('withErrorHandling', () => {
    it('should return result on success', async () => {
      const result = await withErrorHandling(async () => 'success')

      expect(result).toBe('success')
    })

    it('should rethrow AppError as-is', async () => {
      const originalError = new ValidationError('test')

      await expect(
        withErrorHandling(async () => {
          throw originalError
        })
      ).rejects.toBe(originalError)
    })

    it('should use custom error mapper', async () => {
      const mapper = () => new NetworkError('Mapped error')

      await expect(
        withErrorHandling(
          async () => {
            throw new Error('Original')
          },
          mapper
        )
      ).rejects.toBeInstanceOf(NetworkError)
    })

    it('should wrap unknown errors', async () => {
      await expect(
        withErrorHandling(async () => {
          throw 'string error'
        })
      ).rejects.toMatchObject({
        code: 'UNKNOWN_ERROR',
        isOperational: false,
      })
    })
  })
})
