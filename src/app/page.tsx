'use client'

import { Suspense, useState, useEffect } from 'react'
import { TaskList } from '@/components/core/TaskList'
import { ScheduleView } from '@/components/core/ScheduleView'
import { UnifiedDashboard } from '@/components/core/UnifiedDashboard'
import { AcademicCalendar } from '@/components/core/AcademicCalendar'
import { AIAssistant } from '@/components/core/AIAssistant'
import { Header } from '@/components/shared/Header'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Calendar, List, GraduationCap } from 'lucide-react'
import { Task } from '@/types'

function ScheduleViewWrapper() {
  const [tasks, setTasks] = useState<Task[]>([])

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/tasks')
      if (response.ok) {
        const data = await response.json()
        setTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error fetching tasks for schedule:', error)
    }
  }

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
  const [currentView, setCurrentView] = useState<'dashboard' | 'tasks' | 'schedule' | 'academic'>('dashboard')
  const [allTasks, setAllTasks] = useState<Task[]>([])

  // Fetch tasks for AI assistant
  useEffect(() => {
    fetchAllTasks()
  }, [])

  const fetchAllTasks = async () => {
    try {
      const response = await fetch('/api/tasks')
      if (response.ok) {
        const data = await response.json()
        setAllTasks(data.tasks || [])
      }
    } catch (error) {
      console.error('Error fetching tasks for AI assistant:', error)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {currentView === 'dashboard' ? 'Productivity Dashboard' : 
                   currentView === 'tasks' ? 'Your Tasks' : 
                   currentView === 'schedule' ? 'Schedule View' : 'Academic Calendar'}
                </h1>
                <p className="text-muted-foreground mt-2">
                  {currentView === 'dashboard' ? 'Unified view of all your courses, projects, clubs, and todos' :
                   currentView === 'tasks' ? 'Manage your tasks with AI-powered assistance' :
                   currentView === 'schedule' ? 'Your optimized daily schedule' :
                   'Academic calendar with semester planning and course management'}
                </p>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant={currentView === 'dashboard' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentView('dashboard')}
                >
                  <List className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
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
                <Button
                  variant={currentView === 'academic' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentView('academic')}
                >
                  <GraduationCap className="h-4 w-4 mr-2" />
                  Academic
                </Button>
              </div>
            </div>
          </div>
          
          <Suspense fallback={<LoadingSpinner />}>
            {currentView === 'dashboard' ? (
              <UnifiedDashboard onViewChange={setCurrentView} />
            ) : currentView === 'tasks' ? (
              <TaskList onViewChange={setCurrentView} />
            ) : currentView === 'academic' ? (
              <AcademicCalendar 
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
                    task_type: task.task_type || 'course',
                    type_metadata: task.type_metadata || { 
                      course_code: 'Unknown', 
                      assignment_type: 'Assignment',
                      semester: 'Current',
                      credits: 3
                    }
                  }
                  setAllTasks(prev => [...prev, newTask])
                }}
              />
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
            // Default to todo type for AI-created tasks
            task_type: 'todo',
            type_metadata: {
              category: 'general',
              context: 'AI created'
            }
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