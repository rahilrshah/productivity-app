import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({ 
      user_id: user.id,
      email: user.email,
      webhook_info: {
        endpoint: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/claude`,
        auth_header: `Bearer ${process.env.CLAUDE_WEBHOOK_SECRET}`,
        example_payload: {
          text: "Schedule dentist appointment tomorrow high priority",
          user_id: user.id
        }
      }
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}