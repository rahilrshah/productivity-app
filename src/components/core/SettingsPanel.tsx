'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OllamaStatus } from './OllamaStatus'
import { ClaudeSettings } from './ClaudeSettings'
import { PerformanceDashboard } from './PerformanceDashboard'
import { 
  Settings,
  Bot,
  Key,
  Zap,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react'

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'ollama' | 'claude' | 'performance'>('ollama')
  const [isExpanded, setIsExpanded] = useState(false)

  if (!isOpen) return null

  const tabs = [
    {
      id: 'ollama' as const,
      label: 'Ollama (Local AI)',
      icon: Bot,
      description: 'Local AI models for privacy'
    },
    {
      id: 'claude' as const,
      label: 'Claude API',
      icon: Key,
      description: 'Advanced AI capabilities'
    },
    {
      id: 'performance' as const,
      label: 'Performance',
      icon: Zap,
      description: 'App performance metrics'
    }
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className={`w-full max-w-4xl ${isExpanded ? 'max-h-[90vh]' : 'max-h-[80vh]'} flex flex-col`}>
        <CardHeader className="pb-4 flex-shrink-0">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Settings className="h-5 w-5" />
              <span>AI Configuration</span>
            </div>
            <div className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8 w-8 p-0"
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="flex space-x-1 mb-6 bg-muted p-1 rounded-lg flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'ollama' && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Configure local AI models using Ollama for privacy-focused, offline AI assistance.
                </div>
                <OllamaStatus />
              </div>
            )}

            {activeTab === 'claude' && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Connect to Claude API for advanced AI capabilities including sophisticated task analysis and natural language processing.
                </div>
                <ClaudeSettings />
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  Monitor and optimize application performance with detailed metrics and recommendations.
                </div>
                <PerformanceDashboard />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t flex justify-between items-center text-xs text-muted-foreground flex-shrink-0">
            <div>
              Configure your preferred AI backend for enhanced productivity features.
            </div>
            <Button onClick={onClose} variant="outline" size="sm">
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}