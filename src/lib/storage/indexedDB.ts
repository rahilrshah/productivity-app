import { Task } from '@/types'

const DB_NAME = 'ProductivityApp'
const DB_VERSION = 1

interface StoredTask extends Omit<Task, 'tags' | 'dependencies'> {
  tags: string
  dependencies: string
}

interface OfflineChange {
  id: string
  operation: 'create' | 'update' | 'delete'
  entity_type: 'task' | 'user'
  entity_id: string
  data: any
  timestamp: string
  synced: boolean
}

class IndexedDBService {
  private db: IDBDatabase | null = null
  private readonly stores = {
    tasks: 'tasks',
    sync_queue: 'sync_queue',
    offline_changes: 'offline_changes',
    settings: 'settings'
  }

  /**
   * Initialize IndexedDB connection
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Tasks store
        if (!db.objectStoreNames.contains(this.stores.tasks)) {
          const taskStore = db.createObjectStore(this.stores.tasks, { keyPath: 'id' })
          taskStore.createIndex('user_id', 'user_id', { unique: false })
          taskStore.createIndex('status', 'status', { unique: false })
          taskStore.createIndex('due_date', 'due_date', { unique: false })
          taskStore.createIndex('updated_at', 'updated_at', { unique: false })
        }

        // Offline changes queue
        if (!db.objectStoreNames.contains(this.stores.offline_changes)) {
          const changesStore = db.createObjectStore(this.stores.offline_changes, { keyPath: 'id' })
          changesStore.createIndex('synced', 'synced', { unique: false })
          changesStore.createIndex('timestamp', 'timestamp', { unique: false })
        }

        // Settings store
        if (!db.objectStoreNames.contains(this.stores.settings)) {
          db.createObjectStore(this.stores.settings, { keyPath: 'key' })
        }
      }
    })
  }

  /**
   * Store tasks in IndexedDB
   */
  async storeTasks(tasks: Task[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const transaction = this.db.transaction([this.stores.tasks], 'readwrite')
    const store = transaction.objectStore(this.stores.tasks)

    for (const task of tasks) {
      const storedTask: StoredTask = {
        ...task,
        tags: JSON.stringify(task.tags),
        dependencies: JSON.stringify(task.dependencies)
      }
      store.put(storedTask)
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  }

  /**
   * Get tasks from IndexedDB
   */
  async getTasks(userId: string): Promise<Task[]> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.tasks], 'readonly')
      const store = transaction.objectStore(this.stores.tasks)
      const index = store.index('user_id')
      const request = index.getAll(userId)

      request.onsuccess = () => {
        const storedTasks = request.result as StoredTask[]
        const tasks: Task[] = storedTasks.map(task => ({
          ...task,
          tags: JSON.parse(task.tags),
          dependencies: JSON.parse(task.dependencies)
        }))
        resolve(tasks)
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Store a single task
   */
  async storeTask(task: Task): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.tasks], 'readwrite')
      const store = transaction.objectStore(this.stores.tasks)
      
      const storedTask: StoredTask = {
        ...task,
        tags: JSON.stringify(task.tags),
        dependencies: JSON.stringify(task.dependencies)
      }
      
      const request = store.put(storedTask)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Delete a task from IndexedDB
   */
  async deleteTask(taskId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.tasks], 'readwrite')
      const store = transaction.objectStore(this.stores.tasks)
      const request = store.delete(taskId)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Queue an offline change
   */
  async queueOfflineChange(change: Omit<OfflineChange, 'id' | 'timestamp' | 'synced'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const offlineChange: OfflineChange = {
      ...change,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      synced: false
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.offline_changes], 'readwrite')
      const store = transaction.objectStore(this.stores.offline_changes)
      const request = store.add(offlineChange)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get pending offline changes
   */
  async getPendingChanges(): Promise<OfflineChange[]> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.offline_changes], 'readonly')
      const store = transaction.objectStore(this.stores.offline_changes)
      const index = store.index('synced')
      const request = index.getAll(IDBKeyRange.only(false)) // Get unsynced changes

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Mark changes as synced
   */
  async markChangesSynced(changeIds: string[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.offline_changes], 'readwrite')
      const store = transaction.objectStore(this.stores.offline_changes)
      let completed = 0

      for (const changeId of changeIds) {
        const getRequest = store.get(changeId)
        
        getRequest.onsuccess = () => {
          const change = getRequest.result
          if (change) {
            change.synced = true
            const putRequest = store.put(change)
            putRequest.onsuccess = () => {
              completed++
              if (completed === changeIds.length) {
                resolve()
              }
            }
            putRequest.onerror = () => reject(putRequest.error)
          } else {
            completed++
            if (completed === changeIds.length) {
              resolve()
            }
          }
        }
        
        getRequest.onerror = () => reject(getRequest.error)
      }
    })
  }

  /**
   * Clear synced changes older than specified days
   */
  async clearOldSyncedChanges(days: number = 7): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)
    const cutoffISO = cutoffDate.toISOString()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.offline_changes], 'readwrite')
      const store = transaction.objectStore(this.stores.offline_changes)
      const index = store.index('timestamp')
      const range = IDBKeyRange.upperBound(cutoffISO)
      const request = index.openCursor(range)

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const change = cursor.value as OfflineChange
          if (change.synced) {
            cursor.delete()
          }
          cursor.continue()
        } else {
          resolve()
        }
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Store settings
   */
  async storeSetting(key: string, value: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.settings], 'readwrite')
      const store = transaction.objectStore(this.stores.settings)
      const request = store.put({ key, value, timestamp: new Date().toISOString() })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get setting
   */
  async getSetting(key: string): Promise<any> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.stores.settings], 'readonly')
      const store = transaction.objectStore(this.stores.settings)
      const request = store.get(key)

      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.value : null)
      }
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Clear all data (for logout)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const storeNames = Object.values(this.stores)
      const transaction = this.db!.transaction(storeNames, 'readwrite')
      let completed = 0

      for (const storeName of storeNames) {
        const store = transaction.objectStore(storeName)
        const request = store.clear()
        
        request.onsuccess = () => {
          completed++
          if (completed === storeNames.length) {
            resolve()
          }
        }
        request.onerror = () => reject(request.error)
      }
    })
  }

  /**
   * Check if database is available (for offline detection)
   */
  isAvailable(): boolean {
    return this.db !== null
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export const indexedDBService = new IndexedDBService()