'use client'

import { AutomationRulesManager } from '@/components/core/AutomationRulesManager'
import { Header } from '@/components/shared/Header'

export default function AutomationPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">
              Automation Rules
            </h1>
            <p className="text-muted-foreground mt-2">
              Create intelligent rules to automate your productivity workflow
            </p>
          </div>
          
          <AutomationRulesManager />
        </div>
      </main>
    </div>
  )
}