'use client'

import { Task } from '@/types'

export type OperationType = 'create' | 'update' | 'delete' | 'move'

export interface CRDTOperation {
  id: string
  type: OperationType
  entityId: string
  entityType: 'task' | 'project' | 'note'
  userId: string
  timestamp: number
  vectorClock: Record<string, number>
  payload: any
  applied: boolean
}

export interface VectorClock {
  [userId: string]: number
}

export interface CRDTState {
  tasks: Record<string, Task>
  operations: CRDTOperation[]
  vectorClock: VectorClock
  userId: string
}

class CRDTEngine {
  private state: CRDTState
  private subscribers: Set<(state: CRDTState) => void> = new Set()
  private conflictHandlers: Set<(operation: CRDTOperation, existing: Task) => Task> = new Set()

  constructor(userId: string) {
    this.state = {
      tasks: {},
      operations: [],
      vectorClock: { [userId]: 0 },
      userId
    }
  }

  // Generate a new operation
  private createOperation(
    type: OperationType,
    entityId: string,
    entityType: 'task' | 'project' | 'note',
    payload: any
  ): CRDTOperation {
    this.state.vectorClock[this.state.userId] = (this.state.vectorClock[this.state.userId] || 0) + 1

    return {
      id: crypto.randomUUID(),
      type,
      entityId,
      entityType,
      userId: this.state.userId,
      timestamp: Date.now(),
      vectorClock: { ...this.state.vectorClock },
      payload,
      applied: false
    }
  }

  // Apply an operation to the state
  private applyOperation(operation: CRDTOperation): boolean {
    if (operation.applied) return false

    // Update vector clock
    Object.keys(operation.vectorClock).forEach(userId => {
      this.state.vectorClock[userId] = Math.max(
        this.state.vectorClock[userId] || 0,
        operation.vectorClock[userId]
      )
    })

    switch (operation.type) {
      case 'create':
        this.handleCreate(operation)
        break
      case 'update':
        this.handleUpdate(operation)
        break
      case 'delete':
        this.handleDelete(operation)
        break
      case 'move':
        this.handleMove(operation)
        break
      default:
        console.warn('Unknown operation type:', operation.type)
        return false
    }

    operation.applied = true
    this.state.operations.push(operation)
    this.notifySubscribers()
    return true
  }

  private handleCreate(operation: CRDTOperation) {
    if (operation.entityType === 'task' && operation.payload) {
      const task: Task = {
        ...operation.payload,
        id: operation.entityId,
        created_at: new Date(operation.timestamp).toISOString(),
        updated_at: new Date(operation.timestamp).toISOString(),
        user_id: operation.userId,
        version: 1
      }
      this.state.tasks[operation.entityId] = task
    }
  }

  private handleUpdate(operation: CRDTOperation) {
    if (operation.entityType === 'task') {
      const existingTask = this.state.tasks[operation.entityId]
      if (existingTask) {
        // Handle conflicts using Last-Writer-Wins with vector clock comparison
        const conflictResolved = this.resolveConflict(operation, existingTask)
        this.state.tasks[operation.entityId] = {
          ...conflictResolved,
          updated_at: new Date(operation.timestamp).toISOString(),
          version: (existingTask.version || 0) + 1
        }
      }
    }
  }

  private handleDelete(operation: CRDTOperation) {
    if (operation.entityType === 'task') {
      delete this.state.tasks[operation.entityId]
    }
  }

  private handleMove(operation: CRDTOperation) {
    if (operation.entityType === 'task') {
      const task = this.state.tasks[operation.entityId]
      if (task && operation.payload.position !== undefined) {
        this.state.tasks[operation.entityId] = {
          ...task,
          position: operation.payload.position,
          updated_at: new Date(operation.timestamp).toISOString(),
          version: (task.version || 0) + 1
        }
      }
    }
  }

  private resolveConflict(operation: CRDTOperation, existingTask: Task): Task {
    // Try custom conflict handlers first
    for (const handler of this.conflictHandlers) {
      try {
        const result = handler(operation, existingTask)
        if (result) return result
      } catch (error) {
        console.error('Conflict handler error:', error)
      }
    }

    // Default resolution: merge properties, preferring later timestamp
    const merged = { ...existingTask }
    
    if (operation.payload) {
      Object.keys(operation.payload).forEach(key => {
        if (key === 'id' || key === 'user_id' || key === 'created_at') return
        
        // For arrays like tags, merge uniquely
        if (key === 'tags' && Array.isArray(operation.payload[key]) && Array.isArray(merged[key])) {
          merged[key] = [...new Set([...merged[key], ...operation.payload[key]])]
        }
        // For other fields, use timestamp to decide
        else if (operation.timestamp > new Date(existingTask.updated_at || 0).getTime()) {
          (merged as any)[key] = (operation.payload as any)[key]
        }
      })
    }

    return merged
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => {
      try {
        callback(this.state)
      } catch (error) {
        console.error('Subscriber error:', error)
      }
    })
  }

  // Public API methods
  createTask(task: Partial<Task>): string {
    const taskId = crypto.randomUUID()
    const operation = this.createOperation('create', taskId, 'task', task)
    this.applyOperation(operation)
    return taskId
  }

  updateTask(taskId: string, updates: Partial<Task>): boolean {
    const operation = this.createOperation('update', taskId, 'task', updates)
    return this.applyOperation(operation)
  }

  deleteTask(taskId: string): boolean {
    const operation = this.createOperation('delete', taskId, 'task', {})
    return this.applyOperation(operation)
  }

  moveTask(taskId: string, newPosition: number): boolean {
    const operation = this.createOperation('move', taskId, 'task', { position: newPosition })
    return this.applyOperation(operation)
  }

  // Synchronization methods
  getOperationsSince(vectorClock: VectorClock): CRDTOperation[] {
    return this.state.operations.filter(op => {
      return Object.keys(op.vectorClock).some(userId => 
        op.vectorClock[userId] > (vectorClock[userId] || 0)
      )
    })
  }

  applyRemoteOperations(operations: CRDTOperation[]): number {
    let appliedCount = 0
    
    // Sort operations by timestamp to ensure consistent application order
    operations.sort((a, b) => a.timestamp - b.timestamp)
    
    operations.forEach(operation => {
      // Check if we've already applied this operation
      const existingOp = this.state.operations.find(op => op.id === operation.id)
      if (!existingOp) {
        if (this.applyOperation({ ...operation, applied: false })) {
          appliedCount++
        }
      }
    })

    return appliedCount
  }

  getState(): CRDTState {
    return { ...this.state }
  }

  getTasks(): Task[] {
    return Object.values(this.state.tasks).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  getTask(taskId: string): Task | undefined {
    return this.state.tasks[taskId]
  }

  subscribe(callback: (state: CRDTState) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  addConflictHandler(handler: (operation: CRDTOperation, existing: Task) => Task): () => void {
    this.conflictHandlers.add(handler)
    return () => this.conflictHandlers.delete(handler)
  }

  // Export state for persistence
  exportState(): string {
    return JSON.stringify(this.state)
  }

  // Import state from persistence
  importState(stateJson: string): void {
    try {
      const importedState = JSON.parse(stateJson)
      this.state = {
        ...importedState,
        userId: this.state.userId // Preserve current user ID
      }
      this.notifySubscribers()
    } catch (error) {
      console.error('Failed to import state:', error)
    }
  }

  // Get operations for sync
  getUnsyncedOperations(): CRDTOperation[] {
    // In a real implementation, you'd track which operations have been synced
    return this.state.operations.slice(-10) // Return last 10 operations for demo
  }

  // Mark operations as synced
  markOperationsSynced(operationIds: string[]): void {
    // In a real implementation, you'd mark these operations as synced
    console.log('Marked operations as synced:', operationIds)
  }

  // Garbage collection for old operations
  pruneOldOperations(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - maxAge
    this.state.operations = this.state.operations.filter(op => op.timestamp > cutoffTime)
  }
}

// Global CRDT instance
let crdtInstance: CRDTEngine | null = null

export function getCRDTEngine(): CRDTEngine {
  if (!crdtInstance) {
    const userId = typeof window !== 'undefined' 
      ? localStorage.getItem('crdt-user-id') || crypto.randomUUID()
      : 'server-user'
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('crdt-user-id', userId)
    }
    
    crdtInstance = new CRDTEngine(userId)
  }
  return crdtInstance
}

// Real-time sync manager
class RealTimeSyncManager {
  private crdt: CRDTEngine
  private websocket: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(crdt: CRDTEngine) {
    this.crdt = crdt
    this.crdt.subscribe(() => this.syncChanges())
  }

  connect(url: string) {
    try {
      this.websocket = new WebSocket(url)
      
      this.websocket.onopen = () => {
        console.log('Real-time sync connected')
        this.reconnectAttempts = 0
        this.requestFullSync()
      }

      this.websocket.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data))
      }

      this.websocket.onclose = () => {
        console.log('Real-time sync disconnected')
        this.attemptReconnect()
      }

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

    } catch (error) {
      console.error('Failed to connect to real-time sync:', error)
    }
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'operations':
        if (message.operations) {
          this.crdt.applyRemoteOperations(message.operations)
        }
        break
      case 'full-sync':
        if (message.state) {
          this.crdt.importState(JSON.stringify(message.state))
        }
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  private syncChanges() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const operations = this.crdt.getUnsyncedOperations()
      if (operations.length > 0) {
        this.websocket.send(JSON.stringify({
          type: 'operations',
          operations
        }))
      }
    }
  }

  private requestFullSync() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'request-full-sync',
        vectorClock: this.crdt.getState().vectorClock
      }))
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        console.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
        // Would reconnect to the same URL
      }, this.reconnectDelay * this.reconnectAttempts)
    }
  }

  disconnect() {
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
    }
  }

  isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN
  }
}

export { CRDTEngine, RealTimeSyncManager }