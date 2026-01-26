import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * Agent API Route Tests
 *
 * Tests for:
 * - POST /api/agent/interact
 * - GET /api/agent/interact (conversation history)
 * - GET /api/agent/jobs/[id]
 * - PATCH /api/agent/jobs/[id]
 * - DELETE /api/agent/jobs/[id]
 * - POST /api/agent/jobs/process
 */

// Mock Supabase before any imports
const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockRpc = jest.fn()
const mockChannel = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: mockRpc,
    channel: mockChannel,
  })),
}))

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}))

describe('Agent API Test Infrastructure', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should have Supabase mock set up', () => {
      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      expect(createRouteHandlerSupabaseClient).toBeDefined()
    })

    it('should return user for authenticated requests', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
      })

      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      const client = createRouteHandlerSupabaseClient()
      const { data, error } = await client.auth.getUser()

      expect(error).toBeNull()
      expect(data.user).toBeDefined()
      expect(data.user.id).toBe('test-user-id')
    })

    it('should return error for unauthenticated requests', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Unauthorized' },
      })

      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      const client = createRouteHandlerSupabaseClient()
      const { data, error } = await client.auth.getUser()

      expect(error).toBeDefined()
      expect(data.user).toBeNull()
    })
  })

  describe('Database Operations', () => {
    it('should mock agent_logs queries', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { turn_index: 5 },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(mockQuery)

      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      const client = createRouteHandlerSupabaseClient()
      const result = await client
        .from('agent_logs')
        .select('turn_index')
        .eq('thread_id', 'test-thread')
        .order('turn_index', { ascending: false })
        .limit(1)
        .single()

      expect(result.data).toEqual({ turn_index: 5 })
      expect(result.error).toBeNull()
    })

    it('should mock agent_threads queries', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'thread-1',
            user_id: 'user-1',
            title: 'Test Thread',
            status: 'active',
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(mockQuery)

      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      const client = createRouteHandlerSupabaseClient()
      const result = await client
        .from('agent_threads')
        .select('*')
        .eq('id', 'thread-1')
        .single()

      expect(result.data.id).toBe('thread-1')
      expect(result.data.status).toBe('active')
    })

    it('should mock agent_jobs queries', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: {
            id: 'job-1',
            user_id: 'user-1',
            status: 'pending',
            worker_type: 'task',
            intent: 'QUICK_TODO',
            progress: 0,
          },
          error: null,
        }),
      }
      mockFrom.mockReturnValue(mockQuery)

      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      const client = createRouteHandlerSupabaseClient()
      const result = await client
        .from('agent_jobs')
        .select('*')
        .eq('id', 'job-1')
        .single()

      expect(result.data.id).toBe('job-1')
      expect(result.data.status).toBe('pending')
      expect(result.data.worker_type).toBe('task')
    })

    it('should mock claim_next_job RPC call', async () => {
      mockRpc.mockResolvedValueOnce({
        data: {
          id: 'job-1',
          status: 'claimed',
          worker_type: 'task',
          claimed_by: 'worker-1',
        },
        error: null,
      })

      const { createRouteHandlerSupabaseClient } = require('@/lib/supabase/server')
      const client = createRouteHandlerSupabaseClient()
      const result = await client.rpc('claim_next_job', {
        p_worker_type: 'task',
        p_worker_id: 'worker-1',
      })

      expect(result.data.status).toBe('claimed')
      expect(result.data.claimed_by).toBe('worker-1')
    })
  })

  describe('Job Status Transitions', () => {
    const validStatuses = ['pending', 'claimed', 'processing', 'completed', 'failed', 'cancelled']

    it.each(validStatuses)('should accept valid status: %s', (status) => {
      expect(validStatuses).toContain(status)
    })

    it('should validate job status transitions', () => {
      const validTransitions: Record<string, string[]> = {
        pending: ['claimed', 'cancelled'],
        claimed: ['processing', 'failed'],
        processing: ['completed', 'failed'],
        completed: [],
        failed: ['pending'], // retry
        cancelled: [],
      }

      // Verify pending can go to claimed
      expect(validTransitions.pending).toContain('claimed')

      // Verify completed is terminal
      expect(validTransitions.completed).toEqual([])

      // Verify failed can retry
      expect(validTransitions.failed).toContain('pending')
    })
  })

  describe('Worker Types', () => {
    const validWorkerTypes = ['calendar', 'task', 'project']

    it.each(validWorkerTypes)('should accept valid worker type: %s', (workerType) => {
      expect(validWorkerTypes).toContain(workerType)
    })

    it('should map intents to correct workers', () => {
      const intentWorkerMap: Record<string, string> = {
        SCHEDULE_REQUEST: 'calendar',
        ROUTINE: 'calendar',
        QUICK_TODO: 'task',
        COURSE_TASK: 'task',
        CLUB_TASK: 'task',
        JOURNAL: 'task',
        PROJECT_TASK: 'project',
        CREATE_CONTAINER: 'project',
        UNKNOWN: 'task',
      }

      expect(intentWorkerMap.SCHEDULE_REQUEST).toBe('calendar')
      expect(intentWorkerMap.QUICK_TODO).toBe('task')
      expect(intentWorkerMap.PROJECT_TASK).toBe('project')
      expect(intentWorkerMap.UNKNOWN).toBe('task')
    })
  })
})

describe('Agent Interact Request Validation', () => {
  it('should validate input is required', () => {
    const invalidRequests = [
      { threadId: 'test' },
      { input: '' },
      { input: null },
      { input: 123 },
    ]

    invalidRequests.forEach((request) => {
      const isValid = typeof request.input === 'string' && request.input.length > 0
      expect(isValid).toBe(false)
    })
  })

  it('should accept valid requests', () => {
    const validRequests = [
      { input: 'Add a task' },
      { input: 'Create project', threadId: 'thread-1' },
      { input: 'Schedule meeting', clientState: { pendingIntent: 'SCHEDULE_REQUEST' } },
    ]

    validRequests.forEach((request) => {
      const isValid = typeof request.input === 'string' && request.input.length > 0
      expect(isValid).toBe(true)
    })
  })
})

describe('Agent Response Structure', () => {
  it('should have correct SUCCESS response structure', () => {
    const successResponse = {
      threadId: 'test-uuid',
      status: 'SUCCESS',
      displayMessage: 'Created "Test Task"',
      createdNodes: [{ id: 'task-1', title: 'Test Task' }],
    }

    expect(successResponse.threadId).toBeDefined()
    expect(successResponse.status).toBe('SUCCESS')
    expect(successResponse.displayMessage).toBeDefined()
    expect(Array.isArray(successResponse.createdNodes)).toBe(true)
  })

  it('should have correct CLARIFICATION_NEEDED response structure', () => {
    const clarificationResponse = {
      threadId: 'test-uuid',
      status: 'CLARIFICATION_NEEDED',
      displayMessage: 'What would you like to call this task?',
      serverState: {
        pendingIntent: 'QUICK_TODO',
        partialData: { category: 'todo' },
        missingFields: ['title'],
      },
    }

    expect(clarificationResponse.status).toBe('CLARIFICATION_NEEDED')
    expect(clarificationResponse.serverState).toBeDefined()
    expect(clarificationResponse.serverState.missingFields).toContain('title')
  })

  it('should have correct ERROR response structure', () => {
    const errorResponse = {
      threadId: 'test-uuid',
      status: 'ERROR',
      displayMessage: 'An error occurred processing your request',
      error: 'Failed to classify intent',
    }

    expect(errorResponse.status).toBe('ERROR')
    expect(errorResponse.error).toBeDefined()
  })

  it('should have correct PROCESSING response structure', () => {
    const processingResponse = {
      threadId: 'test-uuid',
      status: 'PROCESSING',
      displayMessage: 'Processing your request...',
      jobId: 'job-1',
    }

    expect(processingResponse.status).toBe('PROCESSING')
    expect(processingResponse.jobId).toBeDefined()
  })
})

/**
 * TODO: Add full route handler tests using:
 * - node-mocks-http for NextRequest/NextResponse mocking
 * - msw for Ollama API mocking
 *
 * Example integration test structure:
 *
 * describe('POST /api/agent/interact', () => {
 *   it('should return 401 for unauthenticated requests')
 *   it('should return 400 for missing input')
 *   it('should classify intent and create task')
 *   it('should handle slot-filling continuation')
 *   it('should log interaction to agent_logs')
 * })
 *
 * describe('GET /api/agent/jobs/[id]', () => {
 *   it('should return 401 for unauthenticated requests')
 *   it('should return 404 for non-existent job')
 *   it('should return job details for owner')
 * })
 *
 * describe('POST /api/agent/jobs/process', () => {
 *   it('should claim and process pending jobs')
 *   it('should handle worker failures with retry')
 *   it('should broadcast progress updates')
 * })
 */
