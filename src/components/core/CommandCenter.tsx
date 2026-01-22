'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
  History,
  MessageSquare,
  X,
} from 'lucide-react'
import { useOllama } from '@/lib/ollama'
import { Task } from '@/types'
import { AgentInteractResponse, AgentContextState, GraphNode } from '@/types/graph'

interface CommandCenterProps {
  onTasksCreated?: (tasks: Task[]) => void
}

// Conversation message type
interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  createdNodes?: GraphNode[]
}

// Thread metadata
interface ThreadInfo {
  threadId: string
  lastMessage: string
  turnCount: number
  createdAt: string
}

export function CommandCenter({ onTasksCreated }: CommandCenterProps) {
  const { isAvailable } = useOllama()

  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [showCreatedTasks, setShowCreatedTasks] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // New state for conversation management
  const [threadId, setThreadId] = useState<string | null>(null)
  const [clientState, setClientState] = useState<AgentContextState | undefined>(undefined)
  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [threads, setThreads] = useState<ThreadInfo[]>([])
  const [isLoadingThreads, setIsLoadingThreads] = useState(false)

  // Check Ollama availability on mount
  useEffect(() => {
    checkOllamaAvailability()
  }, [])

  const checkOllamaAvailability = async () => {
    const available = await isAvailable()
    setOllamaAvailable(available)
  }

  // Load conversation threads
  const loadThreads = useCallback(async () => {
    setIsLoadingThreads(true)
    try {
      const response = await fetch('/api/agent/threads')
      if (response.ok) {
        const data = await response.json()
        setThreads(data.threads || [])
      }
    } catch (error) {
      console.error('Failed to load threads:', error)
    } finally {
      setIsLoadingThreads(false)
    }
  }, [])

  // Load thread history when opening history panel
  useEffect(() => {
    if (showHistory) {
      loadThreads()
    }
  }, [showHistory, loadThreads])

  // Load conversation for a specific thread
  const loadConversation = async (tid: string) => {
    try {
      const response = await fetch(`/api/agent/interact?threadId=${tid}`)
      if (response.ok) {
        const data = await response.json()
        const messages: ConversationMessage[] = []
        for (const log of data.logs || []) {
          messages.push({
            role: 'user',
            content: log.user_input,
            timestamp: new Date(log.created_at),
          })
          if (log.ai_response) {
            messages.push({
              role: 'assistant',
              content: log.ai_response,
              timestamp: new Date(log.created_at),
            })
          }
        }
        setConversation(messages)
        setThreadId(tid)
        // Get last context state if available
        const lastLog = data.logs?.[data.logs.length - 1]
        if (lastLog?.context_state) {
          setClientState(lastLog.context_state)
        }
        setShowHistory(false)
      }
    } catch (error) {
      console.error('Failed to load conversation:', error)
    }
  }

  const handleExecute = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setIsProcessing(true)

    // Add user message to conversation immediately
    setConversation(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    }])
    setInput('')

    try {
      const response = await fetch('/api/agent/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: userMessage,
          threadId: threadId || undefined,
          clientState: clientState || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result: AgentInteractResponse = await response.json()

      // Update thread ID for multi-turn conversations
      setThreadId(result.threadId)

      // Update client state for slot-filling
      setClientState(result.serverState)

      // Add assistant response to conversation
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: result.displayMessage,
        timestamp: new Date(),
        createdNodes: result.createdNodes,
      }])

      // Notify parent of created tasks
      if (result.status === 'SUCCESS' && result.createdNodes && result.createdNodes.length > 0) {
        // Convert GraphNode to Task format for compatibility
        const validTaskTypes = ['course', 'project', 'club', 'todo'] as const
        type ValidTaskType = typeof validTaskTypes[number]
        const tasks: Task[] = result.createdNodes.map(node => {
          const taskType: ValidTaskType = validTaskTypes.includes(node.task_type as ValidTaskType)
            ? (node.task_type as ValidTaskType)
            : 'todo'
          return {
            id: node.id,
            user_id: node.user_id,
            title: node.title,
            content: node.content || '',
            status: (node.status === 'blocked' || node.status === 'active' ? 'pending' : node.status) as 'pending' | 'in_progress' | 'completed' | 'archived',
            priority: node.priority || 5,
            due_date: node.due_date,
            tags: node.tags || [],
            parent_id: node.parent_id,
            task_type: taskType,
            created_at: node.created_at,
            updated_at: node.updated_at,
            type_metadata: node.type_metadata as Task['type_metadata'],
            scheduled_for: node.scheduled_for,
            completed_at: node.completed_at,
            position: 0,
            dependencies: [],
            duration_minutes: node.duration_minutes,
            version: node.version || 1,
          }
        })
        onTasksCreated?.(tasks)
        setShowCreatedTasks(true)
      }

    } catch (error) {
      console.error('Command Center error:', error)
      setConversation(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }])
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

  const startNewConversation = () => {
    setThreadId(null)
    setClientState(undefined)
    setConversation([])
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
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-in fade-in duration-500 relative">
      {/* Header Section */}
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          What are we organizing today?
        </h1>
        <p className="text-muted-foreground">
          Paste a syllabus, dump a project idea, or just clear your mind.
        </p>
      </div>

      {/* Conversation History Panel */}
      {showHistory && (
        <Card className="absolute right-0 top-0 w-80 z-50 shadow-xl animate-in slide-in-from-right">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <History className="h-4 w-4" />
                Conversation History
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {isLoadingThreads ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : threads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No conversation history yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {threads.map((thread) => (
                  <button
                    key={thread.threadId}
                    onClick={() => loadConversation(thread.threadId)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      threadId === thread.threadId
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border-transparent hover:border-muted hover:bg-muted/50'
                    }`}
                  >
                    <p className="text-sm font-medium line-clamp-1">{thread.lastMessage}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {thread.turnCount} turn{thread.turnCount !== 1 ? 's' : ''}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(thread.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-end gap-2">
        {threadId && (
          <Button variant="outline" size="sm" onClick={startNewConversation}>
            <MessageSquare className="h-4 w-4 mr-2" />
            New Conversation
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowHistory(!showHistory)}
        >
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </div>

      {/* Conversation Display */}
      {conversation.length > 0 && (
        <Card className="shadow-lg">
          <CardContent className="p-4">
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {conversation.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.createdNodes && msg.createdNodes.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/20">
                        <p className="text-xs opacity-80">
                          Created {msg.createdNodes.length} task{msg.createdNodes.length !== 1 ? 's' : ''}:
                        </p>
                        <ul className="text-xs mt-1 space-y-1">
                          {msg.createdNodes.map((node) => (
                            <li key={node.id} className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              {node.title}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input Card */}
      <Card className="relative shadow-xl border-2 border-muted/40 focus-within:border-blue-500/50 transition-all duration-300">
        <CardContent className="p-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              clientState?.pendingIntent
                ? "Continue your response..."
                : "e.g., 'Here is the syllabus for History 101...' or 'Plan a ski trip for next week...' or just 'Buy groceries tomorrow'"
            }
            className="min-h-[120px] resize-none border-none focus-visible:ring-0 text-base p-4 leading-relaxed"
            disabled={isProcessing}
          />

          <div className="flex items-center justify-between p-2 border-t">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                <Bot className="h-3 w-3 mr-1" />
                Ollama
              </Badge>
              {threadId && (
                <Badge variant="outline" className="text-xs">
                  Thread active
                </Badge>
              )}
              <span className="text-xs text-muted-foreground hidden sm:inline-block">
                {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'} + Enter to send
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
                  {conversation.length > 0 ? 'Send' : 'Make it Happen'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Examples Section - only show when no conversation */}
      {conversation.length === 0 && !isProcessing && (
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
