export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          encrypted_settings: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          encrypted_settings?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          encrypted_settings?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          parent_id: string | null
          title: string
          content: string | null
          status: 'pending' | 'in_progress' | 'completed' | 'archived'
          priority: number
          due_date: string | null
          completed_at: string | null
          scheduled_for: string | null
          duration_minutes: number | null
          recurrence_pattern: string | null
          recurrence_parent_id: string | null
          ai_context: string | null
          embedding: number[] | null
          tags: string[]
          dependencies: string[]
          position: number
          version: number
          version_history: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          parent_id?: string | null
          title: string
          content?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'archived'
          priority?: number
          due_date?: string | null
          completed_at?: string | null
          scheduled_for?: string | null
          duration_minutes?: number | null
          recurrence_pattern?: string | null
          recurrence_parent_id?: string | null
          ai_context?: string | null
          embedding?: number[] | null
          tags?: string[]
          dependencies?: string[]
          position?: number
          version?: number
          version_history?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          parent_id?: string | null
          title?: string
          content?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'archived'
          priority?: number
          due_date?: string | null
          completed_at?: string | null
          scheduled_for?: string | null
          duration_minutes?: number | null
          recurrence_pattern?: string | null
          recurrence_parent_id?: string | null
          ai_context?: string | null
          embedding?: number[] | null
          tags?: string[]
          dependencies?: string[]
          position?: number
          version?: number
          version_history?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      sync_log: {
        Row: {
          id: string
          user_id: string
          device_id: string
          operation: 'create' | 'update' | 'delete'
          entity_type: 'task' | 'user' | 'automation_rule'
          entity_id: string
          changes: Record<string, any> | null
          vector_clock: Record<string, any> | null
          synced_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_id: string
          operation: 'create' | 'update' | 'delete'
          entity_type: 'task' | 'user' | 'automation_rule'
          entity_id: string
          changes?: Record<string, any> | null
          vector_clock?: Record<string, any> | null
          synced_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          device_id?: string
          operation?: 'create' | 'update' | 'delete'
          entity_type?: 'task' | 'user' | 'automation_rule'
          entity_id?: string
          changes?: Record<string, any> | null
          vector_clock?: Record<string, any> | null
          synced_at?: string
        }
      }
      automation_rules: {
        Row: {
          id: string
          user_id: string
          name: string
          trigger_type: 'time_based' | 'task_created' | 'task_completed' | 'due_date_approaching'
          trigger_config: Record<string, any> | null
          action_type: 'create_task' | 'update_task' | 'send_notification' | 'run_ai_command'
          action_config: Record<string, any> | null
          is_active: boolean
          last_triggered_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          trigger_type: 'time_based' | 'task_created' | 'task_completed' | 'due_date_approaching'
          trigger_config?: Record<string, any> | null
          action_type: 'create_task' | 'update_task' | 'send_notification' | 'run_ai_command'
          action_config?: Record<string, any> | null
          is_active?: boolean
          last_triggered_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          trigger_type?: 'time_based' | 'task_created' | 'task_completed' | 'due_date_approaching'
          trigger_config?: Record<string, any> | null
          action_type?: 'create_task' | 'update_task' | 'send_notification' | 'run_ai_command'
          action_config?: Record<string, any> | null
          is_active?: boolean
          last_triggered_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      task_statistics: {
        Row: {
          user_id: string | null
          date: string | null
          total_tasks: number | null
          completed_tasks: number | null
          avg_completion_hours: number | null
        }
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}