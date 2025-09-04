import { describe, it, expect } from '@jest/globals'
import type { Task, TaskStatus, TaskPriority } from '@/types'

describe('Types', () => {
  describe('Task interface', () => {
    it('should allow valid task creation', () => {
      const task: Task = {
        id: 'task-1',
        title: 'Test Task',
        content: { type: 'doc', content: [] },
        status: 'pending',
        priority: 'medium',
        user_id: 'user-1',
        tags: ['work', 'urgent'],
        dependencies: ['task-0'],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      }

      expect(task.id).toBe('task-1')
      expect(task.title).toBe('Test Task')
      expect(task.status).toBe('pending')
      expect(task.priority).toBe('medium')
      expect(task.tags).toContain('work')
      expect(task.dependencies).toContain('task-0')
    })
  })

  describe('TaskStatus type', () => {
    it('should accept valid status values', () => {
      const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']
      
      validStatuses.forEach(status => {
        const task: Partial<Task> = { status }
        expect(task.status).toBe(status)
      })
    })
  })

  describe('TaskPriority type', () => {
    it('should accept valid priority values', () => {
      const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
      
      validPriorities.forEach(priority => {
        const task: Partial<Task> = { priority }
        expect(task.priority).toBe(priority)
      })
    })
  })
})