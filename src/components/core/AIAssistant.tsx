'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useOllama } from '@/lib/ollama'
import { Task } from '@/types'
import { 
  Bot, 
  Send, 
  Loader2,
  Lightbulb,
  Target,
  Clock,
  TrendingUp,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface AIAssistantProps {
  tasks: Task[]
  onTaskCreate?: (task: Partial<Task>) => void
  onTaskUpdate?: (id: string, updates: Partial<Task>) => void
}

export function AIAssistant({ tasks, onTaskCreate: _onTaskCreate, onTaskUpdate: _onTaskUpdate }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { client, isAvailable } = useOllama()

  useEffect(() => {
    // Initial greeting message
    setMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Hello! I'm your AI productivity assistant. I can help you:

• Create tasks from natural language
• Break down complex projects into subtasks  
• Analyze your productivity patterns
• Suggest task priorities and scheduling
• Provide insights on your workload

What would you like assistance with today?`,
      timestamp: new Date()
    }])
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const sendMessage = async () => {
    if (!input.trim() || isProcessing) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsProcessing(true)

    try {
      const response = await processUserMessage(userMessage.content)
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('AI Assistant error:', error)
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error while processing your request. Please make sure Ollama is running and try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
    }
  }

  const processUserMessage = async (message: string): Promise<string> => {
    const available = await isAvailable()
    if (!available) {
      return "I need Ollama to be running to assist you. Please start Ollama and try again."
    }

    // Create context about current tasks
    const taskContext = tasks.length > 0 
      ? `Current tasks: ${tasks.map(t => `"${t.title}" (priority: ${t.priority}, status: ${t.status})`).join(', ')}`
      : 'No current tasks'

    const systemPrompt = `You are a helpful productivity assistant. You help users manage tasks, improve productivity, and organize their work.

Current context: ${taskContext}

Available actions:
- CREATE_TASK: When user wants to create a new task
- ANALYZE_PRODUCTIVITY: When user asks about their productivity patterns
- SUGGEST_PRIORITIES: When user needs help prioritizing tasks
- BREAK_DOWN_TASK: When user wants to break a complex task into subtasks

Respond conversationally and offer specific, actionable advice. If you suggest creating a task, format it clearly.`

    try {
      const response = await client.chat('llama3.1:8b', [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ])

      if (typeof response === 'object' && 'message' in response) {
        return response.message.content
      }

      return "I'm not sure how to help with that. Could you please rephrase your request?"
    } catch (error) {
      throw error
    }
  }

  const getProductivityInsights = () => {
    if (tasks.length === 0) return null

    const totalTasks = tasks.length
    const completedTasks = tasks.filter(t => t.status === 'completed').length
    const highPriorityTasks = tasks.filter(t => t.priority >= 8).length
    const overdueTasks = tasks.filter(t => 
      t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed'
    ).length

    return {
      totalTasks,
      completedTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      highPriorityTasks,
      overdueTasks
    }
  }

  const insights = getProductivityInsights()

  const quickActions = [
    {
      icon: Target,
      label: 'Analyze my productivity',
      prompt: 'Analyze my current productivity patterns and give me insights'
    },
    {
      icon: Lightbulb,
      label: 'Suggest task priorities',
      prompt: 'Help me prioritize my current tasks'
    },
    {
      icon: Clock,
      label: 'Schedule optimization',
      prompt: 'How can I optimize my task scheduling?'
    },
    {
      icon: TrendingUp,
      label: 'Productivity tips',
      prompt: 'Give me productivity tips based on my current workload'
    }
  ]

  if (!isVisible) {
    return (
      <Button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 rounded-full h-12 w-12 p-0"
        size="sm"
      >
        <Bot className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <Card className={`fixed bottom-4 right-4 z-50 ${isExpanded ? 'w-96 h-[500px]' : 'w-80 h-[400px]'} flex flex-col`}>
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-2">
            <Bot className="h-4 w-4 text-blue-600" />
            <span>AI Assistant</span>
            <Badge variant="secondary" className="text-xs">
              Beta
            </Badge>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(false)}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-4 pt-0 min-h-0">
        {/* Productivity Insights */}
        {insights && (
          <div className="mb-3 p-2 bg-muted rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center">
                <div className="font-medium">{insights.completionRate}%</div>
                <div className="text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-red-600">{insights.overdueTasks}</div>
                <div className="text-muted-foreground">Overdue</div>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-0">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] p-2 rounded-lg text-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                <div className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-muted p-2 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Actions */}
        {messages.length <= 1 && (
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-2">Quick actions:</div>
            <div className="grid grid-cols-2 gap-1">
              {quickActions.map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="h-auto p-2 text-xs justify-start"
                  onClick={() => setInput(action.prompt)}
                >
                  <action.icon className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex space-x-2 flex-shrink-0">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask me anything..."
            className="text-sm"
            disabled={isProcessing}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isProcessing}
            size="sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}