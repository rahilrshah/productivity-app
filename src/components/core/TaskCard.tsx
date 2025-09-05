'use client'

import { Task, TaskStatus } from '@/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from './RichTextEditor'
import { formatDate, cn } from '@/lib/utils'
import {
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit,
  PlayCircle,
  BookOpen,
  Briefcase,
  Users,
  ListTodo,
} from 'lucide-react'

interface TaskCardProps {
  task: Task
  onUpdate: (id: string, updates: Partial<Task>) => void
  onDelete: (id: string) => void
}

const statusIcons = {
  pending: Circle,
  in_progress: PlayCircle,
  completed: CheckCircle2,
  archived: Circle,
}

const statusColors = {
  pending: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  archived: 'text-muted-foreground',
}

const priorityColors = {
  low: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  medium: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

const taskTypeIcons = {
  course: BookOpen,
  project: Briefcase,
  club: Users,
  todo: ListTodo,
}

const taskTypeColors = {
  course: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  project: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  club: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  todo: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
}

function getPriorityLevel(priority: number): 'low' | 'medium' | 'high' {
  if (priority <= 3) return 'low'
  if (priority <= 7) return 'medium'
  return 'high'
}

function getPriorityLabel(priority: number): string {
  const level = getPriorityLevel(priority)
  return `${level.charAt(0).toUpperCase() + level.slice(1)} (${priority})`
}

function renderTaskMetadata(task: Task): JSX.Element | null {
  if (!task.type_metadata) return null

  switch (task.task_type) {
    case 'course':
      const courseData = task.type_metadata as any
      return (
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <span>{courseData.course_code}</span>
          <span>•</span>
          <span>{courseData.assignment_type}</span>
          {courseData.semester && (
            <>
              <span>•</span>
              <span>{courseData.semester}</span>
            </>
          )}
        </div>
      )

    case 'project':
      const projectData = task.type_metadata as any
      return (
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <span>{projectData.methodology}</span>
          <span>•</span>
          <span>{projectData.phase}</span>
          {projectData.milestone && (
            <>
              <span>•</span>
              <span>{projectData.milestone}</span>
            </>
          )}
        </div>
      )

    case 'club':
      const clubData = task.type_metadata as any
      return (
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          <span>{clubData.club_name}</span>
          <span>•</span>
          <span>{clubData.role}</span>
          {clubData.event_type && (
            <>
              <span>•</span>
              <span>{clubData.event_type}</span>
            </>
          )}
        </div>
      )

    case 'todo':
      const todoData = task.type_metadata as any
      if (!todoData.category && !todoData.location && !todoData.context) return null
      return (
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {todoData.category && <span>{todoData.category}</span>}
          {todoData.location && (
            <>
              {todoData.category && <span>•</span>}
              <span>{todoData.location}</span>
            </>
          )}
          {todoData.context && (
            <>
              {(todoData.category || todoData.location) && <span>•</span>}
              <span>{todoData.context}</span>
            </>
          )}
        </div>
      )

    default:
      return null
  }
}

export function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const StatusIcon = statusIcons[task.status]
  const priorityLevel = getPriorityLevel(task.priority)
  const TaskTypeIcon = taskTypeIcons[task.task_type || 'todo']
  
  const toggleStatus = () => {
    const statusFlow: Record<TaskStatus, TaskStatus> = {
      pending: 'in_progress',
      in_progress: 'completed',
      completed: 'pending',
      archived: 'pending',
    }
    
    const newStatus = statusFlow[task.status]
    const updates: Partial<Task> = { status: newStatus }
    
    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString()
    } else if (task.completed_at) {
      updates.completed_at = undefined
    }
    
    onUpdate(task.id, updates)
  }

  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
  const isDueSoon = task.due_date && 
    new Date(task.due_date) <= new Date(Date.now() + 86400000) && 
    new Date(task.due_date) > new Date() &&
    task.status !== 'completed'

  return (
    <Card className={cn(
      'transition-all duration-200 hover:shadow-md',
      task.status === 'completed' && 'opacity-75',
      isOverdue && 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20',
      isDueSoon && 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-900 dark:bg-yellow-950/20'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleStatus}
              className="mt-0.5 h-6 w-6 p-0 hover:bg-transparent"
            >
              <StatusIcon className={cn('h-5 w-5', statusColors[task.status])} />
            </Button>
            
            <div className="flex-1 min-w-0">
              <h3 className={cn(
                'font-medium text-sm leading-5',
                task.status === 'completed' && 'line-through text-muted-foreground'
              )}>
                {task.title}
              </h3>
              {task.content && (
                <div className="mt-1">
                  <RichTextEditor
                    content={task.content}
                    readOnly
                    className="text-sm [&_.ProseMirror]:p-0 [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:max-h-12 [&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:text-muted-foreground"
                  />
                </div>
              )}
              {renderTaskMetadata(task) && (
                <div className="mt-1">
                  {renderTaskMetadata(task)}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            <Badge
              variant="outline"
              className={cn('text-xs flex items-center gap-1', taskTypeColors[task.task_type || 'todo'])}
            >
              <TaskTypeIcon className="h-3 w-3" />
              {task.task_type || 'todo'}
            </Badge>
            <Badge
              variant="secondary"
              className={cn('text-xs', priorityColors[priorityLevel])}
            >
              {getPriorityLabel(task.priority)}
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            {task.due_date && (
              <div className={cn(
                'flex items-center space-x-1',
                isOverdue && 'text-red-600 dark:text-red-400',
                isDueSoon && 'text-yellow-600 dark:text-yellow-400'
              )}>
                <Calendar className="h-3 w-3" />
                <span>{formatDate(task.due_date)}</span>
              </div>
            )}
            
            {task.duration_minutes && (
              <div className="flex items-center space-x-1">
                <Clock className="h-3 w-3" />
                <span>{task.duration_minutes}min</span>
              </div>
            )}
            
            {task.tags.length > 0 && (
              <div className="flex items-center space-x-1">
                {task.tags.slice(0, 2).map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {task.tags.length > 2 && (
                  <span className="text-xs">+{task.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(task.id)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}