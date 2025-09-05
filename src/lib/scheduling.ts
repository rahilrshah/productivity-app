'use client'

import { Task } from '@/types'

export interface ScheduleContext {
  priority: number
  due_date?: string
  estimated_duration_minutes?: number
  dependencies?: string[]
  task_type?: 'course' | 'project' | 'club' | 'todo'
  user_preferences: {
    work_hours_start: string
    work_hours_end: string
    break_duration_minutes: number
    focus_time_minutes: number
  }
  // Multi-context preferences
  course_preferences?: {
    preferred_study_hours: string[]
    exam_buffer_days: number
    study_session_duration: number
  }
  project_preferences?: {
    deep_work_hours: string[]
    meeting_hours: string[]
    collaboration_buffer: number
  }
  club_preferences?: {
    meeting_hours: string[]
    event_preparation_buffer: number
    social_event_timing: string[]
  }
  personal_preferences?: {
    errand_hours: string[]
    health_appointment_hours: string[]
    maintenance_days: string[]
  }
}

export interface ScheduledTask extends Task {
  scheduled_start: string
  scheduled_end: string
  time_block_id: string
}

export interface TimeBlock {
  id: string
  start_time: string
  end_time: string
  type: 'work' | 'break' | 'focus' | 'buffer' | 'study' | 'meeting' | 'event' | 'personal'
  task_id?: string
  task_type?: 'course' | 'project' | 'club' | 'todo'
  is_flexible: boolean
  context_priority?: number
}

class UnifiedTaskScheduler {
  private timeBlocks: TimeBlock[] = []
  
  scheduleTask(task: Task, context: ScheduleContext): ScheduledTask | null {
    const taskType = task.task_type || context.task_type || 'todo'
    const duration = this.getOptimalDuration(task, taskType, context)
    const availableSlot = this.findTypeAwareTimeSlot(duration, taskType, context)
    
    if (!availableSlot) {
      return null
    }
    
    const scheduledTask: ScheduledTask = {
      ...task,
      scheduled_start: availableSlot.start_time,
      scheduled_end: availableSlot.end_time,
      time_block_id: availableSlot.id
    }
    
    this.timeBlocks.push(availableSlot)
    return scheduledTask
  }

  private getOptimalDuration(task: Task, taskType: string, context: ScheduleContext): number {
    // Use task duration if specified
    if (task.duration_minutes) return task.duration_minutes
    if (context.estimated_duration_minutes) return context.estimated_duration_minutes

    // Type-specific default durations
    switch (taskType) {
      case 'course':
        return context.course_preferences?.study_session_duration || 120 // 2 hours
      case 'project':
        return 90 // 1.5 hours for deep work
      case 'club':
        return 60 // 1 hour for meetings/events
      case 'todo':
        return 30 // 30 minutes for general tasks
      default:
        return 60
    }
  }

  private findTypeAwareTimeSlot(durationMinutes: number, taskType: string, context: ScheduleContext): TimeBlock | null {
    const preferredHours = this.getPreferredHoursForType(taskType, context)
    const blockType = this.getBlockTypeForTask(taskType)
    
    // Try preferred hours first
    for (const hour of preferredHours) {
      const slot = this.findSlotInHour(hour, durationMinutes, blockType, context)
      if (slot) {
        slot.task_type = taskType as any
        slot.context_priority = this.calculateContextPriority(taskType, context)
        return slot
      }
    }

    // Fallback to any available slot
    return this.findAvailableTimeSlot(durationMinutes, context)
  }

  private getPreferredHoursForType(taskType: string, context: ScheduleContext): string[] {
    switch (taskType) {
      case 'course':
        return context.course_preferences?.preferred_study_hours || ['09:00', '14:00', '19:00']
      case 'project':
        return context.project_preferences?.deep_work_hours || ['09:00', '10:00', '14:00']
      case 'club':
        return context.club_preferences?.meeting_hours || ['18:00', '19:00', '20:00']
      case 'todo':
        return context.personal_preferences?.errand_hours || ['08:00', '12:00', '17:00']
      default:
        return ['09:00', '14:00']
    }
  }

  private getBlockTypeForTask(taskType: string): TimeBlock['type'] {
    switch (taskType) {
      case 'course': return 'study'
      case 'project': return 'focus'
      case 'club': return 'meeting'
      case 'todo': return 'personal'
      default: return 'work'
    }
  }

  private calculateContextPriority(taskType: string, context: ScheduleContext): number {
    const basePriority = context.priority
    const typeMultiplier = {
      course: 1.2, // Academic tasks get slight priority boost
      project: 1.1, // Work tasks get small boost
      club: 0.9,   // Social tasks get slight reduction
      todo: 1.0    // Personal tasks remain neutral
    }
    
    return basePriority * (typeMultiplier[taskType as keyof typeof typeMultiplier] || 1.0)
  }

  private findSlotInHour(hour: string, durationMinutes: number, blockType: TimeBlock['type'], context: ScheduleContext): TimeBlock | null {
    const [hourNum, minuteNum] = hour.split(':').map(Number)
    const startTime = new Date()
    startTime.setHours(hourNum, minuteNum, 0, 0)
    
    // Check if this hour is in the future
    if (startTime <= new Date()) {
      startTime.setDate(startTime.getDate() + 1) // Try tomorrow
    }
    
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000)
    
    if (!this.hasConflict(startTime, endTime)) {
      return {
        id: crypto.randomUUID(),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        type: blockType,
        is_flexible: false
      }
    }
    
    return null
  }
  
  private findAvailableTimeSlot(durationMinutes: number, context: ScheduleContext): TimeBlock | null {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(parseInt(context.user_preferences.work_hours_start.split(':')[0]))
    startOfDay.setMinutes(parseInt(context.user_preferences.work_hours_start.split(':')[1]))
    
    const endOfDay = new Date(now)
    endOfDay.setHours(parseInt(context.user_preferences.work_hours_end.split(':')[0]))
    endOfDay.setMinutes(parseInt(context.user_preferences.work_hours_end.split(':')[1]))
    
    let currentTime = new Date(Math.max(now.getTime(), startOfDay.getTime()))
    
    while (currentTime < endOfDay) {
      const potentialEnd = new Date(currentTime.getTime() + durationMinutes * 60000)
      
      if (potentialEnd <= endOfDay && !this.hasConflict(currentTime, potentialEnd)) {
        return {
          id: crypto.randomUUID(),
          start_time: currentTime.toISOString(),
          end_time: potentialEnd.toISOString(),
          type: durationMinutes >= context.user_preferences.focus_time_minutes ? 'focus' : 'work',
          is_flexible: false
        }
      }
      
      currentTime = new Date(currentTime.getTime() + 15 * 60000) // 15-minute increments
    }
    
    return null
  }
  
  private hasConflict(startTime: Date, endTime: Date): boolean {
    return this.timeBlocks.some(block => {
      const blockStart = new Date(block.start_time)
      const blockEnd = new Date(block.end_time)
      
      return (startTime < blockEnd && endTime > blockStart)
    })
  }
  
  rescheduleTask(taskId: string, newTime: Date): boolean {
    const existingBlockIndex = this.timeBlocks.findIndex(block => block.task_id === taskId)
    if (existingBlockIndex === -1) return false
    
    const existingBlock = this.timeBlocks[existingBlockIndex]
    const duration = new Date(existingBlock.end_time).getTime() - new Date(existingBlock.start_time).getTime()
    const newEndTime = new Date(newTime.getTime() + duration)
    
    // Temporarily remove the existing block to check for conflicts
    this.timeBlocks.splice(existingBlockIndex, 1)
    
    if (this.hasConflict(newTime, newEndTime)) {
      // Restore the block if there's a conflict
      this.timeBlocks.splice(existingBlockIndex, 0, existingBlock)
      return false
    }
    
    // Update the block with new times
    existingBlock.start_time = newTime.toISOString()
    existingBlock.end_time = newEndTime.toISOString()
    this.timeBlocks.splice(existingBlockIndex, 0, existingBlock)
    
    return true
  }
  
  getScheduleForDay(date: Date): TimeBlock[] {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)
    
    return this.timeBlocks.filter(block => {
      const blockStart = new Date(block.start_time)
      return blockStart >= startOfDay && blockStart <= endOfDay
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }
  
  generateOptimalSchedule(tasks: Task[], context: ScheduleContext): ScheduledTask[] {
    const scheduledTasks: ScheduledTask[] = []
    
    // Sort tasks by priority and due date
    const sortedTasks = tasks.sort((a, b) => {
      if (a.due_date && b.due_date) {
        const dueDiff = new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        if (dueDiff !== 0) return dueDiff
      }
      return b.priority - a.priority
    })
    
    for (const task of sortedTasks) {
      const scheduled = this.scheduleTask(task, context)
      if (scheduled) {
        scheduledTasks.push(scheduled)
      }
    }
    
    return scheduledTasks
  }

  generateUnifiedSchedule(tasks: Task[], context: ScheduleContext): {
    scheduledTasks: ScheduledTask[]
    unscheduledTasks: Task[]
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
    recommendations: string[]
  } {
    const scheduledTasks: ScheduledTask[] = []
    const unscheduledTasks: Task[] = []
    const recommendations: string[] = []
    
    // Group tasks by type for better distribution
    const tasksByType = {
      course: tasks.filter(t => t.task_type === 'course'),
      project: tasks.filter(t => t.task_type === 'project'),
      club: tasks.filter(t => t.task_type === 'club'),
      todo: tasks.filter(t => t.task_type === 'todo' || !t.task_type)
    }

    // Calculate workload for each type (duration * priority)
    const calculateWorkload = (tasks: Task[]) => 
      tasks.reduce((total, task) => total + (task.duration_minutes || 60) * task.priority, 0)

    // Enhanced type analysis with efficiency metrics
    const typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } } = {}
    
    Object.entries(tasksByType).forEach(([type, typeTasks]) => {
      typeAnalysis[type] = {
        scheduled: 0,
        total: typeTasks.length,
        workload: calculateWorkload(typeTasks),
        efficiency: 0
      }
      
      // Enhanced sorting with type-specific algorithms
      this.applyTypeSpecificSorting(typeTasks, type, context)
    })

    // Apply advanced scheduling strategies
    this.applyTypeSpecificScheduling(tasksByType, context, scheduledTasks, unscheduledTasks, typeAnalysis)

    // Calculate efficiency metrics and generate recommendations
    this.generateSchedulingRecommendations(typeAnalysis, recommendations, context)

    return {
      scheduledTasks,
      unscheduledTasks,
      typeAnalysis,
      recommendations
    }
  }

  private applyTypeSpecificSorting(tasks: Task[], type: string, context: ScheduleContext) {
    switch (type) {
      case 'course':
        // Course tasks: prioritize by due date proximity and exam buffer
        tasks.sort((a, b) => {
          const examBuffer = context.course_preferences?.exam_buffer_days || 3
          const aDueDays = a.due_date ? Math.ceil((new Date(a.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : Infinity
          const bDueDays = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : Infinity
          
          // Urgent if due within buffer days
          const aUrgent = aDueDays <= examBuffer
          const bUrgent = bDueDays <= examBuffer
          
          if (aUrgent && !bUrgent) return -1
          if (!aUrgent && bUrgent) return 1
          if (aUrgent && bUrgent) return aDueDays - bDueDays
          
          // Non-urgent tasks sorted by priority then due date
          if (a.priority !== b.priority) return b.priority - a.priority
          return aDueDays - bDueDays
        })
        break

      case 'project':
        // Project tasks: balance deep work requirements with dependencies
        tasks.sort((a, b) => {
          // Check for dependencies - prerequisite tasks should be scheduled first
          if (a.dependencies?.includes(b.id)) return 1
          if (b.dependencies?.includes(a.id)) return -1
          
          // Group complex tasks together for deep work sessions
          const aComplex = (a.duration_minutes || 60) >= 120
          const bComplex = (b.duration_minutes || 60) >= 120
          
          if (aComplex && !bComplex) return -1
          if (!aComplex && bComplex) return 1
          
          // Standard priority and due date sorting
          if (a.priority !== b.priority) return b.priority - a.priority
          if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
          return 0
        })
        break

      case 'club':
        // Club tasks: optimize around meeting times and event preparation
        tasks.sort((a, b) => {
          const eventBuffer = context.club_preferences?.event_preparation_buffer || 7
          const aDueDays = a.due_date ? Math.ceil((new Date(a.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : Infinity
          const bDueDays = b.due_date ? Math.ceil((new Date(b.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : Infinity
          
          // Prioritize event preparation tasks
          const aEventPrep = aDueDays <= eventBuffer
          const bEventPrep = bDueDays <= eventBuffer
          
          if (aEventPrep && !bEventPrep) return -1
          if (!aEventPrep && bEventPrep) return 1
          
          return b.priority - a.priority
        })
        break

      case 'todo':
        // Todo tasks: batch similar tasks and optimize for context switching
        tasks.sort((a, b) => {
          // Group by location if specified
          const aLocation = (a.type_metadata as any)?.location
          const bLocation = (b.type_metadata as any)?.location
          if (aLocation && bLocation && aLocation === bLocation) {
            return a.priority - b.priority // Same location, sort by priority
          }
          
          // Group by category if specified
          const aCategory = (a.type_metadata as any)?.category
          const bCategory = (b.type_metadata as any)?.category
          if (aCategory && bCategory && aCategory === bCategory) {
            return b.priority - a.priority
          }
          
          return b.priority - a.priority
        })
        break
    }
  }

  private applyTypeSpecificScheduling(
    tasksByType: { [key: string]: Task[] },
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    unscheduledTasks: Task[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Phase 1: Schedule high-priority and time-sensitive tasks first
    this.scheduleUrgentTasks(tasksByType, context, scheduledTasks, unscheduledTasks, typeAnalysis)
    
    // Phase 2: Apply type-specific batching and optimization
    this.scheduleBatchedTasks(tasksByType, context, scheduledTasks, unscheduledTasks, typeAnalysis)
    
    // Phase 3: Fill remaining slots with flexible tasks
    this.scheduleRemainingTasks(tasksByType, context, scheduledTasks, unscheduledTasks, typeAnalysis)
  }

  private scheduleUrgentTasks(
    tasksByType: { [key: string]: Task[] },
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    unscheduledTasks: Task[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    const now = new Date()
    const urgentThreshold = 2 * 24 * 60 * 60 * 1000 // 2 days

    Object.entries(tasksByType).forEach(([type, tasks]) => {
      const urgentTasks = tasks.filter(task => {
        if (!task.due_date) return false
        const timeUntilDue = new Date(task.due_date).getTime() - now.getTime()
        return timeUntilDue <= urgentThreshold && timeUntilDue > 0
      })

      urgentTasks.forEach(task => {
        const scheduled = this.scheduleTask(task, { ...context, task_type: type as any })
        if (scheduled) {
          scheduledTasks.push(scheduled)
          typeAnalysis[type].scheduled++
          // Remove from original array
          const index = tasks.indexOf(task)
          if (index > -1) tasks.splice(index, 1)
        }
      })
    })
  }

  private scheduleBatchedTasks(
    tasksByType: { [key: string]: Task[] },
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    unscheduledTasks: Task[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Course tasks: batch study sessions for the same course
    this.batchCourseTasks(tasksByType.course, context, scheduledTasks, typeAnalysis)
    
    // Project tasks: create focused work blocks
    this.batchProjectTasks(tasksByType.project, context, scheduledTasks, typeAnalysis)
    
    // Todo tasks: batch by location and context
    this.batchTodoTasks(tasksByType.todo, context, scheduledTasks, typeAnalysis)
    
    // Club tasks: optimize around meeting schedules
    this.scheduleClubTasks(tasksByType.club, context, scheduledTasks, typeAnalysis)
  }

  private batchCourseTasks(
    courseTasks: Task[],
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Group by course code for batching
    const byCourse = courseTasks.reduce((acc, task) => {
      const courseCode = (task.type_metadata as any)?.course_code || 'unknown'
      if (!acc[courseCode]) acc[courseCode] = []
      acc[courseCode].push(task)
      return acc
    }, {} as { [course: string]: Task[] })

    Object.entries(byCourse).forEach(([courseCode, tasks]) => {
      // Try to schedule related tasks in the same study session
      for (let i = 0; i < tasks.length; i += 2) { // Batch in groups of 2
        const batchTasks = tasks.slice(i, i + 2)
        const totalDuration = batchTasks.reduce((sum, task) => sum + (task.duration_minutes || 60), 0)
        
        if (totalDuration <= (context.course_preferences?.study_session_duration || 120)) {
          // Schedule as a batched session
          batchTasks.forEach(task => {
            const scheduled = this.scheduleTask(task, { ...context, task_type: 'course' })
            if (scheduled) {
              scheduledTasks.push(scheduled)
              typeAnalysis.course.scheduled++
            }
          })
        }
      }
    })
  }

  private batchProjectTasks(
    projectTasks: Task[],
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Group by project milestone or create deep work blocks
    const deepWorkTasks = projectTasks.filter(task => (task.duration_minutes || 60) >= 90)
    const quickTasks = projectTasks.filter(task => (task.duration_minutes || 60) < 90)

    // Schedule deep work tasks in focused morning slots
    deepWorkTasks.forEach(task => {
      const scheduled = this.scheduleTask(task, {
        ...context,
        task_type: 'project',
        project_preferences: {
          deep_work_hours: ['09:00', '10:00', '14:00'],
          meeting_hours: context.project_preferences?.meeting_hours || ['13:00', '14:00'],
          collaboration_buffer: context.project_preferences?.collaboration_buffer || 30
        }
      })
      if (scheduled) {
        scheduledTasks.push(scheduled)
        typeAnalysis.project.scheduled++
      }
    })

    // Batch quick tasks together
    quickTasks.forEach(task => {
      const scheduled = this.scheduleTask(task, { ...context, task_type: 'project' })
      if (scheduled) {
        scheduledTasks.push(scheduled)
        typeAnalysis.project.scheduled++
      }
    })
  }

  private batchTodoTasks(
    todoTasks: Task[],
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Group by location to minimize travel
    const byLocation = todoTasks.reduce((acc, task) => {
      const location = (task.type_metadata as any)?.location || 'home'
      if (!acc[location]) acc[location] = []
      acc[location].push(task)
      return acc
    }, {} as { [location: string]: Task[] })

    Object.entries(byLocation).forEach(([location, tasks]) => {
      // Schedule location-based tasks together
      tasks.forEach(task => {
        const scheduled = this.scheduleTask(task, { ...context, task_type: 'todo' })
        if (scheduled) {
          scheduledTasks.push(scheduled)
          typeAnalysis.todo.scheduled++
        }
      })
    })
  }

  private scheduleClubTasks(
    clubTasks: Task[],
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Schedule club tasks around preferred meeting times
    clubTasks.forEach(task => {
      const scheduled = this.scheduleTask(task, { ...context, task_type: 'club' })
      if (scheduled) {
        scheduledTasks.push(scheduled)
        typeAnalysis.club.scheduled++
      }
    })
  }

  private scheduleRemainingTasks(
    tasksByType: { [key: string]: Task[] },
    context: ScheduleContext,
    scheduledTasks: ScheduledTask[],
    unscheduledTasks: Task[],
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } }
  ) {
    // Schedule any remaining tasks using round-robin approach for balance
    const allRemaining = Object.entries(tasksByType).flatMap(([type, tasks]) => 
      tasks.map(task => ({ task, type }))
    )

    allRemaining.forEach(({ task, type }) => {
      const scheduled = this.scheduleTask(task, { ...context, task_type: type as any })
      if (scheduled) {
        scheduledTasks.push(scheduled)
        typeAnalysis[type].scheduled++
      } else {
        unscheduledTasks.push(task)
      }
    })

    // Calculate efficiency metrics
    Object.keys(typeAnalysis).forEach(type => {
      const analysis = typeAnalysis[type]
      analysis.efficiency = analysis.total > 0 ? analysis.scheduled / analysis.total : 0
    })
  }

  private generateSchedulingRecommendations(
    typeAnalysis: { [type: string]: { scheduled: number; total: number; workload: number; efficiency: number } },
    recommendations: string[],
    context: ScheduleContext
  ) {
    Object.entries(typeAnalysis).forEach(([type, analysis]) => {
      if (analysis.efficiency < 0.8 && analysis.total > 0) {
        switch (type) {
          case 'course':
            recommendations.push(`Consider extending study sessions or adding more study time slots for better course task scheduling (${Math.round(analysis.efficiency * 100)}% scheduled)`)
            break
          case 'project':
            recommendations.push(`Project tasks need more focus time - consider blocking larger time slots for deep work (${Math.round(analysis.efficiency * 100)}% scheduled)`)
            break
          case 'club':
            recommendations.push(`Club activities might conflict with other commitments - review meeting times (${Math.round(analysis.efficiency * 100)}% scheduled)`)
            break
          case 'todo':
            recommendations.push(`Personal tasks are overflowing - consider batching errands by location (${Math.round(analysis.efficiency * 100)}% scheduled)`)
            break
        }
      }
    })

    // Workload balance recommendations
    const totalWorkload = Object.values(typeAnalysis).reduce((sum, analysis) => sum + analysis.workload, 0)
    const workloadByType = Object.entries(typeAnalysis).map(([type, analysis]) => ({
      type,
      percentage: totalWorkload > 0 ? (analysis.workload / totalWorkload) * 100 : 0
    }))

    const highWorkload = workloadByType.filter(item => item.percentage > 40)
    if (highWorkload.length > 0) {
      recommendations.push(`Heavy workload detected in ${highWorkload.map(item => item.type).join(', ')} - consider redistributing tasks across more days`)
    }
  }
  
  clear() {
    this.timeBlocks = []
  }
}

export const unifiedTaskScheduler = new UnifiedTaskScheduler()
// Keep old export for backward compatibility
export const taskScheduler = unifiedTaskScheduler