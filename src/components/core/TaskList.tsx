'use client'

import { useState, useEffect } from 'react'
import { Task } from '@/types'
import { TaskCard } from './TaskCard'
import { CreateTaskForm } from './CreateTaskForm'
import { NaturalLanguageInput } from './NaturalLanguageInput'
import { Button } from '@/components/ui/button'
import { Plus, Filter, Bot } from 'lucide-react'

interface TaskListProps {
  onViewChange?: (view: 'tasks' | 'schedule') => void
}

export function TaskList({}: TaskListProps = {}) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showNLInput, setShowNLInput] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Mock data for development
  useEffect(() => {
    const mockTasks: Task[] = [
      {
        id: '1',
        user_id: 'user-1',
        title: 'Complete project documentation',
        content: 'Write comprehensive documentation for the productivity app project',
        status: 'pending',
        priority: 8,
        due_date: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days from now
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
        due_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
        tags: ['work', 'review'],
        dependencies: [],
        position: 1,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '3',
        user_id: 'user-1',
        title: 'Plan weekend activities',
        content: 'Research and plan activities for the weekend trip',
        status: 'pending',
        priority: 3,
        tags: ['personal', 'planning'],
        dependencies: [],
        position: 2,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ]

    setTimeout(() => {
      setTasks(mockTasks)
      setIsLoading(false)
    }, 500)
  }, [])

  const handleCreateTask = (task: Partial<Task>) => {
    const newTask: Task = {
      id: Date.now().toString(),
      user_id: 'user-1',
      title: task.title || '',
      content: task.content || '',
      status: 'pending',
      priority: task.priority || 5,
      due_date: task.due_date,
      tags: task.tags || [],
      dependencies: [],
      position: tasks.length,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    setTasks(prev => [...prev, newTask])
    setShowCreateForm(false)
  }

  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === id
          ? { ...task, ...updates, updated_at: new Date().toISOString() }
          : task
      )
    )
  }

  const handleDeleteTask = (id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id))
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-muted animate-pulse rounded-lg"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => setShowCreateForm(true)}
            size="sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
          <Button
            onClick={() => setShowNLInput(true)}
            size="sm"
            variant="secondary"
          >
            <Bot className="mr-2 h-4 w-4" />
            AI Create
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          {tasks.length} tasks
        </div>
      </div>

      {showCreateForm && (
        <CreateTaskForm
          onSubmit={handleCreateTask}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {showNLInput && (
        <NaturalLanguageInput
          onTaskCreated={(task) => {
            handleCreateTask(task)
            setShowNLInput(false)
          }}
          onClose={() => setShowNLInput(false)}
        />
      )}

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">
              No tasks yet. Create your first task to get started.
            </div>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </Button>
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={handleUpdateTask}
              onDelete={handleDeleteTask}
            />
          ))
        )}
      </div>
    </div>
  )
}