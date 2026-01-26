'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Task, TaskType, TaskStatus } from '@/types'
import { TaskCard } from './TaskCard'
import { TypeAwareCreateForm } from './TypeAwareCreateForm'
import { NaturalLanguageInput } from './NaturalLanguageInput'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Filter, Bot, Wifi, WifiOff, Search, SortAsc, SortDesc, Grid, List, Calendar, Clock } from 'lucide-react'
import { taskService } from '@/lib/taskService'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface TaskListProps {
  onViewChange?: (view: 'tasks' | 'schedule') => void
}

type SortField = 'title' | 'due_date' | 'priority' | 'created_at' | 'updated_at'
type ViewMode = 'list' | 'grid' | 'grouped'

export function TaskList({}: TaskListProps = {}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showNLInput, setShowNLInput] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState({ inProgress: false, needsSync: false })
  
  // Advanced organization state
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<TaskType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<'high' | 'medium' | 'low' | 'all'>('all')
  const [sortField, setSortField] = useState<SortField>('due_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [showFilters, setShowFilters] = useState(false)
  
  const { user } = useAuth()

  // Initialize task service and fetch tasks
  useEffect(() => {
    if (user?.id) {
      initializeAndFetchTasks()
    }
  }, [user?.id])

  // Listen for online/offline changes
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (taskService.isInitialized()) {
        taskService.syncNow().catch(console.error)
      }
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const initializeAndFetchTasks = async () => {
    try {
      setIsLoading(true)
      setError('')
      
      if (!taskService.isInitialized()) {
        await taskService.initialize(user!.id)
      }
      
      await fetchTasks()
    } catch (error) {
      console.error('Error initializing task service:', error)
      setError('Failed to initialize task service. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchTasks = async () => {
    try {
      const fetchedTasks = await taskService.getTasks()
      setTasks(fetchedTasks)
      
      // Update sync status
      const status = taskService.getSyncStatus()
      setSyncStatus(status)
    } catch (error) {
      console.error('Error fetching tasks:', error)
      setError('Failed to load tasks. Please try again.')
    }
  }

  const handleCreateTask = async (task: Partial<Task>) => {
    try {
      const newTask = await taskService.createTask({
        title: task.title || '',
        content: task.content,
        priority: task.priority || 5,
        due_date: task.due_date,
        tags: task.tags || [],
        parent_id: task.parent_id,
        task_type: task.task_type || 'todo',
        type_metadata: task.type_metadata || { category: 'general' }
      })
      
      setTasks(prev => [...prev, newTask])
      setShowCreateForm(false)
      
      // Update sync status
      const status = taskService.getSyncStatus()
      setSyncStatus(status)
    } catch (error) {
      console.error('Error creating task:', error)
      setError('Failed to create task. Please try again.')
    }
  }

  const handleUpdateTask = async (id: string, updates: Partial<Task>) => {
    try {
      // Optimistically update UI
      setTasks(prev =>
        prev.map(task =>
          task.id === id
            ? { ...task, ...updates, updated_at: new Date().toISOString() }
            : task
        )
      )

      const updatedTask = await taskService.updateTask(id, updates)
      
      // Update with server response
      setTasks(prev =>
        prev.map(task =>
          task.id === id ? updatedTask : task
        )
      )
      
      // Update sync status
      const status = taskService.getSyncStatus()
      setSyncStatus(status)
    } catch (error) {
      console.error('Error updating task:', error)
      setError('Failed to update task. Please try again.')
      // Revert optimistic update on failure
      await fetchTasks()
    }
  }

  const handleDeleteTask = async (id: string) => {
    try {
      // Optimistically remove from UI
      setTasks(prev => prev.filter(task => task.id !== id))

      await taskService.deleteTask(id)
      
      // Update sync status
      const status = taskService.getSyncStatus()
      setSyncStatus(status)
    } catch (error) {
      console.error('Error deleting task:', error)
      setError('Failed to delete task. Please try again.')
      // Revert optimistic update on failure
      await fetchTasks()
    }
  }

  const handleSync = async () => {
    if (!isOnline) return
    
    try {
      setSyncStatus(prev => ({ ...prev, inProgress: true }))
      await taskService.syncNow()
      await fetchTasks()
    } catch (error) {
      console.error('Error syncing:', error)
      setError('Failed to sync. Please try again.')
    } finally {
      setSyncStatus(prev => ({ ...prev, inProgress: false }))
    }
  }

  // Memoized filter and sort tasks - prevents recalculation on every render
  const filteredAndSortedTasks = useMemo(() => {
    const searchLower = searchQuery.toLowerCase()

    return tasks
      .filter(task => {
        // Search filter
        if (searchQuery) {
          const matchesTitle = task.title.toLowerCase().includes(searchLower)
          const matchesContent = task.content?.toLowerCase().includes(searchLower)
          const matchesTags = task.tags.some(tag => tag.toLowerCase().includes(searchLower))
          if (!matchesTitle && !matchesContent && !matchesTags) {
            return false
          }
        }

        // Type filter
        if (filterType !== 'all' && task.task_type !== filterType) {
          return false
        }

        // Status filter
        if (filterStatus !== 'all' && task.status !== filterStatus) {
          return false
        }

        // Priority filter
        if (filterPriority !== 'all') {
          const priorityLevel = task.priority <= 3 ? 'low' : task.priority <= 7 ? 'medium' : 'high'
          if (priorityLevel !== filterPriority) {
            return false
          }
        }

        return true
      })
      .sort((a, b) => {
        let aValue: string | number | Date
        let bValue: string | number | Date

        switch (sortField) {
          case 'title':
            aValue = a.title.toLowerCase()
            bValue = b.title.toLowerCase()
            break
          case 'due_date':
            aValue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
            bValue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
            break
          case 'priority':
            aValue = a.priority
            bValue = b.priority
            break
          case 'created_at':
            aValue = new Date(a.created_at).getTime()
            bValue = new Date(b.created_at).getTime()
            break
          case 'updated_at':
            aValue = new Date(a.updated_at).getTime()
            bValue = new Date(b.updated_at).getTime()
            break
          default:
            return 0
        }

        if (sortDirection === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
        }
      })
  }, [tasks, searchQuery, filterType, filterStatus, filterPriority, sortField, sortDirection])

  // Memoized grouped tasks - only compute when needed
  const groupedTasks = useMemo(() => {
    if (viewMode !== 'grouped') return {}

    return filteredAndSortedTasks.reduce((groups, task) => {
      const key = task.task_type || 'todo'
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(task)
      return groups
    }, {} as Record<string, Task[]>)
  }, [filteredAndSortedTasks, viewMode])

  // Memoized callbacks to prevent unnecessary re-renders
  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }, [sortField])

  const clearFilters = useCallback(() => {
    setSearchQuery('')
    setFilterType('all')
    setFilterStatus('all')
    setFilterPriority('all')
  }, [])

  // Memoized active filter count
  const activeFilterCount = useMemo(() => {
    return [
      searchQuery !== '',
      filterType !== 'all',
      filterStatus !== 'all',
      filterPriority !== 'all'
    ].filter(Boolean).length
  }, [searchQuery, filterType, filterStatus, filterPriority])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-muted animate-pulse rounded-lg"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          {error}
          <Button
            variant="link"
            size="sm"
            className="ml-2 h-auto p-0 text-xs"
            onClick={() => {
              setError('')
              fetchTasks()
            }}
          >
            Retry
          </Button>
        </div>
      )}
      
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Main Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => setShowCreateForm(true)}
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
          <Button
            onClick={() => setShowNLInput(true)}
            size="sm"
            variant="secondary"
          >
            <Bot className="mr-2 h-4 w-4" />
            AI Create
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(activeFilterCount > 0 && "bg-primary text-primary-foreground")}
          >
            <Filter className="mr-2 h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2 h-4 w-4 p-0 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          
          {/* View Mode Toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-r-none"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-none border-x"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grouped' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grouped')}
              className="rounded-l-none"
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-muted-foreground">
            {filteredAndSortedTasks.length} of {tasks.length} tasks
          </div>
          
          {/* Sort Controls */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSort('due_date')}
              className="text-xs h-7"
            >
              <Clock className="h-3 w-3 mr-1" />
              Due Date
              {sortField === 'due_date' && (
                sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-1" /> : <SortDesc className="h-3 w-3 ml-1" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSort('priority')}
              className="text-xs h-7"
            >
              Priority
              {sortField === 'priority' && (
                sortDirection === 'asc' ? <SortAsc className="h-3 w-3 ml-1" /> : <SortDesc className="h-3 w-3 ml-1" />
              )}
            </Button>
          </div>
          
          {/* Sync status */}
          <div className="flex items-center space-x-2">
            <div className={`flex items-center space-x-1 text-xs ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
            
            {syncStatus.inProgress && (
              <div className="text-xs text-blue-600">Syncing...</div>
            )}
            
            {isOnline && !syncStatus.inProgress && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSync}
                className="h-6 px-2 text-xs"
              >
                Sync
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="p-4 bg-muted/50 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Filters</h3>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear All
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Task Type</label>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as TaskType | 'all')}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="course">Course</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="club">Club</SelectItem>
                  <SelectItem value="todo">Todo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as TaskStatus | 'all')}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={filterPriority} onValueChange={(value) => setFilterPriority(value as 'high' | 'medium' | 'low' | 'all')}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High (8-10)</SelectItem>
                  <SelectItem value="medium">Medium (4-7)</SelectItem>
                  <SelectItem value="low">Low (1-3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Sort By</label>
              <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_date">Due Date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="created_at">Created</SelectItem>
                  <SelectItem value="updated_at">Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <TypeAwareCreateForm
          onSubmit={handleCreateTask}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {showNLInput && (
        <NaturalLanguageInput
          onTaskCreated={(task) => {
            handleCreateTask(task)
            setShowNLInput(false)
          }}
          onClose={() => setShowNLInput(false)}
        />
      )}

      {/* Task Display */}
      <div className={cn(
        viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 
        viewMode === 'list' ? 'space-y-3' : 
        'space-y-6'
      )}>
        {filteredAndSortedTasks.length === 0 ? (
          <div className="text-center py-12 col-span-full">
            <div className="text-muted-foreground mb-4">
              {tasks.length === 0 ? 
                "No tasks yet. Create your first task to get started." :
                "No tasks match the current filters."
              }
            </div>
            {tasks.length === 0 && (
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Task
              </Button>
            )}
          </div>
        ) : viewMode === 'grouped' ? (
          Object.entries(groupedTasks).map(([taskType, groupTasks]) => (
            <div key={taskType} className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Badge variant="outline" className="capitalize">
                  {taskType} ({groupTasks.length})
                </Badge>
              </div>
              <div className="space-y-3">
                {groupTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUpdate={handleUpdateTask}
                    onDelete={handleDeleteTask}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          filteredAndSortedTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
            />
          ))
        )}
      </div>
    </div>
  )
}