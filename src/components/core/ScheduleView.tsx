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
  const [unscheduledTasks, setUnscheduledTasks] = useState<Task[]>([])
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([])
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [typeAnalysis, setTypeAnalysis] = useState<{ [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }>({})
  const [userPreferences] = useState({
    work_hours_start: '09:00',
    work_hours_end: '17:00',
    break_duration_minutes: 15,
    focus_time_minutes: 90,
    course_preferences: {
      preferred_study_hours: ['09:00', '14:00', '19:00'],
      exam_buffer_days: 3,
      study_session_duration: 120
    },
    project_preferences: {
      deep_work_hours: ['09:00', '10:00', '14:00'],
      meeting_hours: ['13:00', '14:00', '15:00'],
      collaboration_buffer: 30
    },
    club_preferences: {
      meeting_hours: ['18:00', '19:00', '20:00'],
      event_preparation_buffer: 7,
      social_event_timing: ['18:00', '19:00']
    },
    personal_preferences: {
      errand_hours: ['08:00', '12:00', '17:00'],
      health_appointment_hours: ['10:00', '14:00'],
      maintenance_days: ['Saturday', 'Sunday']
    }
  })

  const generateSchedule = () => {
    taskScheduler.clear()
    
    const pendingTasks = tasks.filter(task => 
      task.status === 'pending' || task.status === 'in_progress'
    )
    
    const context = {
      priority: 5,
      user_preferences: {
        work_hours_start: userPreferences.work_hours_start,
        work_hours_end: userPreferences.work_hours_end,
        break_duration_minutes: userPreferences.break_duration_minutes,
        focus_time_minutes: userPreferences.focus_time_minutes
      },
      course_preferences: userPreferences.course_preferences,
      project_preferences: userPreferences.project_preferences,
      club_preferences: userPreferences.club_preferences,
      personal_preferences: userPreferences.personal_preferences
    }
    
    // Use enhanced scheduling with type-specific optimizations
    const scheduleResult = (taskScheduler as any).generateUnifiedSchedule(pendingTasks, context)
    
    setScheduledTasks(scheduleResult.scheduledTasks)
    setUnscheduledTasks(scheduleResult.unscheduledTasks)
    setRecommendations(scheduleResult.recommendations)
    setTypeAnalysis(scheduleResult.typeAnalysis)
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

      {/* Enhanced Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedule Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Schedule Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {scheduledTasks.length}
                </div>
                <div className="text-sm text-muted-foreground">Tasks Scheduled</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {unscheduledTasks.length}
                </div>
                <div className="text-sm text-muted-foreground">Unscheduled</div>
              </div>
              
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {timeBlocks.filter(b => b.type === 'focus').length}
                </div>
                <div className="text-sm text-muted-foreground">Focus Blocks</div>
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

        {/* Type Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Task Type Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(typeAnalysis).map(([type, analysis]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {analysis.scheduled}/{analysis.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-muted rounded-full h-2">
                      <div 
                        className={cn(
                          "h-2 rounded-full transition-all",
                          analysis.efficiency >= 0.8 ? "bg-green-500" :
                          analysis.efficiency >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${analysis.efficiency * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">
                      {Math.round(analysis.efficiency * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-600" />
              Scheduling Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-900">
                  <div className="w-2 h-2 rounded-full bg-orange-500 mt-2 flex-shrink-0" />
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    {recommendation}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unscheduled Tasks */}
      {unscheduledTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-600" />
              Unscheduled Tasks ({unscheduledTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unscheduledTasks.slice(0, 5).map(task => (
                <div key={task.id} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-900">
                  <div>
                    <p className="font-medium text-sm">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.task_type} • Priority {task.priority}
                      {task.due_date && ` • Due ${new Date(task.due_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {task.duration_minutes || 60}min
                  </Badge>
                </div>
              ))}
              {unscheduledTasks.length > 5 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  +{unscheduledTasks.length - 5} more unscheduled tasks
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}