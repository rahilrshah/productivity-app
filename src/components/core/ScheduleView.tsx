'use client'

import { useState, useEffect } from 'react'
import { Task } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { taskScheduler, ScheduledTask, TimeBlock } from '@/lib/scheduling'
import { cn } from '@/lib/utils'
import { 
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Settings,
  RefreshCw
} from 'lucide-react'

interface ScheduleViewProps {
  tasks: Task[]
  onTaskUpdate: (id: string, updates: Partial<Task>) => void
}

export function ScheduleView({ tasks }: ScheduleViewProps) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [userPreferences] = useState({
    work_hours_start: '09:00',
    work_hours_end: '17:00',
    break_duration_minutes: 15,
    focus_time_minutes: 90
  })

  const generateSchedule = () => {
    taskScheduler.clear()
    
    const pendingTasks = tasks.filter(task => 
      task.status === 'pending' || task.status === 'in_progress'
    )
    
    const context = {
      priority: 5,
      user_preferences: userPreferences
    }
    
    const scheduled = taskScheduler.generateOptimalSchedule(pendingTasks, context)
    setScheduledTasks(scheduled)
    setTimeBlocks(taskScheduler.getScheduleForDay(selectedDate))
  }

  useEffect(() => {
    generateSchedule()
  }, [tasks, selectedDate])

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(selectedDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  const getTaskForTimeBlock = (block: TimeBlock): ScheduledTask | undefined => {
    return scheduledTasks.find(task => task.time_block_id === block.id)
  }

  const formatTime = (isoString: string): string => {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const getBlockColor = (type: TimeBlock['type']): string => {
    switch (type) {
      case 'focus': return 'bg-blue-100 border-blue-300 dark:bg-blue-900 dark:border-blue-700'
      case 'work': return 'bg-green-100 border-green-300 dark:bg-green-900 dark:border-green-700'
      case 'break': return 'bg-yellow-100 border-yellow-300 dark:bg-yellow-900 dark:border-yellow-700'
      case 'buffer': return 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600'
      default: return 'bg-gray-50 border-gray-200 dark:bg-gray-900 dark:border-gray-700'
    }
  }

  const getPriorityColor = (priority: number): string => {
    if (priority <= 3) return 'bg-gray-100 text-gray-800'
    if (priority <= 7) return 'bg-blue-100 text-blue-800'
    return 'bg-red-100 text-red-800'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateDate('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {selectedDate.toLocaleDateString('en-US', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h2>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateDate('next')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={generateSchedule}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Regenerate
          </Button>
          
          <Button
            variant="outline"
            size="sm"
          >
            <Settings className="h-4 w-4 mr-2" />
            Preferences
          </Button>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="grid gap-4">
        {timeBlocks.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No tasks scheduled for this day</p>
                <p className="text-sm">Add some tasks to see your optimized schedule</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          timeBlocks.map((block) => {
            const task = getTaskForTimeBlock(block)
            
            return (
              <Card 
                key={block.id}
                className={cn(
                  'transition-all duration-200 hover:shadow-md',
                  getBlockColor(block.type)
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatTime(block.start_time)} - {formatTime(block.end_time)}</span>
                        </div>
                        
                        <Badge variant="outline" className="text-xs capitalize">
                          {block.type}
                        </Badge>
                      </div>
                      
                      {task ? (
                        <div>
                          <h3 className="font-medium text-sm leading-5 mb-1">
                            {task.title}
                          </h3>
                          
                          {task.content && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {typeof task.content === 'string' ? task.content : 'Rich content'}
                            </p>
                          )}
                          
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge 
                              variant="secondary" 
                              className={cn('text-xs', getPriorityColor(task.priority))}
                            >
                              Priority {task.priority}
                            </Badge>
                            
                            {task.tags.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <p className="text-sm">
                            {block.type === 'break' ? 'Break time' : 'Available time block'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Schedule Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {scheduledTasks.length}
              </div>
              <div className="text-sm text-muted-foreground">Tasks Scheduled</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-green-600">
                {timeBlocks.filter(b => b.type === 'focus').length}
              </div>
              <div className="text-sm text-muted-foreground">Focus Blocks</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {Math.round(
                  scheduledTasks.reduce((total, task) => {
                    const duration = new Date(task.scheduled_end).getTime() - 
                                   new Date(task.scheduled_start).getTime()
                    return total + (duration / (1000 * 60))
                  }, 0)
                )}
              </div>
              <div className="text-sm text-muted-foreground">Total Minutes</div>
            </div>
            
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(
                  scheduledTasks.reduce((total, task) => total + task.priority, 0) / 
                  (scheduledTasks.length || 1)
                )}
              </div>
              <div className="text-sm text-muted-foreground">Avg Priority</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}