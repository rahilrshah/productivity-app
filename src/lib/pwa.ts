'use client'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

class PWAManager {
  private deferredPrompt: BeforeInstallPromptEvent | null = null
  private isInstalled = false

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize()
    }
  }

  private initialize() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault()
      this.deferredPrompt = e as BeforeInstallPromptEvent
      this.showInstallBanner()
    })

    // Check if app is already installed
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true
      this.hideInstallBanner()
      console.log('PWA was installed')
    })

    // Check if running in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true
    }

    // Register service worker
    this.registerServiceWorker()
  }

  private async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/'
        })

        console.log('Service Worker registered successfully:', registration)

        // Listen for service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, show update prompt
                this.showUpdatePrompt()
              }
            })
          }
        })

      } catch (error) {
        console.error('Service Worker registration failed:', error)
      }
    }
  }

  private showInstallBanner() {
    // Create a subtle install banner
    const banner = document.createElement('div')
    banner.id = 'pwa-install-banner'
    banner.className = 'fixed bottom-4 left-4 right-4 bg-primary text-primary-foreground p-4 rounded-lg shadow-lg z-50 flex items-center justify-between'
    banner.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <div>
          <p class="font-medium">Install Productivity App</p>
          <p class="text-sm opacity-90">Add to your home screen for quick access</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button id="install-button" class="bg-white text-primary px-3 py-1 rounded text-sm font-medium">
          Install
        </button>
        <button id="dismiss-button" class="text-primary-foreground/80 hover:text-primary-foreground p-1">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    `

    document.body.appendChild(banner)

    // Add event listeners
    const installButton = banner.querySelector('#install-button')
    const dismissButton = banner.querySelector('#dismiss-button')

    installButton?.addEventListener('click', () => this.installApp())
    dismissButton?.addEventListener('click', () => this.hideInstallBanner())

    // Auto-hide after 10 seconds
    setTimeout(() => {
      this.hideInstallBanner()
    }, 10000)
  }

  private hideInstallBanner() {
    const banner = document.getElementById('pwa-install-banner')
    if (banner) {
      banner.remove()
    }
  }

  private showUpdatePrompt() {
    const updatePrompt = document.createElement('div')
    updatePrompt.id = 'pwa-update-prompt'
    updatePrompt.className = 'fixed top-4 right-4 bg-blue-500 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm'
    updatePrompt.innerHTML = `
      <div class="flex items-start space-x-3">
        <svg class="h-6 w-6 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <div class="flex-1">
          <p class="font-medium">Update Available</p>
          <p class="text-sm opacity-90 mt-1">A new version of the app is ready.</p>
          <div class="flex space-x-2 mt-3">
            <button id="update-button" class="bg-white text-blue-500 px-3 py-1 rounded text-sm font-medium">
              Update
            </button>
            <button id="update-dismiss" class="text-white/80 hover:text-white px-3 py-1 text-sm">
              Later
            </button>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(updatePrompt)

    const updateButton = updatePrompt.querySelector('#update-button')
    const dismissButton = updatePrompt.querySelector('#update-dismiss')

    updateButton?.addEventListener('click', () => {
      window.location.reload()
    })

    dismissButton?.addEventListener('click', () => {
      updatePrompt.remove()
    })
  }

  async installApp() {
    if (!this.deferredPrompt) {
      console.log('No install prompt available')
      return false
    }

    try {
      this.deferredPrompt.prompt()
      const { outcome } = await this.deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt')
        this.hideInstallBanner()
        return true
      } else {
        console.log('User dismissed the install prompt')
        return false
      }
    } catch (error) {
      console.error('Error during app installation:', error)
      return false
    } finally {
      this.deferredPrompt = null
    }
  }

  isAppInstalled(): boolean {
    return this.isInstalled
  }

  canInstall(): boolean {
    return this.deferredPrompt !== null
  }

  // Offline storage management
  async cacheImportantData(data: any, key: string) {
    if ('indexedDB' in window) {
      try {
        const request = indexedDB.open('ProductivityAppCache', 1)
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('offlineData')) {
            db.createObjectStore('offlineData')
          }
        }

        return new Promise((resolve, reject) => {
          request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            const transaction = db.transaction(['offlineData'], 'readwrite')
            const store = transaction.objectStore('offlineData')
            
            const putRequest = store.put(data, key)
            putRequest.onsuccess = () => resolve(true)
            putRequest.onerror = () => reject(putRequest.error)
          }
          
          request.onerror = () => reject(request.error)
        })
      } catch (error) {
        console.error('Failed to cache data:', error)
        return false
      }
    }
    return false
  }

  async getCachedData(key: string) {
    if ('indexedDB' in window) {
      try {
        const request = indexedDB.open('ProductivityAppCache', 1)
        
        return new Promise((resolve, reject) => {
          request.onsuccess = (event) => {
            const db = (event.target as IDBOpenDBRequest).result
            const transaction = db.transaction(['offlineData'], 'readonly')
            const store = transaction.objectStore('offlineData')
            
            const getRequest = store.get(key)
            getRequest.onsuccess = () => resolve(getRequest.result)
            getRequest.onerror = () => reject(getRequest.error)
          }
          
          request.onerror = () => reject(request.error)
        })
      } catch (error) {
        console.error('Failed to retrieve cached data:', error)
        return null
      }
    }
    return null
  }
}

export const pwaManager = new PWAManager()