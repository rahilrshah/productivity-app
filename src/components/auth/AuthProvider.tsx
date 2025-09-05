'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { AuthModal } from './AuthModal'

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { loading, initialized, isAuthenticated } = useAuth()
  const [isClient, setIsClient] = useState(false)

  // Prevent hydration mismatch by only rendering after client mount
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Don't render anything until we're on the client
  if (!isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

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