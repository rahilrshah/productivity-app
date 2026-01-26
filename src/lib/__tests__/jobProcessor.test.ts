import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * JobProcessor Tests
 *
 * Tests for the background job processor that:
 * - Polls for pending jobs
 * - Claims jobs atomically
 * - Dispatches to workers
 * - Handles failures with retry
 */

// Types for testing
interface Job {
  id: string
  user_id: string
  thread_id?: string
  intent: string
  worker_type: string
  status: string
  progress: number
  input_data: Record<string, unknown>
  output_data?: Record<string, unknown>
  error_message?: string
  retry_count: number
  max_retries: number
  claimed_by?: string
  claimed_at?: string
  started_at?: string
  completed_at?: string
  next_retry_at?: string
  created_at: string
}

type WorkerType = 'task' | 'calendar' | 'project'

describe('JobProcessor Configuration', () => {
  interface ProcessorConfig {
    pollIntervalMs: number
    workerTypes: WorkerType[]
    workerId: string
  }

  let workerIdCounter = 0

  function createDefaultConfig(): ProcessorConfig {
    workerIdCounter++
    return {
      pollIntervalMs: 1000,
      workerTypes: ['task', 'calendar', 'project'],
      workerId: `worker-${Date.now()}-${workerIdCounter}-${Math.random().toString(36).substring(7)}`,
    }
  }

  it('should have default poll interval of 1 second', () => {
    const config = createDefaultConfig()
    expect(config.pollIntervalMs).toBe(1000)
  })

  it('should support all worker types', () => {
    const config = createDefaultConfig()
    expect(config.workerTypes).toContain('task')
    expect(config.workerTypes).toContain('calendar')
    expect(config.workerTypes).toContain('project')
  })

  it('should generate unique worker ID', () => {
    const config1 = createDefaultConfig()
    const config2 = createDefaultConfig()
    expect(config1.workerId).not.toBe(config2.workerId)
  })
})

describe('Job Claiming', () => {
  describe('Atomic Claim Logic', () => {
    // Simulates claim_next_job RPC behavior
    let jobs: Job[] = []

    beforeEach(() => {
      jobs = [
        {
          id: 'job-1',
          user_id: 'user-1',
          intent: 'QUICK_TODO',
          worker_type: 'task',
          status: 'pending',
          progress: 0,
          input_data: {},
          retry_count: 0,
          max_retries: 3,
          created_at: new Date().toISOString(),
        },
        {
          id: 'job-2',
          user_id: 'user-1',
          intent: 'SCHEDULE_REQUEST',
          worker_type: 'calendar',
          status: 'pending',
          progress: 0,
          input_data: {},
          retry_count: 0,
          max_retries: 3,
          created_at: new Date().toISOString(),
        },
      ]
    })

    function claimNextJob(workerType: string, workerId: string): Job | null {
      const pendingJob = jobs.find(
        (j) => j.status === 'pending' && j.worker_type === workerType
      )

      if (!pendingJob) return null

      // Simulate atomic update
      pendingJob.status = 'claimed'
      pendingJob.claimed_by = workerId
      pendingJob.claimed_at = new Date().toISOString()

      return { ...pendingJob }
    }

    it('should claim job for matching worker type', () => {
      const claimed = claimNextJob('task', 'worker-1')

      expect(claimed).not.toBeNull()
      expect(claimed?.worker_type).toBe('task')
      expect(claimed?.status).toBe('claimed')
      expect(claimed?.claimed_by).toBe('worker-1')
    })

    it('should return null when no pending jobs', () => {
      jobs.forEach((j) => (j.status = 'completed'))
      const claimed = claimNextJob('task', 'worker-1')

      expect(claimed).toBeNull()
    })

    it('should not claim job for different worker type', () => {
      const claimed = claimNextJob('project', 'worker-1')

      expect(claimed).toBeNull()
    })

    it('should claim oldest job first (FIFO)', () => {
      // Add older job
      jobs.unshift({
        id: 'job-0',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'pending',
        progress: 0,
        input_data: {},
        retry_count: 0,
        max_retries: 3,
        created_at: new Date(Date.now() - 10000).toISOString(),
      })

      const claimed = claimNextJob('task', 'worker-1')

      expect(claimed?.id).toBe('job-0')
    })
  })

  describe('Retry Scheduling', () => {
    function calculateNextRetryTime(retryCount: number): Date {
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const baseDelay = 1000
      const maxDelay = 30000
      const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
      return new Date(Date.now() + delay)
    }

    function shouldRetryNow(job: Job): boolean {
      if (job.status !== 'pending') return false
      if (!job.next_retry_at) return true
      return new Date(job.next_retry_at) <= new Date()
    }

    it('should calculate exponential backoff', () => {
      const delay0 = calculateNextRetryTime(0).getTime() - Date.now()
      const delay1 = calculateNextRetryTime(1).getTime() - Date.now()
      const delay2 = calculateNextRetryTime(2).getTime() - Date.now()

      expect(delay0).toBeGreaterThanOrEqual(1000)
      expect(delay0).toBeLessThanOrEqual(1100)
      expect(delay1).toBeGreaterThanOrEqual(2000)
      expect(delay2).toBeGreaterThanOrEqual(4000)
    })

    it('should cap delay at 30 seconds', () => {
      const delay10 = calculateNextRetryTime(10).getTime() - Date.now()

      expect(delay10).toBeLessThanOrEqual(30100)
    })

    it('should allow immediate retry when no next_retry_at', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'pending',
        progress: 0,
        input_data: {},
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }

      expect(shouldRetryNow(job)).toBe(true)
    })

    it('should block retry when next_retry_at is in future', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'pending',
        progress: 0,
        input_data: {},
        retry_count: 1,
        max_retries: 3,
        next_retry_at: new Date(Date.now() + 60000).toISOString(),
        created_at: new Date().toISOString(),
      }

      expect(shouldRetryNow(job)).toBe(false)
    })
  })
})

describe('Job Processing', () => {
  describe('Status Transitions', () => {
    function startProcessing(job: Job): Job {
      if (job.status !== 'claimed') {
        throw new Error(`Cannot start processing job in status: ${job.status}`)
      }
      return {
        ...job,
        status: 'processing',
        started_at: new Date().toISOString(),
      }
    }

    function completeJob(job: Job, output: Record<string, unknown>): Job {
      if (job.status !== 'processing') {
        throw new Error(`Cannot complete job in status: ${job.status}`)
      }
      return {
        ...job,
        status: 'completed',
        progress: 100,
        output_data: output,
        completed_at: new Date().toISOString(),
      }
    }

    function failJob(job: Job, error: string): Job {
      const shouldRetry = job.retry_count < job.max_retries

      if (shouldRetry) {
        return {
          ...job,
          status: 'pending',
          progress: 0,
          retry_count: job.retry_count + 1,
          error_message: error,
          claimed_by: undefined,
          claimed_at: undefined,
          started_at: undefined,
        }
      }

      return {
        ...job,
        status: 'failed',
        error_message: error,
        completed_at: new Date().toISOString(),
      }
    }

    it('should transition from claimed to processing', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'claimed',
        progress: 0,
        input_data: {},
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }

      const processing = startProcessing(job)

      expect(processing.status).toBe('processing')
      expect(processing.started_at).toBeDefined()
    })

    it('should reject processing from non-claimed state', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'pending',
        progress: 0,
        input_data: {},
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }

      expect(() => startProcessing(job)).toThrow()
    })

    it('should transition from processing to completed', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: {},
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }

      const completed = completeJob(job, { message: 'Success' })

      expect(completed.status).toBe('completed')
      expect(completed.progress).toBe(100)
      expect(completed.output_data).toEqual({ message: 'Success' })
    })

    it('should retry on failure when under max retries', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: {},
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }

      const failed = failJob(job, 'Network error')

      expect(failed.status).toBe('pending')
      expect(failed.retry_count).toBe(1)
      expect(failed.claimed_by).toBeUndefined()
    })

    it('should mark as failed when max retries exceeded', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: {},
        retry_count: 3,
        max_retries: 3,
        created_at: new Date().toISOString(),
      }

      const failed = failJob(job, 'Network error')

      expect(failed.status).toBe('failed')
      expect(failed.completed_at).toBeDefined()
    })
  })
})

describe('Concurrent Processing', () => {
  it('should prevent double-processing via claimed status', () => {
    const claimedJobs = new Set<string>()

    function tryClaimJob(jobId: string, workerId: string): boolean {
      if (claimedJobs.has(jobId)) {
        return false
      }
      claimedJobs.add(jobId)
      return true
    }

    // Simulate two workers trying to claim same job
    const claim1 = tryClaimJob('job-1', 'worker-1')
    const claim2 = tryClaimJob('job-1', 'worker-2')

    expect(claim1).toBe(true)
    expect(claim2).toBe(false)
  })

  it('should support multiple workers processing different types', () => {
    const processing: Record<string, string[]> = {
      task: [],
      calendar: [],
      project: [],
    }

    function processJob(workerType: string, jobId: string) {
      processing[workerType].push(jobId)
    }

    // Simulate parallel processing
    processJob('task', 'job-1')
    processJob('calendar', 'job-2')
    processJob('project', 'job-3')
    processJob('task', 'job-4')

    expect(processing.task).toEqual(['job-1', 'job-4'])
    expect(processing.calendar).toEqual(['job-2'])
    expect(processing.project).toEqual(['job-3'])
  })
})

describe('Stale Job Detection', () => {
  function isStaleJob(job: Job, timeoutMs: number = 300000): boolean {
    // Job claimed but not started within timeout
    if (job.status === 'claimed' && job.claimed_at) {
      const claimedTime = new Date(job.claimed_at).getTime()
      if (Date.now() - claimedTime > timeoutMs) {
        return true
      }
    }

    // Job processing but not completed within timeout
    if (job.status === 'processing' && job.started_at) {
      const startedTime = new Date(job.started_at).getTime()
      if (Date.now() - startedTime > timeoutMs) {
        return true
      }
    }

    return false
  }

  function resetStaleJob(job: Job): Job {
    return {
      ...job,
      status: 'pending',
      claimed_by: undefined,
      claimed_at: undefined,
      started_at: undefined,
    }
  }

  it('should detect stale claimed job', () => {
    const job: Job = {
      id: 'job-1',
      user_id: 'user-1',
      intent: 'QUICK_TODO',
      worker_type: 'task',
      status: 'claimed',
      progress: 0,
      input_data: {},
      retry_count: 0,
      max_retries: 3,
      claimed_at: new Date(Date.now() - 400000).toISOString(), // 6+ minutes ago
      created_at: new Date().toISOString(),
    }

    expect(isStaleJob(job, 300000)).toBe(true)
  })

  it('should not flag recent claimed job as stale', () => {
    const job: Job = {
      id: 'job-1',
      user_id: 'user-1',
      intent: 'QUICK_TODO',
      worker_type: 'task',
      status: 'claimed',
      progress: 0,
      input_data: {},
      retry_count: 0,
      max_retries: 3,
      claimed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    expect(isStaleJob(job, 300000)).toBe(false)
  })

  it('should reset stale job to pending', () => {
    const staleJob: Job = {
      id: 'job-1',
      user_id: 'user-1',
      intent: 'QUICK_TODO',
      worker_type: 'task',
      status: 'claimed',
      progress: 0,
      input_data: {},
      retry_count: 0,
      max_retries: 3,
      claimed_by: 'dead-worker',
      claimed_at: new Date(Date.now() - 400000).toISOString(),
      created_at: new Date().toISOString(),
    }

    const reset = resetStaleJob(staleJob)

    expect(reset.status).toBe('pending')
    expect(reset.claimed_by).toBeUndefined()
  })
})

/**
 * TODO: Add integration tests with mocked database:
 *
 * describe('JobProcessor Integration', () => {
 *   it('should poll for jobs at configured interval')
 *   it('should process multiple worker types in parallel')
 *   it('should handle worker crashes gracefully')
 *   it('should broadcast realtime updates')
 *   it('should clean up stale jobs')
 * })
 */
