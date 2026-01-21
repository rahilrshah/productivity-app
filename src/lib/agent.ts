'use client'

import { Task, CreateTaskDTO, CourseMetadata, ProjectMetadata, TodoMetadata } from '@/types'
import { getOllamaClient } from '@/lib/ollama'
import { taskService } from '@/lib/taskService'
import { unifiedTaskScheduler } from '@/lib/scheduling'
import {
  AgentIntent,
  AgentResult,
  AgentAction,
  SyllabusData,
  ProjectData,
  QuickTaskData,
} from '@/lib/agent/types'

/**
 * AgentService - The Central Nervous System
 * Takes raw natural language and orchestrates database changes.
 */
class AgentService {
  private static instance: AgentService

  private constructor() {}

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService()
    }
    return AgentService.instance
  }

  /**
   * Main entry point for processing natural language input
   */
  async processInput(input: string, userId: string): Promise<AgentResult> {
    const actionLog: string[] = []
    const createdTasks: Task[] = []
    const errors: string[] = []
    const actions: AgentAction[] = []

    try {
      const client = getOllamaClient()

      // Step 1: Classify the intent
      actionLog.push('Analyzing input...')
      const classification = await client.classifyIntent(input)
      actionLog.push(`Detected intent: ${classification.intent} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`)

      // Step 2: Route to specialized handler based on intent
      switch (classification.intent) {
        case 'SYLLABUS':
          await this.handleSyllabus(input, userId, actionLog, createdTasks, actions)
          break

        case 'PROJECT_BRAINSTORM':
          await this.handleProjectBrainstorm(input, userId, actionLog, createdTasks, actions)
          break

        case 'QUICK_TASK':
          await this.handleQuickTask(input, userId, actionLog, createdTasks, actions)
          break

        case 'SCHEDULE_REQUEST':
          await this.handleScheduleRequest(input, userId, actionLog, createdTasks, actions)
          break

        case 'UNKNOWN':
        default:
          // Default to quick task for unknown intents
          actionLog.push('Could not determine specific intent, treating as quick task')
          await this.handleQuickTask(input, userId, actionLog, createdTasks, actions)
          break
      }

      return {
        success: true,
        intent: classification.intent,
        confidence: classification.confidence,
        actions,
        actionLog,
        createdTasks,
        errors,
      }
    } catch (error) {
      console.error('Agent processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      errors.push(errorMessage)
      actionLog.push(`Error: ${errorMessage}`)

      return {
        success: false,
        intent: 'UNKNOWN',
        confidence: 0,
        actions,
        actionLog,
        createdTasks,
        errors,
      }
    }
  }

  /**
   * Handle syllabus parsing - creates Course parent + Assignment children
   */
  private async handleSyllabus(
    input: string,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    const client = getOllamaClient()

    // Extract structured syllabus data
    actionLog.push('Extracting course information...')
    const syllabusData = await client.extractSyllabusData(input)

    if (!syllabusData || !syllabusData.courseCode) {
      throw new Error('Could not parse course data from input')
    }

    actionLog.push(`Found course: ${syllabusData.courseCode} - ${syllabusData.courseName}`)

    // Create parent Course task
    const courseTitle = `${syllabusData.courseCode}: ${syllabusData.courseName}`
    const courseMetadata: CourseMetadata = {
      course_code: syllabusData.courseCode,
      semester: syllabusData.semester,
      assignment_type: 'Course Shell',
      credits: syllabusData.credits || 3,
      instructor: syllabusData.instructor,
    }

    const courseTaskData: CreateTaskDTO = {
      title: courseTitle,
      content: `Semester: ${syllabusData.semester}${syllabusData.instructor ? `\nInstructor: ${syllabusData.instructor}` : ''}`,
      task_type: 'course',
      type_metadata: courseMetadata,
      priority: 8,
      tags: ['course', syllabusData.semester.toLowerCase().replace(/\s+/g, '-')],
    }

    actions.push({
      type: 'CREATE_TASK',
      description: `Create course: ${courseTitle}`,
      payload: {
        taskType: 'course',
        title: courseTitle,
        metadata: courseMetadata,
        priority: 8,
      },
    })

    const courseTask = await taskService.createTask(courseTaskData)
    createdTasks.push(courseTask)
    actionLog.push(`Created course: ${courseTitle}`)

    // Create child Assignment tasks
    if (syllabusData.assignments && syllabusData.assignments.length > 0) {
      actionLog.push(`Found ${syllabusData.assignments.length} assignments`)

      for (const assignment of syllabusData.assignments) {
        const assignmentMetadata: CourseMetadata = {
          course_code: syllabusData.courseCode,
          semester: syllabusData.semester,
          assignment_type: assignment.type || 'Assignment',
          credits: 0,
          weight_percentage: assignment.weight,
        }

        // Auto-priority based on weight
        const priority = assignment.weight && assignment.weight > 15 ? 9 :
                        assignment.weight && assignment.weight > 5 ? 7 : 5

        const assignmentTaskData: CreateTaskDTO = {
          title: assignment.title,
          content: assignment.weight ? `Weight: ${assignment.weight}%` : undefined,
          task_type: 'course',
          type_metadata: assignmentMetadata,
          parent_id: courseTask.id,
          due_date: assignment.dueDate,
          priority,
          tags: ['assignment', syllabusData.courseCode.toLowerCase()],
        }

        actions.push({
          type: 'CREATE_TASK',
          description: `Create assignment: ${assignment.title}`,
          payload: {
            taskType: 'course',
            title: assignment.title,
            parentId: courseTask.id,
            metadata: assignmentMetadata,
            dueDate: assignment.dueDate,
            priority,
          },
        })

        const assignmentTask = await taskService.createTask(assignmentTaskData)
        createdTasks.push(assignmentTask)
        actionLog.push(`Added assignment: ${assignment.title}${assignment.dueDate ? ` (due: ${new Date(assignment.dueDate).toLocaleDateString()})` : ''}`)
      }
    }
  }

  /**
   * Handle project brainstorm - creates Project parent + Milestone children
   */
  private async handleProjectBrainstorm(
    input: string,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    const client = getOllamaClient()

    // Extract structured project data
    actionLog.push('Extracting project information...')
    const projectData = await client.extractProjectData(input)

    if (!projectData || !projectData.projectName) {
      throw new Error('Could not parse project data from input')
    }

    actionLog.push(`Found project: ${projectData.projectName}`)

    // Create parent Project task
    const projectMetadata: ProjectMetadata = {
      project_type: projectData.projectType,
      methodology: projectData.projectType === 'work' ? 'Agile' : 'Flexible',
      phase: 'Planning',
    }

    const projectTaskData: CreateTaskDTO = {
      title: projectData.projectName,
      content: projectData.description,
      task_type: 'project',
      type_metadata: projectMetadata,
      priority: 7,
      due_date: projectData.deadline,
      tags: ['project', projectData.projectType],
    }

    actions.push({
      type: 'CREATE_TASK',
      description: `Create project: ${projectData.projectName}`,
      payload: {
        taskType: 'project',
        title: projectData.projectName,
        metadata: projectMetadata,
        priority: 7,
        dueDate: projectData.deadline,
      },
    })

    const projectTask = await taskService.createTask(projectTaskData)
    createdTasks.push(projectTask)
    actionLog.push(`Created project: ${projectData.projectName}`)

    // Create child Milestone tasks
    if (projectData.milestones && projectData.milestones.length > 0) {
      actionLog.push(`Found ${projectData.milestones.length} milestones`)

      for (let i = 0; i < projectData.milestones.length; i++) {
        const milestone = projectData.milestones[i]
        const milestoneMetadata: ProjectMetadata = {
          project_type: projectData.projectType,
          methodology: projectMetadata.methodology,
          phase: `Milestone ${i + 1}`,
          milestone: milestone.title,
        }

        const milestoneTaskData: CreateTaskDTO = {
          title: milestone.title,
          task_type: 'project',
          type_metadata: milestoneMetadata,
          parent_id: projectTask.id,
          due_date: milestone.dueDate,
          priority: 6,
          tags: ['milestone', projectData.projectName.toLowerCase().replace(/\s+/g, '-')],
        }

        actions.push({
          type: 'CREATE_TASK',
          description: `Create milestone: ${milestone.title}`,
          payload: {
            taskType: 'project',
            title: milestone.title,
            parentId: projectTask.id,
            metadata: milestoneMetadata,
            dueDate: milestone.dueDate,
            priority: 6,
          },
        })

        const milestoneTask = await taskService.createTask(milestoneTaskData)
        createdTasks.push(milestoneTask)
        actionLog.push(`Added milestone: ${milestone.title}`)
      }
    }
  }

  /**
   * Handle quick task creation - creates a single todo
   */
  private async handleQuickTask(
    input: string,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    const client = getOllamaClient()

    // Parse task from text using existing method
    actionLog.push('Parsing task...')
    const taskData = await client.parseTaskFromText(input)

    if (!taskData) {
      throw new Error('Could not parse task from input')
    }

    const todoMetadata: TodoMetadata = {
      category: 'general',
      context: 'Quick capture',
    }

    const taskDTO: CreateTaskDTO = {
      title: taskData.title,
      content: taskData.content,
      task_type: 'todo',
      type_metadata: todoMetadata,
      priority: taskData.priority || 5,
      due_date: taskData.due_date,
      tags: taskData.tags || [],
    }

    actions.push({
      type: 'CREATE_TASK',
      description: `Create task: ${taskData.title}`,
      payload: {
        taskType: 'todo',
        title: taskData.title,
        metadata: todoMetadata,
        priority: taskData.priority || 5,
        dueDate: taskData.due_date,
        tags: taskData.tags,
      },
    })

    const task = await taskService.createTask(taskDTO)
    createdTasks.push(task)
    actionLog.push(`Created task: ${taskData.title}`)

    if (taskData.due_date) {
      actionLog.push(`Due: ${new Date(taskData.due_date).toLocaleDateString()}`)
    }
  }

  /**
   * Handle schedule requests - reschedule, find slots, block time
   */
  private async handleScheduleRequest(
    input: string,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    const client = getOllamaClient()

    // Extract structured schedule data
    actionLog.push('Analyzing schedule request...')
    const scheduleData = await client.extractScheduleData(input)

    if (!scheduleData) {
      throw new Error('Could not understand schedule request')
    }

    actionLog.push(`Schedule action: ${scheduleData.action}`)

    switch (scheduleData.action) {
      case 'reschedule':
        await this.handleReschedule(scheduleData, userId, actionLog, actions)
        break

      case 'find_slot':
        await this.handleFindSlot(scheduleData, userId, actionLog, createdTasks, actions)
        break

      case 'block_time':
        await this.handleBlockTime(scheduleData, userId, actionLog, createdTasks, actions)
        break

      case 'schedule_new':
        await this.handleScheduleNew(scheduleData, userId, actionLog, createdTasks, actions)
        break

      default:
        actionLog.push('Unknown schedule action, treating as time block request')
        await this.handleBlockTime(scheduleData, userId, actionLog, createdTasks, actions)
    }
  }

  /**
   * Reschedule an existing task
   */
  private async handleReschedule(
    scheduleData: any,
    userId: string,
    actionLog: string[],
    actions: AgentAction[]
  ): Promise<void> {
    actionLog.push('Searching for existing task to reschedule...')

    // Find the task by title (we'd need to search through existing tasks)
    // For now, we'll log the action and let the UI handle finding the specific task
    if (scheduleData.taskTitle) {
      actionLog.push(`Looking for task: "${scheduleData.taskTitle}"`)
    }

    if (scheduleData.newDate || scheduleData.newTime) {
      const targetTime = this.buildTargetDateTime(scheduleData.newDate, scheduleData.newTime)
      actionLog.push(`Target time: ${targetTime ? targetTime.toLocaleString() : 'flexible'}`)
    }

    actions.push({
      type: 'UPDATE_TASK',
      description: `Reschedule "${scheduleData.taskTitle || 'task'}" to ${scheduleData.newDate || 'new time'}`,
      payload: {
        taskType: 'todo',
        title: scheduleData.taskTitle || 'Reschedule request',
        metadata: {
          action: 'reschedule',
          originalTitle: scheduleData.taskTitle,
          newDate: scheduleData.newDate,
          newTime: scheduleData.newTime,
          reason: scheduleData.reason
        } as any
      }
    })

    actionLog.push(`Reschedule request logged for: ${scheduleData.taskTitle || 'task'}`)
  }

  /**
   * Find available time slot for an activity
   */
  private async handleFindSlot(
    scheduleData: any,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    actionLog.push('Finding available time slot...')

    const activity = scheduleData.taskTitle || 'Activity'
    const duration = scheduleData.duration || 60
    
    actionLog.push(`Activity: ${activity} (${duration} minutes)`)

    if (scheduleData.newDate) {
      actionLog.push(`Preferred date: ${new Date(scheduleData.newDate).toLocaleDateString()}`)
    }

    if (scheduleData.preferences?.timeOfDay) {
      actionLog.push(`Preferred time: ${scheduleData.preferences.timeOfDay}`)
    }

    // Create a task for the time slot request
    const todoMetadata: TodoMetadata = {
      category: 'scheduling',
      context: 'Time slot request',
      location: scheduleData.preferences?.location,
      duration_minutes: duration
    }

    const taskDTO: CreateTaskDTO = {
      title: `${activity} - Time Slot Request`,
      content: scheduleData.reason ? `Reason: ${scheduleData.reason}` : 'Find available time slot',
      task_type: 'todo',
      type_metadata: todoMetadata,
      priority: 6,
      due_date: scheduleData.newDate,
      tags: ['scheduling', 'time-slot', scheduleData.preferences?.timeOfDay].filter(Boolean) as string[],
      duration_minutes: duration
    }

    actions.push({
      type: 'CREATE_TASK',
      description: `Find time slot for: ${activity}`,
      payload: {
        taskType: 'todo',
        title: taskDTO.title,
        metadata: todoMetadata,
        priority: 6,
        dueDate: scheduleData.newDate,
        tags: taskDTO.tags
      }
    })

    const task = await taskService.createTask(taskDTO)
    createdTasks.push(task)
    actionLog.push(`Created time slot request for: ${activity}`)
  }

  /**
   * Block time for focused work
   */
  private async handleBlockTime(
    scheduleData: any,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    actionLog.push('Creating time block...')

    const activity = scheduleData.taskTitle || 'Focused Work'
    const duration = scheduleData.duration || 120 // Default 2 hours for time blocking

    actionLog.push(`Time block: ${activity} (${duration} minutes)`)

    if (scheduleData.newDate) {
      actionLog.push(`Date: ${new Date(scheduleData.newDate).toLocaleDateString()}`)
    }

    // Determine task type based on activity description
    let taskType: 'course' | 'project' | 'club' | 'todo' = 'todo'
    let metadata: any = { category: 'time-block', context: 'Focused work session' }

    const activityLower = activity.toLowerCase()
    if (activityLower.includes('study') || activityLower.includes('course') || activityLower.includes('assignment')) {
      taskType = 'course'
      metadata = {
        course_code: 'TIMEBLOCK',
        semester: 'Current',
        assignment_type: 'Study Session',
        credits: 0
      } as CourseMetadata
    } else if (activityLower.includes('project') || activityLower.includes('development') || activityLower.includes('coding')) {
      taskType = 'project'
      metadata = {
        project_type: 'personal' as const,
        methodology: 'Timeboxed',
        phase: 'Execution'
      } as ProjectMetadata
    }

    const taskDTO: CreateTaskDTO = {
      title: `🎯 ${activity}`,
      content: `Time block session${scheduleData.reason ? ` - ${scheduleData.reason}` : ''}`,
      task_type: taskType,
      type_metadata: metadata,
      priority: 7,
      due_date: scheduleData.newDate,
      tags: ['time-block', 'focus', scheduleData.preferences?.timeOfDay].filter(Boolean) as string[],
      duration_minutes: duration
    }

    actions.push({
      type: 'CREATE_TASK',
      description: `Block time for: ${activity}`,
      payload: {
        taskType,
        title: taskDTO.title,
        metadata,
        priority: 7,
        dueDate: scheduleData.newDate,
        tags: taskDTO.tags
      }
    })

    const task = await taskService.createTask(taskDTO)
    createdTasks.push(task)
    actionLog.push(`Created time block: ${activity}`)
  }

  /**
   * Schedule a new activity/task
   */
  private async handleScheduleNew(
    scheduleData: any,
    userId: string,
    actionLog: string[],
    createdTasks: Task[],
    actions: AgentAction[]
  ): Promise<void> {
    actionLog.push('Creating new scheduled task...')

    const activity = scheduleData.taskTitle || 'New Task'
    const duration = scheduleData.duration || 60

    actionLog.push(`New task: ${activity}`)

    if (scheduleData.newDate && scheduleData.newTime) {
      const targetDateTime = this.buildTargetDateTime(scheduleData.newDate, scheduleData.newTime)
      if (targetDateTime) {
        actionLog.push(`Scheduled for: ${targetDateTime.toLocaleString()}`)
      }
    }

    const todoMetadata: TodoMetadata = {
      category: 'scheduled',
      context: 'Direct scheduling',
      scheduled_time: scheduleData.newTime,
      duration_minutes: duration
    }

    const taskDTO: CreateTaskDTO = {
      title: activity,
      content: scheduleData.reason ? `Note: ${scheduleData.reason}` : undefined,
      task_type: 'todo',
      type_metadata: todoMetadata,
      priority: 6,
      due_date: scheduleData.newDate,
      tags: ['scheduled', 'appointment', scheduleData.preferences?.timeOfDay].filter(Boolean) as string[],
      duration_minutes: duration
    }

    actions.push({
      type: 'CREATE_TASK',
      description: `Schedule: ${activity}`,
      payload: {
        taskType: 'todo',
        title: activity,
        metadata: todoMetadata,
        priority: 6,
        dueDate: scheduleData.newDate,
        tags: taskDTO.tags
      }
    })

    const task = await taskService.createTask(taskDTO)
    createdTasks.push(task)
    actionLog.push(`Scheduled: ${activity}`)
  }

  /**
   * Helper to build target datetime from date and time strings
   */
  private buildTargetDateTime(dateStr?: string, timeStr?: string): Date | null {
    if (!dateStr) return null

    try {
      const date = new Date(dateStr)
      
      if (timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number)
        date.setHours(hours, minutes, 0, 0)
      }

      return date
    } catch (error) {
      console.error('Error building target datetime:', error)
      return null
    }
  }
}

// Export singleton instance
export const agentService = AgentService.getInstance()

// Export convenience function
export async function processNaturalLanguage(input: string, userId: string): Promise<AgentResult> {
  return agentService.processInput(input, userId)
}
