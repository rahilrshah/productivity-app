import { supabase } from '@/lib/supabase/client'
import { keyManager } from '@/lib/encryption/keyManager'
import type { User } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  created_at: string
}

export interface AuthState {
  user: AuthUser | null
  loading: boolean
  initialized: boolean
}

export class AuthService {
  private static instance: AuthService
  private state: AuthState = {
    user: null,
    loading: true,
    initialized: false
  }
  private listeners: Array<(state: AuthState) => void> = []

  private constructor() {
    this.initialize()
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService()
    }
    return AuthService.instance
  }

  /**
   * Initialize auth service and set up listeners
   */
  private async initialize(): Promise<void> {
    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        await this.handleUserSession(session.user)
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        switch (event) {
          case 'SIGNED_IN':
            if (session?.user) {
              await this.handleUserSession(session.user)
            }
            break
          case 'SIGNED_OUT':
            await this.handleSignOut()
            break
          case 'TOKEN_REFRESHED':
            // Session is still valid, no action needed
            break
          case 'PASSWORD_RECOVERY':
            // Handle password recovery if needed
            break
        }
      })

      this.setState({ loading: false, initialized: true })
    } catch (error) {
      console.error('Failed to initialize auth service:', error)
      this.setState({ loading: false, initialized: true })
    }
  }

  /**
   * Handle user session when signed in
   */
  private async handleUserSession(user: User): Promise<void> {
    const authUser: AuthUser = {
      id: user.id,
      email: user.email!,
      created_at: user.created_at
    }

    this.setState({
      user: authUser,
      loading: false,
      initialized: true
    })

    // Initialize encryption keys would happen here after user provides password
    // For now, we'll skip this step as it requires UI interaction
  }

  /**
   * Handle sign out
   */
  private async handleSignOut(): Promise<void> {
    // Clear encryption keys
    keyManager.clearKeys()

    // Clear any local storage
    this.clearLocalData()

    this.setState({
      user: null,
      loading: false,
      initialized: true
    })
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string, userPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (data.user) {
        // Initialize encryption keys with user's chosen password
        await keyManager.initialize(userPassword)
        
        // Create user record with encrypted settings
        await this.createUserRecord(data.user.id, email)
      }

      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sign up failed' 
      }
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string, userPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        return { success: false, error: error.message }
      }

      if (data.user) {
        // Initialize encryption keys with user's password
        await keyManager.initialize(userPassword)
      }

      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Sign in failed' 
      }
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      })

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
  async updatePassword(newPassword: string, userPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        return { success: false, error: error.message }
      }

      // Update encryption keys with new password
      if (keyManager.isInitialized()) {
        // This would require the old user password to re-encrypt data
        // For now, we'll just reinitialize with the new password
        keyManager.clearKeys()
        await keyManager.initialize(userPassword)
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
   * Get current auth state
   */
  getState(): AuthState {
    return { ...this.state }
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener)
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.state.user !== null
  }

  /**
   * Check if encryption is initialized
   */
  isEncryptionReady(): boolean {
    return keyManager.isInitialized()
  }

  /**
   * Private helper methods
   */
  private setState(newState: Partial<AuthState>): void {
    this.state = { ...this.state, ...newState }
    this.listeners.forEach(listener => listener(this.state))
  }

  private async createUserRecord(userId: string, email: string): Promise<void> {
    try {
      // Create initial encrypted settings
      const defaultSettings = {
        theme: 'system',
        notifications: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }

      const encryptedSettings = await keyManager.encryptForPurpose(
        JSON.stringify(defaultSettings),
        'settings'
      )

      const { error } = await supabase
        .from('users')
        .insert({
          id: userId,
          email,
          encrypted_settings: encryptedSettings
        })

      if (error) {
        console.error('Failed to create user record:', error)
      }
    } catch (error) {
      console.error('Failed to create user record:', error)
    }
  }

  private clearLocalData(): void {
    // Clear any app-specific local storage
    const keysToRemove = [
      'task_cache',
      'sync_queue',
      'offline_changes'
    ]

    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    // Clear IndexedDB if needed
    // This would be implemented when we add IndexedDB support
  }
}

// Export singleton instance
export const authService = AuthService.getInstance()