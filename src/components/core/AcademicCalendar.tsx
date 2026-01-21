'use client'

import { useState, useEffect } from 'react'
import { Task, CourseMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useOllama } from '@/lib/ollama'
import { processNaturalLanguage } from '@/lib/agent'
import { 
  Calendar,
  BookOpen,
  Clock,
  AlertCircle,
  Plus,
  Settings,
  GraduationCap,
  CalendarDays,
  Timer,
  Target,
  Bot,
  Sparkles,
  Loader2,
  Send
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AcademicEvent {
  id: string
  title: string
  type: 'class' | 'exam' | 'deadline' | 'break' | 'holiday'
  date: string
  endDate?: string
  time?: string
  course?: string
  location?: string
  description?: string
  priority: number
}

interface Semester {
  id: string
  name: string
  startDate: string
  endDate: string
  type: 'fall' | 'spring' | 'summer' | 'winter'
  year: number
  isActive: boolean
}

interface AcademicCalendarProps {
  tasks: Task[]
  onTaskCreate?: (task: Partial<Task>) => void
  onTasksCreated?: (tasks: Task[]) => void
}

export function AcademicCalendar({ tasks, onTaskCreate, onTasksCreated }: AcademicCalendarProps) {
  const { isAvailable } = useOllama()
  const [currentSemester, setCurrentSemester] = useState<Semester | null>(null)
  const [semesters, setSemesters] = useState<Semester[]>([])
  const [academicEvents, setAcademicEvents] = useState<AcademicEvent[]>([])
  const [selectedWeek, setSelectedWeek] = useState(new Date())
  const [showSetup, setShowSetup] = useState(false)
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'semester'>('week')
  
  // AI Assistant state
  const [aiQuery, setAiQuery] = useState('')
  const [isProcessingAI, setIsProcessingAI] = useState(false)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [showAIAssistant, setShowAIAssistant] = useState(false)
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)

  // Initialize with default semester if none exists
  useEffect(() => {
    const defaultSemester: Semester = {
      id: 'current',
      name: 'Fall 2024',
      startDate: '2024-08-26',
      endDate: '2024-12-13',
      type: 'fall',
      year: 2024,
      isActive: true
    }
    
    setSemesters([defaultSemester])
    setCurrentSemester(defaultSemester)
    
    // Generate sample academic events
    const sampleEvents: AcademicEvent[] = [
      {
        id: '1',
        title: 'Fall Break',
        type: 'break',
        date: '2024-10-14',
        endDate: '2024-10-18',
        description: 'Fall break period - no classes',
        priority: 3
      },
      {
        id: '2',
        title: 'Midterm Exams',
        type: 'exam',
        date: '2024-10-21',
        endDate: '2024-10-25',
        description: 'Midterm examination period',
        priority: 9
      },
      {
        id: '3',
        title: 'Final Exams',
        type: 'exam',
        date: '2024-12-09',
        endDate: '2024-12-13',
        description: 'Final examination period',
        priority: 10
      },
      {
        id: '4',
        title: 'Thanksgiving Break',
        type: 'holiday',
        date: '2024-11-25',
        endDate: '2024-11-29',
        description: 'Thanksgiving holiday break',
        priority: 2
      }
    ]
    
    setAcademicEvents(sampleEvents)
  }, [])

  // Check Ollama availability
  useEffect(() => {
    const checkAvailability = async () => {
      const available = await isAvailable()
      setOllamaAvailable(available)
    }
    checkAvailability()
  }, [isAvailable])

  // AI Assistant functions
  const handleAIQuery = async () => {
    if (!aiQuery.trim() || !ollamaAvailable) return

    setIsProcessingAI(true)
    setAiResponse(null)

    try {
      // Add context about current academic state
      const contextualQuery = `Academic Calendar Context:
- Current Semester: ${currentSemester?.name || 'Not set'}
- Courses: ${Object.keys(courseGroups).join(', ') || 'None'}
- Upcoming Deadlines: ${getUpcomingDeadlines().length}
- Total Course Tasks: ${courseTasks.length}

User Query: ${aiQuery}`

      const result = await processNaturalLanguage(contextualQuery, 'local-user')
      
      if (result.success) {
        setAiResponse(result.actionLog.join('\n'))
        if (result.createdTasks.length > 0 && onTasksCreated) {
          onTasksCreated(result.createdTasks)
        }
        setAiQuery('') // Clear on success
      } else {
        setAiResponse(`Error: ${result.errors.join(', ') || 'Unknown error occurred'}`)
      }
    } catch (error) {
      console.error('AI query error:', error)
      setAiResponse(`Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessingAI(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleAIQuery()
    }
  }

  // Get course tasks from tasks list
  const courseTasks = tasks.filter(task => task.task_type === 'course')
  
  // Group course tasks by course
  const courseGroups = courseTasks.reduce((groups, task) => {
    const metadata = task.type_metadata as CourseMetadata
    const courseKey = metadata.course_code || 'Unknown Course'
    
    if (!groups[courseKey]) {
      groups[courseKey] = []
    }
    groups[courseKey].push(task)
    return groups
  }, {} as Record<string, Task[]>)

  // Get events for current week
  const getWeekEvents = () => {
    const weekStart = new Date(selectedWeek)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Start of week (Sunday)
    
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6) // End of week (Saturday)
    
    return academicEvents.filter(event => {
      const eventDate = new Date(event.date)
      return eventDate >= weekStart && eventDate <= weekEnd
    })
  }

  // Get upcoming deadlines (course tasks with due dates)
  const getUpcomingDeadlines = () => {
    const now = new Date()
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    
    return courseTasks
      .filter(task => 
        task.due_date && 
        new Date(task.due_date) >= now &&
        new Date(task.due_date) <= twoWeeksFromNow &&
        task.status !== 'completed'
      )
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
  }

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedWeek)
    newDate.setDate(selectedWeek.getDate() + (direction === 'next' ? 7 : -7))
    setSelectedWeek(newDate)
  }

  const getEventTypeColor = (type: AcademicEvent['type']) => {
    switch (type) {
      case 'class': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'exam': return 'bg-red-100 text-red-800 border-red-300'
      case 'deadline': return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'break': return 'bg-green-100 text-green-800 border-green-300'
      case 'holiday': return 'bg-purple-100 text-purple-800 border-purple-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getEventTypeIcon = (type: AcademicEvent['type']) => {
    switch (type) {
      case 'class': return <BookOpen className="h-3 w-3" />
      case 'exam': return <Target className="h-3 w-3" />
      case 'deadline': return <AlertCircle className="h-3 w-3" />
      case 'break': return <Timer className="h-3 w-3" />
      case 'holiday': return <GraduationCap className="h-3 w-3" />
      default: return <Calendar className="h-3 w-3" />
    }
  }

  const createTaskFromDeadline = (courseCode: string, assignmentType: string = 'Assignment') => {
    if (!onTaskCreate) return
    
    const newTask: Partial<Task> = {
      title: `${courseCode} ${assignmentType}`,
      task_type: 'course',
      type_metadata: {
        course_code: courseCode,
        assignment_type: assignmentType,
        semester: currentSemester?.name || 'Fall 2024',
        credits: 3
      },
      priority: 7,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Due in 1 week
    }
    
    onTaskCreate(newTask)
  }

  if (showSetup) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Academic Calendar Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Semester Name</Label>
                <Input placeholder="Fall 2024" />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Semester Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select semester type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fall">Fall</SelectItem>
                    <SelectItem value="spring">Spring</SelectItem>
                    <SelectItem value="summer">Summer</SelectItem>
                    <SelectItem value="winter">Winter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <Input type="number" placeholder="2024" />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 pt-4 border-t">
            <Button onClick={() => setShowSetup(false)}>
              Save Setup
            </Button>
            <Button variant="outline" onClick={() => setShowSetup(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold">Academic Calendar</h1>
              <p className="text-sm text-muted-foreground">
                {currentSemester ? currentSemester.name : 'No semester selected'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={showAIAssistant ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowAIAssistant(!showAIAssistant)}
            disabled={ollamaAvailable === false}
            className="flex items-center gap-2"
          >
            <Bot className="h-4 w-4" />
            AI Assistant
          </Button>
          
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
              className="rounded-r-none"
            >
              Week
            </Button>
            <Button
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('month')}
              className="rounded-none border-x"
            >
              Month
            </Button>
            <Button
              variant={viewMode === 'semester' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('semester')}
              className="rounded-l-none"
            >
              Semester
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowSetup(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Setup
          </Button>
        </div>
      </div>

      {/* AI Assistant */}
      {showAIAssistant && (
        <Card className={cn(
          "border-2 shadow-lg",
          ollamaAvailable === false ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" :
          "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20"
        )}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-blue-600" />
              Academic Calendar AI Assistant
              {ollamaAvailable === false && (
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  Unavailable
                </Badge>
              )}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Ask about your courses, deadlines, schedule conflicts, or create tasks naturally
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {ollamaAvailable === false ? (
              <div className="text-amber-800 dark:text-amber-200">
                <p className="font-medium">AI Assistant is unavailable</p>
                <p className="text-sm">Ollama is not running. Please start Ollama to use AI features.</p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Textarea
                    placeholder="e.g., 'When is my next CS101 assignment due?' or 'Schedule study time for Math exam next week' or 'Find conflicts in my schedule'"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={isProcessingAI}
                    className="min-h-[80px] resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Enter to send
                    </span>
                    <Button
                      onClick={handleAIQuery}
                      disabled={isProcessingAI || !aiQuery.trim()}
                      size="sm"
                    >
                      {isProcessingAI ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          Ask AI
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {aiResponse && (
                  <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-800">
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <Bot className="h-4 w-4 text-blue-600" />
                      AI Response
                    </h4>
                    <div className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                      {aiResponse}
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Example queries:</strong></p>
                  <ul className="space-y-1 pl-2">
                    <li>• "What assignments are due this week?"</li>
                    <li>• "Schedule 2 hours of study time for Biology exam"</li>
                    <li>• "When is my next CS101 deadline?"</li>
                    <li>• "Block time for project work next Friday"</li>
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current Week Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Week Navigation & Events */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Week of {selectedWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => navigateWeek('prev')}>
                    ←
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedWeek(new Date())}>
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigateWeek('next')}>
                    →
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {getWeekEvents().length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No academic events this week</p>
                </div>
              ) : (
                getWeekEvents().map(event => (
                  <div key={event.id} className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border",
                    getEventTypeColor(event.type)
                  )}>
                    {getEventTypeIcon(event.type)}
                    <div className="flex-1">
                      <h4 className="font-medium">{event.title}</h4>
                      <p className="text-sm opacity-75">
                        {new Date(event.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                        {event.time && ` at ${event.time}`}
                        {event.location && ` • ${event.location}`}
                      </p>
                      {event.description && (
                        <p className="text-xs opacity-60 mt-1">{event.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {event.type}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Deadlines */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-600" />
                Upcoming Deadlines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {getUpcomingDeadlines().length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-sm">No upcoming deadlines</p>
                </div>
              ) : (
                getUpcomingDeadlines().slice(0, 5).map(task => {
                  const metadata = task.type_metadata as CourseMetadata
                  const daysUntilDue = task.due_date ? 
                    Math.ceil((new Date(task.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0
                  
                  return (
                    <div key={task.id} className="flex items-center justify-between p-2 rounded border">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {metadata.course_code} • {metadata.assignment_type}
                        </p>
                      </div>
                      <Badge 
                        variant={daysUntilDue <= 2 ? 'destructive' : daysUntilDue <= 7 ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {daysUntilDue}d
                      </Badge>
                    </div>
                  )
                })
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => createTaskFromDeadline('CS101', 'Assignment')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Deadline
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Course Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" />
            Course Overview ({Object.keys(courseGroups).length} courses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(courseGroups).map(([courseCode, courseTasks]) => {
              const pendingTasks = courseTasks.filter(t => t.status !== 'completed').length
              const completedTasks = courseTasks.filter(t => t.status === 'completed').length
              const totalTasks = courseTasks.length
              const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
              
              // Get next assignment due date
              const nextDue = courseTasks
                .filter(t => t.due_date && t.status !== 'completed')
                .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0]
              
              return (
                <Card key={courseCode} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold">{courseCode}</h4>
                      <Badge variant="outline">{completionRate}%</Badge>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pending:</span>
                        <span className="font-medium">{pendingTasks}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="font-medium text-green-600">{completedTasks}</span>
                      </div>
                      {nextDue && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Next Due:</span>
                          <span className="font-medium text-orange-600">
                            {new Date(nextDue.due_date!).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full mt-3"
                      onClick={() => createTaskFromDeadline(courseCode)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Assignment
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
            
            {Object.keys(courseGroups).length === 0 && (
              <div className="col-span-full text-center py-8 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No courses found</p>
                <p className="text-sm">Create some course tasks to see them here</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}