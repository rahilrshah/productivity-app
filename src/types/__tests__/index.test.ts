import { describe, it, expect } from '@jest/globals'
import type { Task, TaskStatus } from '@/types'

describe('Types', () => {
  describe('Task interface', () => {
    it('should allow valid task creation', () => {
      const task: Task = {
        id: 'task-1',
        user_id: 'user-1',
        title: 'Test Task',
        content: 'Test task content',
        status: 'pending',
        priority: 2,
        tags: ['work', 'urgent'],
        dependencies: ['task-0'],
        position: 1,
        version: 1,
        task_type: 'todo',
        type_metadata: {},
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
      }

      expect(task.id).toBe('task-1')
      expect(task.title).toBe('Test Task')
      expect(task.status).toBe('pending')
      expect(task.priority).toBe(2)
      expect(task.tags).toContain('work')
      expect(task.dependencies).toContain('task-0')
    })
  })

  describe('TaskStatus type', () => {
    it('should accept valid status values', () => {
      const validStatuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'archived']
      
      validStatuses.forEach(status => {
        const task: Partial<Task> = { status }
        expect(task.status).toBe(status)
      })
    })
  })

  describe('Task priority', () => {
    it('should accept numeric priority values', () => {
      const validPriorities: number[] = [1, 2, 3, 4, 5]
      
      validPriorities.forEach(priority => {
        const task: Partial<Task> = { priority }
        expect(task.priority).toBe(priority)
      })
    })
  })
})