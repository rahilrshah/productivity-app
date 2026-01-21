import { Task, CreateTaskDTO, UpdateTaskDTO, TaskRelation, CreateRelationDTO, GraphNodeFilter } from '@/types'
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
      // Determine node_type and category based on task_type if not provided
      const nodeType = taskData.node_type ||
        (taskData.parent_id ? 'item' :
          (['course', 'project', 'club'].includes(taskData.task_type) ? 'container' : 'item'))

      const category = taskData.category || taskData.task_type || 'todo'

      const task: Omit<Task, 'id' | 'created_at' | 'updated_at'> = {
        user_id: await this.getCurrentUserId(),
        title: taskData.title,
        content: taskData.content || '',
        rich_content: taskData.rich_content,
        status: 'pending',
        priority: taskData.priority || 5,
        manual_priority: taskData.manual_priority || 0,
        due_date: taskData.due_date,
        start_date: taskData.start_date,
        tags: taskData.tags || [],
        dependencies: [],
        position: 0,
        version: 1,
        parent_id: taskData.parent_id,
        task_type: taskData.task_type || 'todo',
        type_metadata: taskData.type_metadata || { category: 'general' },
        // v3.0 Graph fields
        node_type: nodeType as 'container' | 'item',
        category: category as Task['category'],
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

  // ==========================================
  // Graph Architecture Methods (v3.0)
  // ==========================================

  /**
   * Get all container nodes (Courses, Projects, Clubs)
   */
  async getContainers(filter?: { category?: string; status?: string }): Promise<Task[]> {
    try {
      const params = new URLSearchParams()
      params.set('node_type', 'container')
      if (filter?.category) params.set('category', filter.category)
      if (filter?.status) params.set('status', filter.status)

      const response = await fetch(`/api/tasks?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        return data.tasks || []
      }
      return []
    } catch (error) {
      console.error('Error fetching containers:', error)
      return []
    }
  }

  /**
   * Get items under a specific container
   */
  async getItemsByContainer(containerId: string): Promise<Task[]> {
    try {
      const params = new URLSearchParams()
      params.set('parent_id', containerId)

      const response = await fetch(`/api/tasks?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        return data.tasks || []
      }
      return []
    } catch (error) {
      console.error('Error fetching items by container:', error)
      return []
    }
  }

  /**
   * Get tasks sorted by computed priority (Gravity Engine)
   */
  async getTasksByPriority(limit: number = 20): Promise<Task[]> {
    try {
      const params = new URLSearchParams()
      params.set('sort_by', 'computed_priority')
      params.set('limit', limit.toString())
      params.set('node_type', 'item')
      params.set('status', 'pending,active')

      const response = await fetch(`/api/tasks?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        return data.tasks || []
      }
      return []
    } catch (error) {
      console.error('Error fetching tasks by priority:', error)
      return []
    }
  }

  /**
   * Create a relationship between tasks
   */
  async createRelation(relationData: CreateRelationDTO): Promise<TaskRelation | null> {
    try {
      const response = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relationData),
      })

      if (response.ok) {
        const data = await response.json()
        return data.relation
      }
      return null
    } catch (error) {
      console.error('Error creating relation:', error)
      return null
    }
  }

  /**
   * Delete a relationship
   */
  async deleteRelation(relationId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/relations/${relationId}`, {
        method: 'DELETE',
      })
      return response.ok
    } catch (error) {
      console.error('Error deleting relation:', error)
      return false
    }
  }

  /**
   * Get relations for a task (both directions)
   */
  async getRelations(taskId: string): Promise<{ blocking: TaskRelation[]; blockedBy: TaskRelation[] }> {
    try {
      const response = await fetch(`/api/relations?task_id=${taskId}`)
      if (response.ok) {
        const data = await response.json()
        return {
          blocking: data.blocking || [],
          blockedBy: data.blockedBy || [],
        }
      }
      return { blocking: [], blockedBy: [] }
    } catch (error) {
      console.error('Error fetching relations:', error)
      return { blocking: [], blockedBy: [] }
    }
  }

  /**
   * Get active containers for agent context injection
   */
  async getActiveContainersForContext(): Promise<Array<{ id: string; title: string; category: string }>> {
    try {
      const containers = await this.getContainers({ status: 'active' })
      return containers.map(c => ({
        id: c.id,
        title: c.title,
        category: c.category || c.task_type,
      }))
    } catch (error) {
      console.error('Error fetching containers for context:', error)
      return []
    }
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