'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SyncStatus } from '@/components/core/SyncStatus'
import { SettingsPanel } from '@/components/core/SettingsPanel'
import { useTheme } from './ThemeProvider'
import { Moon, Sun, Settings, Search } from 'lucide-react'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        <div className="mr-4 flex">
          <a className="mr-6 flex items-center space-x-2" href="/">
            <span className="font-bold text-xl">ProductivityAI</span>
          </a>
          <nav className="hidden md:flex items-center space-x-6">
            <a
              href="/"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Tasks
            </a>
            <a
              href="/conflicts"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Conflicts
            </a>
            <a
              href="/automation"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Automation
            </a>
          </nav>
        </div>
        
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <Button
              variant="outline"
              size="sm"
              className="relative h-8 w-full justify-start text-sm font-normal text-muted-foreground md:w-40 lg:w-64"
            >
              <Search className="mr-2 h-4 w-4" />
              Search tasks...
            </Button>
          </div>
          
          <nav className="flex items-center space-x-2">
            <SyncStatus />
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Button>
          </nav>
        </div>
      </div>
    </header>
    </>
  )
}