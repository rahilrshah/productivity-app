'use client'

import {
  GraphNode,
  TaskCategory,
  NodeType,
  AgentContextState,
  AgentAction,
  AgentInteractRequest,
  AgentInteractResponse,
  CreateGraphNodeDTO,
} from '@/types'
import { classifyGraphIntent, GraphIntent, IntentClassification } from '@/lib/agent/intentClassifier'

// Simple UUID v4 generator for client-side use
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
import { getOllamaClient } from '@/lib/ollama'
import { taskService } from '@/lib/taskService'

/**
 * StatefulAgentService - Graph-aware agent with conversation memory
 *
 * Features:
 * - Thread-based conversation tracking
 * - Slot-filling for incomplete data
 * - Context injection (active containers)
 * - Multi-turn clarification loop
 */
class StatefulAgentService {
  private static instance: StatefulAgentService

  // In-memory conversation state (for client-side)
  // Server-side persistence is handled by agent_logs table
  private conversationStates: Map<string, AgentContextState> = new Map()

  private constructor() {}

  static getInstance(): StatefulAgentService {
    if (!StatefulAgentService.instance) {
      StatefulAgentService.instance = new StatefulAgentService()
    }
    return StatefulAgentService.instance
  }

  /**
   * Main interaction method - processes user input with conversation context
   */
  async interact(request: AgentInteractRequest, userId: string): Promise<AgentInteractResponse> {
    const threadId = request.threadId || generateUUID()
    const client = getOllamaClient()

    try {
      // Step 1: Load or create conversation state
      let contextState = request.clientState || this.conversationStates.get(threadId) || {}

      // Step 2: Inject active containers as context
      const containers = await taskService.getActiveContainersForContext()
      const containerContext = this.buildContainerContextPrompt(containers)

      // Step 3: Determine if this is a continuation or new conversation
      if (contextState.pendingIntent && contextState.missingFields?.length) {
        // Continue slot-filling
        return await this.handleSlotFilling(
          request.input,
          threadId,
          contextState,
          userId,
          containerContext
        )
      }

      // Step 4: Classify intent with graph awareness
      const classification = await this.classifyGraphIntentInternal(
        request.input,
        containerContext,
        client
      )

      // Step 5: Extract structured data based on intent
      const extractionResult = await this.extractGraphData(
        request.input,
        classification.intent,
        containerContext,
        client
      )

      // Step 6: Check for missing required fields
      const missingFields = this.getMissingFields(classification.intent, extractionResult)

      if (missingFields.length > 0) {
        // Need clarification - save state and ask
        const newState: AgentContextState = {
          pendingIntent: classification.intent,
          partialData: extractionResult,
          missingFields,
          containerContext: containers[0] ? {
            id: containers[0].id,
            title: containers[0].title,
            category: containers[0].category as TaskCategory,
          } : undefined,
        }

        this.conversationStates.set(threadId, newState)

        return {
          threadId,
          status: 'CLARIFICATION_NEEDED',
          displayMessage: this.buildClarificationQuestion(missingFields, extractionResult),
          serverState: newState,
        }
      }

      // Step 7: Execute actions
      const result = await this.executeActions(
        classification.intent,
        extractionResult,
        userId,
        containers
      )

      // Clear conversation state on success
      this.conversationStates.delete(threadId)

      return {
        threadId,
        status: 'SUCCESS',
        displayMessage: result.message,
        createdNodes: result.createdNodes,
      }

    } catch (error) {
      console.error('Stateful agent error:', error)
      return {
        threadId,
        status: 'ERROR',
        displayMessage: 'Sorry, I encountered an error processing your request.',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Handle slot-filling continuation
   */
  private async handleSlotFilling(
    input: string,
    threadId: string,
    state: AgentContextState,
    userId: string,
    containerContext: string
  ): Promise<AgentInteractResponse> {
    const client = getOllamaClient()

    // Parse the user's response to fill missing slots
    const filledData = await this.parseSlotResponse(
      input,
      state.missingFields || [],
      (state.partialData || {}) as Record<string, unknown>,
      client
    )

    // Merge with existing partial data
    const mergedData = { ...(state.partialData || {}), ...filledData } as Record<string, unknown>

    // Check if we still have missing fields
    const remainingMissing = this.getMissingFields(
      state.pendingIntent || 'QUICK_TASK',
      mergedData as Partial<CreateGraphNodeDTO>
    )

    if (remainingMissing.length > 0) {
      // Still missing data, continue asking
      const newState: AgentContextState = {
        ...state,
        partialData: mergedData as Partial<GraphNode>,
        missingFields: remainingMissing,
      }

      this.conversationStates.set(threadId, newState)

      return {
        threadId,
        status: 'CLARIFICATION_NEEDED',
        displayMessage: this.buildClarificationQuestion(remainingMissing, mergedData as Partial<CreateGraphNodeDTO>),
        serverState: newState,
      }
    }

    // All data collected - execute
    const containers = await taskService.getActiveContainersForContext()
    const result = await this.executeActions(
      state.pendingIntent || 'QUICK_TASK',
      mergedData as Partial<CreateGraphNodeDTO>,
      userId,
      containers
    )

    // Clear state
    this.conversationStates.delete(threadId)

    return {
      threadId,
      status: 'SUCCESS',
      displayMessage: result.message,
      createdNodes: result.createdNodes,
    }
  }

  /**
   * Classify intent with graph architecture awareness
   * Delegates to unified intent classifier
   */
  private async classifyGraphIntentInternal(
    input: string,
    containerContext: string,
    _client: ReturnType<typeof getOllamaClient>
  ): Promise<{ intent: string; confidence: number; entities: Record<string, string> }> {
    // Use unified classifier
    const result = await classifyGraphIntent(input, containerContext)
    return {
      intent: result.intent,
      confidence: result.confidence,
      entities: result.entities,
    }
  }

  /**
   * Extract structured data based on classified intent
   */
  private async extractGraphData(
    input: string,
    intent: string,
    containerContext: string,
    client: ReturnType<typeof getOllamaClient>
  ): Promise<Partial<CreateGraphNodeDTO>> {
    const systemPrompt = `Extract structured task data from the input.

CONTEXT - Active containers:
${containerContext || 'No active containers'}

INTENT: ${intent}

Extract and return ONLY a JSON object with these fields:
{
  "title": "Task title",
  "node_type": "container" or "item",
  "category": "course" | "project" | "club" | "routine" | "todo" | "journal",
  "parent_id": "ID of parent container if mentioned/implied",
  "content": "Description or notes",
  "manual_priority": -10 to +10 (0 = default),
  "due_date": "YYYY-MM-DD if mentioned",
  "start_date": "YYYY-MM-DD if task should be deferred",
  "duration_minutes": estimated time in minutes,
  "tags": ["array", "of", "tags"],
  "type_metadata": { domain-specific metadata }
}

For CREATE_CONTAINER intent, use node_type: "container".
For task intents, use node_type: "item".

Map priority hints: high = +5, medium = 0, low = -5

Return ONLY valid JSON.`

    try {
      const response = await client.chat('llama3.1:8b', [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input.substring(0, 3000) }
      ], { temperature: 0.2 })

      const content = (response as any).message?.content?.trim() || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }

      // Fallback to basic extraction
      return {
        title: input.substring(0, 100),
        node_type: 'item' as NodeType,
        category: 'todo' as TaskCategory,
      }
    } catch (error) {
      console.error('Error extracting graph data:', error)
      return {
        title: input.substring(0, 100),
        node_type: 'item' as NodeType,
        category: 'todo' as TaskCategory,
      }
    }
  }

  /**
   * Parse user's response during slot-filling
   */
  private async parseSlotResponse(
    input: string,
    missingFields: string[],
    existingData: Record<string, unknown>,
    client: ReturnType<typeof getOllamaClient>
  ): Promise<Record<string, unknown>> {
    const systemPrompt = `The user is providing additional information to complete a task creation.

MISSING FIELDS: ${missingFields.join(', ')}
EXISTING DATA: ${JSON.stringify(existingData)}

Parse the user's response and extract values for the missing fields.
Return ONLY a JSON object with the extracted values.`

    try {
      const response = await client.chat('llama3.1:8b', [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: input }
      ], { temperature: 0.2 })

      const content = (response as any).message?.content?.trim() || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }

      // Try simple single-value extraction
      if (missingFields.length === 1) {
        return { [missingFields[0]]: input.trim() }
      }

      return {}
    } catch (error) {
      console.error('Error parsing slot response:', error)
      return {}
    }
  }

  /**
   * Determine which required fields are missing
   */
  private getMissingFields(intent: string, data: Partial<CreateGraphNodeDTO>): string[] {
    const missing: string[] = []

    // Title is always required
    if (!data.title || data.title.trim().length === 0) {
      missing.push('title')
    }

    // Category-specific requirements
    switch (intent) {
      case 'COURSE_TASK':
        if (!data.parent_id && !data.type_metadata) {
          // Need to know which course this belongs to
          // But we can infer or ask
        }
        break
      case 'CREATE_CONTAINER':
        if (!data.category) {
          missing.push('category')
        }
        break
    }

    return missing
  }

  /**
   * Build a clarification question for missing fields
   */
  private buildClarificationQuestion(
    missingFields: string[],
    partialData: Partial<CreateGraphNodeDTO>
  ): string {
    const questions: string[] = []

    for (const field of missingFields) {
      switch (field) {
        case 'title':
          questions.push("What would you like to call this task?")
          break
        case 'category':
          questions.push("Is this a course, project, club, routine, or just a todo?")
          break
        case 'parent_id':
          questions.push("Which course or project does this belong to?")
          break
        case 'due_date':
          questions.push("When is this due?")
          break
        default:
          questions.push(`What's the ${field.replace(/_/g, ' ')}?`)
      }
    }

    if (partialData.title) {
      return `Got it - "${partialData.title}". ${questions.join(' ')}`
    }

    return questions.join(' ')
  }

  /**
   * Build context prompt from active containers
   */
  private buildContainerContextPrompt(
    containers: Array<{ id: string; title: string; category: string }>
  ): string {
    if (containers.length === 0) {
      return 'No active containers'
    }

    return containers
      .map(c => `- ${c.title} (${c.category}) [ID: ${c.id}]`)
      .join('\n')
  }

  /**
   * Execute the determined actions
   */
  private async executeActions(
    intent: string,
    data: Partial<CreateGraphNodeDTO>,
    userId: string,
    containers: Array<{ id: string; title: string; category: string }>
  ): Promise<{ message: string; createdNodes: GraphNode[]; actions: AgentAction[] }> {
    const createdNodes: GraphNode[] = []
    const actions: AgentAction[] = []

    try {
      // Resolve category from intent if not set
      const category = this.resolveCategory(intent, data.category)

      // Resolve node_type
      const nodeType = intent === 'CREATE_CONTAINER' ? 'container' : 'item'

      // Resolve parent_id if we can match to a container
      let parentId = data.parent_id
      if (!parentId && nodeType === 'item' && data.type_metadata) {
        // Try to find matching container
        const matchedContainer = this.findMatchingContainer(data, containers)
        if (matchedContainer) {
          parentId = matchedContainer.id
        }
      }

      // Create the node
      const taskData = {
        title: data.title || 'Untitled Task',
        content: data.content,
        priority: 5,
        manual_priority: data.manual_priority || 0,
        due_date: data.due_date,
        start_date: data.start_date,
        tags: data.tags || [],
        parent_id: parentId,
        task_type: this.categoryToTaskType(category),
        type_metadata: data.type_metadata || { category: 'general' },
        node_type: nodeType as NodeType,
        category: category as TaskCategory,
        duration_minutes: data.duration_minutes,
      }

      const task = await taskService.createTask(taskData as any)
      createdNodes.push(task as any)

      actions.push({
        type: 'CREATE_NODE',
        nodeId: task.id,
        data: taskData as any,
      })

      // Build success message
      const parentInfo = parentId
        ? ` under ${containers.find(c => c.id === parentId)?.title || 'parent'}`
        : ''

      return {
        message: `Created "${task.title}"${parentInfo}${data.due_date ? ` (due: ${new Date(data.due_date).toLocaleDateString()})` : ''}`,
        createdNodes,
        actions,
      }

    } catch (error) {
      console.error('Error executing actions:', error)
      return {
        message: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createdNodes,
        actions,
      }
    }
  }

  /**
   * Resolve category from intent
   */
  private resolveCategory(intent: string, explicitCategory?: string): TaskCategory {
    if (explicitCategory) {
      return explicitCategory as TaskCategory
    }

    switch (intent) {
      case 'COURSE_TASK':
        return 'course'
      case 'PROJECT_TASK':
        return 'project'
      case 'CLUB_TASK':
        return 'club'
      case 'ROUTINE':
        return 'routine'
      case 'JOURNAL':
        return 'journal'
      case 'CREATE_CONTAINER':
        return 'project' // Default container type
      default:
        return 'todo'
    }
  }

  /**
   * Convert category to legacy task_type
   */
  private categoryToTaskType(category: TaskCategory): 'course' | 'project' | 'club' | 'todo' {
    switch (category) {
      case 'course':
        return 'course'
      case 'project':
        return 'project'
      case 'club':
        return 'club'
      default:
        return 'todo'
    }
  }

  /**
   * Find a matching container based on extracted data
   */
  private findMatchingContainer(
    data: Partial<CreateGraphNodeDTO>,
    containers: Array<{ id: string; title: string; category: string }>
  ): { id: string; title: string; category: string } | null {
    // Try to match by explicit reference in type_metadata
    const metadata = data.type_metadata as any
    if (metadata?.course_code) {
      const match = containers.find(c =>
        c.title.toLowerCase().includes(metadata.course_code.toLowerCase())
      )
      if (match) return match
    }

    // Try to match by title keywords
    if (data.title) {
      const titleLower = data.title.toLowerCase()
      for (const container of containers) {
        const containerTitleLower = container.title.toLowerCase()
        // Check if container name appears in task title
        if (titleLower.includes(containerTitleLower) ||
            containerTitleLower.includes(titleLower.split(' ')[0])) {
          return container
        }
      }
    }

    return null
  }

  /**
   * Clear conversation state (for testing or reset)
   */
  clearState(threadId?: string): void {
    if (threadId) {
      this.conversationStates.delete(threadId)
    } else {
      this.conversationStates.clear()
    }
  }
}

// Export singleton
export const statefulAgent = StatefulAgentService.getInstance()

// Convenience function
export async function interactWithAgent(
  request: AgentInteractRequest,
  userId: string
): Promise<AgentInteractResponse> {
  return statefulAgent.interact(request, userId)
}
