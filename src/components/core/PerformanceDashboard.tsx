'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { 
  getPerformanceMonitor, 
  PerformanceMetrics, 
  ComponentMetrics,
  memoryOptimizer
} from '@/lib/performance'
import { 
  Zap,
  Clock,
  Activity,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  EyeOff
} from 'lucide-react'

export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [componentMetrics, setComponentMetrics] = useState<ComponentMetrics[]>([])
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [resourceTimings, setResourceTimings] = useState<any[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const monitor = getPerformanceMonitor()

  useEffect(() => {
    refreshData()
    
    // Set up periodic refresh
    const interval = setInterval(refreshData, 10000) // Every 10 seconds
    return () => clearInterval(interval)
  }, [])

  const refreshData = async () => {
    setIsRefreshing(true)
    
    try {
      const latestMetrics = monitor.getLatestMetrics()
      const components = monitor.getComponentMetrics()
      const recs = monitor.getRecommendations()
      const resources = monitor.getResourceTimings()

      setMetrics(latestMetrics)
      setComponentMetrics(components)
      setRecommendations(recs)
      setResourceTimings(resources)
    } catch (error) {
      console.error('Failed to refresh performance data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const getPerformanceScore = (): { score: number; grade: string; color: string } => {
    if (!metrics) return { score: 0, grade: 'N/A', color: 'text-muted-foreground' }

    let score = 100
    
    // Load time impact (0-40 points)
    if (metrics.loadTime > 3000) score -= 40
    else if (metrics.loadTime > 2000) score -= 20
    else if (metrics.loadTime > 1000) score -= 10

    // Interaction time impact (0-30 points)
    if (metrics.interactionTime > 100) score -= 30
    else if (metrics.interactionTime > 50) score -= 15
    else if (metrics.interactionTime > 25) score -= 5

    // Memory usage impact (0-20 points)
    if (metrics.memoryUsage) {
      if (metrics.memoryUsage > 200) score -= 20
      else if (metrics.memoryUsage > 100) score -= 10
      else if (metrics.memoryUsage > 50) score -= 5
    }

    // Cache hit ratio impact (0-10 points)
    if (metrics.cacheHitRatio < 0.5) score -= 10
    else if (metrics.cacheHitRatio < 0.8) score -= 5

    score = Math.max(0, Math.min(100, score))

    let grade = 'F'
    let color = 'text-red-600'

    if (score >= 90) { grade = 'A'; color = 'text-green-600' }
    else if (score >= 80) { grade = 'B'; color = 'text-blue-600' }
    else if (score >= 70) { grade = 'C'; color = 'text-yellow-600' }
    else if (score >= 60) { grade = 'D'; color = 'text-orange-600' }

    return { score, grade, color }
  }

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const getMetricStatus = (value: number, thresholds: { good: number; fair: number }) => {
    if (value <= thresholds.good) return { status: 'good', icon: CheckCircle2, color: 'text-green-600' }
    if (value <= thresholds.fair) return { status: 'fair', icon: Minus, color: 'text-yellow-600' }
    return { status: 'poor', icon: AlertTriangle, color: 'text-red-600' }
  }

  const bundleSize = monitor.estimateBundleSize()
  const performanceScore = getPerformanceScore()

  return (
    <div className="space-y-6">
      {/* Performance Score */}
      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <span>Performance Score</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshData}
                disabled={isRefreshing}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-8 w-8 p-0"
              >
                {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="text-center">
            <div className={`text-4xl font-bold ${performanceScore.color}`}>
              {performanceScore.score}
            </div>
            <div className="text-lg font-medium text-muted-foreground">
              Grade: {performanceScore.grade}
            </div>
            <Progress value={performanceScore.score} className="mt-2 h-2" />
          </div>

          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Load Time */}
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-center mb-1">
                  <Clock className="h-4 w-4 mr-1" />
                  <span className="text-sm font-medium">Load Time</span>
                </div>
                <div className="text-lg font-bold">
                  {formatTime(metrics.loadTime)}
                </div>
                {(() => {
                  const status = getMetricStatus(metrics.loadTime, { good: 1500, fair: 2500 })
                  return <status.icon className={`h-4 w-4 mx-auto ${status.color}`} />
                })()}
              </div>

              {/* Interaction Time */}
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-center mb-1">
                  <Activity className="h-4 w-4 mr-1" />
                  <span className="text-sm font-medium">Interaction</span>
                </div>
                <div className="text-lg font-bold">
                  {formatTime(metrics.interactionTime)}
                </div>
                {(() => {
                  const status = getMetricStatus(metrics.interactionTime, { good: 25, fair: 50 })
                  return <status.icon className={`h-4 w-4 mx-auto ${status.color}`} />
                })()}
              </div>

              {/* Memory Usage */}
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-center mb-1">
                  <HardDrive className="h-4 w-4 mr-1" />
                  <span className="text-sm font-medium">Memory</span>
                </div>
                <div className="text-lg font-bold">
                  {metrics.memoryUsage ? `${metrics.memoryUsage.toFixed(1)}MB` : 'N/A'}
                </div>
                {metrics.memoryUsage && (() => {
                  const status = getMetricStatus(metrics.memoryUsage, { good: 50, fair: 100 })
                  return <status.icon className={`h-4 w-4 mx-auto ${status.color}`} />
                })()}
              </div>

              {/* Cache Hit Ratio */}
              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-center mb-1">
                  <Wifi className="h-4 w-4 mr-1" />
                  <span className="text-sm font-medium">Cache</span>
                </div>
                <div className="text-lg font-bold">
                  {(metrics.cacheHitRatio * 100).toFixed(0)}%
                </div>
                {(() => {
                  const status = getMetricStatus(100 - (metrics.cacheHitRatio * 100), { good: 20, fair: 50 })
                  return <status.icon className={`h-4 w-4 mx-auto ${status.color}`} />
                })()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              <span>Optimization Recommendations</span>
              <Badge variant="secondary" className="text-xs">
                {recommendations.length} suggestions
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((rec, index) => (
                <div key={index} className="flex items-start space-x-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span className="text-sm">{rec}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Component Performance */}
      {showDetails && componentMetrics.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-green-600" />
              <span>Component Performance</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {componentMetrics
                .sort((a, b) => b.renderTime - a.renderTime)
                .slice(0, 10)
                .map((component, index) => (
                  <div key={component.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{component.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {component.rerenderCount} renders • Props: {formatSize(component.propsSize)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">
                        {component.renderTime.toFixed(2)}ms
                      </div>
                      <div className="text-xs text-muted-foreground">
                        avg render time
                      </div>
                    </div>
                    <div className="ml-2">
                      {component.renderTime > 16 ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : component.renderTime < 8 ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <Minus className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resource Analysis */}
      {showDetails && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2">
              <HardDrive className="h-5 w-5 text-purple-600" />
              <span>Resource Analysis</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bundle Size */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">Estimated Bundle Size</span>
                  <Badge variant={bundleSize > 1024 * 1024 ? 'destructive' : 'secondary'}>
                    {formatSize(bundleSize)}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {bundleSize > 1024 * 1024 
                    ? 'Consider code splitting to reduce bundle size'
                    : 'Bundle size is within recommended limits'
                  }
                </div>
              </div>

              {/* Cache Status */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">Memory Cache</span>
                  <Badge variant="secondary">
                    {memoryOptimizer.size()} items
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => memoryOptimizer.cleanup()}
                    className="h-6 px-2 text-xs"
                  >
                    Cleanup Cache
                  </Button>
                </div>
              </div>
            </div>

            {/* Resource breakdown */}
            {resourceTimings.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-sm mb-2">Resource Timings</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {resourceTimings
                    .sort((a, b) => b.duration - a.duration)
                    .slice(0, 10)
                    .map((resource, index) => (
                      <div key={index} className="flex items-center justify-between text-xs p-2 bg-background rounded">
                        <div className="flex-1 truncate">
                          <span className="font-mono">{resource.name.split('/').pop()}</span>
                          <Badge variant="outline" className="ml-2 text-xs">
                            {resource.type}
                          </Badge>
                          {resource.cached && (
                            <Badge variant="secondary" className="ml-1 text-xs">
                              cached
                            </Badge>
                          )}
                        </div>
                        <div className="text-right ml-2">
                          <div>{formatTime(resource.duration)}</div>
                          <div className="text-muted-foreground">{formatSize(resource.size)}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}