import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { AgentInteractRequest, AgentInteractResponse, AgentContextState } from '@/types'
import { v4 as uuidv4 } from 'uuid'

/**
 * Type for extracted task data from LLM
 */
interface ExtractedTaskData {
  title: string
  node_type?: 'container' | 'item'
  category?: string
  parent_id?: string | null
  content?: string | null
  manual_priority?: number | null
  due_date?: string | null
  duration_minutes?: number | null
  tags?: string[]
}

/**
 * POST /api/agent/interact
 *
 * Stateful agent interaction endpoint.
 * Handles multi-turn conversations with slot-filling.
 *
 * Request:
 * {
 *   "input": "string",
 *   "threadId": "uuid (optional)",
 *   "clientState": { "pendingIntent": "...", "partialData": {} }
 * }
 *
 * Response:
 * {
 *   "threadId": "uuid",
 *   "status": "SUCCESS | CLARIFICATION_NEEDED | ERROR",
 *   "displayMessage": "string",
 *   "serverState": { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Require authentication - no fallback to shared UUID
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json() as AgentInteractRequest
    const { input, threadId, clientState } = body

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Input is required and must be a string' },
        { status: 400 }
      )
    }

    // Generate or use provided threadId
    const currentThreadId = threadId || uuidv4()

    // Get turn index for this thread
    let turnIndex = 0
    if (threadId) {
      const { data: lastLog } = await supabase
        .from('agent_logs')
        .select('turn_index')
        .eq('thread_id', threadId)
        .order('turn_index', { ascending: false })
        .limit(1)
        .single()

      if (lastLog) {
        turnIndex = lastLog.turn_index + 1
      }
    }

    // Load previous context state if continuing thread
    let contextState: AgentContextState | undefined = clientState
    if (threadId && !clientState) {
      const { data: prevLog } = await supabase
        .from('agent_logs')
        .select('context_state')
        .eq('thread_id', threadId)
        .order('turn_index', { ascending: false })
        .limit(1)
        .single()

      if (prevLog?.context_state) {
        contextState = prevLog.context_state as AgentContextState
      }
    }

    // Dynamically import the stateful agent (client-side code)
    // For server-side, we'll use a simplified version
    const response = await processAgentRequest(input, currentThreadId, contextState, user.id, supabase)

    // Log this interaction
    const logData = {
      user_id: user.id,
      thread_id: currentThreadId,
      turn_index: turnIndex,
      user_input: input,
      ai_response: response.displayMessage,
      intent: response.status === 'CLARIFICATION_NEEDED'
        ? (response.serverState?.pendingIntent || 'CLARIFICATION')
        : 'EXECUTED',
      context_state: response.serverState || null,
      actions_executed: response.createdNodes?.map(n => ({
        type: 'CREATE_NODE',
        nodeId: n.id,
      })) || null,
    }

    try {
      await supabase.from('agent_logs').insert(logData)
    } catch (logError) {
      console.warn('Failed to log agent interaction:', logError)
    }

    return NextResponse.json(response)

  } catch (error) {
    console.error('Agent interact API error:', error)
    return NextResponse.json(
      {
        threadId: uuidv4(),
        status: 'ERROR',
        displayMessage: 'An error occurred processing your request',
        error: error instanceof Error ? error.message : 'Unknown error',
      } as AgentInteractResponse,
      { status: 500 }
    )
  }
}

/**
 * Server-side agent processing
 * Simplified version that works with server-side rendering
 */
async function processAgentRequest(
  input: string,
  threadId: string,
  contextState: AgentContextState | undefined,
  userId: string,
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>
): Promise<AgentInteractResponse> {
  try {
    // Get active containers for context
    const { data: containers } = await supabase
      .from('tasks')
      .select('id, title, category')
      .eq('node_type', 'container')
      .in('status', ['pending', 'active'])
      .limit(10)

    const containerContext = containers?.map(c =>
      `- ${c.title} (${c.category}) [ID: ${c.id}]`
    ).join('\n') || 'No active containers'

    // If we have pending context state, this is a continuation
    if (contextState?.pendingIntent && contextState?.missingFields?.length) {
      return handleSlotFillingServer(
        input,
        threadId,
        contextState,
        userId,
        supabase,
        containers || []
      )
    }

    // Use Ollama for intent classification
    const ollamaUrl = process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || 'http://localhost:11434'

    // Classify intent
    const classifyResponse = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier for a productivity app.

CONTEXT - Active containers:
${containerContext}

Classify the user input into ONE of these intents:
- COURSE_TASK: Task related to courses/assignments
- PROJECT_TASK: Task related to projects/milestones
- QUICK_TODO: Simple one-off task
- CREATE_CONTAINER: Create new course/project/club
- UNKNOWN: Cannot determine

Extract: title, category (course/project/todo), parent_container, due_date

Respond ONLY with JSON:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0,
  "entities": { "title": "", "category": "", "parent_container": "", "due_date": "" }
}`
          },
          { role: 'user', content: input.substring(0, 2000) }
        ],
        stream: false,
        options: { temperature: 0.3 }
      })
    })

    if (!classifyResponse.ok) {
      throw new Error('Failed to classify intent')
    }

    const classifyResult = await classifyResponse.json()
    const classifyContent = classifyResult.message?.content || ''
    const jsonMatch = classifyContent.match(/\{[\s\S]*\}/)

    let intent = 'QUICK_TODO'
    let entities: Record<string, string> = {}

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        intent = parsed.intent || 'QUICK_TODO'
        entities = parsed.entities || {}
      } catch (e) {
        console.warn('Failed to parse intent JSON, using defaults')
      }
    }

    // Extract structured data
    const extractResponse = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        messages: [
          {
            role: 'system',
            content: `Extract task data from input. INTENT: ${intent}

Return ONLY JSON:
{
  "title": "Task title",
  "node_type": "container" or "item",
  "category": "course" | "project" | "todo",
  "parent_id": "ID if mentioned",
  "content": "Description",
  "manual_priority": 0,
  "due_date": "YYYY-MM-DD or null",
  "duration_minutes": 60,
  "tags": []
}`
          },
          { role: 'user', content: input.substring(0, 3000) }
        ],
        stream: false,
        options: { temperature: 0.2 }
      })
    })

    let extractedData: ExtractedTaskData = { title: input.substring(0, 100), category: 'todo' }

    if (extractResponse.ok) {
      const extractResult = await extractResponse.json()
      const extractContent = extractResult.message?.content || ''
      const extractJsonMatch = extractContent.match(/\{[\s\S]*\}/)

      if (extractJsonMatch) {
        try {
          extractedData = JSON.parse(extractJsonMatch[0])
        } catch (e) {
          console.warn('Failed to parse extraction JSON, using input as title')
          extractedData = { title: input.substring(0, 100), category: 'todo' }
        }
      }
    }

    // Check for missing required fields
    const missingFields: string[] = []
    if (!extractedData.title || extractedData.title.trim().length === 0) {
      missingFields.push('title')
    }

    if (missingFields.length > 0) {
      return {
        threadId,
        status: 'CLARIFICATION_NEEDED',
        displayMessage: "What would you like to call this task?",
        serverState: {
          pendingIntent: intent,
          partialData: extractedData,
          missingFields,
        },
      }
    }

    // Execute: Create the task
    const nodeType = intent === 'CREATE_CONTAINER' ? 'container' : 'item'
    const category = extractedData.category || (
      intent === 'COURSE_TASK' ? 'course' :
      intent === 'PROJECT_TASK' ? 'project' : 'todo'
    )

    // Find parent container if referenced
    let parentId = extractedData.parent_id
    if (!parentId && entities.parent_container && containers) {
      const match = containers.find(c =>
        c.title.toLowerCase().includes(entities.parent_container.toLowerCase())
      )
      if (match) parentId = match.id
    }

    // Helper to sanitize LLM output - convert "null" strings to actual null
    const sanitize = (val: unknown): string | null => {
      if (val === 'null' || val === '' || val === undefined || val === null) return null
      return typeof val === 'string' ? val : String(val)
    }
    const sanitizeNum = (val: unknown): number | null => {
      if (val === 'null' || val === '' || val === undefined || val === null) return null
      const num = typeof val === 'number' ? val : parseInt(String(val), 10)
      return isNaN(num) ? null : num
    }

    const taskData = {
      user_id: userId,
      title: extractedData.title,
      content: sanitize(extractedData.content),
      status: 'pending',
      priority: 5,
      manual_priority: sanitizeNum(extractedData.manual_priority) || 0,
      due_date: sanitize(extractedData.due_date),
      tags: Array.isArray(extractedData.tags) ? extractedData.tags : [],
      parent_id: sanitize(parentId),
      task_type: category === 'course' ? 'course' : category === 'project' ? 'project' : 'todo',
      type_metadata: {},
      node_type: nodeType,
      category: category,
      duration_minutes: sanitizeNum(extractedData.duration_minutes),
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to create task: ${error.message}`)
    }

    const parentInfo = parentId && containers
      ? ` under ${containers.find(c => c.id === parentId)?.title || 'parent'}`
      : ''

    return {
      threadId,
      status: 'SUCCESS',
      displayMessage: `Created "${task.title}"${parentInfo}${extractedData.due_date ? ` (due: ${new Date(extractedData.due_date).toLocaleDateString()})` : ''}`,
      createdNodes: [task],
    }

  } catch (error) {
    console.error('Process agent request error:', error)
    return {
      threadId,
      status: 'ERROR',
      displayMessage: 'Sorry, I encountered an error processing your request.',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Handle slot-filling continuation on server
 */
async function handleSlotFillingServer(
  input: string,
  threadId: string,
  state: AgentContextState,
  userId: string,
  supabase: ReturnType<typeof createRouteHandlerSupabaseClient>,
  containers: Array<{ id: string; title: string; category: string }>
): Promise<AgentInteractResponse> {
  // Merge user input with partial data
  const mergedData: Record<string, unknown> = { ...state.partialData }

  // Simple slot filling: assume input is the value for the first missing field
  if (state.missingFields && state.missingFields.length > 0) {
    const field = state.missingFields[0]
    mergedData[field] = input.trim()
  }

  // Check if we still have missing fields
  const remainingMissing = state.missingFields?.slice(1) || []

  if (remainingMissing.length > 0 && !mergedData.title) {
    return {
      threadId,
      status: 'CLARIFICATION_NEEDED',
      displayMessage: `Got it. What's the ${remainingMissing[0].replace(/_/g, ' ')}?`,
      serverState: {
        ...state,
        partialData: mergedData,
        missingFields: remainingMissing,
      },
    }
  }

  // All data collected - create the task
  const nodeType = state.pendingIntent === 'CREATE_CONTAINER' ? 'container' : 'item'
  const category = (typeof mergedData.category === 'string' ? mergedData.category : 'todo')

  const taskData = {
    user_id: userId,
    title: (typeof mergedData.title === 'string' ? mergedData.title : 'Untitled Task'),
    content: (typeof mergedData.content === 'string' ? mergedData.content : null),
    status: 'pending',
    priority: 5,
    manual_priority: (typeof mergedData.manual_priority === 'number' ? mergedData.manual_priority : 0),
    due_date: (typeof mergedData.due_date === 'string' ? mergedData.due_date : null),
    tags: (Array.isArray(mergedData.tags) ? mergedData.tags : []),
    parent_id: (typeof mergedData.parent_id === 'string' ? mergedData.parent_id : null),
    task_type: category === 'course' ? 'course' : category === 'project' ? 'project' : 'todo',
    type_metadata: {},
    node_type: nodeType,
    category: category,
  }

  const { data: task, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()

  if (error) {
    return {
      threadId,
      status: 'ERROR',
      displayMessage: `Failed to create task: ${error.message}`,
      error: error.message,
    }
  }

  return {
    threadId,
    status: 'SUCCESS',
    displayMessage: `Created "${task.title}"`,
    createdNodes: [task],
  }
}

/**
 * GET /api/agent/interact
 *
 * Get conversation history for a thread
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    // Require authentication - no fallback to shared UUID
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const threadId = searchParams.get('threadId')

    if (!threadId) {
      return NextResponse.json(
        { error: 'threadId is required' },
        { status: 400 }
      )
    }

    const { data: logs, error } = await supabase
      .from('agent_logs')
      .select('*')
      .eq('thread_id', threadId)
      .order('turn_index', { ascending: true })

    if (error) {
      console.error('Error fetching agent logs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch conversation history' },
        { status: 500 }
      )
    }

    return NextResponse.json({ logs })

  } catch (error) {
    console.error('Agent interact GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
