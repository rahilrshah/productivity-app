/**
 * Calendar Worker
 *
 * Handles calendar and scheduling-related intents:
 * - SCHEDULE_REQUEST: Time blocking, rescheduling requests
 * - ROUTINE: Daily/weekly recurring tasks
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { BaseWorker } from './base'
import {
  AgentJob,
  WorkerType,
  WorkerResult,
  WorkerContext,
} from '@/types/agent'
import { GraphNode } from '@/types/graph'
import { GraphIntent } from '../intentClassifier'
import { getOllamaClient } from '@/lib/ollama'
import { taskService } from '@/lib/taskService'

// Maximum characters for AI input to prevent token overflow (~5k tokens)
const MAX_CHARS = 20000

export class CalendarWorker extends BaseWorker {
  readonly workerType: WorkerType = 'calendar'
  readonly supportedIntents: GraphIntent[] = [
    'SCHEDULE_REQUEST',
    'ROUTINE',
  ]

  constructor(supabase: SupabaseClient, workerId?: string) {
    super(supabase, workerId)
  }

  /**
   * Process a calendar-related job
   */
  async processJob(job: AgentJob, context: WorkerContext): Promise<WorkerResult> {
    const { input_data: inputData } = job
    const intent = job.intent as GraphIntent

    try {
      // Apply MAX_CHARS safeguard to prevent token overflow
      if (inputData.user_input && inputData.user_input.length > MAX_CHARS) {
        console.log(`CalendarWorker: Truncating input from ${inputData.user_input.length} to ${MAX_CHARS} chars`)
        inputData.user_input = inputData.user_input.substring(0, MAX_CHARS)
        await this.updateProgress(job.id, 5, 'Input truncated for processing...')
      }

      await this.updateProgress(job.id, 10, 'Analyzing scheduling request...')

      switch (intent) {
        case 'ROUTINE':
          return await this.handleRoutine(job, context)
        case 'SCHEDULE_REQUEST':
          return await this.handleScheduleRequest(job, context)
        default:
          return {
            success: false,
            message: `Unsupported intent: ${intent}`,
            error: `CalendarWorker does not support intent: ${intent}`,
          }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.failJob(job.id, errorMessage)

      return {
        success: false,
        message: `Failed to process calendar request: ${errorMessage}`,
        error: errorMessage,
      }
    }
  }

  /**
   * Handle routine (recurring task) creation
   */
  private async handleRoutine(
    job: AgentJob,
    context: WorkerContext
  ): Promise<WorkerResult> {
    const { input_data: inputData } = job
    const { entities, partial_data: partialData } = inputData

    await this.updateProgress(job.id, 30, 'Creating routine...')

    // Build routine task data
    const taskData: Partial<GraphNode> = {
      ...partialData,
      title: entities.title || partialData?.title || 'New Routine',
      category: 'routine',
      node_type: 'item',
      status: 'pending',
      type_metadata: {
        frequency: this.parseFrequency(entities.frequency || inputData.user_input),
        time_of_day: entities.time_of_day || '',
        days_of_week: this.parseDaysOfWeek(entities.days || inputData.user_input),
      },
    }

    // Set start_date (deferral date) if specified
    if (entities.start_date) {
      taskData.start_date = this.parseDate(entities.start_date) || undefined
    }

    // Set duration if specified
    if (entities.duration) {
      taskData.duration_minutes = this.parseDuration(entities.duration)
    }

    const task = await this.createTask(context.userId, taskData)

    await this.updateProgress(job.id, 90, 'Finalizing routine...')

    const message = `Created routine "${task.title}"`

    await this.completeJob(job.id, {
      message,
      created_nodes: [task],
    })

    return {
      success: true,
      message,
      created_nodes: [task],
    }
  }

  /**
   * Handle scheduling request
   */
  private async handleScheduleRequest(
    job: AgentJob,
    context: WorkerContext
  ): Promise<WorkerResult> {
    const { input_data: inputData } = job
    const { entities, partial_data: partialData } = inputData

    await this.updateProgress(job.id, 30, 'Processing schedule request...')

    // Determine action type
    const action = this.parseScheduleAction(inputData.user_input, entities)

    switch (action.type) {
      case 'block_time':
        return await this.handleTimeBlock(job, context, action)
      case 'reschedule':
        return await this.handleReschedule(job, context, action)
      case 'find_slot':
        return await this.handleFindSlot(job, context, action)
      default:
        // Create a simple scheduled task
        return await this.handleCreateScheduledTask(job, context, entities)
    }
  }

  /**
   * Handle time blocking
   */
  private async handleTimeBlock(
    job: AgentJob,
    context: WorkerContext,
    action: ScheduleAction
  ): Promise<WorkerResult> {
    const taskData: Partial<GraphNode> = {
      title: action.title || 'Time Block',
      category: 'todo',
      node_type: 'item',
      status: 'pending',
      scheduled_for: action.date,
      duration_minutes: action.duration || 60,
      type_metadata: {
        scheduled_time: action.time,
        time_block: true,
      },
    }

    const task = await this.createTask(context.userId, taskData)

    const message = `Blocked time for "${task.title}" on ${new Date(action.date || '').toLocaleDateString()}`

    await this.completeJob(job.id, {
      message,
      created_nodes: [task],
    })

    return {
      success: true,
      message,
      created_nodes: [task],
    }
  }

  /**
   * Handle rescheduling
   */
  private async handleReschedule(
    job: AgentJob,
    context: WorkerContext,
    action: ScheduleAction
  ): Promise<WorkerResult> {
    if (!action.taskId) {
      return {
        success: false,
        message: 'Which task would you like to reschedule?',
        needs_clarification: true,
        missing_fields: ['task_id'],
      }
    }

    await this.updateProgress(job.id, 50, 'Rescheduling task...')

    const updatedTask = await this.updateTask(action.taskId, context.userId, {
      due_date: action.date,
      scheduled_for: action.date,
    })

    const message = `Rescheduled "${updatedTask.title}" to ${new Date(action.date || '').toLocaleDateString()}`

    await this.completeJob(job.id, {
      message,
      updated_nodes: [updatedTask],
    })

    return {
      success: true,
      message,
      updated_nodes: [updatedTask],
    }
  }

  /**
   * Handle finding available time slot
   */
  private async handleFindSlot(
    job: AgentJob,
    context: WorkerContext,
    action: ScheduleAction
  ): Promise<WorkerResult> {
    await this.updateProgress(job.id, 50, 'Searching for available time...')

    // Get existing scheduled tasks for the target date range
    const startDate = action.date || new Date().toISOString().split('T')[0]
    const endDate = new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]

    const { data: existingTasks } = await this.supabase
      .from('tasks')
      .select('scheduled_for, duration_minutes, title')
      .eq('user_id', context.userId)
      .gte('scheduled_for', startDate)
      .lte('scheduled_for', endDate)
      .not('scheduled_for', 'is', null)

    // Find available slots (simplified algorithm)
    const suggestedSlots = this.findAvailableSlots(
      existingTasks || [],
      action.duration || 60,
      startDate
    )

    const message = suggestedSlots.length > 0
      ? `Found ${suggestedSlots.length} available slots: ${suggestedSlots.slice(0, 3).join(', ')}`
      : 'No available slots found in the next week'

    await this.completeJob(job.id, {
      message,
      suggested_actions: suggestedSlots.map(slot => ({
        type: 'schedule' as const,
        description: `Schedule for ${slot}`,
        payload: { date: slot },
      })),
    })

    return {
      success: true,
      message,
    }
  }

  /**
   * Create a scheduled task
   */
  private async handleCreateScheduledTask(
    job: AgentJob,
    context: WorkerContext,
    entities: Record<string, string>
  ): Promise<WorkerResult> {
    const { partial_data: partialData } = job.input_data

    const taskData: Partial<GraphNode> = {
      ...partialData,
      title: entities.title || partialData?.title || 'Scheduled Task',
      category: 'todo',
      node_type: 'item',
      status: 'pending',
      scheduled_for: this.parseDate(entities.date) || undefined,
      due_date: this.parseDate(entities.due_date) || undefined,
      duration_minutes: this.parseDuration(entities.duration),
    }

    const task = await this.createTask(context.userId, taskData)

    const dateInfo = task.scheduled_for
      ? ` scheduled for ${new Date(task.scheduled_for).toLocaleDateString()}`
      : ''
    const message = `Created "${task.title}"${dateInfo}`

    await this.completeJob(job.id, {
      message,
      created_nodes: [task],
    })

    return {
      success: true,
      message,
      created_nodes: [task],
    }
  }

  /**
   * Parse frequency from text
   */
  private parseFrequency(text: string): 'daily' | 'weekly' | 'monthly' {
    const lower = text.toLowerCase()
    if (lower.includes('daily') || lower.includes('every day')) {
      return 'daily'
    }
    if (lower.includes('monthly') || lower.includes('every month')) {
      return 'monthly'
    }
    return 'weekly' // Default
  }

  /**
   * Parse days of week from text
   */
  private parseDaysOfWeek(text: string): string[] {
    const days: string[] = []
    const lower = text.toLowerCase()

    const dayMap: Record<string, string> = {
      monday: 'mon', tuesday: 'tue', wednesday: 'wed',
      thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun',
      mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun',
    }

    for (const [dayName, dayCode] of Object.entries(dayMap)) {
      if (lower.includes(dayName)) {
        if (!days.includes(dayCode)) {
          days.push(dayCode)
        }
      }
    }

    // Check for "weekdays" or "weekends"
    if (lower.includes('weekday')) {
      return ['mon', 'tue', 'wed', 'thu', 'fri']
    }
    if (lower.includes('weekend')) {
      return ['sat', 'sun']
    }
    if (lower.includes('every day') || lower.includes('daily')) {
      return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    }

    return days
  }

  /**
   * Parse duration from text (returns minutes)
   */
  private parseDuration(text: string | undefined): number | undefined {
    if (!text) return undefined

    const lower = text.toLowerCase()

    // Match patterns like "30 minutes", "1 hour", "1.5 hours"
    const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*h(?:our)?s?/i)
    if (hourMatch) {
      return Math.round(parseFloat(hourMatch[1]) * 60)
    }

    const minMatch = lower.match(/(\d+)\s*m(?:in(?:ute)?s?)?/i)
    if (minMatch) {
      return parseInt(minMatch[1], 10)
    }

    return undefined
  }

  /**
   * Parse scheduling action from user input
   */
  private parseScheduleAction(
    text: string,
    entities: Record<string, string>
  ): ScheduleAction {
    const lower = text.toLowerCase()

    if (lower.includes('reschedule') || lower.includes('move')) {
      return {
        type: 'reschedule',
        taskId: entities.task_id,
        date: this.parseDate(entities.new_date || entities.date) || undefined,
      }
    }

    if (lower.includes('block') || lower.includes('reserve')) {
      return {
        type: 'block_time',
        title: entities.title || 'Time Block',
        date: this.parseDate(entities.date) || undefined,
        time: entities.time,
        duration: this.parseDuration(entities.duration),
      }
    }

    if (lower.includes('find') && (lower.includes('time') || lower.includes('slot'))) {
      return {
        type: 'find_slot',
        date: this.parseDate(entities.date) || undefined,
        duration: this.parseDuration(entities.duration) || 60,
      }
    }

    return {
      type: 'create',
      title: entities.title,
      date: this.parseDate(entities.date) || undefined,
    }
  }

  /**
   * Find available time slots (simplified)
   */
  private findAvailableSlots(
    existingTasks: Array<{ scheduled_for: string; duration_minutes: number; title: string }>,
    duration: number,
    startDate: string
  ): string[] {
    const slots: string[] = []
    const start = new Date(startDate)

    // Check next 7 days
    for (let day = 0; day < 7; day++) {
      const date = new Date(start)
      date.setDate(date.getDate() + day)
      const dateStr = date.toISOString().split('T')[0]

      // Check if this day has few tasks scheduled
      const dayTasks = existingTasks.filter(t =>
        t.scheduled_for && t.scheduled_for.startsWith(dateStr)
      )

      if (dayTasks.length < 5) {
        slots.push(dateStr)
      }
    }

    return slots
  }
}

interface ScheduleAction {
  type: 'block_time' | 'reschedule' | 'find_slot' | 'create'
  taskId?: string
  title?: string
  date?: string
  time?: string
  duration?: number
}

interface BatchEvent {
  title: string
  date?: string
  time?: string
  type?: string
  duration_minutes?: number
}

/**
 * Batch import handler for importing multiple events from calendar data
 * Includes context truncation safeguard and batch processing
 */
export async function handleBatchImport(
  job: AgentJob,
  context: WorkerContext,
  supabase: SupabaseClient,
  updateProgress: (jobId: string, progress: number, message?: string) => Promise<void>,
  completeJob: (jobId: string, output: { message: string; created_nodes?: GraphNode[] }) => Promise<void>
): Promise<WorkerResult> {
  let safeInput = job.input_data.user_input

  // Context Safeguard: Truncate long inputs to prevent token overflow
  if (safeInput.length > MAX_CHARS) {
    await updateProgress(job.id, 10, 'Input too long, truncating...')
    safeInput = safeInput.substring(0, MAX_CHARS)
    console.log(`CalendarWorker: Truncated input from ${job.input_data.user_input.length} to ${MAX_CHARS} chars`)
  }

  await updateProgress(job.id, 20, 'AI extracting events...')

  try {
    // Use JSON format for reliable extraction
    const ollamaClient = getOllamaClient()
    const systemPrompt = `You are an expert at extracting calendar events from text.
Extract all events/tasks with dates from the provided text.
Return a JSON object with an "events" array containing objects with:
- title: Event/task name
- date: ISO date string (YYYY-MM-DD) if mentioned
- time: Time in HH:MM format if mentioned
- type: One of "exam", "assignment", "meeting", "task", "event"
- duration_minutes: Duration in minutes if mentioned

Example response:
{"events": [{"title": "CS101 Midterm", "date": "2025-03-15", "type": "exam"}]}

If no events are found, return {"events": []}`

    const response = await ollamaClient.chat('llama3.1:8b', [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract events from this text:\n\n${safeInput}` }
    ], { format: 'json', temperature: 0.2 })

    if ('message' in response && response.message?.content) {
      let events: BatchEvent[] = []

      try {
        const parsed = JSON.parse(response.message.content)
        events = parsed.events || []
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError)
        return {
          success: false,
          message: 'Failed to parse events from input',
          error: 'JSON parse error',
        }
      }

      if (events.length === 0) {
        await completeJob(job.id, {
          message: 'No events found in the input',
        })
        return {
          success: true,
          message: 'No events found in the input',
        }
      }

      await updateProgress(job.id, 50, `Creating ${events.length} tasks...`)

      // Prepare batch tasks
      const tasks = events.map((evt: BatchEvent) => ({
        user_id: context.userId,
        title: evt.title,
        due_date: evt.date,
        category: evt.type === 'exam' ? 'course' as const : 'todo' as const,
        node_type: 'item' as const,
        status: 'pending',
        type_metadata: {
          source: 'batch_import',
          original_type: evt.type,
          scheduled_time: evt.time,
        },
        duration_minutes: evt.duration_minutes,
      }))

      // Batch insert using TaskService
      let created: GraphNode[] = []
      try {
        created = await taskService.createTasksBatch(tasks) as GraphNode[]
      } catch (batchError) {
        console.error('Batch creation failed, falling back to individual inserts:', batchError)

        // Fallback to individual inserts
        for (const task of tasks) {
          try {
            const { data, error } = await supabase
              .from('tasks')
              .insert({
                ...task,
                priority: 5,
                tags: [],
              })
              .select()
              .single()

            if (!error && data) {
              created.push(data as GraphNode)
            }
          } catch (insertError) {
            console.error(`Failed to create task "${task.title}":`, insertError)
          }
        }
      }

      await updateProgress(job.id, 90, 'Finalizing import...')

      const message = `Imported ${created.length} events`
      await completeJob(job.id, {
        message,
        created_nodes: created,
      })

      return {
        success: true,
        message,
        created_nodes: created,
      }
    }

    return {
      success: false,
      message: 'Invalid AI response format',
      error: 'No message content in response',
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Failed to process batch import: ${errorMessage}`,
      error: errorMessage,
    }
  }
}
