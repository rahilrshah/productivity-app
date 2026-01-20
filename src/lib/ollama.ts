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

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || 'http://localhost:11434'
    this.timeout = 30000 // 30 seconds
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

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
      throw error
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      })
      return response.ok
    } catch (error) {
      console.warn('Ollama not available:', error)
      return false
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
    } = {}
  ): Promise<OllamaResponse | ReadableStream<OllamaStreamResponse>> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages,
          stream: options.stream || false,
          options: {
            temperature: options.temperature || 0.7,
            top_p: options.top_p || 0.9,
            top_k: options.top_k || 40,
            num_predict: options.num_predict || -1,
          }
        })
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
  async classifyIntent(text: string, model: string = 'llama3.1:8b'): Promise<{
    intent: 'SYLLABUS' | 'PROJECT_BRAINSTORM' | 'QUICK_TASK' | 'SCHEDULE_REQUEST' | 'UNKNOWN'
    confidence: number
    extractedEntities: Record<string, string>
  }> {
    const systemPrompt = `You are an intent classifier for a productivity app.

Classify the user input into exactly ONE of these intents:
- SYLLABUS: Academic course syllabus, class schedule, assignment lists, grading policies, course information
- PROJECT_BRAINSTORM: Project ideas, feature lists, milestone planning, development roadmaps, project briefs
- QUICK_TASK: Simple single task, todo item, reminder, quick note
- SCHEDULE_REQUEST: Requests about scheduling, rescheduling, time blocking, finding available time
- UNKNOWN: Cannot determine intent or doesn't fit other categories

Also extract any key entities you find (course codes, project names, dates, etc.)

Respond ONLY with valid JSON in this exact format:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0,
  "extractedEntities": { "key": "value" }
}

Do not include any other text, only the JSON object.`

    try {
      const response = await this.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text.substring(0, 2000) }
      ], { temperature: 0.3 }) as OllamaResponse

      const content = response.message.content.trim()

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          intent: parsed.intent || 'UNKNOWN',
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          extractedEntities: parsed.extractedEntities || {}
        }
      }

      return { intent: 'UNKNOWN', confidence: 0, extractedEntities: {} }
    } catch (error) {
      console.error('Error classifying intent:', error)
      return { intent: 'UNKNOWN', confidence: 0, extractedEntities: {} }
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
  }
}