'use client'

import { getOllamaClient, OllamaResponse } from '@/lib/ollama'

/**
 * Legacy intent types (v2.0 - 5 intents)
 * Used by: old agent.ts, ollama.ts classifyIntent
 */
export type LegacyIntent = 'SYLLABUS' | 'PROJECT_BRAINSTORM' | 'QUICK_TASK' | 'SCHEDULE_REQUEST' | 'UNKNOWN'

/**
 * Graph intent types (v3.0 - 9 intents)
 * Used by: stateful agent, API routes
 */
export type GraphIntent =
  | 'COURSE_TASK'
  | 'PROJECT_TASK'
  | 'CLUB_TASK'
  | 'ROUTINE'
  | 'QUICK_TODO'
  | 'JOURNAL'
  | 'CREATE_CONTAINER'
  | 'SCHEDULE_REQUEST'
  | 'UNKNOWN'

/**
 * Union type for all intents
 */
export type Intent = LegacyIntent | GraphIntent

/**
 * Classification result with extracted entities
 */
export interface IntentClassification<T extends Intent = Intent> {
  intent: T
  confidence: number
  entities: Record<string, string>
}

/**
 * Classification mode determines which set of intents to use
 */
export type ClassificationMode = 'legacy' | 'graph'

/**
 * System prompts for each mode
 */
const LEGACY_SYSTEM_PROMPT = `You are an intent classifier for a productivity app.

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
  "entities": { "key": "value" }
}

Do not include any other text, only the JSON object.`

const buildGraphSystemPrompt = (containerContext: string) => `You are an intent classifier for a productivity app with a graph-based task architecture.

CONTEXT - Active containers (courses/projects/clubs):
${containerContext || 'No active containers'}

Classify the user input into ONE of these intents:
- COURSE_TASK: Task related to a course, assignment, exam, study (maps to category: course)
- PROJECT_TASK: Task related to a project, milestone, feature, development (maps to category: project)
- CLUB_TASK: Task related to club activities, meetings, events (maps to category: club)
- ROUTINE: Daily/weekly recurring task, habit (maps to category: routine)
- QUICK_TODO: Simple one-off task (maps to category: todo)
- JOURNAL: Reflection, note, thought capture (maps to category: journal)
- CREATE_CONTAINER: User wants to create a new course/project/club
- SCHEDULE_REQUEST: Scheduling, time blocking, rescheduling
- UNKNOWN: Cannot determine intent

Also extract:
- title: A concise title for the task/item
- parent_container: If this belongs under an existing container, which one?
- category: The graph category (course/project/club/routine/todo/journal)
- due_date: Any mentioned deadline
- priority_hint: "high", "medium", "low" if mentioned

Respond ONLY with JSON:
{
  "intent": "INTENT_NAME",
  "confidence": 0.0,
  "entities": { "title": "", "parent_container": "", "category": "", "due_date": "", "priority_hint": "" }
}`

/**
 * Unified intent classifier supporting both legacy and graph modes
 *
 * @param input - User input text to classify
 * @param mode - Classification mode ('legacy' for 5 intents, 'graph' for 9 intents)
 * @param containerContext - Optional context about active containers (for graph mode)
 * @param model - Ollama model to use for classification
 * @returns Classification result with intent, confidence, and extracted entities
 */
export async function classifyIntent<T extends ClassificationMode>(
  input: string,
  mode: T,
  containerContext?: string,
  model: string = 'llama3.1:8b'
): Promise<IntentClassification<T extends 'legacy' ? LegacyIntent : GraphIntent>> {
  const client = getOllamaClient()

  const systemPrompt = mode === 'legacy'
    ? LEGACY_SYSTEM_PROMPT
    : buildGraphSystemPrompt(containerContext || '')

  try {
    const response = await client.chat(model, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.substring(0, 2000) }
    ], { temperature: 0.3 }) as OllamaResponse

    const content = response.message.content.trim()

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        intent: parsed.intent || (mode === 'legacy' ? 'UNKNOWN' : 'UNKNOWN'),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        entities: parsed.entities || parsed.extractedEntities || {}
      } as IntentClassification<T extends 'legacy' ? LegacyIntent : GraphIntent>
    }

    return {
      intent: mode === 'legacy' ? 'UNKNOWN' : 'UNKNOWN',
      confidence: 0,
      entities: {}
    } as IntentClassification<T extends 'legacy' ? LegacyIntent : GraphIntent>
  } catch (error) {
    console.error('Error classifying intent:', error)
    return {
      intent: mode === 'legacy' ? 'UNKNOWN' : 'QUICK_TODO',
      confidence: mode === 'legacy' ? 0 : 0.3,
      entities: {}
    } as IntentClassification<T extends 'legacy' ? LegacyIntent : GraphIntent>
  }
}

/**
 * Maps graph intents to legacy intents for backward compatibility
 */
export function graphIntentToLegacy(graphIntent: GraphIntent): LegacyIntent {
  switch (graphIntent) {
    case 'COURSE_TASK':
      return 'SYLLABUS'
    case 'PROJECT_TASK':
    case 'CREATE_CONTAINER':
      return 'PROJECT_BRAINSTORM'
    case 'CLUB_TASK':
    case 'ROUTINE':
    case 'QUICK_TODO':
    case 'JOURNAL':
      return 'QUICK_TASK'
    case 'SCHEDULE_REQUEST':
      return 'SCHEDULE_REQUEST'
    case 'UNKNOWN':
    default:
      return 'UNKNOWN'
  }
}

/**
 * Maps legacy intents to the most appropriate graph intent
 */
export function legacyIntentToGraph(legacyIntent: LegacyIntent): GraphIntent {
  switch (legacyIntent) {
    case 'SYLLABUS':
      return 'COURSE_TASK'
    case 'PROJECT_BRAINSTORM':
      return 'PROJECT_TASK'
    case 'QUICK_TASK':
      return 'QUICK_TODO'
    case 'SCHEDULE_REQUEST':
      return 'SCHEDULE_REQUEST'
    case 'UNKNOWN':
    default:
      return 'UNKNOWN'
  }
}

/**
 * Maps graph intent to task category
 */
export function intentToCategory(intent: GraphIntent): string {
  switch (intent) {
    case 'COURSE_TASK':
      return 'course'
    case 'PROJECT_TASK':
    case 'CREATE_CONTAINER':
      return 'project'
    case 'CLUB_TASK':
      return 'club'
    case 'ROUTINE':
      return 'routine'
    case 'JOURNAL':
      return 'journal'
    case 'QUICK_TODO':
    case 'SCHEDULE_REQUEST':
    case 'UNKNOWN':
    default:
      return 'todo'
  }
}

// Export convenience functions for each mode
export const classifyLegacyIntent = (input: string, model?: string) =>
  classifyIntent(input, 'legacy', undefined, model)

export const classifyGraphIntent = (input: string, containerContext?: string, model?: string) =>
  classifyIntent(input, 'graph', containerContext, model)
