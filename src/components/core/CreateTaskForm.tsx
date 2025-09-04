'use client'

import { useState } from 'react'
import { Task } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RichTextEditor } from './RichTextEditor'
import { X, Plus } from 'lucide-react'

interface CreateTaskFormProps {
  onSubmit: (task: Partial<Task>) => void
  onCancel: () => void
}

export function CreateTaskForm({ onSubmit, onCancel }: CreateTaskFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<any>(null)
  const [priority, setPriority] = useState(5)
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [currentTag, setCurrentTag] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) return

    const task: Partial<Task> = {
      title: title.trim(),
      content: content || undefined,
      priority,
      due_date: dueDate || undefined,
      tags,
    }

    onSubmit(task)
  }

  const addTag = () => {
    const tag = currentTag.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags(prev => [...prev, tag])
      setCurrentTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove))
  }

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Create New Task</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
              autoFocus
            />
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Description (optional)
            </label>
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Add task description..."
              className="min-h-[200px]"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Priority (1-10)
              </label>
              <Input
                type="number"
                min="1"
                max="10"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Due Date
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Tags
            </label>
            <div className="flex items-center space-x-2 mb-2">
              <Input
                placeholder="Add tag..."
                value={currentTag}
                onChange={(e) => setCurrentTag(e.target.value)}
                onKeyPress={handleTagKeyPress}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTag}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map(tag => (
                  <div
                    key={tag}
                    className="inline-flex items-center px-2 py-1 rounded-md bg-secondary text-secondary-foreground text-sm"
                  >
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTag(tag)}
                      className="ml-1 h-4 w-4 p-0 hover:bg-transparent"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim()}
            >
              Create Task
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}