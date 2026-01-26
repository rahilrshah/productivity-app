/**
 * Schema Manager Type Definitions
 *
 * Provides typed interfaces for dynamic schema management,
 * replacing `any` types with proper type definitions.
 */

/**
 * Supported field types for custom schemas
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'url'
  | 'email'

/**
 * Field default values by type
 */
export type FieldDefaultValue = string | number | boolean | string[] | null

/**
 * Field definition for custom task types
 */
export interface FieldDefinition {
  id: string
  name: string
  label: string
  type: FieldType
  required?: boolean
  default?: FieldDefaultValue
  placeholder?: string
  helpText?: string
  validation?: FieldValidation
  display?: FieldDisplay
}

/**
 * Field validation rules
 */
export interface FieldValidation {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  options?: string[] // for select/multiselect
}

/**
 * Field display options
 */
export interface FieldDisplay {
  showInList?: boolean
  showInCard?: boolean
  sortable?: boolean
  filterable?: boolean
  searchable?: boolean
}

/**
 * Custom task type schema
 */
export interface TaskTypeSchema {
  id?: string
  typeName: string
  displayName: string
  description?: string
  icon?: string
  color?: string
  fields: FieldDefinition[]
  settings: SchemaSettings
  display: SchemaDisplay
  permissions?: SchemaPermissions
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Schema settings
 */
export interface SchemaSettings {
  allowDuplicates?: boolean
  autoAssignId?: boolean
  trackTime?: boolean
  allowSubtasks?: boolean
  defaultStatus?: string
  statusOptions?: string[]
}

/**
 * Schema display options
 */
export interface SchemaDisplay {
  listView: 'table' | 'cards' | 'kanban'
  defaultSort?: string
  groupBy?: string
  showStats?: boolean
}

/**
 * Schema permissions
 */
export interface SchemaPermissions {
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  canShare?: boolean
}

/**
 * Schema constraint for database operations
 */
export interface SchemaConstraint {
  field: string
  type: 'required' | 'unique' | 'foreign_key' | 'check'
  value?: unknown
  reference?: {
    table: string
    column: string
  }
}

/**
 * Schema update action
 */
export type SchemaUpdateAction = 'add_column' | 'modify_column' | 'add_constraint' | 'drop_column'

/**
 * Schema update definition
 */
export interface SchemaUpdate {
  table: string
  action: SchemaUpdateAction
  column?: string
  dataType?: string
  constraints?: SchemaConstraint[]
}

/**
 * Task data with dynamic metadata
 */
export interface DynamicTaskData {
  title: string
  content?: string
  status?: string
  priority?: number
  due_date?: string
  task_type: string
  type_metadata: Record<string, FieldDefaultValue>
}

/**
 * Validated task metadata
 */
export interface ValidatedMetadata {
  [key: string]: FieldDefaultValue
}

/**
 * JSON Schema representation (for form generation)
 */
export interface JsonSchemaDefinition {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

/**
 * JSON Schema property
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array'
  title?: string
  description?: string
  default?: FieldDefaultValue
  enum?: string[]
  format?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  pattern?: string
  items?: {
    type: string
    enum?: string[]
  }
}
