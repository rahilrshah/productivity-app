'use client'

import { Task, ClubMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Users, Calendar, Crown, Plus, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClubWidgetProps {
  tasks: Task[]
  onTaskCreate?: () => void
  onTaskSelect?: (task: Task) => void
}

export function ClubWidget({ tasks, onTaskCreate, onTaskSelect }: ClubWidgetProps) {
  // Filter only club tasks
  const clubTasks = tasks.filter(task => task.task_type === 'club')
  
  // Group by club
  const clubGroups = clubTasks.reduce((groups, task) => {
    const metadata = task.type_metadata as ClubMetadata
    const clubKey = metadata.club_name || 'General Activities'
    
    if (!groups[clubKey]) {
      groups[clubKey] = []
    }
    groups[clubKey].push(task)
    return groups
  }, {} as Record<string, Task[]>)

  // Calculate stats
  const totalTasks = clubTasks.length
  const upcomingEvents = clubTasks.filter(t => 
    t.due_date && new Date(t.due_date) > new Date() && t.status !== 'completed'
  ).length
  const leadershipTasks = clubTasks.filter(t => {
    const metadata = t.type_metadata as ClubMetadata
    return metadata.leadership_position === true
  }).length

  const getRoleColor = (role: string) => {
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

  const getRoleIcon = (role: string) => {
    if (['president', 'vice-president', 'secretary', 'treasurer', 'officer', 'committee-chair'].includes(role.toLowerCase())) {
      return <Crown className="h-3 w-3" />
    }
    return <Users className="h-3 w-3" />
  }

  const formatEventDate = (dateStr?: string) => {
    if (!dateStr) return null
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

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Clubs & Activities</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onTaskCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Activity
            </Button>
          </div>
        </div>
        
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground">{totalTasks}</div>
            <div>Activities</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{upcomingEvents}</div>
            <div>Upcoming</div>
          </div>
          <div>
            <div className="font-medium text-foreground">{Object.keys(clubGroups).length}</div>
            <div>Clubs</div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 max-h-96 overflow-y-auto">
        {Object.keys(clubGroups).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No club activities yet</p>
            <p className="text-sm">Add your first club activity to get started</p>
          </div>
        ) : (
          Object.entries(clubGroups).map(([clubName, clubTasks]) => {
            const firstTask = clubTasks[0]
            const metadata = firstTask.type_metadata as ClubMetadata
            
            return (
              <div key={clubName} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{clubName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant="outline"
                        className={cn("text-xs flex items-center gap-1", getRoleColor(metadata.role))}
                      >
                        {getRoleIcon(metadata.role)}
                        {metadata.role}
                      </Badge>
                      {leadershipTasks > 0 && clubTasks.some(t => (t.type_metadata as ClubMetadata).leadership_position) && (
                        <Badge variant="secondary" className="text-xs">
                          Leadership
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {clubTasks.length} tasks
                  </Badge>
                </div>
                
                <div className="space-y-1">
                  {clubTasks.slice(0, 3).map((task) => {
                    const taskMetadata = task.type_metadata as ClubMetadata
                    const isUpcoming = task.due_date && new Date(task.due_date) > new Date() && task.status !== 'completed'
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50",
                          task.status === 'completed' && "opacity-60",
                          isUpcoming && "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
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
                            {taskMetadata.event_type && (
                              <Badge variant="secondary" className="text-xs">
                                {taskMetadata.event_type}
                              </Badge>
                            )}
                            {task.due_date && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {formatEventDate(task.due_date)}
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
                  
                  {clubTasks.length > 3 && (
                    <div className="text-center pt-1">
                      <button className="text-xs text-muted-foreground hover:text-foreground">
                        +{clubTasks.length - 3} more
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