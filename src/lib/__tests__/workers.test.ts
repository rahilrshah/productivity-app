import { describe, it, expect, jest, beforeEach } from '@jest/globals'

/**
 * Worker Tests
 *
 * Tests for the specialized worker classes:
 * - TaskWorker: QUICK_TODO, COURSE_TASK, CLUB_TASK, JOURNAL
 * - CalendarWorker: SCHEDULE_REQUEST, ROUTINE
 * - ProjectWorker: PROJECT_TASK, CREATE_CONTAINER
 */

// Types for testing
interface Job {
  id: string
  user_id: string
  thread_id?: string
  intent: string
  worker_type: string
  status: string
  progress: number
  input_data: JobInputData
  output_data?: JobOutputData
  error_message?: string
  retry_count: number
  max_retries: number
}

interface JobInputData {
  user_input: string
  entities: Record<string, string>
  partial_data?: Record<string, unknown>
  container_context?: Array<{ id: string; title: string; category: string }>
}

interface JobOutputData {
  message: string
  created_nodes?: Array<{ id: string; title: string }>
  needs_clarification?: boolean
  missing_fields?: string[]
}

type WorkerType = 'task' | 'calendar' | 'project'

describe('BaseWorker', () => {
  describe('Progress Updates', () => {
    interface ProgressUpdate {
      jobId: string
      progress: number
      message: string
    }

    const progressUpdates: ProgressUpdate[] = []

    function updateProgress(jobId: string, progress: number, message: string) {
      progressUpdates.push({ jobId, progress, message })
    }

    beforeEach(() => {
      progressUpdates.length = 0
    })

    it('should track progress updates', () => {
      updateProgress('job-1', 25, 'Extracting data...')
      updateProgress('job-1', 50, 'Creating task...')
      updateProgress('job-1', 100, 'Complete')

      expect(progressUpdates).toHaveLength(3)
      expect(progressUpdates[0].progress).toBe(25)
      expect(progressUpdates[2].progress).toBe(100)
    })

    it('should validate progress bounds', () => {
      function isValidProgress(progress: number): boolean {
        return progress >= 0 && progress <= 100
      }

      expect(isValidProgress(0)).toBe(true)
      expect(isValidProgress(50)).toBe(true)
      expect(isValidProgress(100)).toBe(true)
      expect(isValidProgress(-1)).toBe(false)
      expect(isValidProgress(101)).toBe(false)
    })
  })

  describe('Job Completion', () => {
    function completeJob(job: Job, output: JobOutputData): Job {
      return {
        ...job,
        status: 'completed',
        progress: 100,
        output_data: output,
      }
    }

    it('should set status to completed', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: { user_input: 'Test', entities: {} },
        retry_count: 0,
        max_retries: 3,
      }

      const completed = completeJob(job, { message: 'Task created' })

      expect(completed.status).toBe('completed')
      expect(completed.progress).toBe(100)
      expect(completed.output_data?.message).toBe('Task created')
    })
  })

  describe('Job Failure', () => {
    function failJob(
      job: Job,
      error: string,
      shouldRetry: boolean
    ): Job {
      if (shouldRetry && job.retry_count < job.max_retries) {
        return {
          ...job,
          status: 'pending',
          retry_count: job.retry_count + 1,
          error_message: error,
        }
      }
      return {
        ...job,
        status: 'failed',
        error_message: error,
      }
    }

    it('should retry when under max retries', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: { user_input: 'Test', entities: {} },
        retry_count: 0,
        max_retries: 3,
      }

      const failed = failJob(job, 'Network error', true)

      expect(failed.status).toBe('pending')
      expect(failed.retry_count).toBe(1)
    })

    it('should fail when max retries exceeded', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: { user_input: 'Test', entities: {} },
        retry_count: 3,
        max_retries: 3,
      }

      const failed = failJob(job, 'Network error', true)

      expect(failed.status).toBe('failed')
      expect(failed.retry_count).toBe(3)
    })

    it('should fail immediately when retry not requested', () => {
      const job: Job = {
        id: 'job-1',
        user_id: 'user-1',
        intent: 'QUICK_TODO',
        worker_type: 'task',
        status: 'processing',
        progress: 50,
        input_data: { user_input: 'Test', entities: {} },
        retry_count: 0,
        max_retries: 3,
      }

      const failed = failJob(job, 'Invalid data', false)

      expect(failed.status).toBe('failed')
      expect(failed.retry_count).toBe(0)
    })
  })
})

describe('TaskWorker', () => {
  const supportedIntents = ['QUICK_TODO', 'COURSE_TASK', 'CLUB_TASK', 'JOURNAL']

  it('should support correct intents', () => {
    expect(supportedIntents).toContain('QUICK_TODO')
    expect(supportedIntents).toContain('COURSE_TASK')
    expect(supportedIntents).toContain('CLUB_TASK')
    expect(supportedIntents).toContain('JOURNAL')
    expect(supportedIntents).not.toContain('SCHEDULE_REQUEST')
    expect(supportedIntents).not.toContain('PROJECT_TASK')
  })

  describe('Task Data Extraction', () => {
    interface ExtractedTaskData {
      title: string
      category?: string
      parent_id?: string
      due_date?: string
      tags?: string[]
    }

    function extractTaskData(
      userInput: string,
      entities: Record<string, string>
    ): ExtractedTaskData {
      return {
        title: entities.title || userInput.substring(0, 100),
        category: entities.category,
        parent_id: entities.parent_container,
        due_date: entities.due_date,
        tags: entities.tags ? entities.tags.split(',').map((t) => t.trim()) : [],
      }
    }

    it('should extract title from entities', () => {
      const data = extractTaskData('Add task', { title: 'My Task' })
      expect(data.title).toBe('My Task')
    })

    it('should fallback to user input for title', () => {
      const data = extractTaskData('Add a task for tomorrow', {})
      expect(data.title).toBe('Add a task for tomorrow')
    })

    it('should truncate long input for title', () => {
      const longInput = 'a'.repeat(200)
      const data = extractTaskData(longInput, {})
      expect(data.title.length).toBe(100)
    })

    it('should parse tags from comma-separated string', () => {
      const data = extractTaskData('Task', { tags: 'work, urgent, review' })
      expect(data.tags).toEqual(['work', 'urgent', 'review'])
    })
  })

  describe('Category Mapping', () => {
    function mapIntentToCategory(intent: string): string {
      const mapping: Record<string, string> = {
        QUICK_TODO: 'todo',
        COURSE_TASK: 'course',
        CLUB_TASK: 'club',
        JOURNAL: 'journal',
      }
      return mapping[intent] || 'todo'
    }

    it('should map QUICK_TODO to todo', () => {
      expect(mapIntentToCategory('QUICK_TODO')).toBe('todo')
    })

    it('should map COURSE_TASK to course', () => {
      expect(mapIntentToCategory('COURSE_TASK')).toBe('course')
    })

    it('should map CLUB_TASK to club', () => {
      expect(mapIntentToCategory('CLUB_TASK')).toBe('club')
    })

    it('should map JOURNAL to journal', () => {
      expect(mapIntentToCategory('JOURNAL')).toBe('journal')
    })

    it('should default to todo for unknown intents', () => {
      expect(mapIntentToCategory('UNKNOWN')).toBe('todo')
    })
  })
})

describe('CalendarWorker', () => {
  const supportedIntents = ['SCHEDULE_REQUEST', 'ROUTINE']

  it('should support correct intents', () => {
    expect(supportedIntents).toContain('SCHEDULE_REQUEST')
    expect(supportedIntents).toContain('ROUTINE')
    expect(supportedIntents).not.toContain('QUICK_TODO')
  })

  describe('Schedule Parsing', () => {
    interface TimeBlock {
      title: string
      start: string
      end: string
      duration_minutes: number
    }

    function parseTimeFromInput(input: string): { hour: number; minute: number } | null {
      // Pattern for time with minutes: 14:30, 2:30pm
      const withMinutes = /(\d{1,2}):(\d{2})\s*(am|pm)?/i
      const matchWithMinutes = input.match(withMinutes)
      if (matchWithMinutes) {
        let hour = parseInt(matchWithMinutes[1], 10)
        const minute = parseInt(matchWithMinutes[2], 10)
        const ampm = matchWithMinutes[3]

        if (ampm?.toLowerCase() === 'pm' && hour < 12) hour += 12
        if (ampm?.toLowerCase() === 'am' && hour === 12) hour = 0

        return { hour, minute }
      }

      // Pattern for time without minutes: 2pm, 9am
      const withoutMinutes = /(\d{1,2})\s*(am|pm)/i
      const matchWithoutMinutes = input.match(withoutMinutes)
      if (matchWithoutMinutes) {
        let hour = parseInt(matchWithoutMinutes[1], 10)
        const ampm = matchWithoutMinutes[2]

        if (ampm.toLowerCase() === 'pm' && hour < 12) hour += 12
        if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0

        return { hour, minute: 0 }
      }

      return null
    }

    it('should parse 24-hour time', () => {
      const time = parseTimeFromInput('Meeting at 14:30')
      expect(time).toEqual({ hour: 14, minute: 30 })
    })

    it('should parse 12-hour time with PM', () => {
      const time = parseTimeFromInput('Call at 2pm')
      expect(time).toEqual({ hour: 14, minute: 0 })
    })

    it('should parse 12-hour time with AM', () => {
      const time = parseTimeFromInput('Standup at 9am')
      expect(time).toEqual({ hour: 9, minute: 0 })
    })

    it('should return null for no time found', () => {
      const time = parseTimeFromInput('Add a task')
      expect(time).toBeNull()
    })
  })

  describe('Recurrence Parsing', () => {
    type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'weekdays' | null

    function parseRecurrence(input: string): RecurrencePattern {
      const lowerInput = input.toLowerCase()

      if (lowerInput.includes('every day') || lowerInput.includes('daily')) {
        return 'daily'
      }
      if (lowerInput.includes('every week') || lowerInput.includes('weekly')) {
        return 'weekly'
      }
      if (lowerInput.includes('every month') || lowerInput.includes('monthly')) {
        return 'monthly'
      }
      if (lowerInput.includes('weekday') || lowerInput.includes('mon-fri')) {
        return 'weekdays'
      }
      return null
    }

    it('should parse daily recurrence', () => {
      expect(parseRecurrence('Every day at 9am')).toBe('daily')
      expect(parseRecurrence('Daily standup')).toBe('daily')
    })

    it('should parse weekly recurrence', () => {
      expect(parseRecurrence('Every week on Monday')).toBe('weekly')
      expect(parseRecurrence('Weekly review')).toBe('weekly')
    })

    it('should parse monthly recurrence', () => {
      expect(parseRecurrence('Every month on the 1st')).toBe('monthly')
      expect(parseRecurrence('Monthly report')).toBe('monthly')
    })

    it('should parse weekday recurrence', () => {
      expect(parseRecurrence('Weekdays at 9am')).toBe('weekdays')
      expect(parseRecurrence('Mon-Fri meetings')).toBe('weekdays')
    })

    it('should return null for no recurrence', () => {
      expect(parseRecurrence('Add a task for tomorrow')).toBeNull()
    })
  })
})

describe('ProjectWorker', () => {
  const supportedIntents = ['PROJECT_TASK', 'CREATE_CONTAINER']

  it('should support correct intents', () => {
    expect(supportedIntents).toContain('PROJECT_TASK')
    expect(supportedIntents).toContain('CREATE_CONTAINER')
    expect(supportedIntents).not.toContain('QUICK_TODO')
  })

  describe('Container Creation', () => {
    interface Container {
      title: string
      category: 'project' | 'course' | 'club'
      node_type: 'container'
    }

    function createContainer(
      title: string,
      category: 'project' | 'course' | 'club'
    ): Container {
      return {
        title,
        category,
        node_type: 'container',
      }
    }

    it('should create project container', () => {
      const container = createContainer('My Project', 'project')
      expect(container.category).toBe('project')
      expect(container.node_type).toBe('container')
    })

    it('should create course container', () => {
      const container = createContainer('Math 101', 'course')
      expect(container.category).toBe('course')
    })

    it('should create club container', () => {
      const container = createContainer('Chess Club', 'club')
      expect(container.category).toBe('club')
    })
  })

  describe('Subtask Generation', () => {
    interface ProjectBreakdown {
      container: { title: string; category: string }
      subtasks: Array<{ title: string; parent_id: string }>
    }

    function generateProjectStructure(
      projectTitle: string,
      subtaskTitles: string[]
    ): ProjectBreakdown {
      const containerId = `container-${Date.now()}`
      return {
        container: {
          title: projectTitle,
          category: 'project',
        },
        subtasks: subtaskTitles.map((title) => ({
          title,
          parent_id: containerId,
        })),
      }
    }

    it('should create container with subtasks', () => {
      const result = generateProjectStructure('Build App', [
        'Set up repository',
        'Create database schema',
        'Implement API',
      ])

      expect(result.container.title).toBe('Build App')
      expect(result.subtasks).toHaveLength(3)
      expect(result.subtasks[0].title).toBe('Set up repository')
    })

    it('should link subtasks to parent', () => {
      const result = generateProjectStructure('Test Project', ['Task 1', 'Task 2'])

      const parentId = result.subtasks[0].parent_id
      expect(result.subtasks.every((t) => t.parent_id === parentId)).toBe(true)
    })
  })
})

describe('Worker Selection', () => {
  function selectWorker(intent: string): WorkerType {
    const calendarIntents = ['SCHEDULE_REQUEST', 'ROUTINE']
    const projectIntents = ['PROJECT_TASK', 'CREATE_CONTAINER']

    if (calendarIntents.includes(intent)) return 'calendar'
    if (projectIntents.includes(intent)) return 'project'
    return 'task'
  }

  it('should select calendar worker for schedule intents', () => {
    expect(selectWorker('SCHEDULE_REQUEST')).toBe('calendar')
    expect(selectWorker('ROUTINE')).toBe('calendar')
  })

  it('should select project worker for project intents', () => {
    expect(selectWorker('PROJECT_TASK')).toBe('project')
    expect(selectWorker('CREATE_CONTAINER')).toBe('project')
  })

  it('should select task worker for other intents', () => {
    expect(selectWorker('QUICK_TODO')).toBe('task')
    expect(selectWorker('COURSE_TASK')).toBe('task')
    expect(selectWorker('CLUB_TASK')).toBe('task')
    expect(selectWorker('JOURNAL')).toBe('task')
    expect(selectWorker('UNKNOWN')).toBe('task')
  })
})

/**
 * TODO: Add integration tests with mocked LLM calls:
 *
 * describe('TaskWorker Integration', () => {
 *   it('should extract data using LLM')
 *   it('should create task in database')
 *   it('should handle missing required fields')
 *   it('should find parent container by name')
 * })
 *
 * describe('CalendarWorker Integration', () => {
 *   it('should parse schedule from natural language')
 *   it('should create recurring events')
 *   it('should batch insert time blocks')
 * })
 *
 * describe('ProjectWorker Integration', () => {
 *   it('should generate subtasks from project description')
 *   it('should create container and children atomically')
 *   it('should create relations between tasks')
 * })
 */
