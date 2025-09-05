'use client'

import { useState } from 'react'
import { Task, TaskType, CourseMetadata, ProjectMetadata, ClubMetadata, TodoMetadata } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
// Using native select elements for now
import { RichTextEditor } from './RichTextEditor'
import { X, Plus, BookOpen, Briefcase, Users, ListTodo } from 'lucide-react'

interface TypeAwareCreateFormProps {
  onSubmit: (task: Partial<Task>) => void
  onCancel: () => void
  defaultType?: TaskType
}

export function TypeAwareCreateForm({ onSubmit, onCancel, defaultType = 'todo' }: TypeAwareCreateFormProps) {
  const [taskType, setTaskType] = useState<TaskType>(defaultType)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<any>(null)
  const [priority, setPriority] = useState(5)
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [currentTag, setCurrentTag] = useState('')
  
  // Type-specific metadata states
  const [courseCode, setCourseCode] = useState('')
  const [semester, setSemester] = useState('')
  const [assignmentType, setAssignmentType] = useState('')
  const [credits, setCredits] = useState(3)
  const [instructor, setInstructor] = useState('')
  
  const [projectType, setProjectType] = useState<'personal' | 'work' | 'side-project'>('personal')
  const [methodology, setMethodology] = useState('agile')
  const [phase, setPhase] = useState('planning')
  const [milestone, setMilestone] = useState('')
  
  const [clubName, setClubName] = useState('')
  const [role, setRole] = useState('member')
  const [eventType, setEventType] = useState('')
  
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [context, setContext] = useState('')

  const getTaskTypeIcon = (type: TaskType) => {
    switch (type) {
      case 'course': return <BookOpen className="h-4 w-4" />
      case 'project': return <Briefcase className="h-4 w-4" />
      case 'club': return <Users className="h-4 w-4" />
      case 'todo': return <ListTodo className="h-4 w-4" />
    }
  }

  const getTaskTypeLabel = (type: TaskType) => {
    switch (type) {
      case 'course': return 'Course Assignment'
      case 'project': return 'Project Task'
      case 'club': return 'Club Activity'
      case 'todo': return 'General Todo'
    }
  }

  const buildMetadata = () => {
    switch (taskType) {
      case 'course':
        return {
          course_code: courseCode,
          semester,
          assignment_type: assignmentType,
          credits,
          instructor: instructor || undefined
        } as CourseMetadata

      case 'project':
        return {
          project_type: projectType,
          methodology,
          phase,
          milestone: milestone || undefined
        } as ProjectMetadata

      case 'club':
        return {
          club_name: clubName,
          role,
          event_type: eventType || undefined
        } as ClubMetadata

      case 'todo':
        return {
          category: category || undefined,
          location: location || undefined,
          context: context || undefined
        } as TodoMetadata
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!title.trim()) return

    const task: Partial<Task> = {
      title: title.trim(),
      content: content || undefined,
      priority,
      due_date: dueDate || undefined,
      tags,
      task_type: taskType,
      type_metadata: buildMetadata()
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

  const renderTypeSpecificFields = () => {
    switch (taskType) {
      case 'course':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Course Code*
                </label>
                <Input
                  placeholder="CS101, MATH200, etc."
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Semester*
                </label>
                <Input
                  placeholder="Fall 2024, Spring 2025, etc."
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Assignment Type*
                </label>
                <select 
                  value={assignmentType} 
                  onChange={(e) => setAssignmentType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  required
                >
                  <option value="">Select type</option>
                  <option value="homework">Homework</option>
                  <option value="quiz">Quiz</option>
                  <option value="exam">Exam</option>
                  <option value="project">Project</option>
                  <option value="essay">Essay</option>
                  <option value="lab">Lab</option>
                  <option value="presentation">Presentation</option>
                  <option value="reading">Reading</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Credits
                </label>
                <Input
                  type="number"
                  min="1"
                  max="6"
                  value={credits}
                  onChange={(e) => setCredits(Number(e.target.value))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Instructor (optional)
              </label>
              <Input
                placeholder="Professor name"
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
              />
            </div>
          </div>
        )

      case 'project':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Project Type*
                </label>
                <select 
                  value={projectType} 
                  onChange={(e) => setProjectType(e.target.value as any)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="side-project">Side Project</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Methodology*
                </label>
                <select 
                  value={methodology} 
                  onChange={(e) => setMethodology(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="agile">Agile</option>
                  <option value="waterfall">Waterfall</option>
                  <option value="kanban">Kanban</option>
                  <option value="scrum">Scrum</option>
                  <option value="lean">Lean</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Phase*
                </label>
                <select 
                  value={phase} 
                  onChange={(e) => setPhase(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="planning">Planning</option>
                  <option value="design">Design</option>
                  <option value="development">Development</option>
                  <option value="testing">Testing</option>
                  <option value="deployment">Deployment</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Milestone (optional)
                </label>
                <Input
                  placeholder="v1.0, MVP, Beta, etc."
                  value={milestone}
                  onChange={(e) => setMilestone(e.target.value)}
                />
              </div>
            </div>
          </div>
        )

      case 'club':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Club Name*
                </label>
                <Input
                  placeholder="Student Government, Chess Club, etc."
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Your Role*
                </label>
                <select 
                  value={role} 
                  onChange={(e) => setRole(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="member">Member</option>
                  <option value="officer">Officer</option>
                  <option value="president">President</option>
                  <option value="vice-president">Vice President</option>
                  <option value="secretary">Secretary</option>
                  <option value="treasurer">Treasurer</option>
                  <option value="committee-chair">Committee Chair</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Event Type (optional)
              </label>
              <Input
                placeholder="Meeting, Workshop, Social Event, etc."
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              />
            </div>
          </div>
        )

      case 'todo':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Category (optional)
                </label>
                <Input
                  placeholder="Personal, Work, Health, etc."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Location (optional)
                </label>
                <Input
                  placeholder="Home, Office, Store, etc."
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Context (optional)
              </label>
              <Input
                placeholder="When free, Morning routine, etc."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </div>
        )
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            {getTaskTypeIcon(taskType)}
            Create {getTaskTypeLabel(taskType)}
          </CardTitle>
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
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Task Type Selector */}
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">
              Task Type
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['course', 'project', 'club', 'todo'] as TaskType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={taskType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTaskType(type)}
                  className="flex items-center gap-2 justify-start"
                >
                  {getTaskTypeIcon(type)}
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>
          </div>

          {/* Basic Task Info */}
          <div>
            <Input
              placeholder="Task title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base"
              autoFocus
              required
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
              className="min-h-[120px]"
            />
          </div>

          {/* Type-specific fields */}
          {renderTypeSpecificFields()}
          
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
              disabled={!title.trim() || (taskType === 'course' && (!courseCode || !semester || !assignmentType)) || (taskType === 'project' && (!methodology || !phase)) || (taskType === 'club' && (!clubName || !role))}
            >
              Create {getTaskTypeLabel(taskType)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}