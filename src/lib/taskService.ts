import { Task, CreateTaskDTO, UpdateTaskDTO } from '@/types'
import { syncService } from '@/lib/sync/syncService'
import { indexedDBService } from '@/lib/storage/indexedDB'
import { authService } from '@/lib/auth'

/**
 * Unified task service that handles both online and offline operations
 * Integrates with sync service for offline-first functionality
 */
export class TaskService {
  private static instance: TaskService
  private initialized = false

  private constructor() {}

  static getInstance(): TaskService {
    if (!TaskService.instance) {
      TaskService.instance = new TaskService()
    }
    return TaskService.instance
  }

  /**
   * Initialize the task service
   */
  async initialize(userId: string): Promise<void> {
    if (this.initialized) return

    try {
      // Initialize IndexedDB
      await indexedDBService.initialize()
      
      // Initialize sync service
      await syncService.initialize(userId)
      
      // Perform initial sync if online
      if (navigator.onLine) {
        try {
          await syncService.fullSync()
        } catch (error) {
          console.warn('Initial sync failed:', error)
        }
      }

      this.initialized = true
      console.log('TaskService initialized successfully')
    } catch (error) {
      console.error('Failed to initialize task service:', error)
      throw error
    }
  }

  /**
   * Get all tasks (from local storage first, fallback to API)
   */
  async getTasks(): Promise<Task[]> {
    try {
      // Try to get from sync service first (handles offline/online)
      return await syncService.getTasks()
    } catch (error) {
      console.error('Error getting tasks from sync service:', error)
      
      // Fallback to direct API call
      try {
        const response = await fetch('/api/tasks')
        if (response.ok) {
          const data = await response.json()
          return data.tasks || []
        }
      } catch (apiError) {
        console.error('API fallback failed:', apiError)
      }
      
      return []
    }
  }

  /**
   * Create a new task
   */
  async createTask(taskData: CreateTaskDTO): Promise<Task> {
    try {
      if (navigator.onLine) {
        // Try API first when online
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskData),
        })

        if (response.ok) {
          const data = await response.json()
          
          // Store in local storage as well
          try {
            await indexedDBService.storeTask(data.task)
          } catch (error) {
            console.warn('Failed to store task locally:', error)
          }
          
          return data.task
        } else {
          throw new Error('API request failed')
        }
      } else {
        throw new Error('Offline - using sync service')
      }
    } catch (error) {
      // Use sync service for offline creation
      const task: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
        user_id: await this.getCurrentUserId(),
        title: taskData.title,
        content: taskData.content || '',
        status: 'pending',
        priority: taskData.priority || 5,
        due_date: taskData.due_date,
        tags: taskData.tags || [],
        dependencies: [],
        position: 0,
        version: 1,
        parent_id: taskData.parent_id,
        task_type: taskData.task_type || 'todo',
        type_metadata: taskData.type_metadata || { category: 'general' },
      }

      return await syncService.createTask(task)
    }
  }

  /**
   * Update a task
   */
  async updateTask(taskId: string, updates: UpdateTaskDTO): Promise<Task> {
    try {
      if (navigator.onLine) {
        // Try API first when online
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        })

        if (response.ok) {
          const data = await response.json()
          
          // Update in local storage as well
          try {
            await indexedDBService.storeTask(data.task)
          } catch (error) {
            console.warn('Failed to update task locally:', error)
          }
          
          return data.task
        } else {
          throw new Error('API request failed')
        }
      } else {
        throw new Error('Offline - using sync service')
      }
    } catch (error) {
      // Use sync service for offline updates
      return await syncService.updateTask(taskId, updates)
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    try {
      if (navigator.onLine) {
        // Try API first when online
        const response = await fetch(`/api/tasks/${taskId}`, {
          method: 'DELETE',
        })

        if (response.ok) {
          // Remove from local storage as well
          try {
            await indexedDBService.deleteTask(taskId)
          } catch (error) {
            console.warn('Failed to delete task locally:', error)
          }
          
          return
        } else {
          throw new Error('API request failed')
        }
      } else {
        throw new Error('Offline - using sync service')
      }
    } catch (error) {
      // Use sync service for offline deletion
      await syncService.deleteTask(taskId)
    }
  }

  /**
   * Force sync with server
   */
  async syncNow(): Promise<void> {
    if (!navigator.onLine) {
      throw new Error('Cannot sync while offline')
    }
    
    await syncService.fullSync()
  }

  /**
   * Get sync status
   */
  getSyncStatus(): { inProgress: boolean; online: boolean; needsSync: boolean } {
    const syncStatus = syncService.getSyncStatus()
    return {
      ...syncStatus,
      needsSync: false // This would be implemented based on pending changes
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Clear all local data (for logout)
   */
  async clearData(): Promise<void> {
    await syncService.clearLocalData()
    this.initialized = false
  }

  /**
   * Private helper methods
   */
  private async getCurrentUserId(): Promise<string> {
    // Check for authenticated user first
    const authState = authService.getState()
    if (authState.user) {
      return authState.user.id
    }
    // Fall back to local user for single-user mode
    return 'local-user'
  }

}

// Export singleton instance
export const taskService = TaskService.getInstance()