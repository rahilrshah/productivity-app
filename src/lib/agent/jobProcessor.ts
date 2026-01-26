/**
 * Job Processor
 *
 * Background processor that claims and processes jobs from the queue.
 * Uses atomic job claiming with SELECT FOR UPDATE SKIP LOCKED pattern.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { BaseWorker } from './workers/base'
import { TaskWorker } from './workers/task'
import { CalendarWorker } from './workers/calendar'
import { ProjectWorker } from './workers/project'
import { AgentJob, WorkerType, WorkerContext } from '@/types/agent'
import { createAdminClient } from '@/lib/supabase/admin'

interface JobProcessorConfig {
  pollIntervalMs?: number
  maxConcurrentJobs?: number
  workerId?: string
}

/**
 * JobProcessor handles background processing of agent jobs
 *
 * Usage:
 * ```ts
 * const processor = new JobProcessor(config)
 * await processor.start()
 * // ... when shutting down:
 * await processor.stop()
 * ```
 */
export class JobProcessor {
  private supabase: SupabaseClient
  private workers: Map<WorkerType, BaseWorker>
  private isRunning: boolean = false
  private pollIntervalMs: number
  private maxConcurrentJobs: number
  private workerId: string
  private activeJobs: Set<string> = new Set()
  private pollTimeout: NodeJS.Timeout | null = null

  constructor(config: JobProcessorConfig = {}) {
    // Create Supabase client using service role for background processing
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration for job processor')
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })

    this.pollIntervalMs = config.pollIntervalMs || 1000
    this.maxConcurrentJobs = config.maxConcurrentJobs || 5
    this.workerId = config.workerId || `processor-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Initialize workers
    this.workers = new Map<WorkerType, BaseWorker>([
      ['task', new TaskWorker(this.supabase, this.workerId)],
      ['calendar', new CalendarWorker(this.supabase, this.workerId)],
      ['project', new ProjectWorker(this.supabase, this.workerId)],
    ])
  }

  /**
   * Start the job processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('JobProcessor is already running')
      return
    }

    this.isRunning = true
    console.log(`JobProcessor ${this.workerId} starting...`)

    this.poll()
  }

  /**
   * Stop the job processor gracefully
   */
  async stop(): Promise<void> {
    this.isRunning = false

    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout)
      this.pollTimeout = null
    }

    // Wait for active jobs to complete (with timeout)
    const maxWaitMs = 30000
    const startTime = Date.now()

    while (this.activeJobs.size > 0 && Date.now() - startTime < maxWaitMs) {
      console.log(`Waiting for ${this.activeJobs.size} active jobs to complete...`)
      await this.sleep(1000)
    }

    if (this.activeJobs.size > 0) {
      console.warn(`Stopping with ${this.activeJobs.size} jobs still active`)
    }

    console.log(`JobProcessor ${this.workerId} stopped`)
  }

  /**
   * Poll for pending jobs
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return

    try {
      // Only poll if we have capacity
      if (this.activeJobs.size < this.maxConcurrentJobs) {
        await this.processNextJobs()
      }
    } catch (error) {
      console.error('Error in job polling:', error)
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollTimeout = setTimeout(() => this.poll(), this.pollIntervalMs)
    }
  }

  /**
   * Claim and process next available jobs
   */
  private async processNextJobs(): Promise<void> {
    const availableSlots = this.maxConcurrentJobs - this.activeJobs.size

    for (let i = 0; i < availableSlots; i++) {
      // Try to claim a job for each worker type
      for (const [workerType, worker] of this.workers) {
        const job = await this.claimNextJob(workerType)

        if (job) {
          this.processJobAsync(job, worker)
          break // Only process one job per poll iteration per slot
        }
      }
    }
  }

  /**
   * Claim the next pending job for a specific worker type
   * Uses database-level locking for concurrent worker safety
   */
  private async claimNextJob(workerType: WorkerType): Promise<AgentJob | null> {
    try {
      // Use RPC function for atomic job claiming
      const { data: job, error } = await this.supabase.rpc('claim_next_job', {
        p_worker_type: workerType,
        p_worker_id: this.workerId,
      })

      if (error) {
        // RPC might not exist yet - fall back to manual claiming
        if (error.code === '42883') {
          return await this.claimNextJobManual(workerType)
        }
        console.error('Error claiming job:', error)
        return null
      }

      return job as AgentJob | null

    } catch (error) {
      console.error('Error in claimNextJob:', error)
      return null
    }
  }

  /**
   * Manual job claiming fallback (less safe for concurrent workers)
   */
  private async claimNextJobManual(workerType: WorkerType): Promise<AgentJob | null> {
    // Find pending job
    const { data: pendingJobs, error: findError } = await this.supabase
      .from('agent_jobs')
      .select('*')
      .eq('status', 'pending')
      .eq('worker_type', workerType)
      .or('next_retry_at.is.null,next_retry_at.lte.now()')
      .order('created_at', { ascending: true })
      .limit(1)

    if (findError || !pendingJobs || pendingJobs.length === 0) {
      return null
    }

    const job = pendingJobs[0]

    // Try to claim it
    const { data: claimedJob, error: claimError } = await this.supabase
      .from('agent_jobs')
      .update({
        status: 'claimed',
        claimed_by: this.workerId,
        claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'pending') // Ensure it's still pending
      .select()
      .single()

    if (claimError || !claimedJob) {
      // Job was claimed by another worker
      return null
    }

    return claimedJob as AgentJob
  }

  /**
   * Process a claimed job asynchronously
   */
  private async processJobAsync(job: AgentJob, worker: BaseWorker): Promise<void> {
    this.activeJobs.add(job.id)

    try {
      // Mark job as processing
      await this.supabase
        .from('agent_jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      // Build worker context
      const context = await this.buildWorkerContext(job)

      // Process the job
      const result = await worker.processJob(job, context)

      // Note: Worker handles marking job as completed/failed

      if (!result.success) {
        console.warn(`Job ${job.id} processing returned failure:`, result.message)
      }

    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error)

      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.handleJobFailure(job, errorMessage)

    } finally {
      this.activeJobs.delete(job.id)
    }
  }

  /**
   * Build context for worker
   */
  private async buildWorkerContext(job: AgentJob): Promise<WorkerContext> {
    // Get user's containers for context
    const { data: containers } = await this.supabase
      .from('tasks')
      .select('id, title, category')
      .eq('user_id', job.user_id)
      .eq('node_type', 'container')
      .in('status', ['pending', 'active'])
      .limit(20)

    return {
      userId: job.user_id,
      threadId: job.thread_id || undefined,
      containers: containers?.map(c => ({
        id: c.id,
        title: c.title,
        category: c.category || 'todo',
      })) || [],
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(job: AgentJob, error: string): Promise<void> {
    const canRetry = job.retry_count < job.max_retries

    if (canRetry) {
      // Schedule retry with exponential backoff
      const backoffMs = Math.min(1000 * Math.pow(2, job.retry_count), 30000)
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString()

      await this.supabase
        .from('agent_jobs')
        .update({
          status: 'pending',
          retry_count: job.retry_count + 1,
          error_message: error,
          next_retry_at: nextRetryAt,
          claimed_by: null,
          claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

    } else {
      // Permanent failure
      await this.supabase
        .from('agent_jobs')
        .update({
          status: 'failed',
          error_message: error,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    }
  }

  /**
   * Janitor function: Resets jobs stuck in 'claimed'/'processing' for > 5 minutes.
   * Implements retry logic: increment retry_count, fail permanently after 3 retries.
   *
   * This function should be called before processing new jobs to clean up stale state.
   *
   * @returns Number of jobs that were cleaned up
   */
  async cleanupStaleJobs(): Promise<number> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    let cleanedCount = 0

    try {
      // 1. Permanently fail jobs that exceeded 3 retries
      const { data: failedJobs, error: failError } = await this.supabase
        .from('agent_jobs')
        .update({
          status: 'failed',
          error_message: 'Job failed after 3 retries (timeout).',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('status', ['claimed', 'processing'])
        .lt('updated_at', fiveMinutesAgo)
        .gte('retry_count', 3)
        .select('id')

      if (failError) {
        console.error('Error failing stale jobs:', failError)
      } else {
        cleanedCount += failedJobs?.length || 0
        if (failedJobs?.length) {
          console.log(`Janitor: Failed ${failedJobs.length} jobs that exceeded retry limit`)
        }
      }

      // 2. Get jobs that need retry (have retries left)
      const { data: jobsToRetry, error: fetchError } = await this.supabase
        .from('agent_jobs')
        .select('id, retry_count')
        .in('status', ['claimed', 'processing'])
        .lt('updated_at', fiveMinutesAgo)
        .lt('retry_count', 3)

      if (fetchError) {
        console.error('Error fetching stale jobs for retry:', fetchError)
        return cleanedCount
      }

      // 3. Reset each job for retry with exponential backoff
      if (jobsToRetry?.length) {
        for (const job of jobsToRetry) {
          const newRetryCount = job.retry_count + 1
          const backoffMs = Math.min(1000 * Math.pow(2, job.retry_count), 30000)
          const nextRetryAt = new Date(Date.now() + backoffMs).toISOString()

          const { error: updateError } = await this.supabase
            .from('agent_jobs')
            .update({
              status: 'pending',
              retry_count: newRetryCount,
              next_retry_at: nextRetryAt,
              error_message: `Timeout. Retry attempt ${newRetryCount}/3`,
              claimed_by: null,
              claimed_at: null,
              started_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)

          if (updateError) {
            console.error(`Error resetting job ${job.id} for retry:`, updateError)
          } else {
            cleanedCount++
          }
        }

        console.log(`Janitor: Reset ${jobsToRetry.length} stale jobs for retry`)
      }

    } catch (error) {
      console.error('Error in cleanupStaleJobs:', error)
    }

    return cleanedCount
  }

  /**
   * Get processor status
   */
  getStatus(): {
    running: boolean
    workerId: string
    activeJobs: number
    workers: string[]
  } {
    return {
      running: this.isRunning,
      workerId: this.workerId,
      activeJobs: this.activeJobs.size,
      workers: Array.from(this.workers.keys()),
    }
  }

  /**
   * Process a single job immediately (for testing or synchronous processing)
   */
  async processJobImmediate(jobId: string): Promise<void> {
    const { data: job, error } = await this.supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error || !job) {
      throw new Error(`Job not found: ${jobId}`)
    }

    const worker = this.workers.get(job.worker_type as WorkerType)
    if (!worker) {
      throw new Error(`No worker for type: ${job.worker_type}`)
    }

    const context = await this.buildWorkerContext(job as AgentJob)
    await worker.processJob(job as AgentJob, context)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Singleton instance for global processor
let globalProcessor: JobProcessor | null = null

/**
 * Get or create the global job processor
 */
export function getJobProcessor(config?: JobProcessorConfig): JobProcessor {
  if (!globalProcessor) {
    globalProcessor = new JobProcessor(config)
  }
  return globalProcessor
}

/**
 * Process pending jobs (for serverless/edge function invocation)
 *
 * This function runs the janitor cleanup first to handle stale jobs,
 * then processes pending jobs up to the specified limit.
 */
export async function processPendingJobs(maxJobs: number = 10): Promise<number> {
  let processed = 0

  // Use admin client for privileged access (bypasses RLS)
  const supabase = createAdminClient()

  // Run Janitor cleanup FIRST - clean up stale jobs before processing new ones
  try {
    const processor = getJobProcessor()
    const cleaned = await processor.cleanupStaleJobs()
    if (cleaned > 0) {
      console.log(`Janitor cleaned ${cleaned} stale jobs`)
    }
  } catch (cleanupError) {
    console.error('Janitor cleanup error (non-fatal):', cleanupError)
    // Continue processing even if cleanup fails
  }

  const workers = new Map<WorkerType, BaseWorker>([
    ['task', new TaskWorker(supabase)],
    ['calendar', new CalendarWorker(supabase)],
    ['project', new ProjectWorker(supabase)],
  ])

  // Get pending jobs
  const { data: jobs } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('status', 'pending')
    .or('next_retry_at.is.null,next_retry_at.lte.now()')
    .order('created_at', { ascending: true })
    .limit(maxJobs)

  if (!jobs || jobs.length === 0) {
    return 0
  }

  // Process each job
  for (const job of jobs) {
    const worker = workers.get(job.worker_type as WorkerType)
    if (!worker) continue

    try {
      // Claim job
      const { error: claimError } = await supabase
        .from('agent_jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', job.id)
        .eq('status', 'pending')

      if (claimError) continue

      // Get containers for context
      const { data: containers } = await supabase
        .from('tasks')
        .select('id, title, category')
        .eq('user_id', job.user_id)
        .eq('node_type', 'container')
        .in('status', ['pending', 'active'])
        .limit(20)

      const context: WorkerContext = {
        userId: job.user_id,
        threadId: job.thread_id || undefined,
        containers: containers?.map(c => ({
          id: c.id,
          title: c.title,
          category: c.category || 'todo',
        })) || [],
      }

      await worker.processJob(job as AgentJob, context)
      processed++

    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error)
    }
  }

  return processed
}
