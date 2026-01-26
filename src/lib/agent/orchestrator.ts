/**
 * Agent Orchestrator (Supervisor)
 *
 * The orchestrator is the supervisor in the supervisor-worker pattern.
 * It receives user requests, classifies intent, and dispatches to appropriate workers.
 *
 * Responsibilities:
 * 1. Manage conversation threads
 * 2. Classify user intent
 * 3. Create and dispatch jobs to workers
 * 4. Handle slot-filling for multi-turn conversations
 */

import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { classifyGraphIntent, GraphIntent, intentToCategory } from './intentClassifier'
import {
  AgentInteractRequest,
  OrchestratorResponse,
  AgentThread,
  AgentJob,
  CreateJobDTO,
  JobInputData,
  WorkerType,
  INTENT_WORKER_MAP,
  AgentContextState,
} from '@/types/agent'
import { CreateGraphNodeDTO, GraphNode } from '@/types/graph'
import { v4 as uuidv4 } from 'uuid'

type SupabaseClient = ReturnType<typeof createRouteHandlerSupabaseClient>

export class AgentOrchestrator {
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  /**
   * Process a user request through the orchestration pipeline
   */
  async processRequest(
    request: AgentInteractRequest,
    userId: string
  ): Promise<OrchestratorResponse> {
    const { input, threadId, clientState } = request

    try {
      // 1. Get or create conversation thread
      const thread = await this.getOrCreateThread(userId, threadId)

      // 2. Save user message
      await this.saveMessage(thread.id, userId, 'user', input)

      // 3. Check for slot-filling continuation
      if (clientState?.pendingIntent && clientState?.missingFields?.length) {
        return this.handleSlotFilling(
          input,
          thread.id,
          userId,
          clientState
        )
      }

      // 4. Get container context for intent classification
      const containers = await this.getContainerContext(userId)
      const containerContext = containers
        .map(c => `- ${c.title} (${c.category}) [ID: ${c.id}]`)
        .join('\n') || 'No active containers'

      // 5. Classify intent
      const classification = await classifyGraphIntent(input, containerContext)
      const intent = classification.intent
      const entities = classification.entities

      // 6. Select worker based on intent
      const workerType = INTENT_WORKER_MAP[intent] || 'task'

      // 7. Check if we have enough data or need clarification
      const extractedData = this.buildPartialData(intent, entities, containers)
      const missingFields = this.checkMissingFields(intent, extractedData)

      if (missingFields.length > 0 && intent !== 'UNKNOWN') {
        // Need more information - return clarification request
        const question = this.buildClarificationQuestion(missingFields[0], intent)
        return {
          status: 'CLARIFICATION_NEEDED',
          threadId: thread.id,
          displayMessage: question,
          serverState: {
            pendingIntent: intent,
            partialData: extractedData,
            missingFields,
          },
        }
      }

      // 8. Create job for async processing
      const job = await this.createJob({
        user_id: userId,
        thread_id: thread.id,
        intent,
        worker_type: workerType,
        input_data: {
          user_input: input,
          entities,
          partial_data: extractedData,
          container_context: containers,
        },
      })

      // 9. For simple tasks, process synchronously
      // For complex tasks (projects, containers), process asynchronously
      if (this.shouldProcessSync(intent)) {
        const result = await this.executeSimpleTask(
          userId,
          intent,
          extractedData,
          containers
        )

        // Update job as completed
        await this.updateJobStatus(job.id, 'completed', {
          message: result.displayMessage,
          created_nodes: result.createdNodes,
        })

        return {
          status: 'SUCCESS',
          threadId: thread.id,
          jobId: job.id,
          displayMessage: result.displayMessage,
          createdNodes: result.createdNodes,
        }
      }

      // 10. Return processing status for async jobs
      return {
        status: 'PROCESSING',
        threadId: thread.id,
        jobId: job.id,
        displayMessage: 'Processing your request...',
      }

    } catch (error) {
      console.error('Orchestrator error:', error)
      return {
        status: 'ERROR',
        threadId: threadId || uuidv4(),
        displayMessage: 'Sorry, I encountered an error processing your request.',
      }
    }
  }

  /**
   * Get or create a conversation thread
   */
  private async getOrCreateThread(
    userId: string,
    threadId?: string
  ): Promise<AgentThread> {
    if (threadId) {
      // Try to get existing thread
      const { data: existingThread } = await this.supabase
        .from('agent_threads')
        .select('*')
        .eq('id', threadId)
        .eq('user_id', userId)
        .single()

      if (existingThread) {
        // Update last_message_at
        await this.supabase
          .from('agent_threads')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', threadId)

        return existingThread as AgentThread
      }
    }

    // Create new thread
    const newThread: Partial<AgentThread> = {
      id: uuidv4(),
      user_id: userId,
      status: 'active',
      message_count: 0,
      metadata: {},
      created_at: new Date().toISOString(),
    }

    const { data, error } = await this.supabase
      .from('agent_threads')
      .insert(newThread)
      .select()
      .single()

    if (error) {
      // If table doesn't exist, return a mock thread for backward compatibility
      console.warn('agent_threads table not found, using mock thread')
      return newThread as AgentThread
    }

    return data as AgentThread
  }

  /**
   * Save a message to the conversation thread
   */
  private async saveMessage(
    threadId: string,
    userId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    jobId?: string
  ): Promise<void> {
    try {
      await this.supabase.from('agent_messages').insert({
        id: uuidv4(),
        thread_id: threadId,
        user_id: userId,
        role,
        content,
        job_id: jobId,
        created_at: new Date().toISOString(),
      })

      // Update thread message count
      await this.supabase.rpc('increment_thread_message_count', {
        p_thread_id: threadId,
      }).catch(() => {
        // RPC might not exist yet
      })
    } catch (error) {
      // Non-critical error, log and continue
      console.warn('Failed to save message:', error)
    }
  }

  /**
   * Get active containers for context
   */
  private async getContainerContext(
    userId: string
  ): Promise<Array<{ id: string; title: string; category: string }>> {
    const { data: containers } = await this.supabase
      .from('tasks')
      .select('id, title, category')
      .eq('user_id', userId)
      .eq('node_type', 'container')
      .in('status', ['pending', 'active'])
      .limit(20)

    return containers?.map(c => ({
      id: c.id,
      title: c.title,
      category: c.category || 'todo',
    })) || []
  }

  /**
   * Handle slot-filling for multi-turn conversations
   */
  private async handleSlotFilling(
    input: string,
    threadId: string,
    userId: string,
    state: AgentContextState
  ): Promise<OrchestratorResponse> {
    const mergedData = { ...state.partialData }
    const missingFields = state.missingFields || []

    // Map user input to the first missing field
    if (missingFields.length > 0) {
      const field = missingFields[0]
      if (field === 'title') {
        mergedData.title = input.trim()
      } else if (field === 'due_date') {
        mergedData.due_date = this.parseDate(input)
      } else if (field === 'category') {
        mergedData.category = input.trim().toLowerCase() as CreateGraphNodeDTO['category']
      } else {
        (mergedData as Record<string, unknown>)[field] = input.trim()
      }
    }

    // Check if we still have missing fields
    const intent = state.pendingIntent as GraphIntent
    const remainingMissing = this.checkMissingFields(intent, mergedData)

    if (remainingMissing.length > 0) {
      const question = this.buildClarificationQuestion(remainingMissing[0], intent)
      return {
        status: 'CLARIFICATION_NEEDED',
        threadId,
        displayMessage: question,
        serverState: {
          pendingIntent: intent,
          partialData: mergedData,
          missingFields: remainingMissing,
        },
      }
    }

    // All data collected - execute the task
    const containers = await this.getContainerContext(userId)
    const result = await this.executeSimpleTask(userId, intent, mergedData, containers)

    return {
      status: 'SUCCESS',
      threadId,
      displayMessage: result.displayMessage,
      createdNodes: result.createdNodes,
    }
  }

  /**
   * Build partial data from extracted entities
   */
  private buildPartialData(
    intent: GraphIntent,
    entities: Record<string, string>,
    containers: Array<{ id: string; title: string; category: string }>
  ): Partial<CreateGraphNodeDTO> {
    const data: Partial<CreateGraphNodeDTO> = {}

    // Title
    if (entities.title) {
      data.title = entities.title
    }

    // Category from intent or entities
    data.category = entities.category as CreateGraphNodeDTO['category']
      || intentToCategory(intent) as CreateGraphNodeDTO['category']

    // Node type
    data.node_type = intent === 'CREATE_CONTAINER' ? 'container' : 'item'

    // Parent container
    if (entities.parent_container) {
      const match = containers.find(c =>
        c.title.toLowerCase().includes(entities.parent_container.toLowerCase())
      )
      if (match) {
        data.parent_id = match.id
      }
    }

    // Due date
    if (entities.due_date) {
      data.due_date = this.parseDate(entities.due_date)
    }

    // Priority
    if (entities.priority_hint) {
      const priorityMap: Record<string, number> = {
        high: 3,
        medium: 0,
        low: -3,
      }
      data.manual_priority = priorityMap[entities.priority_hint.toLowerCase()] || 0
    }

    return data
  }

  /**
   * Check which required fields are missing
   */
  private checkMissingFields(
    intent: GraphIntent,
    data: Partial<CreateGraphNodeDTO>
  ): string[] {
    const missing: string[] = []

    // Title is always required
    if (!data.title || data.title.trim().length === 0) {
      missing.push('title')
    }

    // For CREATE_CONTAINER, category is required
    if (intent === 'CREATE_CONTAINER' && !data.category) {
      missing.push('category')
    }

    return missing
  }

  /**
   * Build clarification question for missing field
   */
  private buildClarificationQuestion(field: string, intent: GraphIntent): string {
    const questions: Record<string, string> = {
      title: "What would you like to call this?",
      due_date: "When is this due?",
      category: "Is this a course, project, or club?",
      parent_container: "Which course or project does this belong to?",
    }

    return questions[field] || `What is the ${field.replace(/_/g, ' ')}?`
  }

  /**
   * Determine if task should be processed synchronously
   */
  private shouldProcessSync(intent: GraphIntent): boolean {
    // Simple tasks can be processed immediately
    const syncIntents: GraphIntent[] = [
      'QUICK_TODO',
      'COURSE_TASK',
      'CLUB_TASK',
      'JOURNAL',
      'ROUTINE',
    ]
    return syncIntents.includes(intent)
  }

  /**
   * Execute a simple task synchronously
   */
  private async executeSimpleTask(
    userId: string,
    intent: GraphIntent,
    data: Partial<CreateGraphNodeDTO>,
    containers: Array<{ id: string; title: string; category: string }>
  ): Promise<{ displayMessage: string; createdNodes: GraphNode[] }> {
    // Sanitize data
    const sanitize = (val: unknown) =>
      val === 'null' || val === '' || val === undefined ? null : val

    const taskData = {
      user_id: userId,
      title: data.title || 'Untitled Task',
      content: sanitize(data.content) as string | null,
      status: 'pending',
      priority: 5,
      manual_priority: data.manual_priority || 0,
      due_date: sanitize(data.due_date),
      tags: data.tags || [],
      parent_id: sanitize(data.parent_id),
      task_type: this.categoryToTaskType(data.category || 'todo'),
      type_metadata: data.type_metadata || {},
      node_type: data.node_type || 'item',
      category: data.category || 'todo',
      duration_minutes: data.duration_minutes || null,
    }

    const { data: task, error } = await this.supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`)
    }

    const parentInfo = data.parent_id && containers
      ? ` under ${containers.find(c => c.id === data.parent_id)?.title || 'parent'}`
      : ''

    const dueDateInfo = data.due_date
      ? ` (due: ${new Date(data.due_date).toLocaleDateString()})`
      : ''

    return {
      displayMessage: `Created "${task.title}"${parentInfo}${dueDateInfo}`,
      createdNodes: [task as GraphNode],
    }
  }

  /**
   * Create a job in the job queue
   */
  private async createJob(jobData: CreateJobDTO): Promise<AgentJob> {
    const job: Partial<AgentJob> = {
      id: uuidv4(),
      user_id: jobData.user_id,
      thread_id: jobData.thread_id,
      intent: jobData.intent,
      worker_type: jobData.worker_type,
      status: 'pending',
      progress: 0,
      input_data: jobData.input_data,
      retry_count: 0,
      max_retries: jobData.max_retries || 3,
      created_at: new Date().toISOString(),
    }

    const { data, error } = await this.supabase
      .from('agent_jobs')
      .insert(job)
      .select()
      .single()

    if (error) {
      // Table might not exist yet
      console.warn('Failed to create job, using in-memory:', error)
      return job as AgentJob
    }

    return data as AgentJob
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string,
    status: AgentJob['status'],
    outputData?: AgentJob['output_data']
  ): Promise<void> {
    try {
      const updates: Partial<AgentJob> = {
        status,
        updated_at: new Date().toISOString(),
      }

      if (status === 'completed') {
        updates.completed_at = new Date().toISOString()
        updates.progress = 100
      }

      if (outputData) {
        updates.output_data = outputData
      }

      await this.supabase
        .from('agent_jobs')
        .update(updates)
        .eq('id', jobId)
    } catch (error) {
      console.warn('Failed to update job status:', error)
    }
  }

  /**
   * Parse date string into ISO format
   */
  private parseDate(dateStr: string): string | undefined {
    if (!dateStr || dateStr === 'null') return undefined

    try {
      // Handle relative dates
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

      // Try to parse as date
      const parsed = new Date(dateStr)
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0]
      }
    } catch {
      // Return undefined if parsing fails
    }

    return undefined
  }

  /**
   * Convert category to legacy task_type
   */
  private categoryToTaskType(category: string): string {
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
}

/**
 * Factory function to create orchestrator with request-scoped supabase client
 */
export function createOrchestrator(): AgentOrchestrator {
  const supabase = createRouteHandlerSupabaseClient()
  return new AgentOrchestrator(supabase)
}
