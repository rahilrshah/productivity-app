import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'

type TaskInsert = Database['public']['Tables']['tasks']['Insert']

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
    // Check authentication
    const authHeader = request.headers.get('authorization')
    const expectedSecret = process.env.CLAUDE_WEBHOOK_SECRET

    if (!expectedSecret) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { text, user_id } = body

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    if (!user_id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Parse the natural language input
    const parsedTask = parseNaturalLanguage(text)

    // Create Supabase client
    const supabase = createRouteHandlerSupabaseClient()
    
    // For webhook, we'll accept any user_id for now (in production you'd want to verify this)
    // You can add user validation here later if needed

    // Get the maximum position for ordering
    const { data: maxPositionData } = await supabase
      .from('tasks')
      .select('position')
      .eq('user_id', user_id)
      .order('position', { ascending: false })
      .limit(1)

    const nextPosition = maxPositionData?.[0]?.position ? maxPositionData[0].position + 1 : 0

    // Create the task
    const taskData: TaskInsert = {
      user_id: user_id,
      title: parsedTask.title,
      content: parsedTask.content || null,
      priority: parsedTask.priority,
      due_date: parsedTask.due_date || null,
      tags: parsedTask.tags,
      position: nextPosition,
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
  return NextResponse.json({ 
    message: 'Claude Webhook Endpoint',
    usage: 'POST with { "text": "your natural language task", "user_id": "your-user-id" }',
    auth: 'Bearer token required'
  })
}