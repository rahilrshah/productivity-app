/**
 * Server-side Claude API client
 * This file should ONLY be imported in server-side code (API routes, Server Actions)
 * API key is stored in environment variables, never exposed to client
 */

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

class ClaudeServerClient {
  private apiKey: string | null
  private baseUrl: string
  private model: string

  constructor() {
    // API key from environment only - never from client
    this.apiKey = process.env.CLAUDE_API_KEY || null
    this.baseUrl = 'https://api.anthropic.com/v1'
    this.model = 'claude-3-5-sonnet-20241022'
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0
  }

  private async makeRequest(
    endpoint: string,
    data: Record<string, unknown>
  ): Promise<Response> {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured. Set CLAUDE_API_KEY environment variable.')
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    }

    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    })
  }

  async chat(
    messages: ClaudeMessage[],
    options: {
      max_tokens?: number
      temperature?: number
      system?: string
    } = {}
  ): Promise<ClaudeResponse> {
    const data = {
      model: this.model,
      max_tokens: options.max_tokens || 1024,
      temperature: options.temperature || 0.7,
      messages,
      ...(options.system && { system: options.system }),
    }

    const response = await this.makeRequest('/messages', data)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Claude API error: ${response.status} ${error}`)
    }

    return await response.json()
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

    const systemPrompt = `You are a productivity expert analyzing a user's task management patterns.

    Provide insights on:
    1. Overall productivity patterns
    2. Task prioritization effectiveness
    3. Potential bottlenecks or issues
    4. Actionable recommendations for improvement

    Be specific, constructive, and focus on actionable advice.`

    const userMessage = `Please analyze my productivity based on these tasks: ${JSON.stringify(taskSummary, null, 2)}`

    const response = await this.chat([
      { role: 'user', content: userMessage }
    ], {
      system: systemPrompt,
      max_tokens: 2000
    })

    return response.content[0].text
  }

  async suggestTaskBreakdown(taskTitle: string, taskDescription?: string): Promise<string[]> {
    const systemPrompt = `You are a project management expert. Break down complex tasks into smaller, actionable subtasks.

    Return a JSON array of specific, actionable subtask titles. Each subtask should:
    - Be completable in 1-2 hours
    - Be clearly defined and actionable
    - Build logically toward completing the main task

    Maximum 7 subtasks. If the task is already simple enough, return an empty array.`

    const taskInfo = taskDescription
      ? `Task: "${taskTitle}"\nDescription: ${taskDescription}`
      : `Task: "${taskTitle}"`

    const response = await this.chat([
      { role: 'user', content: `Break down this task: ${taskInfo}` }
    ], {
      system: systemPrompt,
      max_tokens: 1000
    })

    const content = response.content[0].text.trim()

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/g)
      if (jsonMatch) {
        const subtasks = JSON.parse(jsonMatch[0])
        return Array.isArray(subtasks) ? subtasks : []
      }
      return []
    } catch {
      return []
    }
  }

  async generateTaskSuggestions(context: string, existingTasks: Task[] = []): Promise<string[]> {
    const existingTaskTitles = existingTasks.map(t => t.title)

    const systemPrompt = `You are a productivity assistant. Based on the context provided, suggest relevant tasks that would be helpful.

    Return a JSON array of 3-5 specific, actionable task titles. Avoid suggesting tasks that are too similar to existing ones.

    Each task should be:
    - Specific and actionable
    - Relevant to the context
    - Completable within a reasonable timeframe`

    const contextWithExisting = existingTaskTitles.length > 0
      ? `Context: ${context}\n\nExisting tasks to avoid duplicating: ${existingTaskTitles.join(', ')}`
      : `Context: ${context}`

    const response = await this.chat([
      { role: 'user', content: contextWithExisting }
    ], {
      system: systemPrompt,
      max_tokens: 1000
    })

    const content = response.content[0].text.trim()

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/g)
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0])
        return Array.isArray(suggestions) ? suggestions : []
      }
      return []
    } catch {
      return []
    }
  }

  async parseNaturalLanguageTask(text: string, context?: { defaultType?: string }): Promise<Partial<Task> | null> {
    const systemPrompt = `You are a helpful assistant that extracts structured task information from natural language.

    Extract the following information if available:
    - title: A concise, actionable task title
    - content: Detailed description or additional notes
    - priority: Number from 1-10 based on urgency/importance cues
    - due_date: ISO date string if a specific time is mentioned
    - tags: Array of relevant tags based on content
    - duration_minutes: Estimated duration if mentioned
    - task_type: One of 'course', 'project', 'club', 'todo' based on context
    - type_metadata: Type-specific metadata object

    Return valid JSON only. If no clear task can be extracted, return null.`

    const response = await this.chat([
      { role: 'user', content: `Extract task information from: "${text}"` }
    ], {
      system: systemPrompt,
      max_tokens: 1000
    })

    const content = response.content[0].text.trim()

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/g) || content.match(/null/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return parsed
      }

      return {
        title: text.slice(0, 100),
        content: text.length > 100 ? text : undefined,
        priority: 5,
        task_type: (context?.defaultType as Task['task_type']) || 'todo',
        type_metadata: { category: 'general' }
      }
    } catch {
      return {
        title: text.slice(0, 100),
        priority: 5,
        task_type: (context?.defaultType as Task['task_type']) || 'todo',
        type_metadata: { category: 'general' }
      }
    }
  }
}

// Singleton instance
let claudeServerInstance: ClaudeServerClient | null = null

export function getClaudeServerClient(): ClaudeServerClient {
  if (!claudeServerInstance) {
    claudeServerInstance = new ClaudeServerClient()
  }
  return claudeServerInstance
}
