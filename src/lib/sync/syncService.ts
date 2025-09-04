import { Task } from '@/types'
import { indexedDBService } from '@/lib/storage/indexedDB'
import { keyManager } from '@/lib/encryption/keyManager'

export class SyncService {
  private static instance: SyncService
  private syncInProgress = false
  private deviceId: string
  private userId: string | null = null

  private constructor() {
    this.deviceId = this.getOrCreateDeviceId()
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService()
    }
    return SyncService.instance
  }

  /**
   * Initialize sync service
   */
  async initialize(userId: string): Promise<void> {
    this.userId = userId
    
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
      throw error
    } finally {
      this.syncInProgress = false
    }
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

      const { results } = await response.json()

      // Mark successful changes as synced
      const successfulChangeIds = results
        .filter((result: any) => result.status === 'success')
        .map((result: any) => result.entity_id)

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

    } catch (error) {
      console.error('Full sync failed:', error)
    }
  }

  /**
   * Create task (with offline support)
   */
  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    if (!this.userId) throw new Error('User not initialized')

    const newTask: Task = {
      ...task,
      id: crypto.randomUUID(),
      user_id: this.userId,
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
    if (!this.userId) throw new Error('User not initialized')

    // Get existing task
    const tasks = await indexedDBService.getTasks(this.userId)
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
    if (!this.userId) throw new Error('User not initialized')

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
    if (!this.userId) throw new Error('User not initialized')
    
    const tasks = await indexedDBService.getTasks(this.userId)
    
    // Decrypt tasks
    const decryptedTasks = []
    for (const task of tasks) {
      try {
        const decryptedTask = await this.decryptTask(task)
        decryptedTasks.push(decryptedTask)
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
  private async applyChange(change: any): Promise<void> {
    const { operation, entity_type, entity_id, data } = change

    if (entity_type === 'task') {
      switch (operation) {
        case 'create':
        case 'update':
          const decryptedData = await this.decryptTask(data)
          await indexedDBService.storeTask({ id: entity_id, ...decryptedData })
          break
        case 'delete':
          await indexedDBService.deleteTask(entity_id)
          break
      }
    }
  }

  private async encryptTask(task: any): Promise<any> {
    if (!keyManager.isInitialized()) return task

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

  private async decryptTask(task: any): Promise<any> {
    if (!keyManager.isInitialized()) return task

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
      // If decryption fails, return original data
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
    let deviceId = localStorage.getItem('device_id')
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      localStorage.setItem('device_id', deviceId)
    }
    return deviceId
  }

  private startPeriodicSync(): void {
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