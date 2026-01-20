'use client'

import { Task, CreateTaskDTO, CourseMetadata, ProjectMetadata, TodoMetadata } from '@/types'
import { getOllamaClient } from '@/lib/ollama'
import { taskService } from '@/lib/taskService'
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
          actionLog.push('Schedule request handling coming soon')
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
}

// Export singleton instance
export const agentService = AgentService.getInstance()

// Export convenience function
export async function processNaturalLanguage(input: string, userId: string): Promise<AgentResult> {
  return agentService.processInput(input, userId)
}
