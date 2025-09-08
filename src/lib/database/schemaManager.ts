/**
 * Dynamic Database Schema Management System
 * 
 * User-friendly system for creating custom task types through web interface
 */

import { createClient } from '@supabase/supabase-js';

export interface FieldDefinition {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'select' | 'multiselect' | 'url' | 'email';
  required?: boolean;
  default?: any;
  placeholder?: string;
  helpText?: string;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options?: string[]; // for select/multiselect
  };
  display?: {
    showInList?: boolean;
    showInCard?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    searchable?: boolean;
  };
}

export interface TaskTypeSchema {
  id?: string;
  typeName: string;
  displayName: string;
  description?: string;
  icon?: string;
  color?: string;
  fields: FieldDefinition[];
  settings: {
    allowDuplicates?: boolean;
    autoAssignId?: boolean;
    trackTime?: boolean;
    allowSubtasks?: boolean;
    defaultStatus?: string;
    statusOptions?: string[];
  };
  display: {
    listView: 'table' | 'cards' | 'kanban';
    defaultSort?: string;
    groupBy?: string;
    showStats?: boolean;
  };
  permissions?: {
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canShare?: boolean;
  };
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class SchemaManagerService {
  private supabase: ReturnType<typeof createClient>;
  
  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a new task type schema
   */
  async createTaskType(schema: Omit<TaskTypeSchema, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskTypeSchema> {
    // Validate schema
    this.validateSchema(schema);

    // Save to metadata table
    const { data, error } = await this.supabase
      .from('task_type_schemas')
      .insert({
        type_name: schema.typeName,
        display_name: schema.displayName,
        description: schema.description,
        icon: schema.icon,
        color: schema.color,
        schema_definition: schema,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any)
      .select()
      .single();

    if (error) throw new Error(`Failed to create task type: ${error.message}`);

    // Update database constraints
    await this.updateDatabaseSchema(schema);

    return {
      id: (data as any).id,
      ...schema,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at
    };
  }

  /**
   * Update an existing task type schema
   */
  async updateTaskType(id: string, updates: Partial<TaskTypeSchema>): Promise<TaskTypeSchema> {
    const existing = await this.getTaskTypeById(id);
    if (!existing) throw new Error('Task type not found');

    const updated = { ...existing, ...updates };
    this.validateSchema(updated);

    const { data, error } = await (this.supabase as any)
      .from('task_type_schemas')
      .update({
        type_name: updated.typeName,
        display_name: updated.displayName,
        description: updated.description,
        icon: updated.icon,
        color: updated.color,
        schema_definition: updated,
        updated_at: new Date().toISOString()
      } as any)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update task type: ${error.message}`);

    await this.updateDatabaseSchema(updated);
    return { ...updated, updatedAt: (data as any).updated_at };
  }

  /**
   * Delete a task type schema
   */
  async deleteTaskType(id: string): Promise<void> {
    const schema = await this.getTaskTypeById(id);
    if (!schema) throw new Error('Task type not found');

    // Check if there are existing tasks of this type
    const { count } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('task_type', schema.typeName);

    if (count && count > 0) {
      throw new Error(`Cannot delete task type with ${count} existing tasks`);
    }

    const { error } = await this.supabase
      .from('task_type_schemas')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete task type: ${error.message}`);
  }

  /**
   * Get all task type schemas for current user
   */
  async getAllTaskTypes(): Promise<TaskTypeSchema[]> {
    const { data, error } = await this.supabase
      .from('task_type_schemas')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch task types: ${error.message}`);

    return (data as any).map((row: any) => ({
      id: row.id,
      ...row.schema_definition,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  /**
   * Get task type schema by ID
   */
  async getTaskTypeById(id: string): Promise<TaskTypeSchema | null> {
    const { data, error } = await this.supabase
      .from('task_type_schemas')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      ...(data as any).schema_definition,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at
    };
  }

  /**
   * Get task type schema by type name
   */
  async getTaskTypeByName(typeName: string): Promise<TaskTypeSchema | null> {
    const { data, error } = await this.supabase
      .from('task_type_schemas')
      .select('*')
      .eq('type_name', typeName)
      .single();

    if (error || !data) return null;

    return {
      id: (data as any).id,
      ...(data as any).schema_definition,
      createdAt: (data as any).created_at,
      updatedAt: (data as any).updated_at
    };
  }

  /**
   * Get field definitions for a task type
   */
  async getFieldDefinitions(typeName: string): Promise<FieldDefinition[]> {
    const schema = await this.getTaskTypeByName(typeName);
    return schema?.fields || [];
  }

  /**
   * Validate schema definition
   */
  private validateSchema(schema: TaskTypeSchema): void {
    if (!schema.typeName || !schema.displayName) {
      throw new Error('Type name and display name are required');
    }

    if (!/^[a-z][a-z0-9_]*$/.test(schema.typeName)) {
      throw new Error('Type name must start with letter and contain only lowercase letters, numbers, and underscores');
    }

    if (schema.fields.length === 0) {
      throw new Error('At least one field is required');
    }

    // Validate field names are unique
    const fieldNames = schema.fields.map(f => f.name);
    const uniqueNames = new Set(fieldNames);
    if (fieldNames.length !== uniqueNames.size) {
      throw new Error('Field names must be unique');
    }

    // Validate field names
    schema.fields.forEach(field => {
      if (!/^[a-z][a-z0-9_]*$/.test(field.name)) {
        throw new Error(`Field name '${field.name}' must start with letter and contain only lowercase letters, numbers, and underscores`);
      }
    });
  }

  /**
   * Update database schema to support new task type
   */
  private async updateDatabaseSchema(schema: TaskTypeSchema): Promise<void> {
    // Get all registered task types for constraint update
    const allTypes = await this.getAllTaskTypes();
    const typeNames = allTypes.map(t => t.typeName);

    // Update task_type constraint
    const constraintSQL = `
      DO $$ 
      BEGIN
        -- Drop existing constraint
        ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_type_check;
        
        -- Add updated constraint
        ALTER TABLE tasks ADD CONSTRAINT tasks_task_type_check 
        CHECK (task_type IN (${typeNames.map(name => `'${name}'`).join(', ')}));
      END $$;
    `;

    try {
      // Note: In a real implementation, you'd use a stored procedure or function
      // For now, we'll handle this through the application layer
      console.log('Schema constraint would be updated:', constraintSQL);
    } catch (error) {
      console.error('Failed to update database schema:', error);
    }
  }

  /**
   * Create task with custom schema validation
   */
  async createTask(taskData: any): Promise<any> {
    const schema = await this.getTaskTypeByName(taskData.task_type);
    if (!schema) throw new Error('Invalid task type');

    // Validate custom fields
    const validatedMetadata = this.validateTaskData(taskData.type_metadata || {}, schema);

    const { data, error } = await this.supabase
      .from('tasks')
      .insert({
        ...taskData,
        type_metadata: validatedMetadata
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create task: ${error.message}`);
    return data;
  }

  /**
   * Validate task data against schema
   */
  private validateTaskData(metadata: any, schema: TaskTypeSchema): any {
    const validated: any = {};

    schema.fields.forEach(field => {
      const value = metadata[field.name];

      // Check required fields
      if (field.required && (value === undefined || value === null || value === '')) {
        throw new Error(`Field '${field.label}' is required`);
      }

      // Skip validation if value is empty and not required
      if (value === undefined || value === null || value === '') {
        if (field.default !== undefined) {
          validated[field.name] = field.default;
        }
        return;
      }

      // Type-specific validation
      switch (field.type) {
        case 'number':
          const numValue = Number(value);
          if (isNaN(numValue)) {
            throw new Error(`Field '${field.label}' must be a number`);
          }
          if (field.validation?.min !== undefined && numValue < field.validation.min) {
            throw new Error(`Field '${field.label}' must be at least ${field.validation.min}`);
          }
          if (field.validation?.max !== undefined && numValue > field.validation.max) {
            throw new Error(`Field '${field.label}' must be at most ${field.validation.max}`);
          }
          validated[field.name] = numValue;
          break;

        case 'text':
        case 'textarea':
          if (typeof value !== 'string') {
            throw new Error(`Field '${field.label}' must be text`);
          }
          if (field.validation?.minLength && value.length < field.validation.minLength) {
            throw new Error(`Field '${field.label}' must be at least ${field.validation.minLength} characters`);
          }
          if (field.validation?.maxLength && value.length > field.validation.maxLength) {
            throw new Error(`Field '${field.label}' must be at most ${field.validation.maxLength} characters`);
          }
          validated[field.name] = value;
          break;

        case 'boolean':
          validated[field.name] = Boolean(value);
          break;

        case 'date':
        case 'datetime':
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw new Error(`Field '${field.label}' must be a valid date`);
          }
          validated[field.name] = date.toISOString();
          break;

        case 'select':
          if (field.validation?.options && !field.validation.options.includes(value)) {
            throw new Error(`Field '${field.label}' must be one of: ${field.validation.options.join(', ')}`);
          }
          validated[field.name] = value;
          break;

        case 'multiselect':
          if (!Array.isArray(value)) {
            throw new Error(`Field '${field.label}' must be an array`);
          }
          if (field.validation?.options) {
            const invalidOptions = value.filter(v => !field.validation!.options!.includes(v));
            if (invalidOptions.length > 0) {
              throw new Error(`Field '${field.label}' contains invalid options: ${invalidOptions.join(', ')}`);
            }
          }
          validated[field.name] = value;
          break;

        default:
          validated[field.name] = value;
      }
    });

    return validated;
  }

  /**
   * Generate form schema for UI
   */
  generateFormSchema(schema: TaskTypeSchema): any {
    return {
      title: `Create ${schema.displayName}`,
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Title',
          description: 'Task title'
        },
        description: {
          type: 'string',
          title: 'Description',
          description: 'Task description'
        },
        ...schema.fields.reduce((acc, field) => {
          acc[field.name] = this.fieldToJsonSchema(field);
          return acc;
        }, {} as any)
      },
      required: ['title', ...schema.fields.filter(f => f.required).map(f => f.name)]
    };
  }

  /**
   * Convert field definition to JSON Schema
   */
  private fieldToJsonSchema(field: FieldDefinition): any {
    const base = {
      title: field.label,
      description: field.helpText
    };

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'email':
      case 'url':
        return {
          ...base,
          type: 'string',
          minLength: field.validation?.minLength,
          maxLength: field.validation?.maxLength,
          pattern: field.validation?.pattern,
          format: field.type === 'email' ? 'email' : field.type === 'url' ? 'uri' : undefined
        };
      
      case 'number':
        return {
          ...base,
          type: 'number',
          minimum: field.validation?.min,
          maximum: field.validation?.max
        };
      
      case 'boolean':
        return {
          ...base,
          type: 'boolean'
        };
      
      case 'date':
        return {
          ...base,
          type: 'string',
          format: 'date'
        };
      
      case 'datetime':
        return {
          ...base,
          type: 'string',
          format: 'date-time'
        };
      
      case 'select':
        return {
          ...base,
          type: 'string',
          enum: field.validation?.options || []
        };
      
      case 'multiselect':
        return {
          ...base,
          type: 'array',
          items: {
            type: 'string',
            enum: field.validation?.options || []
          }
        };
      
      default:
        return {
          ...base,
          type: 'string'
        };
    }
  }
}