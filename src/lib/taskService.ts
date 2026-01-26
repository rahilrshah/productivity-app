import { Task, CreateTaskDTO, UpdateTaskDTO, TaskRelation, CreateRelationDTO, GraphNodeFilter, TaskType, TaskCategory } from '@/types'
import { syncService } from '@/lib/sync/syncService'
import { indexedDBService } from '@/lib/storage/indexedDB'
import { authService } from '@/lib/auth'
import {
  TaskNotFoundError,
  ValidationError,
  NetworkError,
  OfflineError,
  SyncError,
  toErrorResponse,
  isAppError,
} from '@/lib/errors'

/**
 * Derives task_type from category for backward compatibility
 * Maps v3.0 categories to legacy task_type
 */
function categoryToTaskType(category: TaskCategory | undefined): TaskType {
  switch (category) {
    case 'course': return 'course'
    case 'project': return 'project'
    case 'club': return 'club'
    case 'routine': return 'todo'  // routine maps to todo for legacy
    case 'journal': return 'todo'  // journal maps to todo for legacy
    case 'todo':
    default:
      return 'todo'
  }
}

/**
 * Normalizes category, accepting both new category and legacy task_type
 */
function normalizeCategory(taskData: CreateTaskDTO): TaskCategory {
  // Prefer category if provided
  if (taskData.category) return taskData.category
  // Fall back to task_type mapping
  if (taskData.task_type) return taskData.task_type as TaskCategory
  // Default to todo
  return 'todo'
}

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
   * @throws {SyncError} When sync service fails and API fallback also fails
   */
  async getTasks(): Promise<Task[]> {
    try {
      // Try to get from sync service first (handles offline/online)
      return await syncService.getTasks()
    } catch (syncError) {
      // Log but don't expose internal details
      console.error('Error getting tasks from sync service:', syncError)

      // Fallback to direct API call
      try {
        const response = await fetch('/api/tasks')
        if (response.ok) {
          const data = await response.json()
          return data.tasks || []
        }
        // API returned error status
        throw new NetworkError(
          `Failed to fetch tasks: ${response.status}`,
          '/api/tasks',
          'GET'
        )
      } catch (apiError) {
        // If it's already our error type, rethrow
        if (isAppError(apiError)) {
          throw apiError
        }
        // Network or other error - return empty for offline resilience
        console.error('API fallback failed:', apiError)
        return []
      }
    }
  }

  /**
   * Create a new task
   * @throws {ValidationError} When task data is invalid
   * @throws {NetworkError} When API request fails
   */
  async createTask(taskData: CreateTaskDTO): Promise<Task> {
    // Validate required fields
    if (!taskData.title || taskData.title.trim().length === 0) {
      throw new ValidationError('Task title is required', 'title')
    }
    if (taskData.title.length > 500) {
      throw new ValidationError('Task title must be 500 characters or less', 'title')
    }

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
          } catch (localError) {
            console.warn('Failed to store task locally:', localError)
          }

          return data.task
        } else if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}))
          throw new ValidationError(
            errorData.error || 'Invalid task data',
            errorData.field,
            errorData.details
          )
        } else {
          throw new NetworkError(
            `Failed to create task: ${response.status}`,
            '/api/tasks',
            'POST'
          )
        }
      } else {
        // Offline - fall through to sync service
        throw new OfflineError('Creating task offline')
      }
    } catch (error) {
      // If it's already our error type and not OfflineError, rethrow
      if (isAppError(error) && !(error instanceof OfflineError)) {
        throw error
      }

      // Use sync service for offline creation
      // Normalize category (primary field) and derive task_type for backward compatibility
      const category = normalizeCategory(taskData)
      const taskType = taskData.task_type || categoryToTaskType(category)

      // Determine node_type: containers are top-level courses/projects/clubs, items have parents
      const nodeType = taskData.node_type ||
        (taskData.parent_id ? 'item' :
          (['course', 'project', 'club'].includes(category) ? 'container' : 'item'))

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
        task_type: taskType,
        type_metadata: taskData.type_metadata || { category: 'general' },
        // v3.0 Graph fields
        node_type: nodeType as 'container' | 'item',
        category: category,
      }

      return await syncService.createTask(task)
    }
  }

  /**
   * Create multiple tasks in a single batch operation
   * More efficient than creating tasks one by one for bulk imports
   *
   * @param tasks Array of partial task data to create
   * @returns Array of created tasks
   * @throws {ValidationError} When any task data is invalid
   * @throws {SyncError} When batch creation fails
   */
  async createTasksBatch(tasks: Array<CreateTaskDTO & { id?: string; user_id?: string; status?: string }>): Promise<Task[]> {
    if (!tasks || tasks.length === 0) {
      return []
    }

    // Validate all tasks first
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      if (!task.title || task.title.trim().length === 0) {
        throw new ValidationError(`Task at index ${i} is missing a title`, 'title')
      }
      if (task.title.length > 500) {
        throw new ValidationError(`Task at index ${i} title must be 500 characters or less`, 'title')
      }
    }

    const userId = await this.getCurrentUserId()
    const now = new Date().toISOString()

    // Prepare clean task data for batch insert
    const cleanTasks = tasks.map(t => {
      const category = normalizeCategory(t as CreateTaskDTO)
      const taskType = t.task_type || categoryToTaskType(category)
      const nodeType = t.node_type ||
        (t.parent_id ? 'item' :
          (['course', 'project', 'club'].includes(category) ? 'container' : 'item'))

      return {
        id: t.id || crypto.randomUUID(),
        user_id: t.user_id || userId,
        title: t.title!.trim(),
        content: t.content || '',
        rich_content: t.rich_content,
        status: t.status || 'pending',
        priority: t.priority || 5,
        manual_priority: t.manual_priority || 0,
        due_date: t.due_date || null,
        start_date: t.start_date || null,
        tags: t.tags || [],
        dependencies: [],
        position: 0,
        version: 1,
        parent_id: t.parent_id || null,
        task_type: taskType,
        type_metadata: t.type_metadata || { category: 'general' },
        node_type: nodeType as 'container' | 'item',
        category: category,
        created_at: now,
        updated_at: now,
      }
    })

    try {
      if (navigator.onLine) {
        // Use API for batch creation when online
        const response = await fetch('/api/tasks/batch', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tasks: cleanTasks }),
        })

        if (response.ok) {
          const data = await response.json()
          const createdTasks = data.tasks || []

          // Store in local storage as well
          try {
            for (const task of createdTasks) {
              await indexedDBService.storeTask(task)
            }
          } catch (localError) {
            console.warn('Failed to store batch tasks locally:', localError)
          }

          return createdTasks
        } else if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}))
          throw new ValidationError(
            errorData.error || 'Invalid batch task data',
            errorData.field,
            errorData.details
          )
        } else {
          // Fall through to direct Supabase insert
          throw new NetworkError(
            `Batch API not available: ${response.status}`,
            '/api/tasks/batch',
            'POST'
          )
        }
      } else {
        throw new OfflineError('Creating batch tasks offline')
      }
    } catch (error) {
      // If it's already our error type (except Network/Offline), rethrow
      if (isAppError(error) && !(error instanceof NetworkError) && !(error instanceof OfflineError)) {
        throw error
      }

      // Fall back to creating tasks through sync service one by one
      // This is less efficient but works offline
      console.warn('Batch API unavailable, falling back to individual creates')
      const createdTasks: Task[] = []
      for (const task of cleanTasks) {
        try {
          const created = await syncService.createTask(task as Omit<Task, 'id' | 'created_at' | 'updated_at'>)
          createdTasks.push(created)
        } catch (createError) {
          console.error(`Failed to create task "${task.title}":`, createError)
          // Continue with remaining tasks
        }
      }
      return createdTasks
    }
  }

  /**
   * Update a task
   * @throws {TaskNotFoundError} When task is not found
   * @throws {ValidationError} When update data is invalid
   * @throws {NetworkError} When API request fails
   */
  async updateTask(taskId: string, updates: UpdateTaskDTO): Promise<Task> {
    // Validate taskId
    if (!taskId || typeof taskId !== 'string') {
      throw new ValidationError('Task ID is required', 'taskId')
    }

    // Validate update fields if provided
    if (updates.title !== undefined && updates.title.length > 500) {
      throw new ValidationError('Task title must be 500 characters or less', 'title')
    }

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
          } catch (localError) {
            console.warn('Failed to update task locally:', localError)
          }

          return data.task
        } else if (response.status === 404) {
          throw new TaskNotFoundError(taskId)
        } else if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}))
          throw new ValidationError(
            errorData.error || 'Invalid update data',
            errorData.field,
            errorData.details
          )
        } else {
          throw new NetworkError(
            `Failed to update task: ${response.status}`,
            `/api/tasks/${taskId}`,
            'PUT'
          )
        }
      } else {
        // Offline - fall through to sync service
        throw new OfflineError('Updating task offline')
      }
    } catch (error) {
      // If it's already our error type and not OfflineError, rethrow
      if (isAppError(error) && !(error instanceof OfflineError)) {
        throw error
      }

      // Use sync service for offline updates
      return await syncService.updateTask(taskId, updates)
    }
  }

  /**
   * Delete a task
   * @throws {TaskNotFoundError} When task is not found
   * @throws {ValidationError} When task ID is invalid
   * @throws {NetworkError} When API request fails
   */
  async deleteTask(taskId: string): Promise<void> {
    // Validate taskId
    if (!taskId || typeof taskId !== 'string') {
      throw new ValidationError('Task ID is required', 'taskId')
    }

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
          } catch (localError) {
            console.warn('Failed to delete task locally:', localError)
          }

          return
        } else if (response.status === 404) {
          throw new TaskNotFoundError(taskId)
        } else {
          throw new NetworkError(
            `Failed to delete task: ${response.status}`,
            `/api/tasks/${taskId}`,
            'DELETE'
          )
        }
      } else {
        // Offline - fall through to sync service
        throw new OfflineError('Deleting task offline')
      }
    } catch (error) {
      // If it's already our error type and not OfflineError, rethrow
      if (isAppError(error) && !(error instanceof OfflineError)) {
        throw error
      }

      // Use sync service for offline deletion
      await syncService.deleteTask(taskId)
    }
  }

  /**
   * Force sync with server
   * @throws {OfflineError} When device is offline
   * @throws {SyncError} When sync operation fails
   */
  async syncNow(): Promise<void> {
    if (!navigator.onLine) {
      throw new OfflineError('Cannot sync while offline')
    }

    try {
      await syncService.fullSync()
    } catch (error) {
      if (isAppError(error)) {
        throw error
      }
      throw new SyncError(
        error instanceof Error ? error.message : 'Sync operation failed',
        'full'
      )
    }
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
   * Returns empty array on network errors for offline resilience
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
      console.error(`Failed to fetch containers: ${response.status}`)
      return []
    } catch (error) {
      // Log but return empty for offline resilience
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