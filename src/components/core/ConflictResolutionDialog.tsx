'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from './RichTextEditor'
import { Task } from '@/types'
import { CRDTOperation } from '@/lib/crdt'
import { 
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  Clock,
  User,
  GitMerge,
  Eye,
  FileText,
  Calendar,
  Tag
} from 'lucide-react'

export interface TaskConflict {
  id: string
  taskId: string
  field: keyof Task
  localValue: any
  remoteValue: any
  localOperation: CRDTOperation
  remoteOperation: CRDTOperation
  task: Task
}

interface ConflictResolutionDialogProps {
  conflicts: TaskConflict[]
  onResolve: (resolutions: Array<{
    conflictId: string
    resolution: 'local' | 'remote' | 'merge'
    mergedValue?: any
  }>) => void
  onClose: () => void
  isOpen: boolean
}

export function ConflictResolutionDialog({ 
  conflicts, 
  onResolve, 
  onClose, 
  isOpen 
}: ConflictResolutionDialogProps) {
  const [resolutions, setResolutions] = useState<{
    [conflictId: string]: {
      type: 'local' | 'remote' | 'merge'
      mergedValue?: any
    }
  }>({})
  
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (conflicts.length > 0) {
      // Initialize with default resolutions
      const defaultResolutions = conflicts.reduce((acc, conflict) => {
        acc[conflict.id] = { type: 'local' }
        return acc
      }, {} as typeof resolutions)
      setResolutions(defaultResolutions)
    }
  }, [conflicts])

  if (!isOpen || conflicts.length === 0) return null

  const currentConflict = conflicts[currentConflictIndex]
  const hasUnresolvedConflicts = Object.values(resolutions).some(r => !r.type)
  const isLastConflict = currentConflictIndex === conflicts.length - 1

  const handleResolutionChange = (
    conflictId: string, 
    type: 'local' | 'remote' | 'merge',
    mergedValue?: any
  ) => {
    setResolutions(prev => ({
      ...prev,
      [conflictId]: { type, mergedValue }
    }))
  }

  const handleNext = () => {
    if (currentConflictIndex < conflicts.length - 1) {
      setCurrentConflictIndex(prev => prev + 1)
    }
  }

  const handlePrevious = () => {
    if (currentConflictIndex > 0) {
      setCurrentConflictIndex(prev => prev - 1)
    }
  }

  const handleResolveAll = () => {
    const finalResolutions = conflicts.map(conflict => ({
      conflictId: conflict.id,
      resolution: resolutions[conflict.id]?.type || 'local',
      mergedValue: resolutions[conflict.id]?.mergedValue
    })) as Array<{
      conflictId: string
      resolution: 'local' | 'remote' | 'merge'
      mergedValue?: any
    }>

    onResolve(finalResolutions)
  }

  const formatValue = (value: any, field: keyof Task): string => {
    if (value === null || value === undefined) return 'Not set'
    
    switch (field) {
      case 'due_date':
        return value ? new Date(value).toLocaleDateString() : 'No due date'
      case 'created_at':
      case 'updated_at':
        return new Date(value).toLocaleString()
      case 'tags':
        return Array.isArray(value) ? value.join(', ') : 'No tags'
      case 'priority':
        return `${value}/10`
      case 'content':
        return typeof value === 'string' ? value : 'Rich content'
      case 'duration_minutes':
        return value ? `${value} minutes` : 'No duration set'
      case 'status':
        return value || 'pending'
      default:
        return String(value)
    }
  }

  const getFieldIcon = (field: keyof Task) => {
    switch (field) {
      case 'title':
        return <FileText className="h-4 w-4" />
      case 'content':
        return <FileText className="h-4 w-4" />
      case 'due_date':
        return <Calendar className="h-4 w-4" />
      case 'tags':
        return <Tag className="h-4 w-4" />
      case 'priority':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getCurrentResolution = () => {
    const resolution = resolutions[currentConflict.id]
    if (!resolution) return null

    switch (resolution.type) {
      case 'local':
        return currentConflict.localValue
      case 'remote':
        return currentConflict.remoteValue
      case 'merge':
        return resolution.mergedValue || currentConflict.localValue
      default:
        return currentConflict.localValue
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="pb-4 flex-shrink-0">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GitMerge className="h-5 w-5 text-amber-600" />
              <span>Resolve Data Conflicts</span>
              <Badge variant="destructive" className="text-xs">
                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-4 w-4 mr-1" />
                {showPreview ? 'Hide' : 'Show'} Preview
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <div className="text-sm text-muted-foreground">
              Conflict {currentConflictIndex + 1} of {conflicts.length}
            </div>
            <div className="flex space-x-1">
              {conflicts.map((_, index) => (
                <div
                  key={index}
                  className={`h-2 w-8 rounded-full ${
                    index === currentConflictIndex
                      ? 'bg-blue-500'
                      : index < currentConflictIndex
                      ? 'bg-green-500'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Current Conflict */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
              {/* Conflict Details */}
              <div className="space-y-4">
                <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center space-x-2">
                      {getFieldIcon(currentConflict.field)}
                      <span>Conflicting Field: {currentConflict.field}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-3">
                      Task: "{currentConflict.task.title}"
                    </p>
                    
                    <div className="space-y-3">
                      {/* Local Version */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-sm text-blue-800 dark:text-blue-200">
                              Your Version
                            </span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-blue-600">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(currentConflict.localOperation.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                        
                        {currentConflict.field === 'content' && typeof currentConflict.localValue === 'object' ? (
                          <div className="max-h-32 overflow-hidden">
                            <RichTextEditor
                              content={currentConflict.localValue}
                              readOnly
                              className="text-xs border-0"
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-blue-700 dark:text-blue-300 font-mono bg-white/50 dark:bg-black/20 p-2 rounded">
                            {formatValue(currentConflict.localValue, currentConflict.field)}
                          </p>
                        )}
                        
                        <Button
                          size="sm"
                          variant={resolutions[currentConflict.id]?.type === 'local' ? 'default' : 'outline'}
                          onClick={() => handleResolutionChange(currentConflict.id, 'local')}
                          className="mt-2 w-full"
                        >
                          {resolutions[currentConflict.id]?.type === 'local' && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Keep My Version
                        </Button>
                      </div>

                      {/* Remote Version */}
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-green-600" />
                            <span className="font-medium text-sm text-green-800 dark:text-green-200">
                              Remote Version
                            </span>
                          </div>
                          <div className="flex items-center space-x-1 text-xs text-green-600">
                            <Clock className="h-3 w-3" />
                            <span>{new Date(currentConflict.remoteOperation.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>
                        
                        {currentConflict.field === 'content' && typeof currentConflict.remoteValue === 'object' ? (
                          <div className="max-h-32 overflow-hidden">
                            <RichTextEditor
                              content={currentConflict.remoteValue}
                              readOnly
                              className="text-xs border-0"
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-green-700 dark:text-green-300 font-mono bg-white/50 dark:bg-black/20 p-2 rounded">
                            {formatValue(currentConflict.remoteValue, currentConflict.field)}
                          </p>
                        )}
                        
                        <Button
                          size="sm"
                          variant={resolutions[currentConflict.id]?.type === 'remote' ? 'default' : 'outline'}
                          onClick={() => handleResolutionChange(currentConflict.id, 'remote')}
                          className="mt-2 w-full"
                        >
                          {resolutions[currentConflict.id]?.type === 'remote' && (
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                          )}
                          Keep Remote Version
                        </Button>
                      </div>

                      {/* Merge Option (for text fields) */}
                      {['title', 'content'].includes(currentConflict.field) && (
                        <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-900">
                          <div className="flex items-center space-x-2 mb-2">
                            <GitMerge className="h-4 w-4 text-purple-600" />
                            <span className="font-medium text-sm text-purple-800 dark:text-purple-200">
                              Custom Merge
                            </span>
                          </div>
                          
                          {currentConflict.field === 'content' ? (
                            <RichTextEditor
                              content={resolutions[currentConflict.id]?.mergedValue || currentConflict.localValue}
                              onChange={(content) => handleResolutionChange(currentConflict.id, 'merge', content)}
                              className="min-h-[100px]"
                            />
                          ) : (
                            <input
                              type="text"
                              value={resolutions[currentConflict.id]?.mergedValue || currentConflict.localValue}
                              onChange={(e) => handleResolutionChange(currentConflict.id, 'merge', e.target.value)}
                              className="w-full p-2 text-sm border rounded"
                            />
                          )}
                          
                          <Button
                            size="sm"
                            variant={resolutions[currentConflict.id]?.type === 'merge' ? 'default' : 'outline'}
                            onClick={() => handleResolutionChange(
                              currentConflict.id, 
                              'merge',
                              resolutions[currentConflict.id]?.mergedValue || currentConflict.localValue
                            )}
                            className="mt-2 w-full"
                          >
                            {resolutions[currentConflict.id]?.type === 'merge' && (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            )}
                            Use Custom Version
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Preview Panel */}
              {showPreview && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Resolution Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="font-medium text-sm mb-2">Resolved Value:</p>
                          {currentConflict.field === 'content' && typeof getCurrentResolution() === 'object' ? (
                            <RichTextEditor
                              content={getCurrentResolution()}
                              readOnly
                              className="border-0"
                            />
                          ) : (
                            <p className="text-sm font-mono">
                              {formatValue(getCurrentResolution(), currentConflict.field)}
                            </p>
                          )}
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          Resolution: {resolutions[currentConflict.id]?.type || 'None'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* All Conflicts Summary */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">All Conflicts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {conflicts.map((conflict, index) => (
                          <div
                            key={conflict.id}
                            className={`flex items-center justify-between p-2 rounded text-xs ${
                              index === currentConflictIndex
                                ? 'bg-blue-100 dark:bg-blue-950/50'
                                : 'bg-muted'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              {getFieldIcon(conflict.field)}
                              <span>{conflict.field}</span>
                            </div>
                            <Badge 
                              variant={resolutions[conflict.id]?.type ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {resolutions[conflict.id]?.type || 'Pending'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t flex-shrink-0">
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={currentConflictIndex === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={isLastConflict}
              >
                Next
                <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>

            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                onClick={handleResolveAll}
                disabled={hasUnresolvedConflicts}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Resolve All ({Object.keys(resolutions).length})
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}