'use client';

import React, { useState, useEffect } from 'react';
import { TaskTypeSchema, FieldDefinition, SchemaManagerService } from '@/lib/database/schemaManager';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

interface TableBuilderProps {
  initialSchema?: TaskTypeSchema;
  onSave?: (schema: TaskTypeSchema) => void;
  onCancel?: () => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text', description: 'Single line text input' },
  { value: 'textarea', label: 'Long Text', description: 'Multi-line text area' },
  { value: 'number', label: 'Number', description: 'Numeric input' },
  { value: 'boolean', label: 'Yes/No', description: 'Boolean checkbox' },
  { value: 'date', label: 'Date', description: 'Date picker' },
  { value: 'datetime', label: 'Date & Time', description: 'Date and time picker' },
  { value: 'select', label: 'Dropdown', description: 'Single selection dropdown' },
  { value: 'multiselect', label: 'Multi-Select', description: 'Multiple selection dropdown' },
  { value: 'url', label: 'URL', description: 'Website link input' },
  { value: 'email', label: 'Email', description: 'Email address input' }
];

const STATUS_OPTIONS = [
  'pending', 'in_progress', 'completed', 'cancelled', 'on_hold', 'blocked'
];

const VIEW_TYPES = [
  { value: 'table', label: 'Table', description: 'Traditional table view' },
  { value: 'cards', label: 'Cards', description: 'Card-based layout' },
  { value: 'kanban', label: 'Kanban', description: 'Drag-and-drop board view' }
];

export default function TableBuilder({ initialSchema, onSave, onCancel }: TableBuilderProps) {
  const { user } = useAuth();
  const [schema, setSchema] = useState<Partial<TaskTypeSchema>>({
    typeName: '',
    displayName: '',
    description: '',
    icon: '📋',
    color: '#3b82f6',
    fields: [],
    settings: {
      allowDuplicates: true,
      trackTime: false,
      allowSubtasks: false,
      defaultStatus: 'pending',
      statusOptions: ['pending', 'in_progress', 'completed']
    },
    display: {
      listView: 'table' as const,
      showStats: true
    }
  });

  const [currentField, setCurrentField] = useState<Partial<FieldDefinition>>({
    id: '',
    name: '',
    label: '',
    type: 'text',
    required: false,
    display: {
      showInList: true,
      filterable: false,
      sortable: false
    }
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);

  // Load initial schema
  useEffect(() => {
    if (initialSchema) {
      setSchema(initialSchema);
    }
  }, [initialSchema]);

  const validateSchema = (): string[] => {
    const errors: string[] = [];

    if (!schema.typeName) errors.push('Type name is required');
    if (!schema.displayName) errors.push('Display name is required');
    if (schema.typeName && !/^[a-z][a-z0-9_]*$/.test(schema.typeName)) {
      errors.push('Type name must start with letter and contain only lowercase letters, numbers, and underscores');
    }
    if (!schema.fields || schema.fields.length === 0) {
      errors.push('At least one field is required');
    }

    // Validate field names are unique
    if (schema.fields) {
      const fieldNames = schema.fields.map(f => f.name);
      const uniqueNames = new Set(fieldNames);
      if (fieldNames.length !== uniqueNames.size) {
        errors.push('Field names must be unique');
      }
    }

    return errors;
  };

  const handleSave = async () => {
    const validationErrors = validateSchema();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    try {
      const schemaManager = new SchemaManagerService(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      let savedSchema: TaskTypeSchema;
      if (initialSchema?.id) {
        savedSchema = await schemaManager.updateTaskType(initialSchema.id, schema as TaskTypeSchema);
      } else {
        savedSchema = await schemaManager.createTaskType(schema as TaskTypeSchema);
      }

      onSave?.(savedSchema);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Failed to save schema']);
    } finally {
      setIsLoading(false);
    }
  };

  const addField = () => {
    if (!currentField.name || !currentField.label) {
      setErrors(['Field name and label are required']);
      return;
    }

    const field: FieldDefinition = {
      id: currentField.name || Date.now().toString(),
      name: currentField.name!,
      label: currentField.label!,
      type: currentField.type!,
      required: currentField.required || false,
      placeholder: currentField.placeholder,
      helpText: currentField.helpText,
      validation: currentField.validation,
      display: currentField.display || {
        showInList: true,
        filterable: false,
        sortable: false
      }
    };

    const newFields = [...(schema.fields || [])];
    if (editingFieldIndex !== null) {
      newFields[editingFieldIndex] = field;
      setEditingFieldIndex(null);
    } else {
      newFields.push(field);
    }

    setSchema({ ...schema, fields: newFields });
    setCurrentField({
      id: '',
      name: '',
      label: '',
      type: 'text',
      required: false,
      display: {
        showInList: true,
        filterable: false,
        sortable: false
      }
    });
    setShowFieldEditor(false);
    setErrors([]);
  };

  const editField = (index: number) => {
    const field = schema.fields?.[index];
    if (field) {
      setCurrentField(field);
      setEditingFieldIndex(index);
      setShowFieldEditor(true);
    }
  };

  const removeField = (index: number) => {
    const newFields = [...(schema.fields || [])];
    newFields.splice(index, 1);
    setSchema({ ...schema, fields: newFields });
  };

  const updateStatusOptions = (options: string[]) => {
    setSchema({
      ...schema,
      settings: {
        ...schema.settings,
        statusOptions: options
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-2">
          {initialSchema ? 'Edit Task Type' : 'Create Custom Task Type'}
        </h2>
        <p className="text-gray-600">
          Design your own task type with custom fields and settings
        </p>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <h3 className="text-red-800 font-medium mb-2">Please fix the following errors:</h3>
          <ul className="list-disc list-inside text-red-700">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Basic Info */}
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Basic Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type Name (Database ID)
                </label>
                <input
                  type="text"
                  value={schema.typeName || ''}
                  onChange={(e) => setSchema({ ...schema, typeName: e.target.value.toLowerCase() })}
                  placeholder="e.g., my_custom_task"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  pattern="^[a-z][a-z0-9_]*$"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Only lowercase letters, numbers, and underscores. Must start with a letter.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={schema.displayName || ''}
                  onChange={(e) => setSchema({ ...schema, displayName: e.target.value })}
                  placeholder="e.g., My Custom Task"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={schema.description || ''}
                  onChange={(e) => setSchema({ ...schema, description: e.target.value })}
                  placeholder="Describe what this task type is used for..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Icon (Emoji)
                  </label>
                  <input
                    type="text"
                    value={schema.icon || ''}
                    onChange={(e) => setSchema({ ...schema, icon: e.target.value })}
                    placeholder="📋"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color
                  </label>
                  <input
                    type="color"
                    value={schema.color || '#3b82f6'}
                    onChange={(e) => setSchema({ ...schema, color: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Settings</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Allow Duplicates</label>
                <input
                  type="checkbox"
                  checked={schema.settings?.allowDuplicates || false}
                  onChange={(e) => setSchema({
                    ...schema,
                    settings: { ...schema.settings, allowDuplicates: e.target.checked }
                  })}
                  className="rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Track Time</label>
                <input
                  type="checkbox"
                  checked={schema.settings?.trackTime || false}
                  onChange={(e) => setSchema({
                    ...schema,
                    settings: { ...schema.settings, trackTime: e.target.checked }
                  })}
                  className="rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Allow Subtasks</label>
                <input
                  type="checkbox"
                  checked={schema.settings?.allowSubtasks || false}
                  onChange={(e) => setSchema({
                    ...schema,
                    settings: { ...schema.settings, allowSubtasks: e.target.checked }
                  })}
                  className="rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Status
                </label>
                <select
                  value={schema.settings?.defaultStatus || 'pending'}
                  onChange={(e) => setSchema({
                    ...schema,
                    settings: { ...schema.settings, defaultStatus: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_OPTIONS.map(status => (
                    <option key={status} value={status}>
                      {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Available Status Options
                </label>
                <div className="space-y-2">
                  {STATUS_OPTIONS.map(status => (
                    <label key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={schema.settings?.statusOptions?.includes(status) || false}
                        onChange={(e) => {
                          const currentOptions = schema.settings?.statusOptions || [];
                          const newOptions = e.target.checked
                            ? [...currentOptions, status]
                            : currentOptions.filter(s => s !== status);
                          updateStatusOptions(newOptions);
                        }}
                        className="mr-2 rounded"
                      />
                      <span className="text-sm">
                        {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Display Settings */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Display Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default View
                </label>
                <select
                  value={schema.display?.listView || 'table'}
                  onChange={(e) => setSchema({
                    ...schema,
                    display: { ...schema.display, listView: e.target.value as any }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {VIEW_TYPES.map(view => (
                    <option key={view.value} value={view.value}>
                      {view.label} - {view.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Show Statistics</label>
                <input
                  type="checkbox"
                  checked={schema.display?.showStats || false}
                  onChange={(e) => setSchema({
                    ...schema,
                    display: { 
                      listView: schema.display?.listView || 'table',
                      ...schema.display, 
                      showStats: e.target.checked 
                    }
                  })}
                  className="rounded"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Fields */}
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Custom Fields</h3>
              <button
                onClick={() => setShowFieldEditor(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Add Field
              </button>
            </div>

            {/* Field List */}
            <div className="space-y-3">
              {schema.fields?.map((field, index) => (
                <div key={field.id} className="border border-gray-200 rounded-md p-3 bg-white">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{field.label}</span>
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {field.type}
                        </span>
                        {field.required && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{field.name}</p>
                      {field.helpText && (
                        <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => editField(index)}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeField(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {(!schema.fields || schema.fields.length === 0) && (
                <p className="text-gray-500 text-center py-8">
                  No custom fields yet. Click "Add Field" to get started.
                </p>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Preview</h3>
            <div className="border border-gray-200 rounded-md p-4 bg-white">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{schema.icon || '📋'}</span>
                <div>
                  <h4 className="font-medium">{schema.displayName || 'Untitled Task Type'}</h4>
                  {schema.description && (
                    <p className="text-sm text-gray-600">{schema.description}</p>
                  )}
                </div>
              </div>
              <div className="text-sm text-gray-500">
                <p>Fields: {schema.fields?.length || 0}</p>
                <p>View: {schema.display?.listView || 'table'}</p>
                <p>Status options: {schema.settings?.statusOptions?.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Field Editor Modal */}
      {showFieldEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">
              {editingFieldIndex !== null ? 'Edit Field' : 'Add New Field'}
            </h3>
            
            <FieldEditor
              field={currentField}
              onChange={setCurrentField}
              onSave={addField}
              onCancel={() => {
                setShowFieldEditor(false);
                setEditingFieldIndex(null);
                setCurrentField({
                  id: '',
                  name: '',
                  label: '',
                  type: 'text',
                  required: false,
                  display: {
                    showInList: true,
                    filterable: false,
                    sortable: false
                  }
                });
              }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : initialSchema ? 'Update Task Type' : 'Create Task Type'}
        </button>
      </div>
    </div>
  );
}

// Field Editor Component
interface FieldEditorProps {
  field: Partial<FieldDefinition>;
  onChange: (field: Partial<FieldDefinition>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function FieldEditor({ field, onChange, onSave, onCancel }: FieldEditorProps) {
  const updateField = (updates: Partial<FieldDefinition>) => {
    onChange({ ...field, ...updates });
  };

  const needsOptions = field.type === 'select' || field.type === 'multiselect';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Field Name (Database Column)
          </label>
          <input
            type="text"
            value={field.name || ''}
            onChange={(e) => updateField({ name: e.target.value.toLowerCase() })}
            placeholder="e.g., custom_field"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Display Label
          </label>
          <input
            type="text"
            value={field.label || ''}
            onChange={(e) => updateField({ label: e.target.value })}
            placeholder="e.g., Custom Field"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Field Type
        </label>
        <select
          value={field.type || 'text'}
          onChange={(e) => updateField({ type: e.target.value as any })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {FIELD_TYPES.map(type => (
            <option key={type.value} value={type.value}>
              {type.label} - {type.description}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Placeholder Text
          </label>
          <input
            type="text"
            value={field.placeholder || ''}
            onChange={(e) => updateField({ placeholder: e.target.value })}
            placeholder="e.g., Enter value..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-center">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={field.required || false}
              onChange={(e) => updateField({ required: e.target.checked })}
              className="mr-2 rounded"
            />
            <span className="text-sm font-medium">Required Field</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Help Text
        </label>
        <input
          type="text"
          value={field.helpText || ''}
          onChange={(e) => updateField({ helpText: e.target.value })}
          placeholder="Additional information about this field..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {needsOptions && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Options (one per line)
          </label>
          <textarea
            value={(field.validation?.options || []).join('\n')}
            onChange={(e) => updateField({
              validation: {
                ...field.validation,
                options: e.target.value.split('\n').filter(opt => opt.trim())
              }
            })}
            placeholder="Option 1&#10;Option 2&#10;Option 3"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {(field.type === 'number') && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Value
            </label>
            <input
              type="number"
              value={field.validation?.min || ''}
              onChange={(e) => updateField({
                validation: {
                  ...field.validation,
                  min: e.target.value ? Number(e.target.value) : undefined
                }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Maximum Value
            </label>
            <input
              type="number"
              value={field.validation?.max || ''}
              onChange={(e) => updateField({
                validation: {
                  ...field.validation,
                  max: e.target.value ? Number(e.target.value) : undefined
                }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-3">Display Settings</h4>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={field.display?.showInList || false}
              onChange={(e) => updateField({
                display: {
                  ...field.display,
                  showInList: e.target.checked
                }
              })}
              className="mr-2 rounded"
            />
            <span className="text-sm">Show in list view</span>
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={field.display?.filterable || false}
              onChange={(e) => updateField({
                display: {
                  ...field.display,
                  filterable: e.target.checked
                }
              })}
              className="mr-2 rounded"
            />
            <span className="text-sm">Allow filtering</span>
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={field.display?.sortable || false}
              onChange={(e) => updateField({
                display: {
                  ...field.display,
                  sortable: e.target.checked
                }
              })}
              className="mr-2 rounded"
            />
            <span className="text-sm">Allow sorting</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!field.name || !field.label}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Field
        </button>
      </div>
    </div>
  );
}