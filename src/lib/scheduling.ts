'use client'

import { Task } from '@/types'

export interface ScheduleContext {
  priority: number
  due_date?: string
  estimated_duration_minutes?: number
  dependencies?: string[]
  user_preferences: {
    work_hours_start: string
    work_hours_end: string
    break_duration_minutes: number
    focus_time_minutes: number
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
  type: 'work' | 'break' | 'focus' | 'buffer'
  task_id?: string
  is_flexible: boolean
}

class TaskScheduler {
  private timeBlocks: TimeBlock[] = []
  
  scheduleTask(task: Task, context: ScheduleContext): ScheduledTask | null {
    const duration = task.duration_minutes || context.estimated_duration_minutes || 60
    const availableSlot = this.findAvailableTimeSlot(duration, context)
    
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
  
  clear() {
    this.timeBlocks = []
  }
}

export const taskScheduler = new TaskScheduler()