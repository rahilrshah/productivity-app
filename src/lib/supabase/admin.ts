/**
 * Admin Supabase Client
 *
 * Creates a privileged Supabase client for background workers to bypass RLS.
 * Use ONLY in background jobs (Cron, Workers) - never in client-side code.
 *
 * SECURITY: This client uses the service role key which bypasses all RLS policies.
 * Only use for server-side operations that need elevated privileges.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

let adminClient: SupabaseClient | null = null

/**
 * Creates or returns a cached admin Supabase client
 *
 * @returns Supabase client with service role privileges
 * @throws Error if required environment variables are not configured
 */
export function createAdminClient(): SupabaseClient {
  // Return cached client if available
  if (adminClient) {
    return adminClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL environment variable. ' +
      'This is required for the admin client.'
    )
  }

  if (!supabaseServiceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
      'This is required for the admin client and should only be available on the server.'
    )
  }

  adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}

/**
 * Gets the admin client (alias for createAdminClient)
 */
export const getAdminClient = createAdminClient

/**
 * Resets the cached admin client (useful for testing)
 */
export function resetAdminClient(): void {
  adminClient = null
}
