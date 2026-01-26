/**
 * Task Worker
 *
 * Handles task-related intents:
 * - QUICK_TODO: Simple one-off tasks
 * - COURSE_TASK: Academic tasks and assignments
 * - CLUB_TASK: Club-related activities
 * - JOURNAL: Journal entries and reflections
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { BaseWorker } from './base'
import {
  AgentJob,
  WorkerType,
  WorkerResult,
  WorkerContext,
} from '@/types/agent'
import { GraphNode, CreateGraphNodeDTO } from '@/types/graph'
import { GraphIntent } from '../intentClassifier'

export class TaskWorker extends BaseWorker {
  readonly workerType: WorkerType = 'task'
  readonly supportedIntents: GraphIntent[] = [
    'QUICK_TODO',
    'COURSE_TASK',
    'CLUB_TASK',
    'JOURNAL',
  ]

  constructor(supabase: SupabaseClient, workerId?: string) {
    super(supabase, workerId)
  }

  /**
   * Process a task-related job
   */
  async processJob(job: AgentJob, context: WorkerContext): Promise<WorkerResult> {
    const { input_data: inputData } = job
    const intent = job.intent as GraphIntent

    try {
      await this.updateProgress(job.id, 10, 'Analyzing request...')

      // Build task data from input
      const taskData = this.buildTaskData(intent, inputData, context)

      // Check for missing required fields
      if (!taskData.title || taskData.title.trim().length === 0) {
        return {
          success: false,
          message: 'Task title is required',
          needs_clarification: true,
          missing_fields: ['title'],
        }
      }

      await this.updateProgress(job.id, 50, 'Creating task...')

      // Create the task
      const task = await this.createTask(context.userId, taskData)

      await this.updateProgress(job.id, 90, 'Finalizing...')

      // Build success message
      const parentInfo = task.parent_id && context.containers
        ? ` under ${context.containers.find(c => c.id === task.parent_id)?.title || 'parent'}`
        : ''
      const dueDateInfo = task.due_date
        ? ` (due: ${new Date(task.due_date).toLocaleDateString()})`
        : ''

      const message = `Created "${task.title}"${parentInfo}${dueDateInfo}`

      await this.completeJob(job.id, {
        message,
        created_nodes: [task],
      })

      return {
        success: true,
        message,
        created_nodes: [task],
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.failJob(job.id, errorMessage)

      return {
        success: false,
        message: `Failed to create task: ${errorMessage}`,
        error: errorMessage,
      }
    }
  }

  /**
   * Build task data from job input
   */
  private buildTaskData(
    intent: GraphIntent,
    inputData: AgentJob['input_data'],
    context: WorkerContext
  ): Partial<GraphNode> {
    const { entities, partial_data: partialData } = inputData

    // Start with partial data if available
    const data: Partial<GraphNode> = { ...partialData }

    // Title from entities or partial data
    if (!data.title && entities.title) {
      data.title = entities.title
    }

    // Category from intent
    data.category = this.intentToCategory(intent)
    data.node_type = 'item'

    // Find parent container if referenced
    if (!data.parent_id && entities.parent_container && context.containers) {
      const match = context.containers.find(c =>
        c.title.toLowerCase().includes(entities.parent_container.toLowerCase())
      )
      if (match) {
        data.parent_id = match.id
        // Inherit root_id from parent if it's a container
        data.root_id = match.id
      }
    }

    // Due date from entities
    if (!data.due_date && entities.due_date) {
      data.due_date = this.parseDate(entities.due_date) || undefined
    }

    // Priority from hint
    if (entities.priority_hint) {
      const priorityMap: Record<string, number> = {
        high: 5,
        medium: 0,
        low: -5,
      }
      data.manual_priority = priorityMap[entities.priority_hint.toLowerCase()] || 0
    }

    // Intent-specific metadata
    data.type_metadata = this.buildTypeMetadata(intent, entities)

    return data
  }

  /**
   * Convert intent to category
   */
  private intentToCategory(intent: GraphIntent): GraphNode['category'] {
    const map: Record<GraphIntent, GraphNode['category']> = {
      QUICK_TODO: 'todo',
      COURSE_TASK: 'course',
      CLUB_TASK: 'club',
      JOURNAL: 'journal',
      PROJECT_TASK: 'project',
      CREATE_CONTAINER: 'project',
      ROUTINE: 'routine',
      SCHEDULE_REQUEST: 'todo',
      UNKNOWN: 'todo',
    }
    return map[intent] || 'todo'
  }

  /**
   * Build type-specific metadata
   */
  private buildTypeMetadata(
    intent: GraphIntent,
    entities: Record<string, string>
  ): Record<string, unknown> {
    switch (intent) {
      case 'COURSE_TASK':
        return {
          course_code: entities.course_code || '',
          semester: entities.semester || '',
          assignment_type: entities.assignment_type || 'task',
        }

      case 'CLUB_TASK':
        return {
          club_name: entities.club_name || '',
          event_type: entities.event_type || '',
        }

      case 'JOURNAL':
        return {
          mood: entities.mood || '',
          is_private: true,
        }

      default:
        return {
          category: 'general',
        }
    }
  }

  /**
   * Process batch task creation
   */
  async processBatch(
    job: AgentJob,
    context: WorkerContext,
    tasks: Array<Partial<CreateGraphNodeDTO>>
  ): Promise<WorkerResult> {
    const createdNodes: GraphNode[] = []
    const errors: string[] = []

    let progress = 10
    const progressIncrement = 80 / tasks.length

    for (const taskData of tasks) {
      try {
        await this.updateProgress(
          job.id,
          Math.round(progress),
          `Creating task ${createdNodes.length + 1} of ${tasks.length}...`
        )

        const task = await this.createTask(context.userId, taskData)
        createdNodes.push(task)
        progress += progressIncrement

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Failed to create "${taskData.title}": ${errorMessage}`)
      }
    }

    const message = errors.length > 0
      ? `Created ${createdNodes.length} tasks with ${errors.length} errors`
      : `Created ${createdNodes.length} tasks`

    if (createdNodes.length > 0) {
      await this.completeJob(job.id, {
        message,
        created_nodes: createdNodes,
      })

      return {
        success: true,
        message,
        created_nodes: createdNodes,
      }
    } else {
      await this.failJob(job.id, errors.join('; '))

      return {
        success: false,
        message: 'Failed to create any tasks',
        error: errors.join('; '),
      }
    }
  }
}
