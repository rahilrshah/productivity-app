/**
 * Project Worker
 *
 * Handles project-related intents:
 * - PROJECT_TASK: Project milestones, features, tasks
 * - CREATE_CONTAINER: Creating new courses, projects, or clubs
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { BaseWorker } from './base'
import {
  AgentJob,
  WorkerType,
  WorkerResult,
  WorkerContext,
} from '@/types/agent'
import { GraphNode, TaskCategory } from '@/types/graph'
import { GraphIntent } from '../intentClassifier'

export class ProjectWorker extends BaseWorker {
  readonly workerType: WorkerType = 'project'
  readonly supportedIntents: GraphIntent[] = [
    'PROJECT_TASK',
    'CREATE_CONTAINER',
  ]

  constructor(supabase: SupabaseClient, workerId?: string) {
    super(supabase, workerId)
  }

  /**
   * Process a project-related job
   */
  async processJob(job: AgentJob, context: WorkerContext): Promise<WorkerResult> {
    const intent = job.intent as GraphIntent

    try {
      await this.updateProgress(job.id, 10, 'Analyzing project request...')

      switch (intent) {
        case 'CREATE_CONTAINER':
          return await this.handleCreateContainer(job, context)
        case 'PROJECT_TASK':
          return await this.handleProjectTask(job, context)
        default:
          return {
            success: false,
            message: `Unsupported intent: ${intent}`,
            error: `ProjectWorker does not support intent: ${intent}`,
          }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.failJob(job.id, errorMessage)

      return {
        success: false,
        message: `Failed to process project request: ${errorMessage}`,
        error: errorMessage,
      }
    }
  }

  /**
   * Handle container (course/project/club) creation
   */
  private async handleCreateContainer(
    job: AgentJob,
    context: WorkerContext
  ): Promise<WorkerResult> {
    const { input_data: inputData } = job
    const { entities, partial_data: partialData } = inputData

    await this.updateProgress(job.id, 20, 'Determining container type...')

    // Determine category from entities or input
    const category = this.determineCategory(inputData.user_input, entities)

    if (!category) {
      return {
        success: false,
        message: 'Is this a course, project, or club?',
        needs_clarification: true,
        missing_fields: ['category'],
      }
    }

    await this.updateProgress(job.id, 40, `Creating ${category}...`)

    // Build container data
    const containerData: Partial<GraphNode> = {
      ...partialData,
      title: entities.title || partialData?.title || `New ${this.capitalizeFirst(category)}`,
      category: category,
      node_type: 'container',
      status: 'active',
      type_metadata: this.buildContainerMetadata(category, entities),
    }

    // Set dates if provided
    if (entities.start_date) {
      containerData.start_date = this.parseDate(entities.start_date) || undefined
    }
    if (entities.due_date || entities.end_date) {
      containerData.due_date = this.parseDate(entities.due_date || entities.end_date) || undefined
    }

    const container = await this.createTask(context.userId, containerData)

    await this.updateProgress(job.id, 60, 'Container created...')

    // Optionally create initial items for the container
    const createdNodes: GraphNode[] = [container]

    if (entities.initial_items || entities.subtasks) {
      const items = this.parseInitialItems(
        entities.initial_items || entities.subtasks,
        category
      )

      await this.updateProgress(job.id, 70, `Creating ${items.length} items...`)

      for (const itemData of items) {
        try {
          const item = await this.createTask(context.userId, {
            ...itemData,
            parent_id: container.id,
            root_id: container.id,
          })
          createdNodes.push(item)
        } catch (error) {
          console.warn('Failed to create item:', error)
        }
      }
    }

    await this.updateProgress(job.id, 90, 'Finalizing...')

    const itemsInfo = createdNodes.length > 1
      ? ` with ${createdNodes.length - 1} items`
      : ''
    const message = `Created ${category} "${container.title}"${itemsInfo}`

    await this.completeJob(job.id, {
      message,
      created_nodes: createdNodes,
    })

    return {
      success: true,
      message,
      created_nodes: createdNodes,
    }
  }

  /**
   * Handle project task creation
   */
  private async handleProjectTask(
    job: AgentJob,
    context: WorkerContext
  ): Promise<WorkerResult> {
    const { input_data: inputData } = job
    const { entities, partial_data: partialData } = inputData

    await this.updateProgress(job.id, 30, 'Creating project task...')

    // Find parent container
    let parentId = partialData?.parent_id
    if (!parentId && entities.parent_container && context.containers) {
      const match = context.containers.find(c =>
        c.title.toLowerCase().includes(entities.parent_container.toLowerCase()) &&
        c.category === 'project'
      )
      if (match) {
        parentId = match.id
      }
    }

    // Build task data
    const taskData: Partial<GraphNode> = {
      ...partialData,
      title: entities.title || partialData?.title || 'Project Task',
      category: 'project',
      node_type: 'item',
      status: 'pending',
      parent_id: parentId,
      root_id: parentId, // If parent is a container, use it as root
      type_metadata: {
        project_type: entities.project_type || 'personal',
        phase: entities.phase || '',
        milestone: entities.milestone || '',
      },
    }

    // Set dates
    if (entities.due_date) {
      taskData.due_date = this.parseDate(entities.due_date) || undefined
    }

    // Set priority
    if (entities.priority_hint) {
      const priorityMap: Record<string, number> = {
        high: 5,
        medium: 0,
        low: -5,
        critical: 10,
        blocker: 10,
      }
      taskData.manual_priority = priorityMap[entities.priority_hint.toLowerCase()] || 0
    }

    const task = await this.createTask(context.userId, taskData)

    await this.updateProgress(job.id, 90, 'Finalizing...')

    const parentInfo = parentId && context.containers
      ? ` under ${context.containers.find(c => c.id === parentId)?.title || 'project'}`
      : ''
    const message = `Created "${task.title}"${parentInfo}`

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
   * Determine category from user input and entities
   */
  private determineCategory(
    text: string,
    entities: Record<string, string>
  ): TaskCategory | null {
    // Check entities first
    if (entities.category) {
      const cat = entities.category.toLowerCase()
      if (['course', 'project', 'club'].includes(cat)) {
        return cat as TaskCategory
      }
    }

    // Check text for keywords
    const lower = text.toLowerCase()

    if (lower.includes('course') || lower.includes('class') ||
        lower.includes('semester') || lower.includes('syllabus')) {
      return 'course'
    }

    if (lower.includes('club') || lower.includes('organization') ||
        lower.includes('membership')) {
      return 'club'
    }

    if (lower.includes('project') || lower.includes('milestone') ||
        lower.includes('feature')) {
      return 'project'
    }

    return null
  }

  /**
   * Build metadata for container based on category
   */
  private buildContainerMetadata(
    category: TaskCategory,
    entities: Record<string, string>
  ): Record<string, unknown> {
    switch (category) {
      case 'course':
        return {
          course_code: entities.course_code || '',
          semester: entities.semester || this.getCurrentSemester(),
          professor: entities.professor ? { name: entities.professor } : undefined,
          credits: entities.credits ? parseInt(entities.credits, 10) : undefined,
        }

      case 'project':
        return {
          project_type: entities.project_type || 'personal',
          methodology: entities.methodology || '',
          phase: 'planning',
          repository_url: entities.repository_url || '',
        }

      case 'club':
        return {
          club_name: entities.title || '',
          role: entities.role || 'member',
          meeting_frequency: entities.meeting_frequency || '',
        }

      default:
        return {}
    }
  }

  /**
   * Parse initial items from comma-separated or newline-separated string
   */
  private parseInitialItems(
    itemsStr: string,
    parentCategory: TaskCategory
  ): Array<Partial<GraphNode>> {
    const items: Array<Partial<GraphNode>> = []

    // Split by comma, semicolon, or newline
    const itemTitles = itemsStr
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const title of itemTitles) {
      items.push({
        title,
        category: parentCategory,
        node_type: 'item',
        status: 'pending',
      })
    }

    return items
  }

  /**
   * Get current semester string
   */
  private getCurrentSemester(): string {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()

    if (month >= 0 && month <= 4) {
      return `Spring ${year}`
    } else if (month >= 5 && month <= 7) {
      return `Summer ${year}`
    } else {
      return `Fall ${year}`
    }
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  /**
   * Create a project breakdown with milestones and tasks
   */
  async createProjectBreakdown(
    job: AgentJob,
    context: WorkerContext,
    projectTitle: string,
    milestones: Array<{
      title: string
      dueDate?: string
      tasks?: string[]
    }>
  ): Promise<WorkerResult> {
    const createdNodes: GraphNode[] = []

    try {
      // Create project container
      await this.updateProgress(job.id, 10, 'Creating project container...')

      const project = await this.createTask(context.userId, {
        title: projectTitle,
        category: 'project',
        node_type: 'container',
        status: 'active',
        type_metadata: {
          project_type: 'personal',
          phase: 'planning',
        },
      })
      createdNodes.push(project)

      // Create milestones
      const progressIncrement = 80 / milestones.length

      for (let i = 0; i < milestones.length; i++) {
        const milestone = milestones[i]
        await this.updateProgress(
          job.id,
          10 + progressIncrement * i,
          `Creating milestone ${i + 1}/${milestones.length}...`
        )

        const milestoneNode = await this.createTask(context.userId, {
          title: milestone.title,
          category: 'project',
          node_type: 'item',
          status: 'pending',
          parent_id: project.id,
          root_id: project.id,
          due_date: milestone.dueDate || undefined,
          type_metadata: {
            is_milestone: true,
          },
        })
        createdNodes.push(milestoneNode)

        // Create tasks under milestone
        if (milestone.tasks) {
          for (const taskTitle of milestone.tasks) {
            const task = await this.createTask(context.userId, {
              title: taskTitle,
              category: 'project',
              node_type: 'item',
              status: 'pending',
              parent_id: milestoneNode.id,
              root_id: project.id,
            })
            createdNodes.push(task)
          }
        }
      }

      await this.updateProgress(job.id, 95, 'Finalizing project...')

      const message = `Created project "${projectTitle}" with ${milestones.length} milestones and ${createdNodes.length - milestones.length - 1} tasks`

      await this.completeJob(job.id, {
        message,
        created_nodes: createdNodes,
      })

      return {
        success: true,
        message,
        created_nodes: createdNodes,
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await this.failJob(job.id, errorMessage)

      return {
        success: false,
        message: `Failed to create project breakdown: ${errorMessage}`,
        error: errorMessage,
      }
    }
  }
}
