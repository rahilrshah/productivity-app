/**
 * Base Worker Class
 *
 * Abstract base class for all agent workers in the supervisor-worker pattern.
 * Workers process jobs dispatched by the orchestrator.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  AgentJob,
  WorkerType,
  WorkerResult,
  WorkerContext,
  JobOutputData,
} from '@/types/agent'
import { GraphNode } from '@/types/graph'
import { GraphIntent } from '../intentClassifier'

export abstract class BaseWorker {
  protected supabase: SupabaseClient
  protected workerId: string

  abstract readonly workerType: WorkerType
  abstract readonly supportedIntents: GraphIntent[]

  constructor(supabase: SupabaseClient, workerId?: string) {
    this.supabase = supabase
    this.workerId = workerId || `worker-${this.workerType}-${Date.now()}`
  }

  /**
   * Check if this worker can handle the given intent
   */
  canHandle(intent: string): boolean {
    return this.supportedIntents.includes(intent as GraphIntent)
  }

  /**
   * Main job processing method - must be implemented by subclasses
   */
  abstract processJob(job: AgentJob, context: WorkerContext): Promise<WorkerResult>

  /**
   * Update job progress
   */
  protected async updateProgress(
    jobId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('agent_jobs')
        .update({
          progress,
          progress_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      // Broadcast progress via realtime
      await this.broadcastEvent(jobId, 'job_progress', { progress, message })
    } catch (error) {
      console.warn('Failed to update progress:', error)
    }
  }

  /**
   * Mark job as completed
   */
  protected async completeJob(
    jobId: string,
    output: JobOutputData
  ): Promise<void> {
    try {
      await this.supabase
        .from('agent_jobs')
        .update({
          status: 'completed',
          progress: 100,
          output_data: output,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      // Broadcast completion via realtime
      await this.broadcastEvent(jobId, 'job_completed', { result: output })
    } catch (error) {
      console.warn('Failed to complete job:', error)
    }
  }

  /**
   * Mark job as failed
   */
  protected async failJob(
    jobId: string,
    error: string,
    shouldRetry: boolean = true
  ): Promise<void> {
    try {
      const { data: job } = await this.supabase
        .from('agent_jobs')
        .select('retry_count, max_retries')
        .eq('id', jobId)
        .single()

      const currentRetry = job?.retry_count || 0
      const maxRetries = job?.max_retries || 3
      const canRetry = shouldRetry && currentRetry < maxRetries

      if (canRetry) {
        // Schedule retry with exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, currentRetry), 30000)
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString()

        await this.supabase
          .from('agent_jobs')
          .update({
            status: 'pending',
            retry_count: currentRetry + 1,
            error_message: error,
            next_retry_at: nextRetryAt,
            claimed_by: null,
            claimed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
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
          .eq('id', jobId)

        // Broadcast failure via realtime
        await this.broadcastEvent(jobId, 'job_failed', {
          error,
          can_retry: false,
          retry_count: currentRetry,
        })
      }
    } catch (err) {
      console.error('Failed to mark job as failed:', err)
    }
  }

  /**
   * Broadcast event via Supabase Realtime
   */
  protected async broadcastEvent(
    jobId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Get job to find user_id for channel
      const { data: job } = await this.supabase
        .from('agent_jobs')
        .select('user_id')
        .eq('id', jobId)
        .single()

      if (job) {
        const channel = this.supabase.channel(`agent_updates:${job.user_id}`)
        await channel.send({
          type: 'broadcast',
          event: eventType,
          payload: { job_id: jobId, ...payload },
        })
      }
    } catch (error) {
      // Non-critical, log and continue
      console.warn('Failed to broadcast event:', error)
    }
  }

  /**
   * Create a task in the database
   */
  protected async createTask(
    userId: string,
    taskData: Partial<GraphNode>
  ): Promise<GraphNode> {
    const insertData = {
      user_id: userId,
      title: taskData.title || 'Untitled',
      content: taskData.content || null,
      status: taskData.status || 'pending',
      priority: 5,
      manual_priority: taskData.manual_priority || 0,
      due_date: taskData.due_date || null,
      start_date: taskData.start_date || null,
      tags: taskData.tags || [],
      parent_id: taskData.parent_id || null,
      root_id: taskData.root_id || null,
      task_type: this.categoryToTaskType(taskData.category || 'todo'),
      type_metadata: taskData.type_metadata || {},
      node_type: taskData.node_type || 'item',
      category: taskData.category || 'todo',
      duration_minutes: taskData.duration_minutes || null,
    }

    const { data, error } = await this.supabase
      .from('tasks')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`)
    }

    return data as GraphNode
  }

  /**
   * Update a task in the database
   */
  protected async updateTask(
    taskId: string,
    userId: string,
    updates: Partial<GraphNode>
  ): Promise<GraphNode> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.content !== undefined) updateData.content = updates.content
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.due_date !== undefined) updateData.due_date = updates.due_date
    if (updates.manual_priority !== undefined) updateData.manual_priority = updates.manual_priority

    const { data, error } = await this.supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`)
    }

    return data as GraphNode
  }

  /**
   * Convert category to legacy task_type
   */
  protected categoryToTaskType(category: string): string {
    const map: Record<string, string> = {
      course: 'course',
      project: 'project',
      club: 'club',
      routine: 'todo',
      journal: 'todo',
      todo: 'todo',
    }
    return map[category] || 'todo'
  }

  /**
   * Parse a date string into ISO format
   */
  protected parseDate(dateStr: string | undefined): string | null {
    if (!dateStr || dateStr === 'null') return null

    try {
      const lower = dateStr.toLowerCase()
      const today = new Date()

      if (lower === 'today') {
        return today.toISOString().split('T')[0]
      }
      if (lower === 'tomorrow') {
        today.setDate(today.getDate() + 1)
        return today.toISOString().split('T')[0]
      }
      if (lower.includes('next week')) {
        today.setDate(today.getDate() + 7)
        return today.toISOString().split('T')[0]
      }

      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
      }
    } catch {
      // Return null if parsing fails
    }

    return null
  }
}
