'use client'

import { Suspense, useState, useEffect } from 'react'
import { TaskList } from '@/components/core/TaskList'
import { ScheduleView } from '@/components/core/ScheduleView'
import { AIAssistant } from '@/components/core/AIAssistant'
import { Header } from '@/components/shared/Header'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Calendar, List } from 'lucide-react'
import { Task } from '@/types'

function ScheduleViewWrapper() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    // Mock data for schedule view
    const mockTasks: Task[] = [
      {
        id: '1',
        user_id: 'user-1',
        title: 'Complete project documentation',
        content: 'Write comprehensive documentation for the productivity app project',
        status: 'pending',
        priority: 8,
        due_date: new Date(Date.now() + 86400000 * 3).toISOString(),
        duration_minutes: 120,
        tags: ['work', 'documentation'],
        dependencies: [],
        position: 0,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        user_id: 'user-1',
        title: 'Review client feedback',
        content: 'Go through all the feedback from the client and prioritize changes',
        status: 'in_progress',
        priority: 6,
        due_date: new Date(Date.now() + 86400000).toISOString(),
        duration_minutes: 90,
        tags: ['work', 'review'],
        dependencies: [],
        position: 1,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    setTasks(mockTasks)
  }, [])

  const handleTaskUpdate = (id: string, updates: Partial<Task>) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === id
          ? { ...task, ...updates, updated_at: new Date().toISOString() }
          : task
      )
    )
  }

  return <ScheduleView tasks={tasks} onTaskUpdate={handleTaskUpdate} />
}

export default function HomePage() {
  const [currentView, setCurrentView] = useState<'tasks' | 'schedule'>('tasks')
  const [allTasks, setAllTasks] = useState<Task[]>([])

  // Mock tasks for AI assistant
  useEffect(() => {
    const mockTasks: Task[] = [
      {
        id: '1',
        user_id: 'user-1',
        title: 'Complete project documentation',
        content: 'Write comprehensive documentation for the productivity app project',
        status: 'pending',
        priority: 8,
        due_date: new Date(Date.now() + 86400000 * 3).toISOString(),
        duration_minutes: 120,
        tags: ['work', 'documentation'],
        dependencies: [],
        position: 0,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        user_id: 'user-1',
        title: 'Review client feedback',
        content: 'Go through all the feedback from the client and prioritize changes',
        status: 'in_progress',
        priority: 6,
        due_date: new Date(Date.now() + 86400000).toISOString(),
        duration_minutes: 90,
        tags: ['work', 'review'],
        dependencies: [],
        position: 1,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    setAllTasks(mockTasks)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {currentView === 'tasks' ? 'Your Tasks' : 'Schedule View'}
                </h1>
                <p className="text-muted-foreground mt-2">
                  {currentView === 'tasks' 
                    ? 'Manage your tasks with AI-powered assistance'
                    : 'Your optimized daily schedule'
                  }
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant={currentView === 'tasks' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentView('tasks')}
                >
                  <List className="h-4 w-4 mr-2" />
                  Tasks
                </Button>
                <Button
                  variant={currentView === 'schedule' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentView('schedule')}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule
                </Button>
              </div>
            </div>
          </div>
          
          <Suspense fallback={<LoadingSpinner />}>
            {currentView === 'tasks' ? (
              <TaskList onViewChange={setCurrentView} />
            ) : (
              <ScheduleViewWrapper />
            )}
          </Suspense>
        </div>
      </main>
      
      {/* AI Assistant */}
      <AIAssistant 
        tasks={allTasks}
        onTaskCreate={(task) => {
          const newTask: Task = {
            id: crypto.randomUUID(),
            user_id: 'user-1',
            title: task.title || '',
            content: task.content || '',
            status: 'pending',
            priority: task.priority || 5,
            due_date: task.due_date,
            tags: task.tags || [],
            dependencies: [],
            position: allTasks.length,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          setAllTasks(prev => [...prev, newTask])
        }}
        onTaskUpdate={(id, updates) => {
          setAllTasks(prev => 
            prev.map(task => 
              task.id === id 
                ? { ...task, ...updates, updated_at: new Date().toISOString() }
                : task
            )
          )
        }}
      />
    </div>
  )
}