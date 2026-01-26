'use client'

export interface OllamaModel {
  name: string
  size: number
  digest: string
  details: {
    format: string
    family: string
    families?: string[]
    parameter_size: string
    quantization_level: string
  }
  modified_at: string
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaResponse {
  model: string
  created_at: string
  message: OllamaMessage
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  eval_count?: number
  eval_duration?: number
}

export interface OllamaStreamResponse {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
}

class OllamaClient {
  private baseUrl: string
  private timeout: number
  private connectionVerified = false

  constructor(baseUrl?: string) {
    // Use provided URL, then env var, then localhost fallback
    const envUrl = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL
    this.baseUrl = baseUrl || envUrl || 'http://localhost:11434'

    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('OllamaClient initialized with baseUrl:', this.baseUrl)
    }

    this.timeout = 60000 // 60 seconds - longer timeout for complex requests
  }

  /**
   * Get the current base URL
   */
  getBaseUrl(): string {
    return this.baseUrl
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        }
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      
      // Provide better error messages
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Request timeout after ${this.timeout / 1000} seconds. Please check if Ollama is running and responsive.`)
        }
        if (error.message.includes('fetch')) {
          throw new Error(`Cannot connect to Ollama at ${this.baseUrl}. Please check if Ollama is running.`)
        }
      }
      
      throw error
    }
  }

  /**
   * Check if Ollama is available and responding
   * Caches the result to avoid repeated checks
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      })
      this.connectionVerified = response.ok
      return response.ok
    } catch (error) {
      this.connectionVerified = false
      // Only warn in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('Ollama not available:', error instanceof Error ? error.message : 'Unknown error')
      }
      return false
    }
  }

  /**
   * Get Ollama connection status with details
   */
  async getStatus(): Promise<{
    available: boolean
    baseUrl: string
    error?: string
  }> {
    try {
      const available = await this.isAvailable()
      return {
        available,
        baseUrl: this.baseUrl
      }
    } catch (error) {
      return {
        available: false,
        baseUrl: this.baseUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`)
      }

      const data = await response.json()
      return data.models || []
    } catch (error) {
      console.error('Error fetching Ollama models:', error)
      return []
    }
  }

  async pullModel(modelName: string, onProgress?: (progress: any) => void): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: modelName,
          stream: !!onProgress
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.statusText}`)
      }

      if (onProgress && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split('\n').filter(line => line.trim())
            
            for (const line of lines) {
              try {
                const progress = JSON.parse(line)
                onProgress(progress)
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      }

      return true
    } catch (error) {
      console.error('Error pulling model:', error)
      return false
    }
  }

  async chat(
    model: string,
    messages: OllamaMessage[],
    options: {
      stream?: boolean
      temperature?: number
      top_p?: number
      top_k?: number
      num_predict?: number
      format?: 'json'  // Request JSON output format from Ollama
    } = {}
  ): Promise<OllamaResponse | ReadableStream<OllamaStreamResponse>> {
    try {
      const requestBody: Record<string, unknown> = {
        model,
        messages,
        stream: options.stream || false,
        options: {
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          top_k: options.top_k || 40,
          num_predict: options.num_predict || -1,
        }
      }

      // Add format option for structured JSON output
      if (options.format === 'json') {
        requestBody.format = 'json'
      }

      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.statusText}`)
      }

      if (options.stream && response.body) {
        return response.body.pipeThrough(new TransformStream({
          transform(chunk, controller) {
            const decoder = new TextDecoder()
            const text = decoder.decode(chunk)
            const lines = text.split('\n').filter(line => line.trim())
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line)
                controller.enqueue(data)
              } catch (e) {
                // Skip invalid JSON lines
              }
            }
          }
        }))
      }

      return await response.json()
    } catch (error) {
      console.error('Error in chat request:', error)
      throw error
    }
  }

  async generate(
    model: string,
    prompt: string,
    options: {
      stream?: boolean
      temperature?: number
      system?: string
    } = {}
  ): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model,
          prompt,
          system: options.system,
          stream: options.stream || false,
          options: {
            temperature: options.temperature || 0.7,
          }
        })
      })

      if (!response.ok) {
        throw new Error(`Generate request failed: ${response.statusText}`)
      }

      if (options.stream && response.body) {
        return response.body
      }

      return await response.json()
    } catch (error) {
      console.error('Error in generate request:', error)
      throw error
    }
  }

  async deleteModel(modelName: string): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/delete`, {
        method: 'DELETE',
        body: JSON.stringify({
          name: modelName
        })
      })

      return response.ok
    } catch (error) {
      console.error('Error deleting model:', error)
      return false
    }
  }

  // Task-specific helper methods
  async parseTaskFromText(text: string, model: string = 'llama3.1:8b'): Promise<{
    title: string
    content?: string
    priority?: number
    due_date?: string
    tags?: string[]
    duration_minutes?: number
  } | null> {
    const systemPrompt = `You are a helpful assistant that extracts task information from natural language text. 
    
    Extract the following information if available:
    - title: A concise task title
    - content: Detailed description or notes
    - priority: Number from 1-10 (1=low, 10=urgent)
    - due_date: ISO date string if mentioned
    - tags: Array of relevant tags
    - duration_minutes: Estimated duration in minutes
    
    Respond only with valid JSON. If no task is detected, respond with null.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ]) as OllamaResponse

      const content = response.message.content.trim()
      
      // Try to parse JSON response
      try {
        return JSON.parse(content)
      } catch (e) {
        // If JSON parsing fails, try to extract basic task info
        return {
          title: text.slice(0, 100),
          content: text.length > 100 ? text : undefined,
          priority: 5
        }
      }
    } catch (error) {
      console.error('Error parsing task from text:', error)
      return null
    }
  }

  async suggestTaskDecomposition(taskTitle: string, model: string = 'llama3.1:8b'): Promise<string[]> {
    const systemPrompt = `You are a productivity expert. Break down complex tasks into smaller, actionable subtasks. 
    
    Return a JSON array of subtask titles. Each subtask should be specific and actionable.
    Maximum 5 subtasks. If the task is already simple enough, return an empty array.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Break down this task: "${taskTitle}"` }
      ]) as OllamaResponse

      const content = response.message.content.trim()
      
      try {
        const subtasks = JSON.parse(content)
        return Array.isArray(subtasks) ? subtasks : []
      } catch (e) {
        return []
      }
    } catch (error) {
      console.error('Error suggesting task decomposition:', error)
      return []
    }
  }

  async generateTaskSuggestions(context: string, model: string = 'llama3.1:8b'): Promise<string[]> {
    const systemPrompt = `Based on the context provided, suggest 3-5 relevant tasks that would be helpful to complete.

    Return a JSON array of task titles. Each task should be specific and actionable.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context }
      ]) as OllamaResponse

      const content = response.message.content.trim()

      try {
        const suggestions = JSON.parse(content)
        return Array.isArray(suggestions) ? suggestions : []
      } catch (e) {
        return []
      }
    } catch (error) {
      console.error('Error generating task suggestions:', error)
      return []
    }
  }

  // Agent-related methods for Command Center
  /**
   * @deprecated Use classifyLegacyIntent from '@/lib/agent/intentClassifier' instead
   */
  async classifyIntent(text: string, model: string = 'llama3.1:8b'): Promise<{
    intent: 'SYLLABUS' | 'PROJECT_BRAINSTORM' | 'QUICK_TASK' | 'SCHEDULE_REQUEST' | 'UNKNOWN'
    confidence: number
    extractedEntities: Record<string, string>
  }> {
    // Delegate to unified classifier
    const { classifyLegacyIntent } = await import('@/lib/agent/intentClassifier')
    const result = await classifyLegacyIntent(text, model)
    return {
      intent: result.intent,
      confidence: result.confidence,
      extractedEntities: result.entities
    }
  }

  async extractSyllabusData(text: string, model: string = 'llama3.1:8b'): Promise<{
    courseCode: string
    courseName: string
    semester: string
    instructor?: string
    credits?: number
    assignments: Array<{
      title: string
      dueDate?: string
      type: string
      weight?: number
    }>
  } | null> {
    const systemPrompt = `You are an expert at extracting structured data from academic syllabi.

Extract course information from the provided syllabus text. Return a JSON object with:
- courseCode: The course code (e.g., "CS101", "MATH 200")
- courseName: Full course name
- semester: Semester/term (e.g., "Fall 2024", "Spring 2025")
- instructor: Instructor name if mentioned
- credits: Number of credits if mentioned
- assignments: Array of assignments with:
  - title: Assignment name
  - dueDate: ISO date string (estimate year as 2025 if not specified)
  - type: Type of assignment (Homework, Exam, Project, Quiz, etc.)
  - weight: Percentage weight if mentioned

If you cannot find a required field, use reasonable defaults:
- courseCode: "UNKNOWN"
- courseName: First meaningful title found
- semester: "Current"

Respond ONLY with valid JSON, no other text.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.substring(0, 4000) }
      ], { temperature: 0.2 }) as OllamaResponse

      const content = response.message.content.trim()
      const jsonMatch = content.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          courseCode: parsed.courseCode || 'UNKNOWN',
          courseName: parsed.courseName || 'Untitled Course',
          semester: parsed.semester || 'Current',
          instructor: parsed.instructor,
          credits: parsed.credits,
          assignments: Array.isArray(parsed.assignments) ? parsed.assignments : []
        }
      }

      return null
    } catch (error) {
      console.error('Error extracting syllabus data:', error)
      return null
    }
  }

  async extractProjectData(text: string, model: string = 'llama3.1:8b'): Promise<{
    projectName: string
    projectType: 'personal' | 'work' | 'side-project'
    description: string
    milestones: Array<{
      title: string
      dueDate?: string
    }>
    deadline?: string
  } | null> {
    const systemPrompt = `You are an expert at extracting project information from brainstorms and briefs.

Extract project details from the provided text. Return a JSON object with:
- projectName: Name or title of the project
- projectType: One of "personal", "work", or "side-project"
- description: Brief description of the project
- milestones: Array of milestones/phases with:
  - title: Milestone name
  - dueDate: ISO date string if mentioned
- deadline: Overall project deadline if mentioned

If the text mentions features, convert them into milestones.
If no clear milestones, break the project into logical phases.

Respond ONLY with valid JSON, no other text.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.substring(0, 3000) }
      ], { temperature: 0.3 }) as OllamaResponse

      const content = response.message.content.trim()
      const jsonMatch = content.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          projectName: parsed.projectName || 'Untitled Project',
          projectType: parsed.projectType || 'personal',
          description: parsed.description || '',
          milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [],
          deadline: parsed.deadline
        }
      }

      return null
    } catch (error) {
      console.error('Error extracting project data:', error)
      return null
    }
  }

  async extractScheduleData(text: string, model: string = 'llama3.1:8b'): Promise<{
    action: 'reschedule' | 'block_time' | 'find_slot' | 'schedule_new'
    taskTitle?: string
    taskId?: string
    newDate?: string
    newTime?: string
    duration?: number
    reason?: string
    preferences?: {
      timeOfDay?: 'morning' | 'afternoon' | 'evening'
      dayOfWeek?: string
      beforeTask?: string
      afterTask?: string
    }
  } | null> {
    const systemPrompt = `You are an expert at understanding scheduling requests and time management.

Extract scheduling information from the provided text. Return a JSON object with:
- action: One of "reschedule", "block_time", "find_slot", or "schedule_new"
- taskTitle: Title/description of the task being scheduled (if creating new or unclear which task)
- taskId: ID of existing task being rescheduled (if mentioned)
- newDate: ISO date string if a specific date is mentioned (format: YYYY-MM-DD)
- newTime: Time in HH:MM format if specific time mentioned
- duration: Duration in minutes if specified
- reason: Reason for scheduling/rescheduling if provided
- preferences: Object with scheduling preferences:
  - timeOfDay: "morning", "afternoon", or "evening" if mentioned
  - dayOfWeek: Specific day name if mentioned
  - beforeTask: Name of task this should be scheduled before
  - afterTask: Name of task this should be scheduled after

Examples of what to extract:
- "Reschedule my CS101 assignment to tomorrow" → action: "reschedule", taskTitle: "CS101 assignment", newDate: tomorrow's date
- "Find time for gym this Friday afternoon" → action: "find_slot", taskTitle: "gym", newDate: Friday's date, timeOfDay: "afternoon"
- "Block 2 hours for project work next Monday morning" → action: "block_time", taskTitle: "project work", duration: 120, newDate: Monday's date, timeOfDay: "morning"
- "Schedule dentist appointment for 3pm tomorrow" → action: "schedule_new", taskTitle: "dentist appointment", newTime: "15:00", newDate: tomorrow's date

Respond ONLY with valid JSON, no other text.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.substring(0, 2000) }
      ], { temperature: 0.2 }) as OllamaResponse

      const content = response.message.content.trim()
      
      // Try to extract JSON more robustly
      let jsonMatch = content.match(/\{[\s\S]*\}/)
      
      // If no JSON found, try to find it within markdown code blocks
      if (!jsonMatch) {
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
        if (codeBlockMatch) {
          jsonMatch = [codeBlockMatch[1]]
        }
      }

      if (jsonMatch) {
        // Clean the JSON string - remove any non-JSON text
        let jsonStr = jsonMatch[0].trim()

        // Try to find just the JSON object part
        const startBrace = jsonStr.indexOf('{')
        const lastBrace = jsonStr.lastIndexOf('}')

        if (startBrace !== -1 && lastBrace !== -1 && lastBrace > startBrace) {
          jsonStr = jsonStr.substring(startBrace, lastBrace + 1)
        }

        try {
          const parsed = JSON.parse(jsonStr)

          // Handle case where LLM returns array instead of object
          if (Array.isArray(parsed) && parsed.length > 0) {
            const firstItem = parsed[0]
            return {
              action: firstItem.action || 'find_slot',
              taskTitle: firstItem.taskTitle,
              taskId: firstItem.taskId,
              newDate: firstItem.newDate ? this.convertRelativeDate(firstItem.newDate) : undefined,
              newTime: firstItem.newTime,
              duration: firstItem.duration,
              reason: firstItem.reason,
              preferences: firstItem.preferences || {}
            }
          }

          // Validate action
          if (!['reschedule', 'block_time', 'find_slot', 'schedule_new'].includes(parsed.action)) {
            parsed.action = 'find_slot' // Default fallback
          }

          // Convert relative dates to actual dates
          if (parsed.newDate) {
            parsed.newDate = this.convertRelativeDate(parsed.newDate)
          }

          return {
            action: parsed.action,
            taskTitle: parsed.taskTitle,
            taskId: parsed.taskId,
            newDate: parsed.newDate,
            newTime: parsed.newTime,
            duration: parsed.duration,
            reason: parsed.reason,
            preferences: parsed.preferences || {}
          }
        } catch (parseError) {
          console.error('JSON parse error:', parseError, 'Content:', jsonMatch[0])

          // Try to clean up common JSON issues
          const cleanedJson = jsonStr
            .replace(/'/g, '"')  // Replace single quotes with double quotes
            .replace(/(\w+):/g, '"$1":')  // Add quotes around unquoted keys
            .replace(/,\s*}/g, '}')  // Remove trailing commas
            .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          
          try {
            const parsed = JSON.parse(cleanedJson)
            return {
              action: parsed.action || 'find_slot',
              taskTitle: parsed.taskTitle,
              taskId: parsed.taskId,
              newDate: parsed.newDate,
              newTime: parsed.newTime,
              duration: parsed.duration,
              reason: parsed.reason,
              preferences: parsed.preferences || {}
            }
          } catch (secondParseError) {
            console.error('Second JSON parse failed:', secondParseError)
            
            // Final fallback: try to extract basic info using regex
            const actionMatch = content.match(/"action"\s*:\s*"([^"]+)"/i)
            const titleMatch = content.match(/"taskTitle"\s*:\s*"([^"]+)"/i)
            const durationMatch = content.match(/"duration"\s*:\s*(\d+)/i)
            const dateMatch = content.match(/"newDate"\s*:\s*"([^"]+)"/i)
            const timeMatch = content.match(/"newTime"\s*:\s*"([^"]+)"/i)
            
            return {
              action: (actionMatch?.[1] as any) || 'find_slot',
              taskTitle: titleMatch?.[1] || 'Scheduling request',
              taskId: undefined,
              newDate: dateMatch?.[1],
              newTime: timeMatch?.[1],
              duration: durationMatch?.[1] ? parseInt(durationMatch[1]) : undefined,
              reason: undefined,
              preferences: {}
            }
          }
        }
      }

      // Last fallback - create a basic schedule request
      return {
        action: 'find_slot',
        taskTitle: 'Schedule request',
        taskId: undefined,
        newDate: undefined,
        newTime: undefined,
        duration: 60,
        reason: content.length > 0 ? content : undefined,
        preferences: {}
      }
    } catch (error) {
      console.error('Error extracting schedule data:', error)
      return null
    }
  }

  private convertRelativeDate(dateStr: string): string {
    const today = new Date()
    const lowerStr = dateStr.toLowerCase()
    
    if (lowerStr.includes('today')) {
      return today.toISOString().split('T')[0]
    } else if (lowerStr.includes('tomorrow')) {
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      return tomorrow.toISOString().split('T')[0]
    } else if (lowerStr.includes('monday')) {
      const nextMonday = new Date(today)
      const daysUntilMonday = (1 - nextMonday.getDay() + 7) % 7
      if (daysUntilMonday === 0) nextMonday.setDate(nextMonday.getDate() + 7)
      else nextMonday.setDate(nextMonday.getDate() + daysUntilMonday)
      return nextMonday.toISOString().split('T')[0]
    } else if (lowerStr.includes('tuesday')) {
      const nextTuesday = new Date(today)
      const daysUntilTuesday = (2 - nextTuesday.getDay() + 7) % 7
      if (daysUntilTuesday === 0) nextTuesday.setDate(nextTuesday.getDate() + 7)
      else nextTuesday.setDate(nextTuesday.getDate() + daysUntilTuesday)
      return nextTuesday.toISOString().split('T')[0]
    } else if (lowerStr.includes('wednesday')) {
      const nextWednesday = new Date(today)
      const daysUntilWednesday = (3 - nextWednesday.getDay() + 7) % 7
      if (daysUntilWednesday === 0) nextWednesday.setDate(nextWednesday.getDate() + 7)
      else nextWednesday.setDate(nextWednesday.getDate() + daysUntilWednesday)
      return nextWednesday.toISOString().split('T')[0]
    } else if (lowerStr.includes('thursday')) {
      const nextThursday = new Date(today)
      const daysUntilThursday = (4 - nextThursday.getDay() + 7) % 7
      if (daysUntilThursday === 0) nextThursday.setDate(nextThursday.getDate() + 7)
      else nextThursday.setDate(nextThursday.getDate() + daysUntilThursday)
      return nextThursday.toISOString().split('T')[0]
    } else if (lowerStr.includes('friday')) {
      const nextFriday = new Date(today)
      const daysUntilFriday = (5 - nextFriday.getDay() + 7) % 7
      if (daysUntilFriday === 0) nextFriday.setDate(nextFriday.getDate() + 7)
      else nextFriday.setDate(nextFriday.getDate() + daysUntilFriday)
      return nextFriday.toISOString().split('T')[0]
    } else if (lowerStr.includes('saturday')) {
      const nextSaturday = new Date(today)
      const daysUntilSaturday = (6 - nextSaturday.getDay() + 7) % 7
      if (daysUntilSaturday === 0) nextSaturday.setDate(nextSaturday.getDate() + 7)
      else nextSaturday.setDate(nextSaturday.getDate() + daysUntilSaturday)
      return nextSaturday.toISOString().split('T')[0]
    } else if (lowerStr.includes('sunday')) {
      const nextSunday = new Date(today)
      const daysUntilSunday = (7 - nextSunday.getDay()) % 7
      if (daysUntilSunday === 0) nextSunday.setDate(nextSunday.getDate() + 7)
      else nextSunday.setDate(nextSunday.getDate() + daysUntilSunday)
      return nextSunday.toISOString().split('T')[0]
    } else if (lowerStr.includes('next week')) {
      const nextWeek = new Date(today)
      nextWeek.setDate(nextWeek.getDate() + 7)
      return nextWeek.toISOString().split('T')[0]
    }
    
    // If it's already in a valid format or unrecognized, return as-is
    return dateStr
  }
}

// Global Ollama client instance
let ollamaInstance: OllamaClient | null = null

export function getOllamaClient(): OllamaClient {
  if (!ollamaInstance) {
    ollamaInstance = new OllamaClient()
  }
  return ollamaInstance
}

// Hook for React components
export function useOllama() {
  const client = getOllamaClient()

  return {
    client,
    isAvailable: () => client.isAvailable(),
    listModels: () => client.listModels(),
    parseTask: (text: string, model?: string) => client.parseTaskFromText(text, model),
    suggestSubtasks: (task: string, model?: string) => client.suggestTaskDecomposition(task, model),
    generateSuggestions: (context: string, model?: string) => client.generateTaskSuggestions(context, model),
    // Agent-related methods
    classifyIntent: (text: string, model?: string) => client.classifyIntent(text, model),
    extractSyllabusData: (text: string, model?: string) => client.extractSyllabusData(text, model),
    extractProjectData: (text: string, model?: string) => client.extractProjectData(text, model),
    extractScheduleData: (text: string, model?: string) => client.extractScheduleData(text, model),
  }
}