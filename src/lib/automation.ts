'use client'

import { Task } from '@/types'

export type TriggerType = 
  | 'task_created' 
  | 'task_completed' 
  | 'task_overdue' 
  | 'priority_changed'
  | 'status_changed'
  | 'tag_added'
  | 'scheduled_time'
  | 'context_change'

export type ActionType = 
  | 'set_priority' 
  | 'add_tag' 
  | 'remove_tag'
  | 'set_status'
  | 'create_subtask'
  | 'send_notification'
  | 'schedule_reminder'
  | 'move_to_project'
  | 'duplicate_task'

export interface TriggerCondition {
  field?: keyof Task
  operator?: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in'
  value?: any
  timeUnit?: 'minutes' | 'hours' | 'days' | 'weeks'
  timeValue?: number
}

export interface AutomationTrigger {
  id: string
  type: TriggerType
  conditions?: TriggerCondition[]
  description: string
}

export interface AutomationAction {
  id: string
  type: ActionType
  parameters: Record<string, any>
  description: string
  delay?: number // milliseconds
}

export interface AutomationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  triggers: AutomationTrigger[]
  actions: AutomationAction[]
  created_at: string
  updated_at: string
  execution_count: number
  last_executed?: string
}

export interface AutomationExecution {
  id: string
  rule_id: string
  rule_name: string
  triggered_by: string // task id or event id
  executed_at: string
  actions_performed: string[]
  success: boolean
  error?: string
}

class AutomationEngine {
  private rules: AutomationRule[] = []
  private executionHistory: AutomationExecution[] = []
  private listeners: Set<(execution: AutomationExecution) => void> = new Set()

  constructor() {
    this.loadRules()
    this.loadExecutionHistory()
  }

  private loadRules() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation-rules')
      if (saved) {
        try {
          this.rules = JSON.parse(saved)
        } catch (e) {
          console.error('Failed to load automation rules:', e)
        }
      }
    }
  }

  private saveRules() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('automation-rules', JSON.stringify(this.rules))
    }
  }

  private loadExecutionHistory() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('automation-history')
      if (saved) {
        try {
          this.executionHistory = JSON.parse(saved).slice(-100) // Keep last 100 executions
        } catch (e) {
          console.error('Failed to load automation history:', e)
        }
      }
    }
  }

  private saveExecutionHistory() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('automation-history', JSON.stringify(this.executionHistory))
    }
  }

  // Rule Management
  createRule(rule: Omit<AutomationRule, 'id' | 'created_at' | 'updated_at' | 'execution_count'>): AutomationRule {
    const newRule: AutomationRule = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_count: 0,
      ...rule
    }

    this.rules.push(newRule)
    this.saveRules()
    return newRule
  }

  updateRule(id: string, updates: Partial<AutomationRule>): AutomationRule | null {
    const ruleIndex = this.rules.findIndex(r => r.id === id)
    if (ruleIndex === -1) return null

    this.rules[ruleIndex] = {
      ...this.rules[ruleIndex],
      ...updates,
      updated_at: new Date().toISOString()
    }

    this.saveRules()
    return this.rules[ruleIndex]
  }

  deleteRule(id: string): boolean {
    const initialLength = this.rules.length
    this.rules = this.rules.filter(r => r.id !== id)
    
    if (this.rules.length !== initialLength) {
      this.saveRules()
      return true
    }
    return false
  }

  getRules(): AutomationRule[] {
    return [...this.rules]
  }

  getRule(id: string): AutomationRule | null {
    return this.rules.find(r => r.id === id) || null
  }

  // Trigger Processing
  processTaskEvent(
    eventType: TriggerType, 
    task: Task, 
    previousTask?: Task,
    context?: Record<string, any>
  ): AutomationExecution[] {
    const executions: AutomationExecution[] = []
    const eligibleRules = this.rules.filter(rule => 
      rule.enabled && rule.triggers.some(trigger => trigger.type === eventType)
    )

    for (const rule of eligibleRules) {
      const matchingTriggers = rule.triggers.filter(trigger => 
        trigger.type === eventType && this.evaluateTrigger(trigger, task, previousTask, context)
      )

      if (matchingTriggers.length > 0) {
        const execution = this.executeRule(rule, task, matchingTriggers[0])
        if (execution) {
          executions.push(execution)
        }
      }
    }

    return executions
  }

  private evaluateTrigger(
    trigger: AutomationTrigger, 
    task: Task, 
    previousTask?: Task,
    context?: Record<string, any>
  ): boolean {
    if (!trigger.conditions || trigger.conditions.length === 0) {
      return true // No conditions means always match
    }

    return trigger.conditions.every(condition => this.evaluateCondition(condition, task, previousTask, context))
  }

  private evaluateCondition(
    condition: TriggerCondition, 
    task: Task, 
    previousTask?: Task,
    context?: Record<string, any>
  ): boolean {
    if (!condition.field || !condition.operator) return true

    const currentValue = task[condition.field as keyof Task]
    const previousValue = previousTask?.[condition.field as keyof Task]

    switch (condition.operator) {
      case 'equals':
        return currentValue === condition.value

      case 'not_equals':
        return currentValue !== condition.value

      case 'contains':
        if (typeof currentValue === 'string') {
          return currentValue.includes(condition.value as string)
        }
        if (Array.isArray(currentValue)) {
          return (currentValue as any[]).includes(condition.value)
        }
        return false

      case 'greater_than':
        return Number(currentValue) > Number(condition.value)

      case 'less_than':
        return Number(currentValue) < Number(condition.value)

      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(currentValue)

      case 'not_in':
        return Array.isArray(condition.value) && !condition.value.includes(currentValue)

      default:
        return false
    }
  }

  private executeRule(
    rule: AutomationRule, 
    task: Task, 
    trigger: AutomationTrigger
  ): AutomationExecution | null {
    const execution: AutomationExecution = {
      id: crypto.randomUUID(),
      rule_id: rule.id,
      rule_name: rule.name,
      triggered_by: task.id,
      executed_at: new Date().toISOString(),
      actions_performed: [],
      success: true
    }

    try {
      for (const action of rule.actions) {
        const result = this.executeAction(action, task)
        if (result.success) {
          execution.actions_performed.push(result.description)
        } else {
          execution.success = false
          execution.error = result.error
          break
        }

        // Handle action delays
        if (action.delay) {
          setTimeout(() => {
            // In a real implementation, delayed actions would be queued
            console.log(`Delayed action executed: ${action.description}`)
          }, action.delay)
        }
      }

      // Update rule execution count
      this.updateRule(rule.id, {
        execution_count: rule.execution_count + 1,
        last_executed: execution.executed_at
      })

      this.executionHistory.push(execution)
      this.saveExecutionHistory()

      // Notify listeners
      this.listeners.forEach(listener => listener(execution))

      return execution

    } catch (error) {
      execution.success = false
      execution.error = error instanceof Error ? error.message : 'Unknown error'
      
      this.executionHistory.push(execution)
      this.saveExecutionHistory()

      return execution
    }
  }

  private executeAction(action: AutomationAction, task: Task): { success: boolean; description: string; error?: string } {
    try {
      switch (action.type) {
        case 'set_priority':
          // In a real implementation, this would update the task
          return {
            success: true,
            description: `Set priority to ${action.parameters.priority}`
          }

        case 'add_tag':
          return {
            success: true,
            description: `Added tag: ${action.parameters.tag}`
          }

        case 'remove_tag':
          return {
            success: true,
            description: `Removed tag: ${action.parameters.tag}`
          }

        case 'set_status':
          return {
            success: true,
            description: `Changed status to ${action.parameters.status}`
          }

        case 'create_subtask':
          return {
            success: true,
            description: `Created subtask: ${action.parameters.title}`
          }

        case 'send_notification':
          // In a real implementation, this would trigger a notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(action.parameters.title || 'Automation Alert', {
              body: action.parameters.body || `Task "${task.title}" triggered automation`,
              icon: '/icon-192x192.png'
            })
          }
          return {
            success: true,
            description: `Sent notification: ${action.parameters.title}`
          }

        case 'schedule_reminder':
          return {
            success: true,
            description: `Scheduled reminder for ${action.parameters.when}`
          }

        case 'move_to_project':
          return {
            success: true,
            description: `Moved to project: ${action.parameters.project_name}`
          }

        case 'duplicate_task':
          return {
            success: true,
            description: `Created duplicate task`
          }

        default:
          return {
            success: false,
            description: `Unknown action type: ${action.type}`,
            error: `Unknown action type: ${action.type}`
          }
      }
    } catch (error) {
      return {
        success: false,
        description: 'Action execution failed',
        error: error instanceof Error ? error.message : 'Action execution failed'
      }
    }
  }

  // Built-in Rule Templates
  getBuiltInRules(): Partial<AutomationRule>[] {
    return [
      {
        name: 'High Priority Alert',
        description: 'Send notification when a high priority task is created',
        triggers: [{
          id: crypto.randomUUID(),
          type: 'task_created',
          conditions: [{
            field: 'priority',
            operator: 'greater_than',
            value: 8
          }],
          description: 'Task created with priority > 8'
        }],
        actions: [{
          id: crypto.randomUUID(),
          type: 'send_notification',
          parameters: {
            title: 'High Priority Task Created',
            body: 'A high priority task needs your attention'
          },
          description: 'Send high priority notification'
        }]
      },
      {
        name: 'Auto-tag Work Tasks',
        description: 'Automatically tag tasks containing work-related keywords',
        triggers: [{
          id: crypto.randomUUID(),
          type: 'task_created',
          conditions: [{
            field: 'title',
            operator: 'contains',
            value: 'meeting'
          }],
          description: 'Task title contains "meeting"'
        }],
        actions: [{
          id: crypto.randomUUID(),
          type: 'add_tag',
          parameters: {
            tag: 'work'
          },
          description: 'Add work tag'
        }]
      },
      {
        name: 'Overdue Task Escalation',
        description: 'Increase priority of overdue tasks',
        triggers: [{
          id: crypto.randomUUID(),
          type: 'task_overdue',
          description: 'Task becomes overdue'
        }],
        actions: [{
          id: crypto.randomUUID(),
          type: 'set_priority',
          parameters: {
            priority: 9
          },
          description: 'Set priority to urgent'
        }, {
          id: crypto.randomUUID(),
          type: 'add_tag',
          parameters: {
            tag: 'overdue'
          },
          description: 'Add overdue tag'
        }]
      },
      {
        name: 'Completion Celebration',
        description: 'Send congratulations when tasks are completed',
        triggers: [{
          id: crypto.randomUUID(),
          type: 'task_completed',
          description: 'Task is marked as completed'
        }],
        actions: [{
          id: crypto.randomUUID(),
          type: 'send_notification',
          parameters: {
            title: '🎉 Task Completed!',
            body: 'Great job completing that task!'
          },
          description: 'Send completion celebration'
        }]
      }
    ]
  }

  // Event Listeners
  onExecution(callback: (execution: AutomationExecution) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // Execution History
  getExecutionHistory(): AutomationExecution[] {
    return [...this.executionHistory]
  }

  clearExecutionHistory(): void {
    this.executionHistory = []
    this.saveExecutionHistory()
  }

  // Analytics
  getRuleStats(): {
    rule_id: string
    name: string
    execution_count: number
    success_rate: number
    last_executed?: string
  }[] {
    return this.rules.map(rule => {
      const executions = this.executionHistory.filter(e => e.rule_id === rule.id)
      const successful = executions.filter(e => e.success).length
      
      return {
        rule_id: rule.id,
        name: rule.name,
        execution_count: rule.execution_count,
        success_rate: executions.length > 0 ? (successful / executions.length) * 100 : 100,
        last_executed: rule.last_executed
      }
    })
  }
}

// Global automation engine instance
let automationInstance: AutomationEngine | null = null

export function getAutomationEngine(): AutomationEngine {
  if (!automationInstance) {
    automationInstance = new AutomationEngine()
  }
  return automationInstance
}

// Helper function to trigger automation from task operations
export function triggerAutomation(
  eventType: TriggerType,
  task: Task,
  previousTask?: Task,
  context?: Record<string, any>
): void {
  const engine = getAutomationEngine()
  engine.processTaskEvent(eventType, task, previousTask, context)
}