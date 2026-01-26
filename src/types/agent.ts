/**
 * Multi-Agent Supervision Architecture Types
 *
 * This module defines types for the supervisor-worker pattern where:
 * - Orchestrator receives user requests and creates jobs
 * - Workers process jobs asynchronously
 * - Realtime updates are pushed to clients via Supabase channels
 */

import { CreateGraphNodeDTO, GraphNode, AgentContextState as BaseAgentContextState } from './graph'

// Re-export GraphIntent type from intentClassifier for convenience
// Note: GraphIntent is defined in @/lib/agent/intentClassifier
export type GraphIntent =
  | 'COURSE_TASK'
  | 'PROJECT_TASK'
  | 'CLUB_TASK'
  | 'ROUTINE'
  | 'QUICK_TODO'
  | 'JOURNAL'
  | 'CREATE_CONTAINER'
  | 'SCHEDULE_REQUEST'
  | 'UNKNOWN'

// ==========================================
// Job Status & Worker Types
// ==========================================

export type JobStatus = 'pending' | 'claimed' | 'processing' | 'completed' | 'failed' | 'cancelled'
export type WorkerType = 'calendar' | 'task' | 'project'

// ==========================================
// Agent Thread (Conversation Context)
// ==========================================

export interface AgentThread {
  id: string
  user_id: string
  title?: string
  status: 'active' | 'archived'
  last_message_at?: string
  message_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at?: string
}

export interface CreateThreadDTO {
  title?: string
  metadata?: Record<string, unknown>
}

// ==========================================
// Agent Messages
// ==========================================

export type MessageRole = 'user' | 'assistant' | 'system'

export interface AgentMessage {
  id: string
  thread_id: string
  user_id: string
  role: MessageRole
  content: string
  context_state?: AgentContextState
  job_id?: string
  created_at: string
}

export interface CreateMessageDTO {
  thread_id: string
  role: MessageRole
  content: string
  context_state?: AgentContextState
  job_id?: string
}

// ==========================================
// Agent Jobs (Async Queue)
// ==========================================

export interface AgentJob {
  id: string
  user_id: string
  thread_id?: string
  message_id?: string
  intent: string
  worker_type: WorkerType
  status: JobStatus
  progress: number
  progress_message?: string
  input_data: JobInputData
  output_data?: JobOutputData
  error_message?: string
  retry_count: number
  max_retries: number
  next_retry_at?: string
  claimed_by?: string
  claimed_at?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at?: string
}

export interface CreateJobDTO {
  user_id: string
  thread_id?: string
  message_id?: string
  intent: string
  worker_type: WorkerType
  input_data: JobInputData
  max_retries?: number
}

// ==========================================
// Job Input/Output Data
// ==========================================

export interface JobInputData {
  user_input: string
  entities: Record<string, string>
  partial_data?: Partial<CreateGraphNodeDTO>
  container_context?: Array<{ id: string; title: string; category: string }>
  thread_context?: AgentContextState
}

export interface JobOutputData {
  message: string
  created_nodes?: GraphNode[]
  updated_nodes?: GraphNode[]
  deleted_node_ids?: string[]
  needs_clarification?: boolean
  missing_fields?: string[]
  suggested_actions?: SuggestedAction[]
}

export interface SuggestedAction {
  type: 'create' | 'update' | 'delete' | 'schedule'
  description: string
  payload?: Record<string, unknown>
}

// ==========================================
// Context State (Multi-turn Conversations)
// ==========================================

export interface AgentContextState {
  pendingIntent?: GraphIntent | string
  partialData?: Partial<CreateGraphNodeDTO>
  missingFields?: string[]
  lastAction?: string
  conversationHistory?: Array<{
    role: MessageRole
    content: string
    timestamp: string
  }>
}

// ==========================================
// Orchestrator Types
// ==========================================

export interface AgentInteractRequest {
  input: string
  threadId?: string
  clientState?: AgentContextState
}

export type AgentResponseStatus = 'SUCCESS' | 'PROCESSING' | 'CLARIFICATION_NEEDED' | 'ERROR'

export interface AgentInteractResponse {
  threadId: string
  status: AgentResponseStatus
  displayMessage: string
  jobId?: string
  createdNodes?: GraphNode[]
  serverState?: AgentContextState
  error?: string
}

export interface OrchestratorResponse {
  status: AgentResponseStatus
  threadId: string
  jobId?: string
  displayMessage: string
  serverState?: AgentContextState
  createdNodes?: GraphNode[]
}

// ==========================================
// Worker Types
// ==========================================

export interface WorkerResult {
  success: boolean
  message: string
  created_nodes?: GraphNode[]
  updated_nodes?: GraphNode[]
  needs_clarification?: boolean
  missing_fields?: string[]
  error?: string
}

export interface WorkerContext {
  userId: string
  threadId?: string
  containers: Array<{ id: string; title: string; category: string }>
}

// ==========================================
// Intent to Worker Mapping
// ==========================================

export const INTENT_WORKER_MAP: Record<GraphIntent, WorkerType> = {
  'SCHEDULE_REQUEST': 'calendar',
  'ROUTINE': 'calendar',
  'QUICK_TODO': 'task',
  'COURSE_TASK': 'task',
  'CLUB_TASK': 'task',
  'JOURNAL': 'task',
  'PROJECT_TASK': 'project',
  'CREATE_CONTAINER': 'project',
  'UNKNOWN': 'task',
}

// ==========================================
// Realtime Event Types
// ==========================================

export type AgentEventType =
  | 'job_created'
  | 'job_started'
  | 'job_progress'
  | 'job_completed'
  | 'job_failed'
  | 'job_cancelled'

export interface AgentEvent {
  type: AgentEventType
  job_id: string
  user_id: string
  timestamp: string
  payload: Record<string, unknown>
}

export interface JobProgressEvent {
  job_id: string
  progress: number
  message?: string
}

export interface JobCompletedEvent {
  job_id: string
  result: JobOutputData
}

export interface JobFailedEvent {
  job_id: string
  error: string
  can_retry: boolean
  retry_count: number
}
