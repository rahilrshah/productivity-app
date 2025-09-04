'use client'

// Performance monitoring and optimization utilities

export interface PerformanceMetrics {
  loadTime: number
  renderTime: number
  interactionTime: number
  memoryUsage?: number
  bundleSize?: number
  cacheHitRatio: number
}

export interface ComponentMetrics {
  name: string
  renderTime: number
  rerenderCount: number
  propsSize: number
  lastRendered: number
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = []
  private componentMetrics: Map<string, ComponentMetrics> = new Map()
  private observers: PerformanceObserver[] = []
  
  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeObservers()
    }
  }

  private initializeObservers() {
    // Observe largest contentful paint
    if ('PerformanceObserver' in window) {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        this.recordMetric('lcp', lastEntry.startTime)
      })
      
      try {
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
        this.observers.push(lcpObserver)
      } catch (e) {
        console.warn('LCP observation not supported')
      }

      // Observe first input delay
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach(entry => {
          this.recordMetric('fid', entry.processingStart - entry.startTime)
        })
      })

      try {
        fidObserver.observe({ entryTypes: ['first-input'] })
        this.observers.push(fidObserver)
      } catch (e) {
        console.warn('FID observation not supported')
      }

      // Observe layout shifts
      const clsObserver = new PerformanceObserver((list) => {
        let clsScore = 0
        const entries = list.getEntries()
        entries.forEach(entry => {
          if (entry.hadRecentInput) return
          clsScore += (entry as any).value
        })
        this.recordMetric('cls', clsScore)
      })

      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] })
        this.observers.push(clsObserver)
      } catch (e) {
        console.warn('CLS observation not supported')
      }
    }

    // Monitor memory usage
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory
        this.recordMetric('memory', memory.usedJSHeapSize / 1024 / 1024) // MB
      }, 30000) // Every 30 seconds
    }
  }

  private recordMetric(type: string, value: number) {
    const timestamp = performance.now()
    
    // Store in appropriate format
    switch (type) {
      case 'lcp':
        this.updateMetrics({ loadTime: value })
        break
      case 'fid':
        this.updateMetrics({ interactionTime: value })
        break
      case 'cls':
        // CLS is accumulated over time
        break
      case 'memory':
        this.updateMetrics({ memoryUsage: value })
        break
    }
  }

  private updateMetrics(update: Partial<PerformanceMetrics>) {
    const latest = this.metrics[this.metrics.length - 1] || {
      loadTime: 0,
      renderTime: 0,
      interactionTime: 0,
      cacheHitRatio: 0
    }

    const newMetrics = { ...latest, ...update }
    this.metrics.push(newMetrics)

    // Keep only last 100 measurements
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100)
    }
  }

  // Component-level performance tracking
  trackComponentRender(componentName: string, renderTime: number, propsSize: number = 0) {
    const existing = this.componentMetrics.get(componentName)
    
    if (existing) {
      this.componentMetrics.set(componentName, {
        name: componentName,
        renderTime: (existing.renderTime + renderTime) / 2, // Average
        rerenderCount: existing.rerenderCount + 1,
        propsSize,
        lastRendered: Date.now()
      })
    } else {
      this.componentMetrics.set(componentName, {
        name: componentName,
        renderTime,
        rerenderCount: 1,
        propsSize,
        lastRendered: Date.now()
      })
    }
  }

  // Get performance insights
  getMetrics(): PerformanceMetrics[] {
    return [...this.metrics]
  }

  getLatestMetrics(): PerformanceMetrics | null {
    return this.metrics[this.metrics.length - 1] || null
  }

  getComponentMetrics(): ComponentMetrics[] {
    return Array.from(this.componentMetrics.values())
  }

  // Performance recommendations
  getRecommendations(): string[] {
    const recommendations: string[] = []
    const latest = this.getLatestMetrics()
    const components = this.getComponentMetrics()

    if (!latest) return recommendations

    // Load time recommendations
    if (latest.loadTime > 2500) {
      recommendations.push('Consider code splitting to reduce initial bundle size')
      recommendations.push('Implement lazy loading for non-critical components')
    }

    // Memory recommendations
    if (latest.memoryUsage && latest.memoryUsage > 100) {
      recommendations.push('Monitor memory usage - currently high at ' + latest.memoryUsage.toFixed(1) + 'MB')
    }

    // Component recommendations
    const slowComponents = components.filter(c => c.renderTime > 16) // 60fps threshold
    if (slowComponents.length > 0) {
      recommendations.push(`Optimize slow components: ${slowComponents.map(c => c.name).join(', ')}`)
    }

    const frequentRerenderers = components.filter(c => c.rerenderCount > 20)
    if (frequentRerenderers.length > 0) {
      recommendations.push(`Reduce re-renders in: ${frequentRerenderers.map(c => c.name).join(', ')}`)
    }

    // Cache recommendations
    if (latest.cacheHitRatio < 0.8) {
      recommendations.push('Improve caching strategy - hit ratio is low')
    }

    return recommendations
  }

  // Resource monitoring
  getResourceTimings() {
    if (typeof window === 'undefined') return []
    
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    
    return resources.map(resource => ({
      name: resource.name,
      duration: resource.duration,
      size: resource.transferSize || 0,
      type: this.getResourceType(resource.name),
      cached: resource.transferSize === 0 && resource.decodedBodySize > 0
    }))
  }

  private getResourceType(url: string): string {
    if (url.includes('.js')) return 'script'
    if (url.includes('.css')) return 'stylesheet'
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image'
    if (url.includes('.woff')) return 'font'
    return 'other'
  }

  // Bundle analysis
  estimateBundleSize(): number {
    const scripts = this.getResourceTimings().filter(r => r.type === 'script')
    return scripts.reduce((total, script) => total + script.size, 0)
  }

  // Clean up observers
  cleanup() {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }
}

// React performance hooks
export function usePerformanceMonitor(componentName: string) {
  const monitor = getPerformanceMonitor()
  
  return {
    trackRender: (renderTime: number, propsSize?: number) => {
      monitor.trackComponentRender(componentName, renderTime, propsSize)
    },
    startTimer: () => performance.now(),
    endTimer: (startTime: number) => performance.now() - startTime
  }
}

// HOC for automatic performance tracking
export function withPerformanceTracking<T extends object>(
  WrappedComponent: React.ComponentType<T>,
  componentName?: string
) {
  return function PerformanceTrackedComponent(props: T) {
    const name = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Unknown'
    const { trackRender, startTimer, endTimer } = usePerformanceMonitor(name)
    
    const startTime = startTimer()
    
    React.useEffect(() => {
      const renderTime = endTimer(startTime)
      const propsSize = JSON.stringify(props).length
      trackRender(renderTime, propsSize)
    })

    return React.createElement(WrappedComponent, props)
  }
}

// Lazy loading utilities
export function createLazyComponent<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback?: React.ComponentType
) {
  const LazyComponent = React.lazy(importFn)
  
  return function LazyWrapper(props: React.ComponentProps<T>) {
    return React.createElement(
      React.Suspense,
      { 
        fallback: fallback 
          ? React.createElement(fallback) 
          : React.createElement('div', { children: 'Loading...' })
      },
      React.createElement(LazyComponent, props)
    )
  }
}

// Memory optimization
export class MemoryOptimizer {
  private cache = new Map()
  private maxSize = 100
  private ttl = 5 * 60 * 1000 // 5 minutes

  set(key: string, value: any, customTtl?: number) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: customTtl || this.ttl
    })
  }

  get(key: string) {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  clear() {
    this.cache.clear()
  }

  size() {
    return this.cache.size
  }

  cleanup() {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key)
      }
    }
  }
}

// Image optimization
export function optimizeImageLoading() {
  if (typeof window === 'undefined') return

  // Implement intersection observer for lazy loading
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target as HTMLImageElement
        if (img.dataset.src) {
          img.src = img.dataset.src
          img.removeAttribute('data-src')
          imageObserver.unobserve(img)
        }
      }
    })
  })

  // Observe all images with data-src
  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img)
  })

  return () => imageObserver.disconnect()
}

// Global performance monitor instance
let performanceMonitorInstance: PerformanceMonitor | null = null

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitor()
  }
  return performanceMonitorInstance
}

// Export utilities
export const memoryOptimizer = new MemoryOptimizer()

// Performance measurement decorator
export function measurePerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value

  descriptor.value = function (...args: any[]) {
    const start = performance.now()
    const result = method.apply(this, args)
    const end = performance.now()
    
    console.log(`${target.constructor.name}.${propertyName} took ${(end - start).toFixed(2)}ms`)
    
    return result
  }

  return descriptor
}

// React import (handled at runtime)
let React: any
if (typeof window !== 'undefined') {
  React = require('react')
}