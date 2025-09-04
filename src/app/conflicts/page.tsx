'use client'

import { ConflictManager } from '@/components/core/ConflictManager'
import { Header } from '@/components/shared/Header'

export default function ConflictsPage() {
  const handleConflictResolved = (resolutions: any[]) => {
    console.log('Conflicts resolved:', resolutions)
    // In a real app, you might want to:
    // - Show a success notification
    // - Trigger a data sync
    // - Update the UI state
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              Conflict Resolution
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage and resolve data synchronization conflicts
            </p>
          </div>
          
          <ConflictManager onConflictResolved={handleConflictResolved} />
        </div>
      </main>
    </div>
  )
}