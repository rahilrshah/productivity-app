'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getCRDTEngine } from '@/lib/crdt'
import { 
  Wifi, 
  WifiOff, 
  RotateCw as Sync, 
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react'

export function SyncStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle')
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [pendingOperations, setPendingOperations] = useState(0)

  useEffect(() => {
    const crdt = getCRDTEngine()
    
    // Monitor online/offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    setIsOnline(navigator.onLine)

    // Subscribe to CRDT changes
    const unsubscribe = crdt.subscribe((state) => {
      setPendingOperations(state.operations.length)
    })

    // Simulate sync operations
    const syncInterval = setInterval(() => {
      if (isOnline && pendingOperations > 0) {
        simulateSync()
      }
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unsubscribe()
      clearInterval(syncInterval)
    }
  }, [isOnline, pendingOperations])

  const simulateSync = async () => {
    setSyncStatus('syncing')
    
    // Simulate sync delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const success = Math.random() > 0.1 // 90% success rate
    
    if (success) {
      setSyncStatus('success')
      setLastSyncTime(new Date())
      setTimeout(() => setSyncStatus('idle'), 2000)
    } else {
      setSyncStatus('error')
      setTimeout(() => setSyncStatus('idle'), 3000)
    }
  }

  const handleManualSync = () => {
    if (isOnline) {
      simulateSync()
    }
  }

  const formatTime = (date: Date): string => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'just now'
    if (minutes === 1) return '1 minute ago'
    if (minutes < 60) return `${minutes} minutes ago`
    
    const hours = Math.floor(minutes / 60)
    if (hours === 1) return '1 hour ago'
    if (hours < 24) return `${hours} hours ago`
    
    return date.toLocaleDateString()
  }

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="h-3 w-3" />
    
    switch (syncStatus) {
      case 'syncing':
        return <Sync className="h-3 w-3 animate-spin" />
      case 'success':
        return <CheckCircle className="h-3 w-3" />
      case 'error':
        return <AlertTriangle className="h-3 w-3" />
      default:
        return <Wifi className="h-3 w-3" />
    }
  }

  const getStatusColor = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (!isOnline) return 'destructive'
    
    switch (syncStatus) {
      case 'syncing':
        return 'secondary'
      case 'success':
        return 'default'
      case 'error':
        return 'destructive'
      default:
        return pendingOperations > 0 ? 'secondary' : 'default'
    }
  }

  const getStatusText = (): string => {
    if (!isOnline) return 'Offline'
    
    switch (syncStatus) {
      case 'syncing':
        return 'Syncing...'
      case 'success':
        return 'Synced'
      case 'error':
        return 'Sync Error'
      default:
        return pendingOperations > 0 ? `${pendingOperations} pending` : 'Up to date'
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Badge
        variant={getStatusColor()}
        className="flex items-center space-x-1 text-xs cursor-pointer"
        onClick={handleManualSync}
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
      </Badge>
      
      {lastSyncTime && (
        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatTime(lastSyncTime)}</span>
        </div>
      )}
      
      {!isOnline && pendingOperations > 0 && (
        <Badge variant="outline" className="text-xs">
          {pendingOperations} offline changes
        </Badge>
      )}
    </div>
  )
}

// Conflict resolution modal component
export function ConflictResolutionModal({ 
  conflicts,
  onResolve,
  onClose 
}: {
  conflicts: any[]
  onResolve: (resolution: any) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Resolve Conflicts</h2>
        
        <div className="space-y-4">
          {conflicts.map((conflict, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="font-medium">
                  Conflict in "{conflict.entity.title}"
                </h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Your Version
                  </h4>
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm">
                    {JSON.stringify(conflict.local, null, 2)}
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => onResolve({ ...conflict, resolution: 'local' })}
                  >
                    Keep This
                  </Button>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Remote Version
                  </h4>
                  <div className="bg-green-50 dark:bg-green-950 p-3 rounded text-sm">
                    {JSON.stringify(conflict.remote, null, 2)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onResolve({ ...conflict, resolution: 'remote' })}
                  >
                    Keep This
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onResolve({ ...conflict, resolution: 'merge' })}
                >
                  Auto Merge
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex justify-end space-x-2 mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}