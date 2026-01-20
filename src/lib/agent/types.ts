import { Task, TaskType, CourseMetadata, ProjectMetadata, ClubMetadata, TodoMetadata } from '@/types'

// Agent intent categories
export type AgentIntent =
  | 'SYLLABUS'           // Academic course syllabus with assignments
  | 'PROJECT_BRAINSTORM' // Project ideas, feature lists, milestones
  | 'QUICK_TASK'         // Simple single task or todo
  | 'SCHEDULE_REQUEST'   // Scheduling, time blocking requests
  | 'UNKNOWN'            // Cannot determine intent

// Intent classification result
export interface IntentClassification {
  intent: AgentIntent
  confidence: number
  extractedEntities: Record<string, string>
}

// Agent action types
export type AgentActionType = 'CREATE_TASK' | 'CREATE_BATCH' | 'UPDATE_TASK' | 'SCHEDULE'

export interface AgentAction {
  type: AgentActionType
  description: string
  payload: {
    taskType: TaskType
    title: string
    parentId?: string
    metadata?: CourseMetadata | ProjectMetadata | ClubMetadata | TodoMetadata
    dueDate?: string
    priority?: number
    content?: string
    tags?: string[]
  }
}

// Result from agent processing
export interface AgentResult {
  success: boolean
  intent: AgentIntent
  confidence: number
  actions: AgentAction[]
  actionLog: string[]
  createdTasks: Task[]
  errors: string[]
}

// Extracted syllabus data
export interface SyllabusData {
  courseCode: string
  courseName: string
  semester: string
  instructor?: string
  credits?: number
  assignments: Array<{
    title: string
    dueDate?: string
    type: string
    weight?: number
    description?: string
  }>
  regularSchedule?: Array<{
    day: string
    startTime: string
    endTime?: string
    location?: string
  }>
}

// Extracted project data
export interface ProjectData {
  projectName: string
  projectType: 'personal' | 'work' | 'side-project'
  description: string
  methodology?: string
  milestones: Array<{
    title: string
    dueDate?: string
    description?: string
  }>
  deadline?: string
  teamMembers?: string[]
  repositoryUrl?: string
}

// Extracted quick task data
export interface QuickTaskData {
  title: string
  content?: string
  dueDate?: string
  priority?: number
  tags?: string[]
  durationMinutes?: number
  category?: string
}

// Extracted schedule request data
export interface ScheduleRequestData {
  action: 'reschedule' | 'block_time' | 'find_slot'
  taskId?: string
  newDate?: string
  duration?: number
  reason?: string
}

// Union type for all extracted data
export type ExtractedData =
  | { type: 'syllabus'; data: SyllabusData }
  | { type: 'project'; data: ProjectData }
  | { type: 'quickTask'; data: QuickTaskData }
  | { type: 'schedule'; data: ScheduleRequestData }
