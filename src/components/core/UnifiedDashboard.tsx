'use client'

import { useState, useEffect } from 'react'
import { Task, TaskType } from '@/types'
import { CourseWidget } from './CourseWidget'
import { ProjectWidget } from './ProjectWidget'
import { ClubWidget } from './ClubWidget'
import { TodoWidget } from './TodoWidget'
import { TypeAwareCreateForm } from './TypeAwareCreateForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LayoutDashboard, TrendingUp, Clock, AlertCircle, Plus, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import { taskService } from '@/lib/taskService'

interface UnifiedDashboardProps {
  onViewChange?: (view: 'tasks' | 'schedule') => void
}

export function UnifiedDashboard({ onViewChange }: UnifiedDashboardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [defaultTaskType, setDefaultTaskType] = useState<TaskType>('todo')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    loadTasks()
  }, [])

  const loadTasks = async () => {
    try {
      setIsLoading(true)
      const allTasks = await taskService.getTasks()
      setTasks(allTasks)
    } catch (error) {
      console.error('Error loading tasks:', error)
      setError('Failed to load tasks')
    } finally {
      setIsLoading(false)
    }
  }

  const handleTaskCreate = async (task: Partial<Task>) => {
    try {
      const newTask = await taskService.createTask({
        title: task.title || '',
        content: task.content,
        priority: task.priority || 5,
        due_date: task.due_date,
        tags: task.tags || [],
        parent_id: task.parent_id,
        task_type: task.task_type || defaultTaskType,
        type_metadata: task.type_metadata || { category: 'general' }
      })
      
      setTasks(prev => [...prev, newTask])
      setShowCreateForm(false)
    } catch (error) {
      console.error('Error creating task:', error)
      setError('Failed to create task')
    }
  }

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task)
    // Could open a detail modal or navigate to task details
  }

  // Calculate summary stats
  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    overdue: tasks.filter(t => 
      t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'
    ).length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

  // Get tasks by type for widgets
  const tasksByType = {
    course: tasks.filter(t => t.task_type === 'course'),
    project: tasks.filter(t => t.task_type === 'project'),
    club: tasks.filter(t => t.task_type === 'club'),
    todo: tasks.filter(t => t.task_type === 'todo' || !t.task_type)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">Unified Dashboard</h1>
            <p className="text-muted-foreground">
              Manage all your courses, projects, clubs, and todos in one place
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onViewChange?.('schedule')}
          >
            <Clock className="h-4 w-4 mr-2" />
            Schedule View
          </Button>
          <Button 
            size="sm"
            onClick={() => {
              setDefaultTaskType('todo')
              setShowCreateForm(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Quick Add
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <LayoutDashboard className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">{completionRate}%</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold">{stats.inProgress}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <Clock className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Task Creation Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <TypeAwareCreateForm
              onSubmit={handleTaskCreate}
              onCancel={() => setShowCreateForm(false)}
              defaultType={defaultTaskType}
            />
          </div>
        </div>
      )}

      {/* Type-based Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CourseWidget 
          tasks={tasksByType.course}
          onTaskCreate={() => {
            setDefaultTaskType('course')
            setShowCreateForm(true)
          }}
          onTaskSelect={handleTaskSelect}
        />
        
        <ProjectWidget 
          tasks={tasksByType.project}
          onTaskCreate={() => {
            setDefaultTaskType('project')
            setShowCreateForm(true)
          }}
          onTaskSelect={handleTaskSelect}
        />
        
        <ClubWidget 
          tasks={tasksByType.club}
          onTaskCreate={() => {
            setDefaultTaskType('club')
            setShowCreateForm(true)
          }}
          onTaskSelect={handleTaskSelect}
        />
        
        <TodoWidget 
          tasks={tasksByType.todo}
          onTaskCreate={() => {
            setDefaultTaskType('todo')
            setShowCreateForm(true)
          }}
          onTaskSelect={handleTaskSelect}
        />
      </div>

      {/* Recent Activity / Timeline could be added here */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => {
                setDefaultTaskType('course')
                setShowCreateForm(true)
              }}
            >
              📚
              <span className="text-sm">Add Assignment</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => {
                setDefaultTaskType('project')
                setShowCreateForm(true)
              }}
            >
              💼
              <span className="text-sm">Project Task</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => {
                setDefaultTaskType('club')
                setShowCreateForm(true)
              }}
            >
              👥
              <span className="text-sm">Club Activity</span>
            </Button>
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-center gap-2"
              onClick={() => {
                setDefaultTaskType('todo')
                setShowCreateForm(true)
              }}
            >
              ✅
              <span className="text-sm">Personal Todo</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}