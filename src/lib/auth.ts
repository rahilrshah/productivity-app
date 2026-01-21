'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { User } from '@supabase/supabase-js'

export interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
}

export interface AuthResult {
  success: boolean
  error?: string
}

/**
 * Authentication service that handles both Supabase auth and encryption key management
 */
class AuthService {
  private supabase = createClientComponentClient()
  private state: AuthState = {
    user: null,
    loading: false,
    initialized: false,
  }
  private subscribers = new Set<(state: AuthState) => void>()

  constructor() {
    this.initialize()
  }

  /**
   * Initialize the auth service and check current session
   */
  private async initialize() {
    this.setState({ loading: true })

    try {
      console.log('Auth service initializing...')
      console.log('Supabase client config:', {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      })
      
      // Check current session
      const { data: { session }, error } = await this.supabase.auth.getSession()
      
      console.log('Session check detailed result:', { 
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        userEmail: session?.user?.email,
        sessionError: error,
        accessToken: session?.access_token ? 'present' : 'missing'
      })
      
      if (session?.user) {
        console.log('User found, setting authenticated state')
        this.setState({ 
          user: session.user, 
          loading: false, 
          initialized: true 
        })
      } else {
        console.log('No user found, setting unauthenticated state')
        this.setState({ 
          user: null, 
          loading: false, 
          initialized: true 
        })
      }

      // Listen for auth changes
      this.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          this.setState({ 
            user: session.user,
            loading: false 
          })
        } else if (event === 'SIGNED_OUT') {
          await this.handleSignOut()
        }
      })
    } catch (error) {
      console.error('Failed to initialize auth service:', error)
      this.setState({ 
        user: null, 
        loading: false, 
        initialized: true 
      })
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    this.setState({ loading: true })

    try {
      console.log('Starting sign in for email:', email)
      
      // First authenticate with Supabase
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('Sign in response:', {
        hasUser: !!data.user,
        hasSession: !!data.session,
        userId: data.user?.id,
        error: error?.message,
        errorCode: error?.name
      })

      if (error) {
        console.error('Sign in error:', error)
        this.setState({ loading: false })
        return { success: false, error: error.message }
      }

      if (!data.user) {
        console.error('No user returned from sign in')
        this.setState({ loading: false })
        return { success: false, error: 'No user returned from authentication' }
      }

      console.log('Sign in successful, updating state')
      this.setState({
        user: data.user,
        loading: false,
      })

      return { success: true }
    } catch (error) {
      this.setState({ loading: false })
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sign in failed' 
      }
    }
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string): Promise<AuthResult> {
    this.setState({ loading: true })

    try {
      console.log('Starting sign up for email:', email)
      
      // First create account with Supabase
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
      })

      console.log('Sign up response:', {
        hasUser: !!data.user,
        hasSession: !!data.session,
        userId: data.user?.id,
        userConfirmedAt: data.user?.confirmed_at,
        error: error?.message,
        errorCode: error?.name
      })

      if (error) {
        console.error('Sign up error:', error)
        this.setState({ loading: false })
        return { success: false, error: error.message }
      }

      // Check if email confirmation is required
      if (!data.user && !data.session) {
        console.log('Email confirmation required')
        this.setState({ loading: false })
        return { 
          success: true, 
          error: 'Please check your email and click the confirmation link to complete registration.' 
        }
      }

      if (!data.user) {
        console.error('No user returned from sign up')
        this.setState({ loading: false })
        return { success: false, error: 'No user returned from registration' }
      }

      console.log('Sign up successful, updating state')
      this.setState({
        user: data.user,
        loading: false,
      })

      return { success: true }
    } catch (error) {
      this.setState({ loading: false })
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sign up failed' 
      }
    }
  }

  /**
   * Sign out and clear all data
   */
  async signOut(): Promise<void> {
    this.setState({ loading: true })
    
    try {
      await this.supabase.auth.signOut()
      await this.handleSignOut()
    } catch (error) {
      console.error('Error during sign out:', error)
      await this.handleSignOut() // Force cleanup even if API call fails
    }
  }

  /**
   * Handle cleanup after sign out
   */
  private async handleSignOut(): Promise<void> {
    this.setState({
      user: null,
      loading: false,
    })
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<AuthResult> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email)
      
      if (error) {
        return { success: false, error: error.message }
      }
      
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Password reset failed' 
      }
    }
  }

  /**
   * Update password
   */
  async updatePassword(newPassword: string): Promise<AuthResult> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Password update failed' 
      }
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.state.user !== null
  }


  /**
   * Get current auth state
   */
  getState(): AuthState {
    return this.state
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback: (state: AuthState) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  /**
   * Update state and notify subscribers
   */
  private setState(updates: Partial<AuthState>): void {
    this.state = { ...this.state, ...updates }
    this.subscribers.forEach(callback => callback(this.state))
  }
}

// Export singleton instance
export const authService = new AuthService()