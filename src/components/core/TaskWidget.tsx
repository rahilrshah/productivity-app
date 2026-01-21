'use client'

import { Task, CourseMetadata, ProjectMetadata, ClubMetadata, TodoMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  BookOpen, Briefcase, Users, ListTodo, Plus, Clock, Calendar,
  AlertTriangle, Crown, MapPin, Tag, CheckCircle2, GitBranch, Target
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

// Widget configuration type
export interface TaskWidgetConfig {
  type: 'course' | 'project' | 'club' | 'todo'
  title: string
  icon: LucideIcon
  iconColor: string
  addButtonText: string
  emptyMessage: string
  emptySubMessage: string
}

// Preset configurations for each type
export const WIDGET_CONFIGS: Record<string, TaskWidgetConfig> = {
  course: {
    type: 'course',
    title: 'Courses',
    icon: BookOpen,
    iconColor: 'text-purple-600',
    addButtonText: 'Add Assignment',
    emptyMessage: 'No course assignments yet',
    emptySubMessage: 'Add your first assignment to get started'
  },
  project: {
    type: 'project',
    title: 'Projects',
    icon: Briefcase,
    iconColor: 'text-orange-600',
    addButtonText: 'Add Task',
    emptyMessage: 'No project tasks yet',
    emptySubMessage: 'Create your first project task to get started'
  },
  club: {
    type: 'club',
    title: 'Clubs & Activities',
    icon: Users,
    iconColor: 'text-green-600',
    addButtonText: 'Add Activity',
    emptyMessage: 'No club activities yet',
    emptySubMessage: 'Add your first club activity to get started'
  },
  todo: {
    type: 'todo',
    title: 'Personal Todos',
    icon: ListTodo,
    iconColor: 'text-blue-600',
    addButtonText: 'Add Todo',
    emptyMessage: 'No todos yet',
    emptySubMessage: 'Add your first todo to get started'
  }
}

interface TaskWidgetProps {
  tasks: Task[]
  config: TaskWidgetConfig
  onTaskCreate?: () => void
  onTaskSelect?: (task: Task) => void
}

export function TaskWidget({ tasks, config, onTaskCreate, onTaskSelect }: TaskWidgetProps) {
  const Icon = config.icon

  // Filter tasks by category (new) or task_type (legacy)
  const filteredTasks = tasks.filter(task => {
    const category = task.category || task.task_type
    if (config.type === 'todo') {
      return category === 'todo' || category === 'routine' || category === 'journal' || !category
    }
    return category === config.type
  })

  // Group tasks based on type
  const groups = groupTasks(filteredTasks, config.type)

  // Calculate stats
  const stats = calculateStats(filteredTasks, config.type, groups)

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", config.iconColor)} />
            <CardTitle className="text-lg">{config.title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {stats.alert && (
              <Badge variant="destructive" className="text-xs">
                {stats.alert}
              </Badge>
            )}
            <Button size="sm" onClick={onTaskCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {config.addButtonText}
            </Button>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{stats.stat1.value}</div>
            <div>{stats.stat1.label}</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{stats.stat2.value}</div>
            <div>{stats.stat2.label}</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{stats.stat3.value}</div>
            <div>{stats.stat3.label}</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {Object.keys(groups).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Icon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{config.emptyMessage}</p>
            <p className="text-sm">{config.emptySubMessage}</p>
          </div>
        ) : (
          Object.entries(groups).map(([groupKey, groupTasks]) => (
            <TaskGroup
              key={groupKey}
              groupKey={groupKey}
              tasks={groupTasks}
              type={config.type}
              onTaskSelect={onTaskSelect}
            />
          ))
        )}
      </CardContent>
    </Card>
  )
}

// Group tasks based on type
function groupTasks(tasks: Task[], type: string): Record<string, Task[]> {
  return tasks.reduce((groups, task) => {
    let groupKey: string

    switch (type) {
      case 'course':
        groupKey = (task.type_metadata as CourseMetadata)?.course_code || 'Unknown Course'
        break
      case 'project':
        const projectMeta = task.type_metadata as ProjectMetadata
        groupKey = task.parent_id ? 'Project Tasks' : projectMeta?.milestone || task.title.split(' ')[0] || 'General'
        break
      case 'club':
        groupKey = (task.type_metadata as ClubMetadata)?.club_name || 'General Activities'
        break
      case 'todo':
      default:
        groupKey = (task.type_metadata as TodoMetadata)?.category || 'General'
        break
    }

    if (!groups[groupKey]) {
      groups[groupKey] = []
    }
    groups[groupKey].push(task)
    return groups
  }, {} as Record<string, Task[]>)
}

// Calculate stats based on type
function calculateStats(tasks: Task[], type: string, groups: Record<string, Task[]>) {
  const total = tasks.length
  const completed = tasks.filter(t => t.status === 'completed').length
  const overdue = tasks.filter(t =>
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'
  ).length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const pending = tasks.filter(t => t.status === 'pending').length
  const upcoming = tasks.filter(t =>
    t.due_date && new Date(t.due_date) > new Date() && t.status !== 'completed'
  ).length

  // Completed today for todos
  const completedToday = tasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false
    const completedDate = new Date(t.completed_at).toDateString()
    const today = new Date().toDateString()
    return completedDate === today
  }).length

  switch (type) {
    case 'course':
      return {
        stat1: { value: total, label: 'Total' },
        stat2: { value: completed, label: 'Completed' },
        stat3: { value: Object.keys(groups).length, label: 'Courses' },
        alert: overdue > 0 ? `${overdue} overdue` : null
      }
    case 'project':
      return {
        stat1: { value: total, label: 'Total Tasks' },
        stat2: { value: inProgress, label: 'In Progress' },
        stat3: { value: Object.keys(groups).length, label: 'Projects' },
        alert: null
      }
    case 'club':
      return {
        stat1: { value: total, label: 'Activities' },
        stat2: { value: upcoming, label: 'Upcoming' },
        stat3: { value: Object.keys(groups).length, label: 'Clubs' },
        alert: null
      }
    case 'todo':
    default:
      return {
        stat1: { value: total, label: 'Total' },
        stat2: { value: completedToday, label: 'Done Today' },
        stat3: { value: pending, label: 'Pending' },
        alert: null
      }
  }
}

// Task group component
interface TaskGroupProps {
  groupKey: string
  tasks: Task[]
  type: string
  onTaskSelect?: (task: Task) => void
}

function TaskGroup({ groupKey, tasks, type, onTaskSelect }: TaskGroupProps) {
  const firstTask = tasks[0]
  const metadata = firstTask.type_metadata
  const progress = tasks.length > 0
    ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)
    : 0

  // Sort tasks: pending/in_progress first, then by priority
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1
    if (a.status !== 'completed' && b.status === 'completed') return -1
    return b.priority - a.priority
  })

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <GroupHeader
        groupKey={groupKey}
        tasks={tasks}
        type={type}
        metadata={metadata}
        progress={progress}
      />

      {type === 'project' && <Progress value={progress} className="h-2" />}

      <div className="space-y-1">
        {sortedTasks.slice(0, type === 'todo' ? 4 : 3).map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            type={type}
            onClick={() => onTaskSelect?.(task)}
          />
        ))}

        {tasks.length > (type === 'todo' ? 4 : 3) && (
          <div className="text-center pt-1">
            <button className="text-xs text-muted-foreground hover:text-foreground">
              +{tasks.length - (type === 'todo' ? 4 : 3)} more
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Group header based on type
interface GroupHeaderProps {
  groupKey: string
  tasks: Task[]
  type: string
  metadata: any
  progress: number
}

function GroupHeader({ groupKey, tasks, type, metadata, progress }: GroupHeaderProps) {
  switch (type) {
    case 'course':
      return (
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">{groupKey}</h4>
            {(metadata as CourseMetadata)?.semester && (
              <p className="text-sm text-muted-foreground">{(metadata as CourseMetadata).semester}</p>
            )}
          </div>
          <Badge variant="outline" className="text-xs">
            {tasks.length} tasks
          </Badge>
        </div>
      )
    case 'project':
      const projectMeta = metadata as ProjectMetadata
      return (
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">{groupKey}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={cn("text-xs", getPhaseColor(projectMeta?.phase || ''))}
              >
                {getMethodologyIcon(projectMeta?.methodology || '')}
                {projectMeta?.phase || 'Planning'}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {projectMeta?.methodology || 'Flexible'}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{progress}%</div>
            <div className="text-xs text-muted-foreground">Complete</div>
          </div>
        </div>
      )
    case 'club':
      const clubMeta = metadata as ClubMetadata
      return (
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium">{groupKey}</h4>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={cn("text-xs flex items-center gap-1", getRoleColor(clubMeta?.role || ''))}
              >
                {getRoleIcon(clubMeta?.role || '')}
                {clubMeta?.role || 'Member'}
              </Badge>
              {clubMeta?.leadership_position && (
                <Badge variant="secondary" className="text-xs">
                  Leadership
                </Badge>
              )}
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {tasks.length} tasks
          </Badge>
        </div>
      )
    case 'todo':
    default:
      return (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{getCategoryIcon(groupKey)}</span>
            <h4 className="font-medium">{groupKey}</h4>
            <Badge variant="outline" className="text-xs">
              {tasks.length} tasks
            </Badge>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{progress}%</div>
          </div>
        </div>
      )
  }
}

// Task card component
interface TaskCardProps {
  task: Task
  type: string
  onClick: () => void
}

function TaskCard({ task, type, onClick }: TaskCardProps) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
  const isUpcoming = task.due_date && new Date(task.due_date) > new Date() && task.status !== 'completed'

  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50",
        task.status === 'completed' && "opacity-60",
        type === 'course' && isOverdue && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
        type === 'club' && isUpcoming && "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TaskStatusIndicator task={task} type={type} />
          <span className={cn(
            "font-medium text-sm truncate",
            task.status === 'completed' && "line-through text-muted-foreground"
          )}>
            {task.title}
          </span>
        </div>
        <TaskMetadataDisplay task={task} type={type} isOverdue={!!isOverdue} />
      </div>

      <Badge variant="outline" className="text-xs ml-2">
        P{task.priority}
      </Badge>
    </div>
  )
}

// Status indicator
function TaskStatusIndicator({ task, type }: { task: Task, type: string }) {
  if (type === 'todo' && task.status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />
  }

  if (type === 'todo') {
    return (
      <div className={cn(
        "w-3 h-3 rounded-full border-2",
        task.status === 'in_progress' ? "bg-blue-500 border-blue-500" :
        "border-gray-300 hover:border-blue-500"
      )} />
    )
  }

  return (
    <div className={cn(
      "w-2 h-2 rounded-full",
      task.status === 'completed' ? "bg-green-500" :
      task.status === 'in_progress' ? "bg-blue-500" :
      "bg-gray-300"
    )} />
  )
}

// Metadata display based on type
function TaskMetadataDisplay({ task, type, isOverdue }: { task: Task, type: string, isOverdue: boolean }) {
  const metadata = task.type_metadata

  switch (type) {
    case 'course':
      const courseMeta = metadata as CourseMetadata
      return (
        <div className="flex items-center gap-2 mt-1">
          <Badge
            variant="secondary"
            className={cn("text-xs", getAssignmentTypeColor(courseMeta?.assignment_type || ''))}
          >
            {courseMeta?.assignment_type || 'Task'}
          </Badge>
          {task.due_date && (
            <div className={cn(
              "flex items-center gap-1 text-xs",
              isOverdue ? "text-red-600" : "text-muted-foreground"
            )}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <Clock className="h-3 w-3" />
              {formatDueDate(task.due_date)}
            </div>
          )}
        </div>
      )
    case 'project':
      const projectMeta = metadata as ProjectMetadata
      return (
        <div className="flex items-center gap-2 mt-1">
          {projectMeta?.milestone && (
            <Badge variant="outline" className="text-xs">
              {projectMeta.milestone}
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {projectMeta?.project_type || 'personal'}
          </Badge>
        </div>
      )
    case 'club':
      const clubMeta = metadata as ClubMetadata
      return (
        <div className="flex items-center gap-2 mt-1">
          {clubMeta?.event_type && (
            <Badge variant="secondary" className="text-xs">
              {clubMeta.event_type}
            </Badge>
          )}
          {task.due_date && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {formatEventDate(task.due_date)}
            </div>
          )}
        </div>
      )
    case 'todo':
    default:
      const todoMeta = metadata as TodoMetadata
      return (
        <div className="flex items-center gap-2 mt-1">
          {todoMeta?.location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {todoMeta.location}
            </div>
          )}
          {todoMeta?.context && (
            <Badge variant="secondary" className="text-xs">
              {todoMeta.context}
            </Badge>
          )}
          {task.tags && task.tags.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" />
              {task.tags.slice(0, 2).join(', ')}
              {task.tags.length > 2 && '...'}
            </div>
          )}
        </div>
      )
  }
}

// Helper functions
function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `${diffDays} days`
  return date.toLocaleDateString()
}

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'Past event'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays <= 7) return `In ${diffDays} days`
  return date.toLocaleDateString()
}

function getAssignmentTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'exam': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'quiz': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    case 'project': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    case 'homework': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'essay': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

function getPhaseColor(phase: string): string {
  switch (phase.toLowerCase()) {
    case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'design': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    case 'development': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'testing': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    case 'deployment': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    case 'maintenance': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

function getMethodologyIcon(methodology: string) {
  switch (methodology.toLowerCase()) {
    case 'agile':
    case 'scrum': return <GitBranch className="h-3 w-3" />
    case 'kanban': return <Target className="h-3 w-3" />
    default: return <Briefcase className="h-3 w-3" />
  }
}

function getRoleColor(role: string): string {
  switch (role.toLowerCase()) {
    case 'president': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'vice-president': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    case 'secretary': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'treasurer': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'officer': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    case 'committee-chair': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  }
}

function getRoleIcon(role: string) {
  if (['president', 'vice-president', 'secretary', 'treasurer', 'officer', 'committee-chair'].includes(role.toLowerCase())) {
    return <Crown className="h-3 w-3" />
  }
  return <Users className="h-3 w-3" />
}

function getCategoryIcon(category: string): string {
  switch (category.toLowerCase()) {
    case 'work': return '💼'
    case 'personal': return '🏠'
    case 'health': return '🏥'
    case 'shopping': return '🛒'
    case 'errands': return '🏃'
    case 'maintenance': return '🔧'
    case 'learning': return '📚'
    default: return '📝'
  }
}

function getPriorityColor(priority: number): string {
  if (priority >= 8) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  if (priority >= 6) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  if (priority >= 4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
}
