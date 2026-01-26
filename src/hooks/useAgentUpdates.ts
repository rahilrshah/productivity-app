'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { AgentJob, JobStatus } from '@/types/agent'

interface UseAgentUpdatesOptions {
  /** Subscribe to a specific job by ID */
  jobId?: string
  /** Subscribe to a specific thread by ID */
  threadId?: string
  /** Callback when a job starts processing */
  onJobStarted?: (job: AgentJob) => void
  /** Callback when job progress updates */
  onJobProgress?: (job: AgentJob) => void
  /** Callback when a job completes successfully */
  onJobCompleted?: (job: AgentJob) => void
  /** Callback when a job fails */
  onJobFailed?: (job: AgentJob) => void
  /** Whether to automatically reconnect on disconnect */
  autoReconnect?: boolean
}

interface UseAgentUpdatesReturn {
  /** Map of job IDs to their current state */
  jobs: Map<string, AgentJob>
  /** Whether the realtime connection is active */
  isConnected: boolean
  /** Any connection error */
  error: Error | null
  /** Get a specific job by ID */
  getJob: (jobId: string) => AgentJob | undefined
  /** Manually refresh job status from database */
  refreshJob: (jobId: string) => Promise<void>
  /** Clear all cached jobs */
  clearJobs: () => void
}

/**
 * Hook for subscribing to agent job updates via Supabase Realtime
 *
 * Usage:
 * ```tsx
 * const { jobs, isConnected, getJob } = useAgentUpdates({
 *   jobId: currentJobId,
 *   onJobCompleted: (job) => {
 *     console.log('Job completed:', job.output_data?.message)
 *   },
 *   onJobFailed: (job) => {
 *     console.error('Job failed:', job.error_message)
 *   },
 * })
 *
 * const currentJob = getJob(currentJobId)
 * if (currentJob?.status === 'processing') {
 *   return <Spinner progress={currentJob.progress} />
 * }
 * ```
 */
export function useAgentUpdates(
  options: UseAgentUpdatesOptions = {}
): UseAgentUpdatesReturn {
  const {
    jobId,
    threadId,
    onJobStarted,
    onJobProgress,
    onJobCompleted,
    onJobFailed,
    autoReconnect = true,
  } = options

  const [jobs, setJobs] = useState<Map<string, AgentJob>>(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const supabase = createClientComponentClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Callbacks ref to avoid stale closures
  const callbacksRef = useRef({
    onJobStarted,
    onJobProgress,
    onJobCompleted,
    onJobFailed,
  })

  // Update callbacks ref when they change
  useEffect(() => {
    callbacksRef.current = {
      onJobStarted,
      onJobProgress,
      onJobCompleted,
      onJobFailed,
    }
  }, [onJobStarted, onJobProgress, onJobCompleted, onJobFailed])

  /**
   * Handle job update from realtime subscription
   */
  const handleJobUpdate = useCallback((payload: { new: AgentJob; old?: AgentJob }) => {
    const job = payload.new

    setJobs(prev => {
      const newMap = new Map(prev)
      newMap.set(job.id, job)
      return newMap
    })

    // Call appropriate callback based on status change
    const oldStatus = payload.old?.status
    const newStatus = job.status

    if (oldStatus !== newStatus) {
      switch (newStatus) {
        case 'processing':
          callbacksRef.current.onJobStarted?.(job)
          break
        case 'completed':
          callbacksRef.current.onJobCompleted?.(job)
          break
        case 'failed':
          callbacksRef.current.onJobFailed?.(job)
          break
      }
    } else if (newStatus === 'processing') {
      // Progress update within processing status
      callbacksRef.current.onJobProgress?.(job)
    }
  }, [])

  /**
   * Subscribe to job updates
   */
  const subscribe = useCallback(async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError(new Error('User not authenticated'))
        return
      }

      // Build filter based on options
      let filter: string | undefined
      if (jobId) {
        filter = `id=eq.${jobId}`
      } else if (threadId) {
        filter = `thread_id=eq.${threadId}`
      } else {
        filter = `user_id=eq.${user.id}`
      }

      // Create channel for postgres changes
      const channel = supabase
        .channel(`agent_jobs:${jobId || threadId || user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'agent_jobs',
            filter,
          },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              handleJobUpdate({
                new: payload.new as AgentJob,
                old: payload.old as AgentJob | undefined,
              })
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            setError(null)
          } else if (status === 'CHANNEL_ERROR') {
            setIsConnected(false)
            setError(new Error('Channel subscription error'))

            if (autoReconnect) {
              // Schedule reconnect
              reconnectTimeoutRef.current = setTimeout(() => {
                subscribe()
              }, 5000)
            }
          } else if (status === 'CLOSED') {
            setIsConnected(false)
          }
        })

      channelRef.current = channel

    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to subscribe'))
      setIsConnected(false)
    }
  }, [supabase, jobId, threadId, handleJobUpdate, autoReconnect])

  /**
   * Unsubscribe from updates
   */
  const unsubscribe = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    setIsConnected(false)
  }, [supabase])

  /**
   * Get a specific job by ID
   */
  const getJob = useCallback((id: string): AgentJob | undefined => {
    return jobs.get(id)
  }, [jobs])

  /**
   * Manually refresh a job's status from the database
   */
  const refreshJob = useCallback(async (id: string): Promise<void> => {
    const { data: job, error: fetchError } = await supabase
      .from('agent_jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('Failed to refresh job:', fetchError)
      return
    }

    if (job) {
      setJobs(prev => {
        const newMap = new Map(prev)
        newMap.set(job.id, job as AgentJob)
        return newMap
      })
    }
  }, [supabase])

  /**
   * Clear all cached jobs
   */
  const clearJobs = useCallback(() => {
    setJobs(new Map())
  }, [])

  // Subscribe on mount, unsubscribe on unmount
  useEffect(() => {
    subscribe()

    return () => {
      unsubscribe()
    }
  }, [subscribe, unsubscribe])

  // Initial load if jobId is provided
  useEffect(() => {
    if (jobId) {
      refreshJob(jobId)
    }
  }, [jobId, refreshJob])

  return {
    jobs,
    isConnected,
    error,
    getJob,
    refreshJob,
    clearJobs,
  }
}

/**
 * Simple hook for tracking a single job's status
 */
export function useJobStatus(jobId: string | undefined): {
  job: AgentJob | undefined
  isLoading: boolean
  isCompleted: boolean
  isFailed: boolean
  progress: number
} {
  const { jobs, getJob } = useAgentUpdates({
    jobId,
    autoReconnect: true,
  })

  const job = jobId ? getJob(jobId) : undefined

  return {
    job,
    isLoading: job?.status === 'pending' || job?.status === 'claimed' || job?.status === 'processing',
    isCompleted: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    progress: job?.progress || 0,
  }
}

export default useAgentUpdates
