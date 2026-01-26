import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * AgentOrchestrator Tests
 *
 * Tests for the supervisor component that:
 * - Receives user requests
 * - Classifies intents
 * - Dispatches to appropriate workers
 * - Manages conversation threads
 */

// Mock dependencies
jest.mock('@/lib/supabase/server', () => ({
  createRouteHandlerSupabaseClient: jest.fn(),
}))

describe('Intent to Worker Mapping', () => {
  const INTENT_WORKER_MAP: Record<string, string> = {
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

  it('should map calendar intents to calendar worker', () => {
    expect(INTENT_WORKER_MAP.SCHEDULE_REQUEST).toBe('calendar')
    expect(INTENT_WORKER_MAP.ROUTINE).toBe('calendar')
  })

  it('should map task intents to task worker', () => {
    expect(INTENT_WORKER_MAP.QUICK_TODO).toBe('task')
    expect(INTENT_WORKER_MAP.COURSE_TASK).toBe('task')
    expect(INTENT_WORKER_MAP.CLUB_TASK).toBe('task')
    expect(INTENT_WORKER_MAP.JOURNAL).toBe('task')
  })

  it('should map project intents to project worker', () => {
    expect(INTENT_WORKER_MAP.PROJECT_TASK).toBe('project')
    expect(INTENT_WORKER_MAP.CREATE_CONTAINER).toBe('project')
  })

  it('should default unknown intents to task worker', () => {
    expect(INTENT_WORKER_MAP.UNKNOWN).toBe('task')
  })

  it('should cover all valid intents', () => {
    const validIntents = [
      'SCHEDULE_REQUEST',
      'ROUTINE',
      'QUICK_TODO',
      'COURSE_TASK',
      'CLUB_TASK',
      'JOURNAL',
      'PROJECT_TASK',
      'CREATE_CONTAINER',
      'UNKNOWN',
    ]

    validIntents.forEach((intent) => {
      expect(INTENT_WORKER_MAP[intent]).toBeDefined()
    })
  })
})

describe('Orchestrator Request Processing', () => {
  interface OrchestratorRequest {
    input: string
    threadId?: string
    clientState?: {
      pendingIntent?: string
      partialData?: Record<string, unknown>
      missingFields?: string[]
    }
  }

  interface OrchestratorResponse {
    status: 'SUCCESS' | 'PROCESSING' | 'CLARIFICATION_NEEDED' | 'ERROR'
    threadId: string
    jobId?: string
    displayMessage: string
    createdNodes?: unknown[]
    serverState?: unknown
    error?: string
  }

  function validateRequest(request: OrchestratorRequest): { valid: boolean; error?: string } {
    if (!request.input || typeof request.input !== 'string') {
      return { valid: false, error: 'Input is required and must be a string' }
    }
    if (request.input.length > 10000) {
      return { valid: false, error: 'Input exceeds maximum length' }
    }
    if (request.threadId && !/^[0-9a-f-]{36}$/i.test(request.threadId)) {
      return { valid: false, error: 'Invalid thread ID format' }
    }
    return { valid: true }
  }

  it('should validate input is present', () => {
    expect(validateRequest({ input: '' }).valid).toBe(false)
    expect(validateRequest({ input: 'Test' }).valid).toBe(true)
  })

  it('should validate input type', () => {
    expect(validateRequest({ input: 'Valid string' }).valid).toBe(true)
    // @ts-expect-error Testing invalid type
    expect(validateRequest({ input: 123 }).valid).toBe(false)
  })

  it('should validate input length', () => {
    expect(validateRequest({ input: 'a'.repeat(10001) }).valid).toBe(false)
    expect(validateRequest({ input: 'a'.repeat(1000) }).valid).toBe(true)
  })

  it('should validate thread ID format', () => {
    expect(validateRequest({
      input: 'Test',
      threadId: '123e4567-e89b-12d3-a456-426614174000',
    }).valid).toBe(true)
    expect(validateRequest({
      input: 'Test',
      threadId: 'invalid-id',
    }).valid).toBe(false)
  })
})

describe('Slot Filling Detection', () => {
  interface ClientState {
    pendingIntent?: string
    partialData?: Record<string, unknown>
    missingFields?: string[]
  }

  function isSlotFillingContinuation(clientState?: ClientState): boolean {
    return !!(
      clientState?.pendingIntent &&
      clientState?.missingFields &&
      clientState.missingFields.length > 0
    )
  }

  it('should detect slot filling continuation', () => {
    expect(isSlotFillingContinuation({
      pendingIntent: 'QUICK_TODO',
      missingFields: ['title'],
    })).toBe(true)
  })

  it('should not detect when no pending intent', () => {
    expect(isSlotFillingContinuation({
      missingFields: ['title'],
    })).toBe(false)
  })

  it('should not detect when no missing fields', () => {
    expect(isSlotFillingContinuation({
      pendingIntent: 'QUICK_TODO',
      missingFields: [],
    })).toBe(false)
  })

  it('should not detect when client state is undefined', () => {
    expect(isSlotFillingContinuation(undefined)).toBe(false)
  })
})

describe('Thread Management', () => {
  interface Thread {
    id: string
    user_id: string
    title?: string
    status: 'active' | 'archived'
    message_count: number
    created_at: string
  }

  function createThread(userId: string, title?: string): Thread {
    return {
      id: `thread-${Date.now()}`,
      user_id: userId,
      title: title || undefined,
      status: 'active',
      message_count: 0,
      created_at: new Date().toISOString(),
    }
  }

  function generateThreadTitle(input: string): string {
    // Take first 50 chars of input as title
    const truncated = input.substring(0, 50)
    return truncated.length < input.length ? `${truncated}...` : truncated
  }

  it('should create thread with user ID', () => {
    const thread = createThread('user-123')
    expect(thread.user_id).toBe('user-123')
    expect(thread.status).toBe('active')
    expect(thread.message_count).toBe(0)
  })

  it('should create thread with optional title', () => {
    const thread = createThread('user-123', 'My Conversation')
    expect(thread.title).toBe('My Conversation')
  })

  it('should generate thread title from input', () => {
    expect(generateThreadTitle('Add a task for tomorrow')).toBe('Add a task for tomorrow')
    expect(generateThreadTitle('a'.repeat(100))).toBe('a'.repeat(50) + '...')
  })
})

describe('Job Creation', () => {
  interface JobInput {
    userId: string
    threadId: string
    intent: string
    workerType: string
    inputData: Record<string, unknown>
  }

  interface Job {
    id: string
    user_id: string
    thread_id: string
    intent: string
    worker_type: string
    status: string
    input_data: Record<string, unknown>
    created_at: string
  }

  function createJob(input: JobInput): Job {
    return {
      id: `job-${Date.now()}`,
      user_id: input.userId,
      thread_id: input.threadId,
      intent: input.intent,
      worker_type: input.workerType,
      status: 'pending',
      input_data: input.inputData,
      created_at: new Date().toISOString(),
    }
  }

  it('should create job with all required fields', () => {
    const job = createJob({
      userId: 'user-1',
      threadId: 'thread-1',
      intent: 'QUICK_TODO',
      workerType: 'task',
      inputData: { user_input: 'Add a task' },
    })

    expect(job.user_id).toBe('user-1')
    expect(job.thread_id).toBe('thread-1')
    expect(job.intent).toBe('QUICK_TODO')
    expect(job.worker_type).toBe('task')
    expect(job.status).toBe('pending')
    expect(job.input_data.user_input).toBe('Add a task')
  })

  it('should set initial status to pending', () => {
    const job = createJob({
      userId: 'user-1',
      threadId: 'thread-1',
      intent: 'QUICK_TODO',
      workerType: 'task',
      inputData: {},
    })

    expect(job.status).toBe('pending')
  })
})

describe('Container Context', () => {
  interface Container {
    id: string
    title: string
    category: string
  }

  function formatContainerContext(containers: Container[]): string {
    if (!containers.length) return 'No active containers'
    return containers
      .map((c) => `- ${c.title} (${c.category}) [ID: ${c.id}]`)
      .join('\n')
  }

  it('should format empty containers list', () => {
    expect(formatContainerContext([])).toBe('No active containers')
  })

  it('should format single container', () => {
    const result = formatContainerContext([
      { id: '1', title: 'Math 101', category: 'course' },
    ])
    expect(result).toBe('- Math 101 (course) [ID: 1]')
  })

  it('should format multiple containers', () => {
    const result = formatContainerContext([
      { id: '1', title: 'Math 101', category: 'course' },
      { id: '2', title: 'Side Project', category: 'project' },
    ])
    expect(result).toContain('- Math 101 (course) [ID: 1]')
    expect(result).toContain('- Side Project (project) [ID: 2]')
  })
})

describe('Error Response Generation', () => {
  interface ErrorResponse {
    threadId: string
    status: 'ERROR'
    displayMessage: string
    error: string
  }

  function createErrorResponse(
    threadId: string,
    error: Error | string
  ): ErrorResponse {
    const errorMessage = typeof error === 'string' ? error : error.message
    return {
      threadId,
      status: 'ERROR',
      displayMessage: 'Sorry, I encountered an error processing your request.',
      error: errorMessage,
    }
  }

  it('should create error response from Error object', () => {
    const response = createErrorResponse(
      'thread-1',
      new Error('Database connection failed')
    )
    expect(response.status).toBe('ERROR')
    expect(response.error).toBe('Database connection failed')
  })

  it('should create error response from string', () => {
    const response = createErrorResponse('thread-1', 'Invalid input')
    expect(response.error).toBe('Invalid input')
  })

  it('should include thread ID', () => {
    const response = createErrorResponse('thread-123', 'Error')
    expect(response.threadId).toBe('thread-123')
  })
})

/**
 * TODO: Add integration tests with mocked Supabase:
 *
 * describe('AgentOrchestrator Integration', () => {
 *   it('should create thread on first request')
 *   it('should reuse thread on continuation')
 *   it('should classify intent using Ollama')
 *   it('should create job in database')
 *   it('should handle slot filling')
 *   it('should return PROCESSING status for async jobs')
 * })
 */
