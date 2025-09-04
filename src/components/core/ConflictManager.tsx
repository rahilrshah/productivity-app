'use client'

import { useState, useEffect, useCallback } from 'react'
import { ConflictResolutionDialog, TaskConflict } from './ConflictResolutionDialog'
import { ConflictHistory } from './ConflictHistory'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getCRDTEngine, CRDTOperation } from '@/lib/crdt'
import { Task } from '@/types'
import { 
  AlertTriangle,
  Shield,
  CheckCircle2,
  History,
  Settings,
  RefreshCw,
  Bell,
  BellOff
} from 'lucide-react'

interface ConflictRecord {
  id: string
  taskId: string
  taskTitle: string
  field: string
  resolvedAt: Date
  resolutionType: 'local' | 'remote' | 'merge'
  localOperation: CRDTOperation
  remoteOperation: CRDTOperation
  resolvedValue: any
  userId: string
}

interface ConflictManagerProps {
  onConflictResolved?: (resolutions: any[]) => void
}

export function ConflictManager({ onConflictResolved }: ConflictManagerProps) {
  const [activeConflicts, setActiveConflicts] = useState<TaskConflict[]>([])
  const [conflictHistory, setConflictHistory] = useState<ConflictRecord[]>([])
  const [showResolutionDialog, setShowResolutionDialog] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [autoResolveEnabled, setAutoResolveEnabled] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  
  const crdt = getCRDTEngine()

  // Simulate conflict detection (in real app, this would be triggered by CRDT operations)
  const checkForConflicts = useCallback(() => {
    // This would be called when CRDT operations are applied
    // For demo purposes, we'll create some mock conflicts
    const mockConflicts: TaskConflict[] = []
    
    // In a real implementation, conflicts would be detected when:
    // 1. Two operations modify the same field of the same entity
    // 2. Operations have incompatible vector clocks
    // 3. Concurrent modifications result in different final states
    
    if (mockConflicts.length > 0) {
      setActiveConflicts(mockConflicts)
      if (notificationsEnabled) {
        // Show notification
        console.log(`${mockConflicts.length} conflicts detected`)
      }
    }
  }, [notificationsEnabled])

  // Set up conflict detection
  useEffect(() => {
    const unsubscribe = crdt.subscribe((state) => {
      // In a real implementation, analyze state changes for conflicts
      checkForConflicts()
    })

    // Load conflict history from localStorage
    const savedHistory = localStorage.getItem('conflict-history')
    if (savedHistory) {
      try {
        const history = JSON.parse(savedHistory).map((record: any) => ({
          ...record,
          resolvedAt: new Date(record.resolvedAt)
        }))
        setConflictHistory(history)
      } catch (e) {
        console.error('Failed to load conflict history:', e)
      }
    }

    return unsubscribe
  }, [crdt, checkForConflicts])

  // Auto-resolve conflicts based on predefined rules
  const autoResolveConflicts = (conflicts: TaskConflict[]) => {
    if (!autoResolveEnabled) return

    const autoResolutions = conflicts.map(conflict => {
      let resolution: 'local' | 'remote' | 'merge' = 'local'

      // Auto-resolution rules:
      // 1. For timestamps, keep the later one
      if (['created_at', 'updated_at'].includes(conflict.field)) {
        resolution = new Date(conflict.remoteOperation.timestamp) > new Date(conflict.localOperation.timestamp) 
          ? 'remote' : 'local'
      }
      // 2. For priority, keep the higher value
      else if (conflict.field === 'priority') {
        resolution = (conflict.remoteValue || 0) > (conflict.localValue || 0) ? 'remote' : 'local'
      }
      // 3. For tags, merge arrays
      else if (conflict.field === 'tags') {
        resolution = 'merge'
      }
      // 4. Default: keep local for user actions
      else {
        resolution = 'local'
      }

      return {
        conflictId: conflict.id,
        resolution,
        mergedValue: resolution === 'merge' && conflict.field === 'tags' 
          ? [...new Set([...(conflict.localValue || []), ...(conflict.remoteValue || [])])]
          : undefined
      }
    })

    handleResolveConflicts(autoResolutions)
  }

  const handleResolveConflicts = (resolutions: Array<{
    conflictId: string
    resolution: 'local' | 'remote' | 'merge'
    mergedValue?: any
  }>) => {
    // Create conflict records for history
    const resolvedConflicts = activeConflicts
      .filter(conflict => resolutions.some(r => r.conflictId === conflict.id))
      .map(conflict => {
        const resolution = resolutions.find(r => r.conflictId === conflict.id)!
        
        let resolvedValue = conflict.localValue
        if (resolution.resolution === 'remote') {
          resolvedValue = conflict.remoteValue
        } else if (resolution.resolution === 'merge') {
          resolvedValue = resolution.mergedValue || conflict.localValue
        }

        return {
          id: crypto.randomUUID(),
          taskId: conflict.taskId,
          taskTitle: conflict.task.title,
          field: conflict.field,
          resolvedAt: new Date(),
          resolutionType: resolution.resolution,
          localOperation: conflict.localOperation,
          remoteOperation: conflict.remoteOperation,
          resolvedValue,
          userId: crdt.getState().userId
        }
      })

    // Update conflict history
    const newHistory = [...conflictHistory, ...resolvedConflicts]
    setConflictHistory(newHistory)
    
    // Save to localStorage
    localStorage.setItem('conflict-history', JSON.stringify(newHistory))

    // Remove resolved conflicts from active list
    const resolvedIds = resolutions.map(r => r.conflictId)
    setActiveConflicts(prev => prev.filter(c => !resolvedIds.includes(c.id)))
    
    // Close dialog
    setShowResolutionDialog(false)

    // Notify parent component
    onConflictResolved?.(resolutions)
  }

  const handleRevertResolution = (conflictId: string) => {
    // In a real implementation, this would revert the CRDT state
    // and potentially recreate the conflict for re-resolution
    console.log('Reverting conflict resolution:', conflictId)
    
    // Remove from history (for demo purposes)
    setConflictHistory(prev => prev.filter(record => record.id !== conflictId))
  }

  const handlePreviewConflict = (conflict: ConflictRecord) => {
    // Show a preview modal or detailed view
    console.log('Previewing conflict:', conflict)
  }

  const createMockConflict = () => {
    // For testing purposes - create a mock conflict
    const mockTask: Task = {
      id: 'task-1',
      user_id: 'user-1',
      title: 'Sample Task with Conflict',
      content: 'This is a sample task for testing conflicts',
      status: 'pending',
      priority: 5,
      tags: ['test', 'demo'],
      dependencies: [],
      position: 0,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const mockConflict: TaskConflict = {
      id: crypto.randomUUID(),
      taskId: mockTask.id,
      field: 'title',
      localValue: 'Updated Task Title (Local)',
      remoteValue: 'Updated Task Title (Remote)',
      localOperation: {
        id: crypto.randomUUID(),
        type: 'update',
        entityId: mockTask.id,
        entityType: 'task',
        userId: 'user-1',
        timestamp: Date.now() - 1000,
        vectorClock: { 'user-1': 5 },
        payload: { title: 'Updated Task Title (Local)' },
        applied: false
      },
      remoteOperation: {
        id: crypto.randomUUID(),
        type: 'update',
        entityId: mockTask.id,
        entityType: 'task',
        userId: 'user-2',
        timestamp: Date.now() - 500,
        vectorClock: { 'user-2': 3 },
        payload: { title: 'Updated Task Title (Remote)' },
        applied: false
      },
      task: mockTask
    }

    setActiveConflicts([mockConflict])
  }

  return (
    <div className="space-y-6">
      {/* Conflict Status Overview */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-blue-600" />
              <span>Conflict Management</span>
            </div>
            <div className="flex items-center space-x-2">
              {activeConflicts.length > 0 ? (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {activeConflicts.length} active
                </Badge>
              ) : (
                <Badge variant="default">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  No conflicts
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span className="text-sm">Auto-resolve conflicts</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoResolveEnabled(!autoResolveEnabled)}
                className={autoResolveEnabled ? 'text-green-600' : 'text-muted-foreground'}
              >
                {autoResolveEnabled ? <CheckCircle2 className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                <span className="text-sm">Conflict notifications</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={notificationsEnabled ? 'text-green-600' : 'text-muted-foreground'}
              >
                {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Active Conflicts */}
          {activeConflicts.length > 0 ? (
            <div className="space-y-3">
              <h3 className="font-medium text-sm flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" />
                Active Conflicts Requiring Resolution
              </h3>
              
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-900">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                  {activeConflicts.length} conflict{activeConflicts.length > 1 ? 's' : ''} detected during synchronization. 
                  Please review and resolve to continue.
                </p>
                
                <div className="flex space-x-2">
                  <Button
                    onClick={() => setShowResolutionDialog(true)}
                    size="sm"
                  >
                    Resolve Conflicts
                  </Button>
                  
                  {autoResolveEnabled && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => autoResolveConflicts(activeConflicts)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Auto-resolve
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="font-medium text-lg mb-2">All Clear!</h3>
              <p className="text-muted-foreground text-sm mb-4">
                No conflicts detected. Your data is synchronized successfully.
              </p>
              
              {/* Demo Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={createMockConflict}
                className="text-xs"
              >
                Create Mock Conflict (Demo)
              </Button>
            </div>
          )}

          {/* History Section */}
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm flex items-center">
              <History className="h-4 w-4 mr-2" />
              Resolution History ({conflictHistory.length})
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? 'Hide' : 'Show'} History
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History Panel */}
      {showHistory && (
        <ConflictHistory
          conflicts={conflictHistory}
          onRevert={handleRevertResolution}
          onPreview={handlePreviewConflict}
        />
      )}

      {/* Resolution Dialog */}
      <ConflictResolutionDialog
        conflicts={activeConflicts}
        onResolve={handleResolveConflicts}
        onClose={() => setShowResolutionDialog(false)}
        isOpen={showResolutionDialog}
      />
    </div>
  )
}