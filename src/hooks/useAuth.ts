'use client'

import { useState, useEffect } from 'react'
import { authService, type AuthState } from '@/lib/auth'

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>(() => authService.getState())

  useEffect(() => {
    const unsubscribe = authService.subscribe(setAuthState)
    return unsubscribe
  }, [])

  return {
    user: authState.user,
    loading: authState.loading,
    initialized: authState.initialized,
    isAuthenticated: authService.isAuthenticated(),
    isEncryptionReady: authService.isEncryptionReady(),
    signIn: authService.signIn.bind(authService),
    signUp: authService.signUp.bind(authService),
    signOut: authService.signOut.bind(authService),
    resetPassword: authService.resetPassword.bind(authService),
    updatePassword: authService.updatePassword.bind(authService),
  }
}