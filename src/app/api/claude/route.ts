import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { getClaudeServerClient } from '@/lib/claude-server'
import { z } from 'zod'

// Request validation schemas
const ChatRequestSchema = z.object({
  action: z.literal('chat'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })),
  options: z.object({
    max_tokens: z.number().optional(),
    temperature: z.number().optional(),
    system: z.string().optional()
  }).optional()
})

const AnalyzeRequestSchema = z.object({
  action: z.literal('analyze'),
  tasks: z.array(z.object({
    title: z.string(),
    status: z.string().optional(),
    priority: z.number().optional(),
    due_date: z.string().nullable().optional(),
    created_at: z.string().optional(),
    tags: z.array(z.string()).optional()
  }))
})

const BreakdownRequestSchema = z.object({
  action: z.literal('breakdown'),
  title: z.string(),
  description: z.string().optional()
})

const SuggestRequestSchema = z.object({
  action: z.literal('suggest'),
  context: z.string(),
  existingTasks: z.array(z.object({
    title: z.string()
  })).optional()
})

const ParseTaskRequestSchema = z.object({
  action: z.literal('parseTask'),
  text: z.string(),
  context: z.object({
    defaultType: z.string().optional()
  }).optional()
})

const RequestSchema = z.discriminatedUnion('action', [
  ChatRequestSchema,
  AnalyzeRequestSchema,
  BreakdownRequestSchema,
  SuggestRequestSchema,
  ParseTaskRequestSchema
])

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const claude = getClaudeServerClient()

    if (!claude.isConfigured()) {
      return NextResponse.json(
        { error: 'Claude API is not configured. Contact administrator.' },
        { status: 503 }
      )
    }

    const body = await request.json()

    // Validate request
    const parseResult = RequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const data = parseResult.data

    switch (data.action) {
      case 'chat': {
        const response = await claude.chat(data.messages, data.options)
        return NextResponse.json({ result: response })
      }

      case 'analyze': {
        const analysis = await claude.analyzeProductivity(data.tasks as Parameters<typeof claude.analyzeProductivity>[0])
        return NextResponse.json({ result: analysis })
      }

      case 'breakdown': {
        const subtasks = await claude.suggestTaskBreakdown(data.title, data.description)
        return NextResponse.json({ result: subtasks })
      }

      case 'suggest': {
        const suggestions = await claude.generateTaskSuggestions(
          data.context,
          data.existingTasks as Parameters<typeof claude.generateTaskSuggestions>[1]
        )
        return NextResponse.json({ result: suggestions })
      }

      case 'parseTask': {
        const parsed = await claude.parseNaturalLanguageTask(data.text, data.context)
        return NextResponse.json({ result: parsed })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Claude API route error:', error)
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Check if Claude is configured (no auth required for status check)
  const claude = getClaudeServerClient()
  return NextResponse.json({ configured: claude.isConfigured() })
}
