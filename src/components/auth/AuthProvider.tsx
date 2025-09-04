'use client'

import { useAuth } from '@/hooks/useAuth'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { AuthModal } from './AuthModal'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { loading, initialized, isAuthenticated } = useAuth()

  // Show loading spinner while initializing
  if (!initialized || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // Show auth modal if not authenticated
  if (!isAuthenticated) {
    return <AuthModal />
  }

  // User is authenticated, show the app
  return <>{children}</>
}