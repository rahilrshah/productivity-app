// Graph Architecture Types (v3.0)

// Node classification
export type NodeType = 'container' | 'item'

// Category determines priority weights and context
export type TaskCategory = 'course' | 'project' | 'club' | 'routine' | 'todo' | 'journal'

// Extended status with blocked state
export type GraphTaskStatus = 'pending' | 'active' | 'blocked' | 'completed' | 'archived'

// Relationship types for edges
export type RelationType = 'blocks' | 'relates_to' | 'duplicate_of'

// The main Graph Node interface
export interface GraphNode {
  // Identity
  id: string
  user_id: string

  // Graph Topology
  parent_id?: string      // Primary hierarchy (Course -> Assignment)
  root_id?: string        // Optimization: points to top-level container

  // Polymorphism
  node_type: NodeType     // 'container' or 'item'
  category: TaskCategory  // Drives priority weights

  // Core State
  title: string
  rich_content?: Record<string, unknown>  // Tiptap JSON content
  content?: string        // Legacy plain text content
  status: GraphTaskStatus

  // Type-specific metadata (polymorphic)
  type_metadata: CourseNodeMetadata | ProjectNodeMetadata | ClubNodeMetadata | Record<string, unknown>

  // Priority Engine Inputs
  manual_priority: number      // User override (-10 to +10)
  due_date?: string           // Hard deadline
  start_date?: string         // Deferral date
  duration_minutes?: number   // Effort estimate

  // Priority Engine Output (READ-ONLY - calculated by trigger)
  computed_priority: number

  // Legacy fields for backward compatibility
  priority?: number           // Old priority field
  task_type?: string          // Old task_type field
  tags?: string[]
  scheduled_for?: string
  completed_at?: string

  // System metadata
  created_at: string
  updated_at: string
  version: number
}

// Edge/Relationship between nodes
export interface TaskRelation {
  id: string
  user_id: string
  predecessor_id: string    // Source node
  successor_id: string      // Target node
  relation_type: RelationType
  created_at: string
}

// Agent conversation log
export interface AgentLog {
  id: string
  user_id: string
  thread_id: string
  turn_index: number
  user_input: string
  ai_response?: string
  intent: string
  context_state?: AgentContextState
  actions_executed?: AgentAction[]
  created_at: string
}

// Agent state for slot-filling
export interface AgentContextState {
  pendingIntent?: string
  partialData?: Partial<GraphNode>
  missingFields?: string[]
  containerContext?: {
    id: string
    title: string
    category: TaskCategory
  }
}

// Agent action record
export interface AgentAction {
  type: 'CREATE_NODE' | 'UPDATE_NODE' | 'CREATE_RELATION' | 'DELETE_NODE'
  nodeId?: string
  data?: Partial<GraphNode>
  relationData?: Partial<TaskRelation>
}

// Type-specific metadata interfaces
export interface CourseNodeMetadata {
  course_code: string
  semester: string
  professor?: {
    name: string
    email?: string
  }
  credits?: number
  syllabus_url?: string
  assignment_type?: string
  weight_percentage?: number
}

export interface ProjectNodeMetadata {
  project_type: 'personal' | 'work' | 'side-project'
  methodology?: string
  phase?: string
  milestone?: string
  repository_url?: string
  team_members?: string[]
  client?: string
  budget?: number
}

export interface ClubNodeMetadata {
  club_name: string
  role?: string
  event_type?: string
  meeting_frequency?: string
  meeting_location?: string
  required_attendance?: boolean
  leadership_position?: boolean
}

export interface RoutineNodeMetadata {
  frequency: 'daily' | 'weekly' | 'monthly'
  time_of_day?: string
  days_of_week?: string[]
}

export interface JournalNodeMetadata {
  mood?: string
  tags?: string[]
  is_private?: boolean
}

// DTOs for creating/updating nodes
export interface CreateGraphNodeDTO {
  title: string
  node_type: NodeType
  category: TaskCategory
  parent_id?: string
  rich_content?: Record<string, unknown>
  content?: string
  type_metadata?: Record<string, unknown>
  manual_priority?: number
  due_date?: string
  start_date?: string
  duration_minutes?: number
  tags?: string[]
}

export interface UpdateGraphNodeDTO {
  title?: string
  node_type?: NodeType
  category?: TaskCategory
  parent_id?: string
  rich_content?: Record<string, unknown>
  content?: string
  status?: GraphTaskStatus
  type_metadata?: Record<string, unknown>
  manual_priority?: number
  due_date?: string
  start_date?: string
  duration_minutes?: number
  tags?: string[]
}

// DTO for creating relations
export interface CreateRelationDTO {
  predecessor_id: string
  successor_id: string
  relation_type: RelationType
}

// Agent interaction request/response
export interface AgentInteractRequest {
  input: string
  threadId?: string
  clientState?: AgentContextState
}

export interface AgentInteractResponse {
  threadId: string
  status: 'SUCCESS' | 'CLARIFICATION_NEEDED' | 'ERROR'
  displayMessage: string
  serverState?: AgentContextState
  createdNodes?: GraphNode[]
  error?: string
}

// Query filters for nodes
export interface GraphNodeFilter {
  node_type?: NodeType
  category?: TaskCategory
  status?: GraphTaskStatus
  parent_id?: string
  root_id?: string
  search?: string
}
