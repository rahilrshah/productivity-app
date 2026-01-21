// Re-export all graph types for v3.0 architecture
export * from './graph'

export interface User {
  id: string
  email: string
  encrypted_settings: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  parent_id?: string
  root_id?: string              // v3.0: Points to top-level container
  title: string
  content: string
  rich_content?: Record<string, unknown>  // v3.0: Tiptap JSON content
  status: TaskStatus
  priority: number              // Legacy priority
  manual_priority?: number      // v3.0: User override (-10 to +10)
  computed_priority?: number    // v3.0: Calculated by trigger (READ-ONLY)
  due_date?: string
  start_date?: string           // v3.0: Deferral date
  completed_at?: string
  scheduled_for?: string
  duration_minutes?: number
  recurrence_pattern?: string
  recurrence_parent_id?: string
  ai_context?: string
  embedding?: number[]
  tags: string[]
  dependencies: string[]
  position?: number
  version: number
  version_history?: string
  created_at: string
  updated_at: string
  deleted_at?: string
  // Multi-type fields
  /** @deprecated Use `category` instead. Will be removed in v4.0 */
  task_type: TaskType
  type_metadata: TaskMetadata
  // v3.0 Graph fields
  node_type?: 'container' | 'item'
  /** Primary field for task categorization. Prefer over task_type */
  category?: TaskCategory
}

/** v3.0: Extended category type including routine and journal */
export type TaskCategory = 'course' | 'project' | 'club' | 'routine' | 'todo' | 'journal'

export type TaskType = 'course' | 'project' | 'club' | 'todo'

export type TaskMetadata = CourseMetadata | ProjectMetadata | ClubMetadata | TodoMetadata

export interface CourseMetadata {
  course_code: string
  semester: string
  assignment_type: string
  credits: number
  instructor?: string
  syllabus_url?: string
  submission_method?: string
  weight_percentage?: number
}

export interface ProjectMetadata {
  project_type: 'personal' | 'work' | 'side-project'
  methodology: string
  phase: string
  milestone?: string
  repository_url?: string
  team_members?: string[]
  client?: string
  budget?: number
}

export interface ClubMetadata {
  club_name: string
  role: string
  event_type?: string
  meeting_frequency?: string
  meeting_location?: string
  required_attendance?: boolean
  leadership_position?: boolean
}

export interface TodoMetadata {
  category?: string
  location?: string
  context?: string
  scheduled_time?: string
  duration_minutes?: number
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'archived'

export interface SyncLog {
  id: string
  user_id: string
  device_id: string
  operation: SyncOperation
  entity_type: EntityType
  entity_id: string
  changes: Record<string, unknown>
  vector_clock: Record<string, number>
  synced_at: string
}

export type SyncOperation = 'create' | 'update' | 'delete'
export type EntityType = 'task' | 'user' | 'automation_rule'

export interface AutomationRule {
  id: string
  user_id: string
  name: string
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  action_type: ActionType
  action_config: Record<string, unknown>
  is_active: boolean
  last_triggered_at?: string
  created_at: string
}

export type TriggerType = 'time_based' | 'task_created' | 'task_completed' | 'due_date_approaching'
export type ActionType = 'create_task' | 'update_task' | 'send_notification' | 'run_ai_command'

export interface CreateTaskDTO {
  title: string
  content?: string
  rich_content?: Record<string, unknown>  // v3.0: Tiptap JSON
  priority?: number
  manual_priority?: number     // v3.0: User override
  due_date?: string
  start_date?: string          // v3.0: Deferral date
  parent_id?: string
  tags?: string[]
  /** @deprecated Use `category` instead. Auto-derived from category if not provided */
  task_type?: TaskType
  type_metadata?: TaskMetadata
  scheduled_for?: string
  duration_minutes?: number
  // v3.0 Graph fields
  node_type?: 'container' | 'item'
  /** Primary field for task categorization. Required if task_type not provided */
  category?: TaskCategory
}

export interface CreateCourseTaskDTO extends Omit<CreateTaskDTO, 'type_metadata' | 'task_type'> {
  task_type: 'course'
  type_metadata: CourseMetadata
}

export interface CreateProjectTaskDTO extends Omit<CreateTaskDTO, 'type_metadata' | 'task_type'> {
  task_type: 'project'
  type_metadata: ProjectMetadata
}

export interface CreateClubTaskDTO extends Omit<CreateTaskDTO, 'type_metadata' | 'task_type'> {
  task_type: 'club'
  type_metadata: ClubMetadata
}

export interface CreateTodoTaskDTO extends Omit<CreateTaskDTO, 'type_metadata' | 'task_type'> {
  task_type: 'todo'
  type_metadata: TodoMetadata
}

export interface UpdateTaskDTO {
  title?: string
  content?: string
  status?: TaskStatus
  priority?: number
  due_date?: string
  completed_at?: string
  tags?: string[]
}

export interface TaskFilter {
  status?: TaskStatus[]
  priority?: [number, number]
  due_before?: string
  due_after?: string
  tags?: string[]
  search?: string
  limit?: number
  offset?: number
}

export interface ScheduleEntry {
  id: string
  task_id: string
  scheduled_for: string
  duration_minutes?: number
  created_at: string
}

export interface ParsedTask {
  title: string
  due_date?: string
  priority: 'high' | 'medium' | 'low'
  tags: string[]
  recurrence?: string
  duration?: number
}

export interface AIContext {
  user_preferences: Record<string, unknown>
  task_history: Task[]
  current_date: string
  dependency_graph: Record<string, string[]>
  // Multi-type context
  course_context?: CourseContext
  project_context?: ProjectContext
  club_context?: ClubContext
  personal_context?: PersonalContext
}

export interface CourseContext {
  current_semester: string
  courses: Array<{
    code: string
    name: string
    credits: number
    schedule: string
    syllabus_data?: any
  }>
  academic_calendar: Array<{
    event: string
    date: string
    type: 'exam' | 'assignment' | 'break' | 'semester'
  }>
}

export interface ProjectContext {
  active_projects: Array<{
    id: string
    name: string
    methodology: string
    current_phase: string
    team_size?: number
    deadline?: string
  }>
  work_schedule: {
    work_hours: string
    availability: string[]
    time_zone: string
  }
}

export interface ClubContext {
  memberships: Array<{
    club_name: string
    role: string
    meeting_schedule: string
    responsibilities: string[]
  }>
  upcoming_events: Array<{
    event: string
    date: string
    club: string
    required: boolean
  }>
}

export interface PersonalContext {
  daily_schedule: {
    wake_time: string
    sleep_time: string
    work_hours: string
    break_preferences: string[]
  }
  locations: string[]
  recurring_commitments: string[]
}

export interface ComponentSpec {
  props: {
    required: Record<string, string | number | boolean>
    optional?: Record<string, string | number | boolean>
  }
  state?: Record<string, string | number | boolean>
  methods?: Record<string, Function>
  events?: Record<string, Function>
  performance: {
    renderTime: number
    memoryLimit: number
    updateFrequency: number
  }
  a11y: {
    role: string
    ariaLabel: boolean
    keyboardNav: boolean
    screenReader: boolean
  }
}