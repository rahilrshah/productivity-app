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

export interface ClaudeStreamResponse {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop'
  message?: Partial<ClaudeResponse>
  content_block?: {
    type: 'text'
    text: string
  }
  delta?: {
    type: 'text_delta'
    text: string
  }
}

class ClaudeClient {
  private apiKey: string | null
  private baseUrl: string
  private model: string

  constructor() {
    this.apiKey = typeof window !== 'undefined' 
      ? localStorage.getItem('claude-api-key') 
      : process.env.CLAUDE_API_KEY || null
    this.baseUrl = 'https://api.anthropic.com/v1'
    this.model = 'claude-3-5-sonnet-20241022'
  }

  setApiKey(key: string) {
    this.apiKey = key
    if (typeof window !== 'undefined') {
      localStorage.setItem('claude-api-key', key)
    }
  }

  getApiKey(): string | null {
    return this.apiKey
  }

  clearApiKey() {
    this.apiKey = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem('claude-api-key')
    }
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0
  }

  private async makeRequest(
    endpoint: string, 
    data: any, 
    stream: boolean = false
  ): Promise<Response> {
    if (!this.apiKey) {
      throw new Error('Claude API key not configured')
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
      stream?: boolean
      max_tokens?: number
      temperature?: number
      system?: string
    } = {}
  ): Promise<ClaudeResponse | ReadableStream<ClaudeStreamResponse>> {
    const data = {
      model: this.model,
      max_tokens: options.max_tokens || 1024,
      temperature: options.temperature || 0.7,
      messages,
      ...(options.system && { system: options.system }),
      ...(options.stream && { stream: true })
    }

    try {
      const response = await this.makeRequest('/messages', data, options.stream)

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Claude API error: ${response.status} ${error}`)
      }

      if (options.stream && response.body) {
        return response.body.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            const decoder = new TextDecoder()
            const text = decoder.decode(chunk)
            const lines = text.split('\n').filter(line => line.trim())
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  controller.enqueue(data)
                } catch (e) {
                  // Skip invalid JSON lines
                }
              }
            }
          }
        }))
      }

      return await response.json()
    } catch (error) {
      console.error('Claude API error:', error)
      throw error
    }
  }

  // Task-specific helper methods
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

    try {
      const response = await this.chat([
        { role: 'user', content: userMessage }
      ], { 
        system: systemPrompt,
        max_tokens: 2000 
      }) as ClaudeResponse

      return response.content[0].text
    } catch (error) {
      throw new Error(`Failed to analyze productivity: ${error}`)
    }
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

    try {
      const response = await this.chat([
        { role: 'user', content: `Break down this task: ${taskInfo}` }
      ], { 
        system: systemPrompt,
        max_tokens: 1000 
      }) as ClaudeResponse

      const content = response.content[0].text.trim()
      
      try {
        // Extract JSON array from the response
        const jsonMatch = content.match(/\[[\s\S]*\]/g)
        if (jsonMatch) {
          const subtasks = JSON.parse(jsonMatch[0])
          return Array.isArray(subtasks) ? subtasks : []
        }
        return []
      } catch (e) {
        console.error('Failed to parse subtasks JSON:', e)
        return []
      }
    } catch (error) {
      console.error('Error suggesting task breakdown:', error)
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

    try {
      const response = await this.chat([
        { role: 'user', content: contextWithExisting }
      ], { 
        system: systemPrompt,
        max_tokens: 1000 
      }) as ClaudeResponse

      const content = response.content[0].text.trim()
      
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/g)
        if (jsonMatch) {
          const suggestions = JSON.parse(jsonMatch[0])
          return Array.isArray(suggestions) ? suggestions : []
        }
        return []
      } catch (e) {
        return []
      }
    } catch (error) {
      console.error('Error generating task suggestions:', error)
      return []
    }
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
      }) as ClaudeResponse

      const content = response.content[0].text.trim()
      
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/g)
        if (jsonMatch) {
          const priorities = JSON.parse(jsonMatch[0])
          return typeof priorities === 'object' ? priorities : {}
        }
        return {}
      } catch (e) {
        return {}
      }
    } catch (error) {
      console.error('Error optimizing task priorities:', error)
      return {}
    }
  }

  async parseNaturalLanguageTask(text: string, context?: { defaultType?: string }): Promise<Partial<Task> | null> {
    const systemPrompt = `You are a helpful assistant that extracts structured task information from natural language, with support for different task types.
    
    Extract the following information if available:
    - title: A concise, actionable task title
    - content: Detailed description or additional notes
    - priority: Number from 1-10 based on urgency/importance cues
    - due_date: ISO date string if a specific time is mentioned
    - tags: Array of relevant tags based on content
    - duration_minutes: Estimated duration if mentioned
    - task_type: One of 'course', 'project', 'club', 'todo' based on context
    - type_metadata: Type-specific metadata object
    
    Task Type Detection:
    - 'course': Academic assignments, homework, exams, readings, study sessions
    - 'project': Work projects, personal projects, development tasks, deliverables
    - 'club': Meetings, events, club activities, volunteer work, social events
    - 'todo': General personal tasks, errands, health appointments, maintenance
    
    Type-specific metadata to extract:
    - Course: course_code, assignment_type, semester, credits, instructor
    - Project: project_type, methodology, phase, milestone
    - Club: club_name, role, event_type
    - Todo: category, location, context
    
    Return valid JSON only. If no clear task can be extracted, return null.
    
    Examples:
    - "CS101 homework due Friday" → course task with course_code: "CS101", assignment_type: "homework"
    - "Sprint planning meeting" → project task with methodology: "agile", phase: "planning"
    - "Student council meeting" → club task with club_name: "student council", event_type: "meeting"
    - "Pick up groceries" → todo task with category: "errands", location: "store"`

    try {
      const response = await this.chat([
        { role: 'user', content: `Extract task information from: "${text}"` }
      ], { 
        system: systemPrompt,
        max_tokens: 1000 
      }) as ClaudeResponse

      const content = response.content[0].text.trim()
      
      try {
        // Look for JSON object in the response
        const jsonMatch = content.match(/\{[\s\S]*\}/g) || content.match(/null/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          return parsed
        }
        
        // Fallback: extract basic task info with default type
        return {
          title: text.slice(0, 100),
          content: text.length > 100 ? text : undefined,
          priority: 5,
          task_type: (context?.defaultType as any) || 'todo',
          type_metadata: { category: 'general' }
        }
      } catch (e) {
        return {
          title: text.slice(0, 100),
          priority: 5,
          task_type: (context?.defaultType as any) || 'todo',
          type_metadata: { category: 'general' }
        }
      }
    } catch (error) {
      console.error('Error parsing natural language task:', error)
      return null
    }
  }

  async generateTypeSpecificSuggestions(taskType: string, context: string, existingTasks: Task[] = []): Promise<string[]> {
    const existingTaskTitles = existingTasks.filter(t => t.task_type === taskType).map(t => t.title)
    
    const typePrompts = {
      course: `You are an academic advisor helping with course task suggestions. Based on the context provided, suggest 3-5 specific academic tasks.
      
      Focus on:
      - Assignment types (homework, essays, projects, readings)
      - Study planning and preparation
      - Course-specific activities
      - Academic deadlines and scheduling`,
      
      project: `You are a project manager helping with project task suggestions. Based on the context provided, suggest 3-5 specific project tasks.
      
      Focus on:
      - Development phases (planning, design, implementation, testing)
      - Team coordination and communication
      - Technical deliverables and milestones
      - Project management activities`,
      
      club: `You are an activities coordinator helping with club/organization task suggestions. Based on the context provided, suggest 3-5 specific club activities.
      
      Focus on:
      - Meeting preparation and organization
      - Event planning and coordination
      - Member engagement activities
      - Administrative and leadership tasks`,
      
      todo: `You are a personal productivity assistant helping with general task suggestions. Based on the context provided, suggest 3-5 specific personal tasks.
      
      Focus on:
      - Personal maintenance and health
      - Errands and daily activities
      - Home and life organization
      - Personal development and learning`
    }

    const systemPrompt = typePrompts[taskType as keyof typeof typePrompts] || typePrompts.todo
    
    const contextWithExisting = existingTaskTitles.length > 0 
      ? `Context: ${context}\n\nExisting ${taskType} tasks to avoid duplicating: ${existingTaskTitles.join(', ')}`
      : `Context: ${context}`

    try {
      const response = await this.chat([
        { role: 'user', content: contextWithExisting }
      ], { 
        system: systemPrompt + '\n\nReturn a JSON array of 3-5 specific, actionable task titles.',
        max_tokens: 1000 
      }) as ClaudeResponse

      const content = response.content[0].text.trim()
      
      try {
        const jsonMatch = content.match(/\[[^\]]*\]/g)
        if (jsonMatch) {
          const suggestions = JSON.parse(jsonMatch[0])
          return Array.isArray(suggestions) ? suggestions : []
        }
        return []
      } catch (e) {
        return []
      }
    } catch (error) {
      console.error('Error generating type-specific suggestions:', error)
      return []
    }
  }

  async analyzeMultiTypeProductivity(tasks: Task[], contexts: { course?: any, project?: any, club?: any, personal?: any } = {}): Promise<string> {
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

    const systemPrompt = `You are a productivity expert analyzing a multi-domain task management system with support for courses, projects, clubs, and personal todos.
    
    Provide insights on:
    1. Cross-domain workload balance and potential conflicts
    2. Type-specific productivity patterns and recommendations
    3. Priority management across different contexts
    4. Schedule optimization opportunities
    5. Integration strategies for better workflow
    
    Be specific, constructive, and focus on actionable multi-domain advice that considers the different nature of academic, professional, social, and personal commitments.`

    const userMessage = `Analyze my multi-type productivity:

Task Distribution:
${analysis.map(a => `${a.type.charAt(0).toUpperCase() + a.type.slice(1)}: ${a.total} tasks (${a.completed} completed, ${a.overdue} overdue, ${a.high_priority} high priority)`).join('\n')}

Additional Context:
${JSON.stringify(contexts, null, 2)}`

    try {
      const response = await this.chat([
        { role: 'user', content: userMessage }
      ], { 
        system: systemPrompt,
        max_tokens: 2000 
      }) as ClaudeResponse

      return response.content[0].text
    } catch (error) {
      throw new Error(`Failed to analyze multi-type productivity: ${error}`)
    }
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
    setApiKey: (key: string) => client.setApiKey(key),
    clearApiKey: () => client.clearApiKey(),
    analyzeProductivity: (tasks: Task[]) => client.analyzeProductivity(tasks),
    analyzeMultiTypeProductivity: (tasks: Task[], contexts?: any) => client.analyzeMultiTypeProductivity(tasks, contexts),
    suggestBreakdown: (title: string, description?: string) => client.suggestTaskBreakdown(title, description),
    generateSuggestions: (context: string, existing?: Task[]) => client.generateTaskSuggestions(context, existing),
    generateTypeSpecificSuggestions: (taskType: string, context: string, existing?: Task[]) => client.generateTypeSpecificSuggestions(taskType, context, existing),
    optimizePriorities: (tasks: Task[]) => client.optimizeTaskPriorities(tasks),
    parseTask: (text: string, context?: { defaultType?: string }) => client.parseNaturalLanguageTask(text, context),
  }
}