-- Add missing position column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Update existing tasks to have a position value
UPDATE tasks SET position = ROW_NUMBER() OVER (ORDER BY created_at) WHERE position IS NULL OR position = 0;

-- Create index for better performance on position-based queries
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);

-- Update RLS policy if needed (tasks should be accessible by user)
-- This ensures position column is included in existing policies