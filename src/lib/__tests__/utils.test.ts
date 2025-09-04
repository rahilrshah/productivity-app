import { describe, it, expect } from '@jest/globals'
import { cn } from '@/lib/utils'

describe('Utils', () => {
  describe('cn (className utility)', () => {
    it('should combine class names correctly', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2')
    })

    it('should handle conditional classes', () => {
      expect(cn('class1', false && 'class2', 'class3')).toBe('class1 class3')
    })

    it('should handle undefined and null values', () => {
      expect(cn('class1', null, undefined, 'class2')).toBe('class1 class2')
    })

    it('should handle Tailwind merge conflicts', () => {
      expect(cn('px-2 py-1', 'px-4')).toContain('px-4')
      expect(cn('px-2 py-1', 'px-4')).not.toContain('px-2')
    })
  })
})