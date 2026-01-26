'use client'

import { Component, ReactNode, ErrorInfo } from 'react'
import { isAppError, AppError } from '@/lib/errors'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** Optional context name for better error tracking */
  context?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary component for catching and displaying errors gracefully
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary context="TaskList" onError={logError}>
 *   <TaskList />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary
 *   fallback={(error, reset) => (
 *     <div>
 *       <p>Error: {error.message}</p>
 *       <button onClick={reset}>Try Again</button>
 *     </div>
 *   )}
 * >
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log error details
    const context = this.props.context || 'Unknown'
    console.error(`[ErrorBoundary:${context}] Caught error:`, error)
    console.error('Component stack:', errorInfo.componentStack)

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // In production, this would send to error tracking service
    // e.g., Sentry.captureException(error, { extra: { errorInfo, context } })
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, fallback } = this.props

    if (hasError && error) {
      // Custom fallback function
      if (typeof fallback === 'function') {
        return fallback(error, this.resetError)
      }

      // Custom fallback element
      if (fallback) {
        return fallback
      }

      // Default error UI
      return <DefaultErrorFallback error={error} onReset={this.resetError} />
    }

    return children
  }
}

/**
 * Default error fallback UI component
 */
interface DefaultErrorFallbackProps {
  error: Error
  onReset: () => void
}

function DefaultErrorFallback({ error, onReset }: DefaultErrorFallbackProps): ReactNode {
  const isOperational = isAppError(error) && (error as AppError).isOperational

  return (
    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
            {isOperational ? 'Something went wrong' : 'An unexpected error occurred'}
          </h3>
          <div className="mt-2 text-sm text-red-700 dark:text-red-300">
            <p>{error.message}</p>
            {isAppError(error) && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Error code: {(error as AppError).code}
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-800 hover:bg-red-200 dark:hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-3 py-1.5 border border-red-300 dark:border-red-600 text-xs font-medium rounded-md text-red-700 dark:text-red-200 bg-white dark:bg-transparent hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <details className="mt-4">
          <summary className="text-xs text-red-600 dark:text-red-400 cursor-pointer">
            Technical details
          </summary>
          <pre className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-800 dark:text-red-200 overflow-auto max-h-40">
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  )
}

/**
 * Hook-based error boundary wrapper for functional components
 * Use this when you need to catch errors in a specific part of your component
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = Component.displayName || Component.name || 'Component'

  const WrappedComponent: React.FC<P> = (props) => (
    <ErrorBoundary {...options} context={options?.context || displayName}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${displayName})`

  return WrappedComponent
}

export default ErrorBoundary
