'use client'

import { Task, TodoMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ListTodo, MapPin, Tag, Plus, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TodoWidgetProps {
  tasks: Task[]
  onTaskCreate?: () => void
  onTaskSelect?: (task: Task) => void
}

export function TodoWidget({ tasks, onTaskCreate, onTaskSelect }: TodoWidgetProps) {
  // Filter only todo tasks
  const todoTasks = tasks.filter(task => task.task_type === 'todo' || !task.task_type)
  
  // Group by category
  const categoryGroups = todoTasks.reduce((groups, task) => {
    const metadata = task.type_metadata as TodoMetadata
    const category = metadata?.category || 'General'
    
    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(task)
    return groups
  }, {} as Record<string, Task[]>)

  // Calculate stats
  const totalTasks = todoTasks.length
  const completedToday = todoTasks.filter(t => {
    if (t.status !== 'completed' || !t.completed_at) return false
    const completedDate = new Date(t.completed_at).toDateString()
    const today = new Date().toDateString()
    return completedDate === today
  }).length
  const pendingTasks = todoTasks.filter(t => t.status === 'pending').length

  const getPriorityColor = (priority: number) => {
    if (priority >= 8) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    if (priority >= 6) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
    if (priority >= 4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  }

  const getCategoryIcon = (category: string) => {
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

  // Sort categories by task count
  const sortedCategories = Object.entries(categoryGroups).sort(([,a], [,b]) => b.length - a.length)

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Personal Todos</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onTaskCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Todo
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
            <div className="font-medium text-foreground">{completedToday}</div>
            <div>Done Today</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{pendingTasks}</div>
            <div>Pending</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {sortedCategories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No todos yet</p>
            <p className="text-sm">Add your first todo to get started</p>
          </div>
        ) : (
          sortedCategories.map(([category, categoryTasks]) => {
            const completedInCategory = categoryTasks.filter(t => t.status === 'completed').length
            const progress = categoryTasks.length > 0 ? Math.round((completedInCategory / categoryTasks.length) * 100) : 0
            
            return (
              <div key={category} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getCategoryIcon(category)}</span>
                    <h4 className="font-medium">{category}</h4>
                    <Badge variant="outline" className="text-xs">
                      {categoryTasks.length} tasks
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{progress}%</div>
                  </div>
                </div>
                
                <div className="space-y-1">
                  {/* Show pending tasks first, then completed ones */}
                  {categoryTasks
                    .sort((a, b) => {
                      if (a.status === 'completed' && b.status !== 'completed') return 1
                      if (a.status !== 'completed' && b.status === 'completed') return -1
                      return b.priority - a.priority
                    })
                    .slice(0, 4)
                    .map((task) => {
                      const taskMetadata = task.type_metadata as TodoMetadata
                      
                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50",
                            task.status === 'completed' && "opacity-60"
                          )}
                          onClick={() => onTaskSelect?.(task)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {task.status === 'completed' ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <div className={cn(
                                  "w-3 h-3 rounded-full border-2",
                                  task.status === 'in_progress' ? "bg-blue-500 border-blue-500" :
                                  "border-gray-300 hover:border-blue-500"
                                )} />
                              )}
                              <span className={cn(
                                "font-medium text-sm truncate",
                                task.status === 'completed' && "line-through text-muted-foreground"
                              )}>
                                {task.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {taskMetadata?.location && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {taskMetadata.location}
                                </div>
                              )}
                              {taskMetadata?.context && (
                                <Badge variant="secondary" className="text-xs">
                                  {taskMetadata.context}
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
                          </div>
                          
                          <div className="flex items-center gap-2 ml-2">
                            <Badge 
                              variant="outline" 
                              className={cn("text-xs", getPriorityColor(task.priority))}
                            >
                              P{task.priority}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  
                  {categoryTasks.length > 4 && (
                    <div className="text-center pt-1">
                      <button className="text-xs text-muted-foreground hover:text-foreground">
                        +{categoryTasks.length - 4} more
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