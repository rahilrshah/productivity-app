'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CRDTOperation } from '@/lib/crdt'
import { 
  History,
  Search,
  Filter,
  GitBranch,
  Clock,
  User,
  FileText,
  AlertTriangle,
  CheckCircle2,
  X,
  RotateCcw,
  Eye
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

interface ConflictHistoryProps {
  conflicts: ConflictRecord[]
  onRevert?: (conflictId: string) => void
  onPreview?: (conflict: ConflictRecord) => void
}

export function ConflictHistory({ conflicts, onRevert, onPreview }: ConflictHistoryProps) {
  const [filteredConflicts, setFilteredConflicts] = useState<ConflictRecord[]>(conflicts)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'local' | 'remote' | 'merge'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'task' | 'field'>('date')

  useEffect(() => {
    let filtered = conflicts

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(conflict =>
        conflict.taskTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conflict.field.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply resolution type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(conflict => conflict.resolutionType === filterType)
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime()
        case 'task':
          return a.taskTitle.localeCompare(b.taskTitle)
        case 'field':
          return a.field.localeCompare(b.field)
        default:
          return 0
      }
    })

    setFilteredConflicts(filtered)
  }, [conflicts, searchTerm, filterType, sortBy])

  const getResolutionIcon = (type: ConflictRecord['resolutionType']) => {
    switch (type) {
      case 'local':
        return <User className="h-4 w-4 text-blue-600" />
      case 'remote':
        return <GitBranch className="h-4 w-4 text-green-600" />
      case 'merge':
        return <FileText className="h-4 w-4 text-purple-600" />
    }
  }

  const getResolutionBadge = (type: ConflictRecord['resolutionType']) => {
    const colors = {
      local: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      remote: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      merge: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    }

    return (
      <Badge variant="secondary" className={colors[type]}>
        {type === 'local' && 'Kept Local'}
        {type === 'remote' && 'Kept Remote'}
        {type === 'merge' && 'Custom Merge'}
      </Badge>
    )
  }

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return 'Not set'
    if (typeof value === 'object') return 'Rich content'
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 50) + '...'
    }
    return String(value)
  }

  if (conflicts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-medium text-lg mb-2">No Conflict History</h3>
          <p className="text-muted-foreground text-sm max-w-md">
            When conflicts occur during synchronization, they'll appear here with resolution details.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="h-5 w-5" />
            <span>Conflict Resolution History</span>
            <Badge variant="secondary" className="text-xs">
              {conflicts.length} resolved
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by task or field..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              className="px-3 py-2 text-sm border rounded-md bg-background"
            >
              <option value="all">All Types</option>
              <option value="local">Local Kept</option>
              <option value="remote">Remote Kept</option>
              <option value="merge">Merged</option>
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 text-sm border rounded-md bg-background"
            >
              <option value="date">Sort by Date</option>
              <option value="task">Sort by Task</option>
              <option value="field">Sort by Field</option>
            </select>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {conflicts.filter(c => c.resolutionType === 'local').length}
            </div>
            <div className="text-xs text-muted-foreground">Local Kept</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {conflicts.filter(c => c.resolutionType === 'remote').length}
            </div>
            <div className="text-xs text-muted-foreground">Remote Kept</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {conflicts.filter(c => c.resolutionType === 'merge').length}
            </div>
            <div className="text-xs text-muted-foreground">Merged</div>
          </div>
        </div>

        {/* Conflict List */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {filteredConflicts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No conflicts match your filters</p>
            </div>
          ) : (
            filteredConflicts.map((conflict) => (
              <Card key={conflict.id} className="border-l-4 border-l-muted">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        {getResolutionIcon(conflict.resolutionType)}
                        <h4 className="font-medium text-sm truncate">
                          {conflict.taskTitle}
                        </h4>
                        {getResolutionBadge(conflict.resolutionType)}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Field:</span>
                          <span className="ml-2 font-mono">{conflict.field}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Resolved:</span>
                          <span className="ml-2">
                            {conflict.resolvedAt.toLocaleDateString()} at{' '}
                            {conflict.resolvedAt.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-2 p-2 bg-muted rounded text-xs">
                        <span className="text-muted-foreground">Final value:</span>
                        <span className="ml-2 font-mono">
                          {formatFieldValue(conflict.resolvedValue)}
                        </span>
                      </div>
                      
                      {/* Operation Details */}
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 bg-blue-50 dark:bg-blue-950/20 rounded">
                          <div className="flex items-center space-x-1 mb-1">
                            <Clock className="h-3 w-3" />
                            <span className="font-medium">Local Operation</span>
                          </div>
                          <div className="text-muted-foreground">
                            {new Date(conflict.localOperation.timestamp).toLocaleString()}
                          </div>
                        </div>
                        <div className="p-2 bg-green-50 dark:bg-green-950/20 rounded">
                          <div className="flex items-center space-x-1 mb-1">
                            <Clock className="h-3 w-3" />
                            <span className="font-medium">Remote Operation</span>
                          </div>
                          <div className="text-muted-foreground">
                            {new Date(conflict.remoteOperation.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-1 ml-4">
                      {onPreview && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onPreview(conflict)}
                          className="h-8 w-8 p-0"
                          title="Preview resolution"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      )}
                      {onRevert && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRevert(conflict.id)}
                          className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                          title="Revert resolution"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Actions */}
        {filteredConflicts.length > 0 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Showing {filteredConflicts.length} of {conflicts.length} conflicts
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm('')
                  setFilterType('all')
                  setSortBy('date')
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}