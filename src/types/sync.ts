/**
 * Sync Module Type Definitions
 *
 * Provides typed interfaces for sync operations, replacing `any` types
 * with proper type definitions for type safety.
 */

/**
 * Sync operation types
 */
export type SyncOperation = 'create' | 'update' | 'delete'
export type EntityType = 'task' | 'user'

/**
 * Vector clock for distributed sync
 */
export type VectorClock = Record<string, number>

/**
 * Sync change record
 */
export interface SyncChange {
  operation: SyncOperation
  entity_type: EntityType
  entity_id: string
  data: SyncChangeData
  vector_clock: VectorClock
}

/**
 * Data payload for sync changes
 */
export interface SyncChangeData {
  title?: string
  content?: string | null
  rich_content?: Record<string, unknown> | null
  status?: string
  priority?: number
  manual_priority?: number
  due_date?: string | null
  start_date?: string | null
  completed_at?: string | null
  tags?: string[]
  parent_id?: string | null
  root_id?: string | null
  position?: number
  task_type?: string
  type_metadata?: Record<string, unknown>
  node_type?: 'item' | 'container'
  category?: string | null
  duration_minutes?: number | null
  computed_priority?: number | null
  updated_at?: string
  // User-specific fields
  display_name?: string
  preferences?: Record<string, unknown>
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  entity_id: string
  status: 'success' | 'error'
  error?: string
}

/**
 * Sync request payload
 */
export interface SyncPushRequest {
  changes: SyncChange[]
  device_id: string
}

/**
 * Sync pull request parameters
 */
export interface SyncPullRequest {
  since?: string // ISO timestamp
  limit?: number
  offset?: number
}

/**
 * Sync pull response
 */
export interface SyncPullResponse {
  changes: SyncChange[]
  hasMore: boolean
  serverTimestamp: string
}

/**
 * Sync status
 */
export interface SyncStatus {
  inProgress: boolean
  online: boolean
  lastSyncAt?: string
  pendingChanges: number
  error?: string
}

/**
 * Conflict detection result
 */
export interface ConflictResult {
  hasConflict: boolean
  localVersion?: number
  serverVersion?: number
  resolution?: 'local' | 'server' | 'merge'
}

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  enabled: boolean
  requireEncryption: boolean
  keyVersion?: number
}
