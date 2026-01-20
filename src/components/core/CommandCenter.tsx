'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Bot,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { processNaturalLanguage } from '@/lib/agent'
import { useOllama } from '@/lib/ollama'
import { Task } from '@/types'
import { AgentResult } from '@/lib/agent/types'

interface CommandCenterProps {
  onTasksCreated?: (tasks: Task[]) => void
}

// Default user ID for single-user mode (no auth required)
const DEFAULT_USER_ID = 'local-user'

export function CommandCenter({ onTasksCreated }: CommandCenterProps) {
  const { isAvailable } = useOllama()

  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<AgentResult | null>(null)
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [showCreatedTasks, setShowCreatedTasks] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Check Ollama availability on mount
  useEffect(() => {
    checkOllamaAvailability()
  }, [])

  const checkOllamaAvailability = async () => {
    const available = await isAvailable()
    setOllamaAvailable(available)
  }

  const handleExecute = async () => {
    if (!input.trim()) return

    setIsProcessing(true)
    setResult(null)

    try {
      const agentResult = await processNaturalLanguage(input, DEFAULT_USER_ID)
      setResult(agentResult)

      if (agentResult.success && agentResult.createdTasks.length > 0) {
        onTasksCreated?.(agentResult.createdTasks)
        setInput('') // Clear input on success
        setShowCreatedTasks(true)
      }
    } catch (error) {
      console.error('Command Center error:', error)
      setResult({
        success: false,
        intent: 'UNKNOWN',
        confidence: 0,
        actions: [],
        actionLog: ['Critical error occurred'],
        createdTasks: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleExecute()
    }
  }

  const resetState = () => {
    setResult(null)
    setShowCreatedTasks(false)
    textareaRef.current?.focus()
  }

  // Ollama unavailable state
  if (ollamaAvailable === false) {
    return (
      <div className="max-w-3xl mx-auto w-full space-y-6">
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            What are we organizing today?
          </h1>
          <p className="text-muted-foreground">
            Paste a syllabus, dump a project idea, or just clear your mind.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="p-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  AI Assistant Unavailable
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Ollama is not running. The Command Center requires a local Ollama instance.
                </p>
                <div className="mt-4 space-y-2 text-sm text-amber-700 dark:text-amber-300">
                  <p>To get started:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Install Ollama from <span className="font-mono">ollama.com</span></li>
                    <li>Run <span className="font-mono bg-amber-200 dark:bg-amber-800 px-1 rounded">ollama serve</span></li>
                    <li>Pull a model: <span className="font-mono bg-amber-200 dark:bg-amber-800 px-1 rounded">ollama pull llama3.1:8b</span></li>
                  </ol>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkOllamaAvailability}
                  className="mt-4"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Connection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          What are we organizing today?
        </h1>
        <p className="text-muted-foreground">
          Paste a syllabus, dump a project idea, or just clear your mind.
        </p>
      </div>

      {/* Input Card */}
      <Card className="relative shadow-xl border-2 border-muted/40 focus-within:border-blue-500/50 transition-all duration-300">
        <CardContent className="p-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., 'Here is the syllabus for History 101...' or 'Plan a ski trip for next week...' or just 'Buy groceries tomorrow'"
            className="min-h-[200px] resize-none border-none focus-visible:ring-0 text-base p-4 leading-relaxed"
            disabled={isProcessing}
          />

          <div className="flex items-center justify-between p-2 border-t">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <Bot className="h-3 w-3 mr-1" />
                Ollama
              </Badge>
              <span className="text-xs text-muted-foreground hidden sm:inline-block">
                {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} + Enter to execute
              </span>
            </div>

            <Button
              onClick={handleExecute}
              disabled={isProcessing || !input.trim()}
              className="rounded-full px-6 shadow-lg bg-blue-600 hover:bg-blue-700 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Make it Happen
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Result / Action Log */}
      {result && (
        <Card
          className={`animate-in slide-in-from-bottom-4 ${
            result.success
              ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20'
              : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
          }`}
        >
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  {result.success ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-green-800 dark:text-green-200">
                        Actions Completed
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <span className="text-red-800 dark:text-red-200">
                        Processing Failed
                      </span>
                    </>
                  )}
                </h3>
                <Badge variant="outline" className="text-xs">
                  {result.intent}
                </Badge>
              </div>

              {/* Action Log */}
              <ul className="space-y-1">
                {result.actionLog.map((log, i) => (
                  <li
                    key={i}
                    className={`text-sm flex items-start gap-2 ${
                      result.success
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    }`}
                  >
                    <ArrowRight className="h-4 w-4 mt-0.5 opacity-50 flex-shrink-0" />
                    {log}
                  </li>
                ))}
              </ul>

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="text-sm text-red-700 dark:text-red-300">
                  {result.errors.map((error, i) => (
                    <p key={i}>{error}</p>
                  ))}
                </div>
              )}

              {/* Created Tasks Preview */}
              {result.createdTasks.length > 0 && (
                <div className="pt-2 border-t border-green-200 dark:border-green-800">
                  <button
                    onClick={() => setShowCreatedTasks(!showCreatedTasks)}
                    className="w-full flex items-center justify-between text-sm text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200"
                  >
                    <span>
                      {result.createdTasks.length} task{result.createdTasks.length !== 1 ? 's' : ''} created
                    </span>
                    {showCreatedTasks ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {showCreatedTasks && (
                    <ul className="mt-2 space-y-1">
                      {result.createdTasks.map((task) => (
                        <li
                          key={task.id}
                          className="text-sm text-green-700 dark:text-green-300 pl-4 border-l-2 border-green-300 dark:border-green-700"
                        >
                          <span className="font-medium">{task.title}</span>
                          {task.parent_id && (
                            <span className="text-xs text-green-600 dark:text-green-400 ml-2">
                              (child task)
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Reset Button */}
              {result.success && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  className="w-full mt-2"
                >
                  Create Another
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Examples Section */}
      {!result && !isProcessing && (
        <Card className="border-dashed">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Try these examples:
            </h3>
            <div className="space-y-2">
              {[
                {
                  label: 'Syllabus',
                  text: 'CS101 Introduction to Programming - Fall 2025\nInstructor: Dr. Smith\nAssignments:\n- Homework 1: Due Sept 15, 10%\n- Midterm: Oct 20, 30%\n- Final Project: Dec 10, 40%',
                },
                {
                  label: 'Project',
                  text: 'Build a personal finance tracker app\nFeatures: expense tracking, budget alerts, monthly reports\nGoal: MVP by end of Q1',
                },
                {
                  label: 'Quick Task',
                  text: 'Call dentist tomorrow at 2pm to schedule appointment',
                },
              ].map((example, index) => (
                <button
                  key={index}
                  onClick={() => setInput(example.text)}
                  className="w-full text-left text-sm p-3 rounded-lg border border-transparent hover:border-muted hover:bg-muted/50 transition-colors"
                >
                  <Badge variant="outline" className="mb-1">
                    {example.label}
                  </Badge>
                  <p className="text-muted-foreground line-clamp-2">
                    {example.text}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
