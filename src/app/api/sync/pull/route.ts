import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server'

// Maximum number of sync records to return per request
const MAX_SYNC_RECORDS = 100

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('device_id')
    const since = searchParams.get('since') // ISO timestamp

    if (!deviceId) {
      return NextResponse.json({ error: 'device_id is required' }, { status: 400 })
    }

    // Validate deviceId format
    if (deviceId.length > 100) {
      return NextResponse.json({ error: 'Invalid device_id' }, { status: 400 })
    }

    let query = supabase
      .from('sync_log')
      .select('*')
      .eq('user_id', user.id)
      .neq('device_id', deviceId) // Don't sync back our own changes
      .order('synced_at', { ascending: true })
      .limit(MAX_SYNC_RECORDS) // Prevent memory exhaustion

    if (since) {
      query = query.gte('synced_at', since)
    }

    const { data: syncLogs, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch sync data' }, { status: 500 })
    }

    // Group changes by entity
    const changesByEntity: Record<string, any[]> = {}
    
    for (const log of syncLogs || []) {
      const key = `${log.entity_type}:${log.entity_id}`
      if (!changesByEntity[key]) {
        changesByEntity[key] = []
      }
      changesByEntity[key].push(log)
    }

    // Apply CRDT conflict resolution and get final state for each entity
    const resolvedChanges = []
    
    for (const [, changes] of Object.entries(changesByEntity)) {
      // Sort by vector clock to resolve conflicts
      changes.sort((a, b) => {
        // Simple timestamp-based conflict resolution for now
        // In a full CRDT implementation, this would be more sophisticated
        return new Date(a.synced_at).getTime() - new Date(b.synced_at).getTime()
      })

      const finalChange = changes[changes.length - 1]
      
      resolvedChanges.push({
        operation: finalChange.operation,
        entity_type: finalChange.entity_type,
        entity_id: finalChange.entity_id,
        data: finalChange.changes,
        vector_clock: finalChange.vector_clock,
        synced_at: finalChange.synced_at
      })
    }

    // Check if there are more records to fetch
    const hasMore = (syncLogs?.length || 0) === MAX_SYNC_RECORDS

    return NextResponse.json({
      changes: resolvedChanges,
      timestamp: new Date().toISOString(),
      hasMore,
      limit: MAX_SYNC_RECORDS
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}