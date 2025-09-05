'use client'

import { Task, ProjectMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Briefcase, Users, GitBranch, Plus, Target } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectWidgetProps {
  tasks: Task[]
  onTaskCreate?: () => void
  onTaskSelect?: (task: Task) => void
}

export function ProjectWidget({ tasks, onTaskCreate, onTaskSelect }: ProjectWidgetProps) {
  // Filter only project tasks
  const projectTasks = tasks.filter(task => task.task_type === 'project')
  
  // Group by project (using title for project name or metadata)
  const projectGroups = projectTasks.reduce((groups, task) => {
    const metadata = task.type_metadata as ProjectMetadata
    // Use the task's parent project name or fall back to a generic group
    const projectKey = task.parent_id ? 'Project Tasks' : metadata.milestone || task.title.split(' ')[0] || 'General'
    
    if (!groups[projectKey]) {
      groups[projectKey] = []
    }
    groups[projectKey].push(task)
    return groups
  }, {} as Record<string, Task[]>)

  // Calculate stats
  const totalTasks = projectTasks.length
  const completedTasks = projectTasks.filter(t => t.status === 'completed').length
  const inProgressTasks = projectTasks.filter(t => t.status === 'in_progress').length

  const getPhaseColor = (phase: string) => {
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

  const getMethodologyIcon = (methodology: string) => {
    switch (methodology.toLowerCase()) {
      case 'agile':
      case 'scrum': return <GitBranch className="h-3 w-3" />
      case 'kanban': return <Target className="h-3 w-3" />
      default: return <Briefcase className="h-3 w-3" />
    }
  }

  const calculateProgress = (tasks: Task[]) => {
    if (tasks.length === 0) return 0
    const completed = tasks.filter(t => t.status === 'completed').length
    return Math.round((completed / tasks.length) * 100)
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-orange-600" />
            <CardTitle className="text-lg">Projects</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onTaskCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{totalTasks}</div>
            <div>Total Tasks</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{inProgressTasks}</div>
            <div>In Progress</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{Object.keys(projectGroups).length}</div>
            <div>Projects</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {Object.keys(projectGroups).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No project tasks yet</p>
            <p className="text-sm">Create your first project task to get started</p>
          </div>
        ) : (
          Object.entries(projectGroups).map(([projectName, projectTasks]) => {
            const progress = calculateProgress(projectTasks)
            const firstTask = projectTasks[0]
            const metadata = firstTask.type_metadata as ProjectMetadata
            
            return (
              <div key={projectName} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{projectName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", getPhaseColor(metadata.phase))}
                      >
                        {getMethodologyIcon(metadata.methodology)}
                        {metadata.phase}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {metadata.methodology}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{progress}%</div>
                    <div className="text-xs text-muted-foreground">Complete</div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <Progress value={progress} className="h-2" />
                
                {/* Recent Tasks */}
                <div className="space-y-1">
                  {projectTasks.slice(0, 3).map((task) => {
                    const taskMetadata = task.type_metadata as ProjectMetadata
                    
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
                            {taskMetadata.milestone && (
                              <Badge variant="outline" className="text-xs">
                                {taskMetadata.milestone}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {taskMetadata.project_type}
                            </Badge>
                          </div>
                        </div>
                        
                        <Badge variant="outline" className="text-xs ml-2">
                          P{task.priority}
                        </Badge>
                      </div>
                    )
                  })}
                  
                  {projectTasks.length > 3 && (
                    <div className="text-center pt-1">
                      <button className="text-xs text-muted-foreground hover:text-foreground">
                        +{projectTasks.length - 3} more
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