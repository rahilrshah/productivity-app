'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { getOllamaClient, OllamaModel } from '@/lib/ollama'
import { 
  Bot, 
  Download, 
  Check, 
  X, 
  RefreshCw,
  HardDrive,
  Zap,
  AlertCircle
} from 'lucide-react'

export function OllamaStatus() {
  const [isAvailable, setIsAvailable] = useState(false)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(true)
  const [pullProgress, setPullProgress] = useState<{ [key: string]: number }>({})

  const ollama = getOllamaClient()

  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = async () => {
    setLoading(true)
    try {
      const available = await ollama.isAvailable()
      setIsAvailable(available)
      
      if (available) {
        const modelList = await ollama.listModels()
        setModels(modelList)
      }
    } catch (error) {
      console.error('Failed to check Ollama status:', error)
      setIsAvailable(false)
    } finally {
      setLoading(false)
    }
  }

  const pullModel = async (modelName: string) => {
    try {
      setPullProgress(prev => ({ ...prev, [modelName]: 0 }))
      
      const success = await ollama.pullModel(modelName, (progress) => {
        if (progress.completed && progress.total) {
          const percentage = (progress.completed / progress.total) * 100
          setPullProgress(prev => ({ ...prev, [modelName]: percentage }))
        }
      })

      if (success) {
        setPullProgress(prev => ({ ...prev, [modelName]: 100 }))
        setTimeout(() => {
          setPullProgress(prev => {
            const newProgress = { ...prev }
            delete newProgress[modelName]
            return newProgress
          })
          checkStatus() // Refresh models list
        }, 2000)
      }
    } catch (error) {
      console.error('Failed to pull model:', error)
      setPullProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[modelName]
        return newProgress
      })
    }
  }

  const formatSize = (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    if (bytes === 0) return '0 B'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`
  }

  const getStatusBadge = () => {
    if (loading) {
      return (
        <Badge variant="secondary">
          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
          Checking...
        </Badge>
      )
    }
    
    if (isAvailable) {
      return (
        <Badge variant="default">
          <Check className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      )
    }
    
    return (
      <Badge variant="destructive">
        <X className="h-3 w-3 mr-1" />
        Disconnected
      </Badge>
    )
  }

  const recommendedModels = [
    {
      name: 'llama3.1:8b',
      description: 'Best balance of performance and resource usage',
      size: '4.7GB',
      recommended: true
    },
    {
      name: 'mistral:7b',
      description: 'Fast and efficient for task processing',
      size: '4.1GB',
      recommended: true
    },
    {
      name: 'codellama:7b',
      description: 'Specialized for code-related tasks',
      size: '3.8GB',
      recommended: false
    },
    {
      name: 'phi3:mini',
      description: 'Lightweight model for basic tasks',
      size: '2.3GB',
      recommended: false
    }
  ]

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" />
          <span>Checking Ollama status...</span>
        </CardContent>
      </Card>
    )
  }

  if (!isAvailable) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <span>Ollama Not Available</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ollama is not running or not accessible. To use AI features:
            </p>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-start space-x-2">
                <span className="font-medium">1.</span>
                <span>Install Ollama from <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ollama.ai</a></span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="font-medium">2.</span>
                <span>Start Ollama: <code className="bg-muted px-1 py-0.5 rounded text-xs">ollama serve</code></span>
              </div>
              <div className="flex items-start space-x-2">
                <span className="font-medium">3.</span>
                <span>Ensure it's running on <code className="bg-muted px-1 py-0.5 rounded text-xs">http://localhost:11434</code></span>
              </div>
            </div>
            
            <Button onClick={checkStatus} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bot className="h-5 w-5" />
            <span>Ollama AI Models</span>
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Installed Models */}
        {models.length > 0 && (
          <div>
            <h3 className="font-medium text-sm mb-3 flex items-center">
              <HardDrive className="h-4 w-4 mr-2" />
              Installed Models ({models.length})
            </h3>
            <div className="space-y-2">
              {models.map((model) => (
                <div key={model.name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{model.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatSize(model.size)} • {model.details.parameter_size}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Ready
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Models */}
        <div>
          <h3 className="font-medium text-sm mb-3 flex items-center">
            <Download className="h-4 w-4 mr-2" />
            Recommended Models
          </h3>
          <div className="space-y-3">
            {recommendedModels.map((model) => {
              const isInstalled = models.some(m => m.name === model.name)
              const isPulling = pullProgress[model.name] !== undefined
              
              return (
                <div key={model.name} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm">{model.name}</span>
                      {model.recommended && (
                        <Badge variant="secondary" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{model.description}</p>
                    <p className="text-xs text-muted-foreground">{model.size}</p>
                    
                    {isPulling && (
                      <div className="mt-2">
                        <Progress value={pullProgress[model.name]} className="h-2" />
                        <p className="text-xs text-muted-foreground mt-1">
                          Downloading... {Math.round(pullProgress[model.name])}%
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4">
                    {isInstalled ? (
                      <Badge variant="default" className="text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Installed
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => pullModel(model.name)}
                        disabled={isPulling}
                      >
                        {isPulling ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <Button variant="outline" size="sm" onClick={checkStatus}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <div className="text-xs text-muted-foreground">
            {models.length > 0 ? `${models.length} models ready` : 'No models installed'}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}