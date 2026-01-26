'use client'

import { Task } from '@/types'

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ClaudeResponse {
  content: Array<{
    type: 'text'
    text: string
  }>
  id: string
  model: string
  role: 'assistant'
  stop_reason: string
  stop_sequence: null
  type: 'message'
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Client-side Claude API wrapper
 * All actual API calls go through the server to protect the API key
 */
class ClaudeClient {
  private configured: boolean | null = null

  /**
   * Check if Claude API is configured on the server
   */
  async isConfigured(): Promise<boolean> {
    if (this.configured !== null) {
      return this.configured
    }

    try {
      const response = await fetch('/api/claude')
      if (response.ok) {
        const data = await response.json()
        this.configured = data.configured
        return data.configured
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Make a request to the Claude API through our server
   */
  private async makeRequest<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(error.error || `Request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.result
  }

  async chat(
    messages: ClaudeMessage[],
    options: {
      max_tokens?: number
      temperature?: number
      system?: string
    } = {}
  ): Promise<ClaudeResponse> {
    return this.makeRequest({
      action: 'chat',
      messages,
      options
    })
  }

  async analyzeProductivity(tasks: Task[]): Promise<string> {
    const taskSummary = tasks.map(task => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      created_at: task.created_at,
      tags: task.tags
    }))

    return this.makeRequest({
      action: 'analyze',
      tasks: taskSummary
    })
  }

  async suggestTaskBreakdown(taskTitle: string, taskDescription?: string): Promise<string[]> {
    return this.makeRequest({
      action: 'breakdown',
      title: taskTitle,
      description: taskDescription
    })
  }

  async generateTaskSuggestions(context: string, existingTasks: Task[] = []): Promise<string[]> {
    return this.makeRequest({
      action: 'suggest',
      context,
      existingTasks: existingTasks.map(t => ({ title: t.title }))
    })
  }

  async optimizeTaskPriorities(tasks: Task[]): Promise<{ [taskId: string]: number }> {
    const taskData = tasks.map(task => ({
      id: task.id,
      title: task.title,
      current_priority: task.priority,
      due_date: task.due_date,
      status: task.status,
      tags: task.tags
    }))

    const systemPrompt = `You are a productivity expert helping optimize task priorities.

    Analyze the provided tasks and suggest priority adjustments (1-10 scale, where 10 is most urgent).

    Consider:
    - Due dates (urgent items should have higher priority)
    - Current status (in-progress tasks might need different priority)
    - Task interdependencies based on titles and context
    - Balance across different types of work

    Return a JSON object with task IDs as keys and recommended priorities as values, only for tasks that should change.`

    try {
      const response = await this.chat([
        { role: 'user', content: `Optimize priorities for these tasks: ${JSON.stringify(taskData, null, 2)}` }
      ], {
        system: systemPrompt,
        max_tokens: 1500
      })

      const content = response.content[0].text.trim()

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/g)
        if (jsonMatch) {
          const priorities = JSON.parse(jsonMatch[0])
          return typeof priorities === 'object' ? priorities : {}
        }
        return {}
      } catch {
        return {}
      }
    } catch (error) {
      console.error('Error optimizing task priorities:', error)
      return {}
    }
  }

  async parseNaturalLanguageTask(text: string, context?: { defaultType?: string }): Promise<Partial<Task> | null> {
    return this.makeRequest({
      action: 'parseTask',
      text,
      context
    })
  }

  async generateTypeSpecificSuggestions(taskType: string, context: string, existingTasks: Task[] = []): Promise<string[]> {
    const existingTaskTitles = existingTasks.filter(t => t.task_type === taskType).map(t => t.title)

    const typePrompts: Record<string, string> = {
      course: `You are an academic advisor. Suggest 3-5 specific academic tasks for: ${context}`,
      project: `You are a project manager. Suggest 3-5 specific project tasks for: ${context}`,
      club: `You are an activities coordinator. Suggest 3-5 specific club activities for: ${context}`,
      todo: `You are a personal productivity assistant. Suggest 3-5 specific personal tasks for: ${context}`
    }

    const systemPrompt = typePrompts[taskType] || typePrompts.todo
    const contextWithExisting = existingTaskTitles.length > 0
      ? `${systemPrompt}\n\nExisting ${taskType} tasks to avoid duplicating: ${existingTaskTitles.join(', ')}`
      : systemPrompt

    try {
      const response = await this.chat([
        { role: 'user', content: contextWithExisting }
      ], {
        system: 'Return a JSON array of 3-5 specific, actionable task titles.',
        max_tokens: 1000
      })

      const content = response.content[0].text.trim()

      try {
        const jsonMatch = content.match(/\[[^\]]*\]/g)
        if (jsonMatch) {
          const suggestions = JSON.parse(jsonMatch[0])
          return Array.isArray(suggestions) ? suggestions : []
        }
        return []
      } catch {
        return []
      }
    } catch (error) {
      console.error('Error generating type-specific suggestions:', error)
      return []
    }
  }

  async analyzeMultiTypeProductivity(tasks: Task[], contexts: Record<string, unknown> = {}): Promise<string> {
    const tasksByType = {
      course: tasks.filter(t => t.task_type === 'course'),
      project: tasks.filter(t => t.task_type === 'project'),
      club: tasks.filter(t => t.task_type === 'club'),
      todo: tasks.filter(t => t.task_type === 'todo')
    }

    const analysis = Object.entries(tasksByType).map(([type, typeTasks]) => ({
      type,
      total: typeTasks.length,
      completed: typeTasks.filter(t => t.status === 'completed').length,
      overdue: typeTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length,
      high_priority: typeTasks.filter(t => t.priority >= 8).length
    }))

    const systemPrompt = `You are a productivity expert analyzing a multi-domain task management system.

    Provide insights on:
    1. Cross-domain workload balance and potential conflicts
    2. Type-specific productivity patterns and recommendations
    3. Priority management across different contexts
    4. Schedule optimization opportunities
    5. Integration strategies for better workflow

    Be specific, constructive, and focus on actionable advice.`

    const userMessage = `Analyze my multi-type productivity:

Task Distribution:
${analysis.map(a => `${a.type.charAt(0).toUpperCase() + a.type.slice(1)}: ${a.total} tasks (${a.completed} completed, ${a.overdue} overdue, ${a.high_priority} high priority)`).join('\n')}

Additional Context:
${JSON.stringify(contexts, null, 2)}`

    const response = await this.chat([
      { role: 'user', content: userMessage }
    ], {
      system: systemPrompt,
      max_tokens: 2000
    })

    return response.content[0].text
  }
}

// Global Claude client instance
let claudeInstance: ClaudeClient | null = null

export function getClaudeClient(): ClaudeClient {
  if (!claudeInstance) {
    claudeInstance = new ClaudeClient()
  }
  return claudeInstance
}

// Hook for React components
export function useClaude() {
  const client = getClaudeClient()

  return {
    client,
    isConfigured: () => client.isConfigured(),
    analyzeProductivity: (tasks: Task[]) => client.analyzeProductivity(tasks),
    analyzeMultiTypeProductivity: (tasks: Task[], contexts?: Record<string, unknown>) => client.analyzeMultiTypeProductivity(tasks, contexts),
    suggestBreakdown: (title: string, description?: string) => client.suggestTaskBreakdown(title, description),
    generateSuggestions: (context: string, existing?: Task[]) => client.generateTaskSuggestions(context, existing),
    generateTypeSpecificSuggestions: (taskType: string, context: string, existing?: Task[]) => client.generateTypeSpecificSuggestions(taskType, context, existing),
    optimizePriorities: (tasks: Task[]) => client.optimizeTaskPriorities(tasks),
    parseTask: (text: string, context?: { defaultType?: string }) => client.parseNaturalLanguageTask(text, context),
  }
}
