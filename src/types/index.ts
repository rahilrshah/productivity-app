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
  title: string
  content: string
  status: TaskStatus
  priority: number
  due_date?: string
  completed_at?: string
  scheduled_for?: string
  duration_minutes?: number
  recurrence_pattern?: string
  recurrence_parent_id?: string
  ai_context?: string
  embedding?: number[]
  tags: string[]
  dependencies: string[]
  position: number
  version: number
  version_history?: string
  created_at: string
  updated_at: string
  deleted_at?: string
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
  priority?: number
  due_date?: string
  parent_id?: string
  tags?: string[]
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