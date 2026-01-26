'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useClaude } from '@/lib/claude'
import {
  Key,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  Zap,
  Settings,
  Shield
} from 'lucide-react'

export function ClaudeSettings() {
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const { client, isConfigured } = useClaude()

  // Check configuration status on mount
  useEffect(() => {
    checkConfiguration()
  }, [])

  const checkConfiguration = async () => {
    setConnectionStatus('checking')
    try {
      const configured = await isConfigured()
      setConnectionStatus(configured ? 'success' : 'idle')
    } catch {
      setConnectionStatus('idle')
    }
  }

  const testConnection = async () => {
    setIsTestingConnection(true)
    setErrorMessage('')

    try {
      // Test with a simple message through the server
      const response = await client.chat([
        { role: 'user', content: 'Hello, can you respond with just "Connection successful"?' }
      ], { max_tokens: 50 })

      if (typeof response === 'object' && 'content' in response) {
        setConnectionStatus('success')
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      setConnectionStatus('error')
      const errorMsg = error instanceof Error ? error.message : 'Connection test failed'
      setErrorMessage(errorMsg)
    } finally {
      setIsTestingConnection(false)
    }
  }

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'checking':
        return (
          <Badge variant="secondary" className="text-xs">
            Checking...
          </Badge>
        )
      case 'success':
        return (
          <Badge variant="default" className="text-xs">
            <Check className="h-3 w-3 mr-1" />
            Configured
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive" className="text-xs">
            <X className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-xs">
            Not configured
          </Badge>
        )
    }
  }

  const features = [
    {
      icon: Zap,
      title: 'Advanced Task Analysis',
      description: 'Deep productivity insights and pattern analysis'
    },
    {
      icon: Settings,
      title: 'Intelligent Task Breakdown',
      description: 'Automatically break complex tasks into subtasks'
    },
    {
      icon: Key,
      title: 'Priority Optimization',
      description: 'AI-powered task prioritization recommendations'
    }
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Key className="h-5 w-5 text-purple-600" />
            <span>Claude AI Configuration</span>
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Server-side Configuration Notice */}
        <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
          <div className="flex items-start space-x-3">
            <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-300">
                Secure Server-Side Configuration
              </p>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Claude API keys are now securely stored on the server. This protects your API key
                from XSS attacks and unauthorized access.
              </p>
              {connectionStatus !== 'success' && (
                <p className="text-sm text-muted-foreground mt-2">
                  Contact your administrator to configure the CLAUDE_API_KEY environment variable.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Connection Test */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={testConnection}
              disabled={isTestingConnection || connectionStatus === 'checking'}
            >
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </Button>

            {connectionStatus === 'success' && (
              <span className="text-xs text-green-600 flex items-center">
                <Check className="h-3 w-3 mr-1" />
                Connection verified
              </span>
            )}
          </div>

          {/* Error Message */}
          {connectionStatus === 'error' && errorMessage && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Connection Failed</p>
                  <p className="text-xs text-destructive/80 mt-1">{errorMessage}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Make sure CLAUDE_API_KEY is configured on the server.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Claude AI Features</h4>
          <div className="space-y-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`flex items-start space-x-3 p-3 rounded-lg border ${
                  connectionStatus === 'success'
                    ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
                    : 'bg-muted/50 border-muted'
                }`}
              >
                <feature.icon
                  className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                    connectionStatus === 'success'
                      ? 'text-green-600'
                      : 'text-muted-foreground'
                  }`}
                />
                <div className="flex-1">
                  <h5 className="font-medium text-sm">{feature.title}</h5>
                  <p className="text-xs text-muted-foreground mt-1">
                    {feature.description}
                  </p>
                </div>
                {connectionStatus === 'success' && (
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Documentation Link */}
        <div className="text-xs text-muted-foreground">
          <span>
            Learn more about Claude AI at{' '}
            <a
              href="https://docs.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline inline-flex items-center"
            >
              Anthropic Documentation
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
