import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'
import { timingSafeEqual } from 'crypto'

type TaskInsert = Database['public']['Tables']['tasks']['Insert']

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false
  }

  // Ensure both strings are the same length for comparison
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.length !== bBuffer.length) {
    // Still do a comparison to maintain constant time
    const dummy = Buffer.alloc(aBuffer.length)
    timingSafeEqual(aBuffer, dummy)
    return false
  }

  return timingSafeEqual(aBuffer, bBuffer)
}

interface ParsedTask {
  title: string
  content?: string
  priority: number
  due_date?: string
  tags: string[]
}

// Natural language parsing function
function parseNaturalLanguage(input: string): ParsedTask {
  const lowercaseInput = input.toLowerCase()
  
  // Extract priority
  let priority = 5 // default
  if (lowercaseInput.includes('urgent') || lowercaseInput.includes('critical')) {
    priority = 1
  } else if (lowercaseInput.includes('high priority') || lowercaseInput.includes('important')) {
    priority = 2
  } else if (lowercaseInput.includes('low priority') || lowercaseInput.includes('low')) {
    priority = 8
  }

  // Extract due dates
  let due_date: string | undefined
  const today = new Date()
  
  if (lowercaseInput.includes('tomorrow')) {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    due_date = tomorrow.toISOString().split('T')[0]
  } else if (lowercaseInput.includes('today')) {
    due_date = today.toISOString().split('T')[0]
  } else if (lowercaseInput.includes('next week')) {
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    due_date = nextWeek.toISOString().split('T')[0]
  } else if (lowercaseInput.includes('friday')) {
    const friday = new Date(today)
    const daysUntilFriday = (5 - friday.getDay() + 7) % 7
    if (daysUntilFriday === 0) friday.setDate(friday.getDate() + 7) // next Friday if today is Friday
    else friday.setDate(friday.getDate() + daysUntilFriday)
    due_date = friday.toISOString().split('T')[0]
  } else if (lowercaseInput.includes('monday')) {
    const monday = new Date(today)
    const daysUntilMonday = (1 - monday.getDay() + 7) % 7
    if (daysUntilMonday === 0) monday.setDate(monday.getDate() + 7) // next Monday if today is Monday
    else monday.setDate(monday.getDate() + daysUntilMonday)
    due_date = monday.toISOString().split('T')[0]
  }

  // Extract tags
  const tags: string[] = []
  if (lowercaseInput.includes('personal') || lowercaseInput.includes('tagged as personal')) {
    tags.push('personal')
  }
  if (lowercaseInput.includes('work') || lowercaseInput.includes('tagged as work')) {
    tags.push('work')
  }
  if (lowercaseInput.includes('shopping') || lowercaseInput.includes('grocery')) {
    tags.push('shopping')
  }
  if (lowercaseInput.includes('health') || lowercaseInput.includes('medical') || lowercaseInput.includes('appointment')) {
    tags.push('health')
  }

  // Extract title (remove priority and time indicators)
  let title = input
    .replace(/urgent|critical|high priority|important|low priority|low/gi, '')
    .replace(/tomorrow|today|next week|friday|monday|by friday|by monday/gi, '')
    .replace(/tagged as \w+/gi, '')
    .replace(/add task:?|create task:?|schedule:?|add:?/gi, '')
    .trim()
    .replace(/^[:\-]\s*/, '') // remove leading colons or dashes

  if (!title) {
    title = 'New task'
  }

  // Clean up title
  title = title.charAt(0).toUpperCase() + title.slice(1)

  return {
    title,
    priority,
    due_date,
    tags
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication using constant-time comparison
    const authHeader = request.headers.get('authorization')
    const expectedSecret = process.env.CLAUDE_WEBHOOK_SECRET

    if (!expectedSecret) {
      // Log server-side but don't expose details to client
      console.error('CLAUDE_WEBHOOK_SECRET not configured')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    // Validate auth header format and compare securely
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providedToken = authHeader.slice(7) // Remove 'Bearer ' prefix
    if (!secureCompare(providedToken, expectedSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { text, user_id } = body

    // Validate text
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    // Limit text length to prevent abuse
    if (text.length > 5000) {
      return NextResponse.json({ error: 'Text too long' }, { status: 400 })
    }

    // Validate user_id format (UUID)
    if (!user_id || typeof user_id !== 'string') {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(user_id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }

    // Parse the natural language input
    const parsedTask = parseNaturalLanguage(text)

    // Create Supabase client
    const supabase = createRouteHandlerSupabaseClient()
    
    // For webhook, we'll accept any user_id for now (in production you'd want to verify this)
    // You can add user validation here later if needed

    // Create the task
    const taskData: TaskInsert = {
      user_id: user_id,
      title: parsedTask.title,
      content: parsedTask.content || null,
      priority: parsedTask.priority,
      due_date: parsedTask.due_date || null,
      tags: parsedTask.tags,
      status: 'pending'
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert(taskData)
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    // Return success response with created task details
    return NextResponse.json({ 
      success: true,
      message: `Task created successfully: "${task.title}"`,
      task: {
        id: task.id,
        title: task.title,
        priority: task.priority,
        due_date: task.due_date,
        tags: task.tags
      }
    }, { status: 201 })

  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  // Don't expose any details about the webhook configuration
  return NextResponse.json({
    message: 'Webhook endpoint',
    status: 'active'
  })
}