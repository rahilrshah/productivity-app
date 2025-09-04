'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useOllama } from '@/lib/ollama'
import { Task } from '@/types'
import { 
  Wand2, 
  Sparkles, 
  Clock, 
  Calendar,
  Tag,
  AlertTriangle,
  Check,
  X,
  Bot,
  Loader2
} from 'lucide-react'

interface NaturalLanguageInputProps {
  onTaskCreated: (task: Partial<Task>) => void
  onClose?: () => void
}

export function NaturalLanguageInput({ onTaskCreated, onClose }: NaturalLanguageInputProps) {
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [parsedTask, setParsedTask] = useState<Partial<Task> | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { client, isAvailable } = useOllama()

  useEffect(() => {
    checkOllamaAvailability()
  }, [])

  const checkOllamaAvailability = async () => {
    const available = await isAvailable()
    if (!available) {
      setError('Ollama is not available. Natural language parsing requires a running Ollama instance.')
    }
  }

  const parseNaturalLanguage = async () => {
    if (!input.trim()) return
    
    setIsProcessing(true)
    setError(null)
    
    try {
      const task = await client.parseTaskFromText(input)
      
      if (task) {
        setParsedTask(task)
        
        // Generate subtask suggestions if the task is complex
        if (task.title && task.title.length > 20) {
          const subtasks = await client.suggestTaskDecomposition(task.title)
          setSuggestions(subtasks)
          setShowSuggestions(subtasks.length > 0)
        }
      } else {
        setError('Could not parse task from the provided text. Please try rephrasing or creating the task manually.')
      }
    } catch (err) {
      console.error('Natural language parsing error:', err)
      setError('Failed to process natural language input. Please check your Ollama connection.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      parseNaturalLanguage()
    }
  }

  const acceptTask = () => {
    if (parsedTask) {
      onTaskCreated(parsedTask)
      resetForm()
    }
  }

  const rejectTask = () => {
    setParsedTask(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const resetForm = () => {
    setInput('')
    setParsedTask(null)
    setSuggestions([])
    setShowSuggestions(false)
    setError(null)
    onClose?.()
  }

  const createSubtask = (subtaskTitle: string) => {
    onTaskCreated({
      title: subtaskTitle,
      priority: parsedTask?.priority || 5,
      tags: [...(parsedTask?.tags || []), 'subtask']
    })
  }

  const examples = [
    "Prepare presentation for client meeting next Friday at 2pm, high priority",
    "Buy groceries for dinner party this weekend - need wine, cheese, bread",
    "Review project documentation and update API docs, should take 2 hours",
    "Call mom for her birthday tomorrow, don't forget flowers",
    "Research vacation destinations for summer trip, budget around $3000"
  ]

  if (error && !parsedTask) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                AI Assistant Unavailable
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {error}
              </p>
              <div className="mt-3 space-x-2">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  Create Manually
                </Button>
                <Button variant="outline" size="sm" onClick={checkOllamaAvailability}>
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <h3 className="font-medium">Natural Language Task Creation</h3>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Powered
              </Badge>
            </div>

            <div className="space-y-2">
              <Input
                placeholder="Describe your task naturally... e.g., 'Call client about project update tomorrow at 3pm'"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isProcessing}
                className="text-base"
              />
              
              <div className="flex items-center justify-between">
                <Button
                  onClick={parseNaturalLanguage}
                  disabled={!input.trim() || isProcessing}
                  size="sm"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Parse Task
                    </>
                  )}
                </Button>
                
                {onClose && (
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {/* Examples */}
            {!parsedTask && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground mb-2">Examples:</p>
                <div className="space-y-1">
                  {examples.slice(0, 2).map((example, index) => (
                    <button
                      key={index}
                      onClick={() => setInput(example)}
                      className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors block w-full p-1 hover:bg-muted rounded"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parsed Task Preview */}
      {parsedTask && (
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-green-800 dark:text-green-200">
                  Parsed Task
                </h4>
                <div className="flex space-x-2">
                  <Button size="sm" onClick={acceptTask}>
                    <Check className="h-4 w-4 mr-1" />
                    Accept
                  </Button>
                  <Button variant="outline" size="sm" onClick={rejectTask}>
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="font-medium text-sm">{parsedTask.title}</p>
                  {parsedTask.content && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {parsedTask.content}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  {parsedTask.priority && (
                    <Badge variant="outline">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Priority {parsedTask.priority}
                    </Badge>
                  )}
                  
                  {parsedTask.due_date && (
                    <Badge variant="outline">
                      <Calendar className="h-3 w-3 mr-1" />
                      {new Date(parsedTask.due_date).toLocaleDateString()}
                    </Badge>
                  )}
                  
                  {parsedTask.duration_minutes && (
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {parsedTask.duration_minutes}min
                    </Badge>
                  )}
                  
                  {parsedTask.tags?.map(tag => (
                    <Badge key={tag} variant="secondary">
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subtask Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center">
                <Sparkles className="h-4 w-4 mr-2 text-purple-600" />
                Suggested Subtasks
              </h4>
              
              <div className="space-y-2">
                {suggestions.map((subtask, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-muted rounded-lg"
                  >
                    <span className="text-sm flex-1">{subtask}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createSubtask(subtask)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                ))}
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSuggestions(false)}
                className="w-full"
              >
                <X className="h-4 w-4 mr-1" />
                Hide Suggestions
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}