'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useClaude } from '@/lib/claude'
import { 
  Key,
  Check, 
  X, 
  Eye, 
  EyeOff,
  AlertTriangle,
  ExternalLink,
  Zap,
  Settings
} from 'lucide-react'

export function ClaudeSettings() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isTestingConnection, setIsTestingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const { client, isConfigured, setApiKey: saveApiKey, clearApiKey } = useClaude()

  useEffect(() => {
    const existingKey = client.getApiKey()
    if (existingKey) {
      setApiKey(existingKey)
      setConnectionStatus('success')
    }
  }, [client])

  const handleSaveKey = () => {
    if (apiKey.trim()) {
      saveApiKey(apiKey.trim())
      testConnection()
    }
  }

  const handleClearKey = () => {
    clearApiKey()
    setApiKey('')
    setConnectionStatus('idle')
    setErrorMessage('')
  }

  const testConnection = async () => {
    if (!apiKey.trim()) return

    setIsTestingConnection(true)
    setErrorMessage('')

    try {
      // Save the key temporarily for testing
      const tempClient = client
      tempClient.setApiKey(apiKey.trim())

      // Test with a simple message
      const response = await tempClient.chat([
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
      console.error('Claude connection test failed:', error)
    } finally {
      setIsTestingConnection(false)
    }
  }

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'success':
        return (
          <Badge variant="default" className="text-xs">
            <Check className="h-3 w-3 mr-1" />
            Connected
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
        {/* API Key Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="claude-api-key">Claude API Key</Label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Input
                  id="claude-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button
                onClick={handleSaveKey}
                disabled={!apiKey.trim() || isTestingConnection}
                size="sm"
              >
                Save
              </Button>
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Get your API key from{' '}
                <a 
                  href="https://console.anthropic.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center"
                >
                  Anthropic Console
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </span>
              
              {isConfigured() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearKey}
                  className="text-destructive hover:text-destructive h-6 px-2"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Connection Test */}
          {apiKey && (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testConnection}
                disabled={isTestingConnection || !apiKey.trim()}
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
          )}

          {/* Error Message */}
          {connectionStatus === 'error' && errorMessage && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Connection Failed</p>
                  <p className="text-xs text-destructive/80 mt-1">{errorMessage}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Make sure your API key is valid and you have sufficient credits.
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
                  isConfigured() && connectionStatus === 'success'
                    ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
                    : 'bg-muted/50 border-muted'
                }`}
              >
                <feature.icon 
                  className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                    isConfigured() && connectionStatus === 'success'
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
                {isConfigured() && connectionStatus === 'success' && (
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Usage Info */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700 dark:text-blue-300">
              <p className="font-medium">Usage & Privacy</p>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                <li>Your API key is stored locally in your browser</li>
                <li>Claude API requests are made directly from your browser</li>
                <li>Standard Anthropic usage rates apply</li>
                <li>Task data is only sent to Claude when you explicitly use AI features</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}