import { Task } from '@/types'
import { indexedDBService } from '@/lib/storage/indexedDB'
import { keyManager } from '@/lib/encryption/keyManager'

/**
 * Error thrown when encryption is required but not available
 */
export class EncryptionRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncryptionRequiredError'
  }
}

export class SyncService {
  private static instance: SyncService
  private syncInProgress = false
  private deviceId: string
  private userId: string | null = null
  private retryCount = 0
  private maxRetries = 5
  private requireEncryption = false // Can be enabled for production

  private constructor() {
    // Initialize deviceId as empty, will be set during initialize()
    this.deviceId = ''
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService()
    }
    return SyncService.instance
  }

  /**
   * Initialize sync service
   * @param userId - The user's ID
   * @param options - Configuration options
   */
  async initialize(
    userId: string,
    options: { requireEncryption?: boolean } = {}
  ): Promise<void> {
    this.userId = userId
    this.requireEncryption = options.requireEncryption ?? false

    // Set device ID now that we're in client context
    this.deviceId = this.getOrCreateDeviceId()

    // Initialize IndexedDB
    await indexedDBService.initialize()

    // Set up periodic sync
    this.startPeriodicSync()

    // Set up online/offline event listeners
    this.setupNetworkListeners()
  }

  /**
   * Sync tasks from server to local storage
   */
  async syncFromServer(): Promise<void> {
    if (!this.userId || this.syncInProgress) return

    try {
      this.syncInProgress = true
      
      // Get last sync timestamp
      const lastSync = await indexedDBService.getSetting('last_sync_timestamp')
      
      // Fetch changes from server
      const url = new URL('/api/sync/pull', window.location.origin)
      url.searchParams.set('device_id', this.deviceId)
      if (lastSync) {
        url.searchParams.set('since', lastSync)
      }

      const response = await fetch(url.toString())
      
      if (!response.ok) {
        throw new Error('Failed to fetch sync data')
      }

      const { changes, timestamp } = await response.json()

      // Apply changes locally
      for (const change of changes) {
        await this.applyChange(change)
      }

      // Update last sync timestamp
      await indexedDBService.storeSetting('last_sync_timestamp', timestamp)

    } catch (error) {
      console.error('Sync from server failed:', error)
      // Implement exponential backoff for retries
      this.scheduleRetry()
      throw error
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Schedule a retry with exponential backoff
   */
  private scheduleRetry(): void {
    if (this.retryCount >= this.maxRetries) {
      console.warn('Max retries reached, will try again on next scheduled sync')
      this.retryCount = 0
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000) // Max 30s
    this.retryCount++

    console.log(`Scheduling retry in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`)

    setTimeout(() => {
      if (navigator.onLine && !this.syncInProgress) {
        this.fullSync().catch(console.error)
      }
    }, delay)
  }

  /**
   * Sync local changes to server
   */
  async syncToServer(): Promise<void> {
    if (!this.userId || this.syncInProgress) return

    try {
      this.syncInProgress = true

      // Get pending changes
      const pendingChanges = await indexedDBService.getPendingChanges()
      
      if (pendingChanges.length === 0) return

      // Prepare changes for server
      const serverChanges = pendingChanges.map(change => ({
        operation: change.operation,
        entity_type: change.entity_type,
        entity_id: change.entity_id,
        data: change.data,
        vector_clock: this.generateVectorClock()
      }))

      // Send changes to server
      const response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_id: this.deviceId,
          changes: serverChanges
        })
      })

      if (!response.ok) {
        throw new Error('Failed to push sync data')
      }

      const { results } = await response.json() as {
        results: Array<{ entity_id: string; status: 'success' | 'error'; error?: string }>
      }

      // Mark successful changes as synced
      const successfulChangeIds = results
        .filter((result) => result.status === 'success')
        .map((result) => result.entity_id)

      if (successfulChangeIds.length > 0) {
        await indexedDBService.markChangesSynced(successfulChangeIds)
      }

    } catch (error) {
      console.error('Sync to server failed:', error)
      throw error
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Full bidirectional sync
   */
  async fullSync(): Promise<void> {
    if (!navigator.onLine) {
      console.log('Offline - skipping sync')
      return
    }

    try {
      // Sync local changes to server first
      await this.syncToServer()
      
      // Then sync changes from server
      await this.syncFromServer()

      // Clean up old synced changes
      await indexedDBService.clearOldSyncedChanges(7)

      // Reset retry count on successful sync
      this.retryCount = 0

    } catch (error) {
      console.error('Full sync failed:', error)
      // Don't schedule retry here as individual methods handle it
    }
  }

  /**
   * Create task (with offline support)
   */
  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    // Use provided user_id or fall back to local-user for single-user mode
    const userId = task.user_id || this.userId || 'local-user'

    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Store locally first
    await indexedDBService.storeTask(newTask)

    // Encrypt sensitive data before queuing for sync
    const encryptedTask = await this.encryptTask(newTask)

    // Queue for sync
    await indexedDBService.queueOfflineChange({
      operation: 'create',
      entity_type: 'task',
      entity_id: newTask.id,
      data: encryptedTask
    })

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.fullSync().catch(console.error)
    }

    return newTask
  }

  /**
   * Update task (with offline support)
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const userId = this.userId || 'local-user'

    // Get existing task
    const tasks = await indexedDBService.getTasks(userId)
    const existingTask = tasks.find(t => t.id === taskId)
    
    if (!existingTask) {
      throw new Error('Task not found')
    }

    const updatedTask: Task = {
      ...existingTask,
      ...updates,
      updated_at: new Date().toISOString(),
    }

    // Store locally
    await indexedDBService.storeTask(updatedTask)

    // Encrypt sensitive data before queuing for sync
    const encryptedUpdates = await this.encryptTask(updates)

    // Queue for sync
    await indexedDBService.queueOfflineChange({
      operation: 'update',
      entity_type: 'task',
      entity_id: taskId,
      data: encryptedUpdates
    })

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.fullSync().catch(console.error)
    }

    return updatedTask
  }

  /**
   * Delete task (with offline support)
   */
  async deleteTask(taskId: string): Promise<void> {
    // Single-user mode support

    // Remove from local storage
    await indexedDBService.deleteTask(taskId)

    // Queue for sync
    await indexedDBService.queueOfflineChange({
      operation: 'delete',
      entity_type: 'task',
      entity_id: taskId,
      data: { deleted_at: new Date().toISOString() }
    })

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.fullSync().catch(console.error)
    }
  }

  /**
   * Get tasks (from local storage)
   */
  async getTasks(): Promise<Task[]> {
    const userId = this.userId || 'local-user'

    const tasks = await indexedDBService.getTasks(userId)

    // Decrypt tasks
    const decryptedTasks: Task[] = []
    for (const task of tasks) {
      try {
        const decryptedTask = await this.decryptTask(task)
        // Merge decrypted fields back into the full task
        decryptedTasks.push({ ...task, ...decryptedTask } as Task)
      } catch (error) {
        console.error('Failed to decrypt task:', error)
        // Include task with original data if decryption fails
        decryptedTasks.push(task)
      }
    }

    return decryptedTasks
  }

  /**
   * Private helper methods
   */
  private async applyChange(change: {
    operation: string
    entity_type: string
    entity_id: string
    data: Partial<Task>
  }): Promise<void> {
    const { operation, entity_type, entity_id, data } = change

    if (entity_type === 'task') {
      switch (operation) {
        case 'create':
        case 'update': {
          const decryptedData = await this.decryptTask(data)
          await indexedDBService.storeTask({ id: entity_id, ...decryptedData } as Task)
          break
        }
        case 'delete':
          await indexedDBService.deleteTask(entity_id)
          break
      }
    }
  }

  /**
   * Encrypt task data before syncing
   * @throws EncryptionRequiredError if encryption is required but not available
   */
  private async encryptTask(task: Partial<Task>): Promise<Partial<Task>> {
    if (!keyManager.isInitialized()) {
      if (this.requireEncryption) {
        throw new EncryptionRequiredError(
          'Encryption is required but keyManager is not initialized. ' +
          'Please ensure encryption keys are set up before syncing sensitive data.'
        )
      }
      // In non-strict mode, warn but continue
      console.warn('Warning: Syncing data without encryption. Set requireEncryption=true in production.')
      return task
    }

    const encrypted = { ...task }

    // Encrypt sensitive fields
    if (task.title) {
      encrypted.title = await keyManager.encryptForPurpose(task.title, 'tasks')
    }
    if (task.content) {
      encrypted.content = await keyManager.encryptForPurpose(JSON.stringify(task.content), 'tasks')
    }

    return encrypted
  }

  /**
   * Decrypt task data after fetching from server
   * @throws EncryptionRequiredError if decryption fails and encryption is required
   */
  private async decryptTask(task: Partial<Task>): Promise<Partial<Task>> {
    if (!keyManager.isInitialized()) {
      if (this.requireEncryption) {
        throw new EncryptionRequiredError(
          'Decryption required but keyManager is not initialized. ' +
          'Please ensure encryption keys are available before accessing encrypted data.'
        )
      }
      return task
    }

    const decrypted = { ...task }

    // Decrypt sensitive fields
    try {
      if (task.title && typeof task.title === 'string' && task.title.startsWith('{')) {
        decrypted.title = await keyManager.decryptForPurpose(task.title, 'tasks')
      }
      if (task.content && typeof task.content === 'string' && task.content.startsWith('{')) {
        const decryptedContent = await keyManager.decryptForPurpose(task.content, 'tasks')
        decrypted.content = JSON.parse(decryptedContent)
      }
    } catch (error) {
      if (this.requireEncryption) {
        throw new EncryptionRequiredError(
          `Failed to decrypt task ${task.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
      // In non-strict mode, warn and return original
      console.warn('Decryption failed for task:', task.id, error)
    }

    return decrypted
  }

  private generateVectorClock(): Record<string, number> {
    // Simple vector clock implementation
    const timestamp = Date.now()
    return {
      [this.deviceId]: timestamp
    }
  }

  private getOrCreateDeviceId(): string {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      // Server-side: return a temporary ID that will be replaced on client
      return 'temp-server-id'
    }
    
    let deviceId = localStorage.getItem('device_id')
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem('device_id', deviceId)
    }
    return deviceId
  }

  private startPeriodicSync(): void {
    // Only start sync on client side
    if (typeof window === 'undefined') return
    
    // Sync every 5 minutes when online
    setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        this.fullSync().catch(console.error)
      }
    }, 5 * 60 * 1000) // 5 minutes
  }

  private setupNetworkListeners(): void {
    // Sync when coming back online
    window.addEventListener('online', () => {
      console.log('Back online - starting sync')
      setTimeout(() => {
        this.fullSync().catch(console.error)
      }, 1000) // Wait a bit for connection to stabilize
    })

    // Handle going offline
    window.addEventListener('offline', () => {
      console.log('Gone offline - will queue changes locally')
    })
  }

  /**
   * Check if sync is needed
   */
  async needsSync(): Promise<boolean> {
    const pendingChanges = await indexedDBService.getPendingChanges()
    return pendingChanges.length > 0
  }

  /**
   * Get sync status
   */
  getSyncStatus(): { inProgress: boolean; online: boolean } {
    return {
      inProgress: this.syncInProgress,
      online: navigator.onLine
    }
  }

  /**
   * Clear all local data (for logout)
   */
  async clearLocalData(): Promise<void> {
    await indexedDBService.clearAllData()
    this.userId = null
  }
}

export const syncService = SyncService.getInstance()