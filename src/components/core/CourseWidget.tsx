'use client'

import { Task, CourseMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BookOpen, Calendar, Clock, Plus, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CourseWidgetProps {
  tasks: Task[]
  onTaskCreate?: () => void
  onTaskSelect?: (task: Task) => void
}

export function CourseWidget({ tasks, onTaskCreate, onTaskSelect }: CourseWidgetProps) {
  // Filter only course tasks
  const courseTasks = tasks.filter(task => task.task_type === 'course')
  
  // Group by course
  const courseGroups = courseTasks.reduce((groups, task) => {
    const metadata = task.type_metadata as CourseMetadata
    const courseKey = metadata.course_code || 'Unknown Course'
    
    if (!groups[courseKey]) {
      groups[courseKey] = []
    }
    groups[courseKey].push(task)
    return groups
  }, {} as Record<string, Task[]>)

  // Calculate stats
  const totalTasks = courseTasks.length
  const completedTasks = courseTasks.filter(t => t.status === 'completed').length
  const overdueTasks = courseTasks.filter(t => 
    t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'
  ).length

  const getAssignmentTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'exam': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'quiz': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'project': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'homework': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'essay': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    }
  }

  const formatDueDate = (dateStr?: string) => {
    if (!dateStr) return null
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

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Courses</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {overdueTasks > 0 && (
              <Badge variant="destructive" className="text-xs">
                {overdueTasks} overdue
              </Badge>
            )}
            <Button size="sm" onClick={onTaskCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Assignment
            </Button>
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{totalTasks}</div>
            <div>Total</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{completedTasks}</div>
            <div>Completed</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{Object.keys(courseGroups).length}</div>
            <div>Courses</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {Object.keys(courseGroups).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No course assignments yet</p>
            <p className="text-sm">Add your first assignment to get started</p>
          </div>
        ) : (
          Object.entries(courseGroups).map(([courseCode, courseTasks]) => {
            const firstTask = courseTasks[0]
            const metadata = firstTask.type_metadata as CourseMetadata
            
            return (
              <div key={courseCode} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{courseCode}</h4>
                    {metadata.semester && (
                      <p className="text-sm text-muted-foreground">{metadata.semester}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {courseTasks.length} tasks
                  </Badge>
                </div>
                
                <div className="space-y-1">
                  {courseTasks.slice(0, 3).map((task) => {
                    const taskMetadata = task.type_metadata as CourseMetadata
                    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed'
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50",
                          task.status === 'completed' && "opacity-60",
                          isOverdue && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                        )}
                        onClick={() => onTaskSelect?.(task)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              task.status === 'completed' ? "bg-green-500" :
                              task.status === 'in_progress' ? "bg-blue-500" :
                              "bg-gray-300"
                            )} />
                            <span className={cn(
                              "font-medium text-sm truncate",
                              task.status === 'completed' && "line-through text-muted-foreground"
                            )}>
                              {task.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant="secondary"
                              className={cn("text-xs", getAssignmentTypeColor(taskMetadata.assignment_type))}
                            >
                              {taskMetadata.assignment_type}
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
                        </div>
                        
                        <Badge variant="outline" className="text-xs ml-2">
                          P{task.priority}
                        </Badge>
                      </div>
                    )
                  })}
                  
                  {courseTasks.length > 3 && (
                    <div className="text-center pt-1">
                      <button className="text-xs text-muted-foreground hover:text-foreground">
                        +{courseTasks.length - 3} more
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}