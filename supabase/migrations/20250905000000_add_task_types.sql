-- Add task type and metadata fields to support multi-type task system
-- Migration for courses, projects, clubs, and todos support

-- Add task type enum and metadata columns
ALTER TABLE tasks 
ADD COLUMN task_type VARCHAR(20) DEFAULT 'todo' CHECK (task_type IN ('course', 'project', 'club', 'todo')),
ADD COLUMN type_metadata JSONB DEFAULT '{}';

-- Create indexes for efficient querying
CREATE INDEX idx_tasks_type ON tasks(user_id, task_type);
CREATE INDEX idx_tasks_type_metadata ON tasks USING gin(type_metadata);

-- Update the task_statistics materialized view to include type information
DROP MATERIALIZED VIEW task_statistics;

CREATE MATERIALIZED VIEW task_statistics AS
SELECT 
  user_id,
  DATE_TRUNC('day', created_at) as date,
  task_type,
  COUNT(*) as total_tasks,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600)::INTEGER as avg_completion_hours,
  AVG(priority) as avg_priority,
  COUNT(CASE WHEN due_date IS NOT NULL AND due_date < NOW() AND status != 'completed' THEN 1 END) as overdue_tasks
FROM tasks
WHERE deleted_at IS NULL
GROUP BY user_id, DATE_TRUNC('day', created_at), task_type;

CREATE INDEX idx_task_stats_new ON task_statistics(user_id, date, task_type);

-- Create a function to migrate existing tasks to have default metadata
CREATE OR REPLACE FUNCTION migrate_existing_tasks_to_typed()
RETURNS void AS $$
BEGIN
  -- Update existing tasks without type_metadata to have appropriate empty metadata
  UPDATE tasks 
  SET type_metadata = CASE task_type
    WHEN 'course' THEN '{"course_code": "", "semester": "", "assignment_type": "homework", "credits": 3}'::jsonb
    WHEN 'project' THEN '{"project_type": "personal", "methodology": "agile", "phase": "planning"}'::jsonb  
    WHEN 'club' THEN '{"club_name": "", "role": "member"}'::jsonb
    ELSE '{"category": "general"}'::jsonb
  END
  WHERE type_metadata = '{}'::jsonb OR type_metadata IS NULL;
  
  -- Set task_type to 'todo' for any tasks that don't have it set
  UPDATE tasks SET task_type = 'todo' WHERE task_type IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Run the migration function
SELECT migrate_existing_tasks_to_typed();

-- Drop the migration function as it's no longer needed
DROP FUNCTION migrate_existing_tasks_to_typed();

-- Add validation constraints for metadata based on task type
CREATE OR REPLACE FUNCTION validate_task_type_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that metadata contains required fields for each task type
  CASE NEW.task_type
    WHEN 'course' THEN
      IF NOT (NEW.type_metadata ? 'course_code' AND NEW.type_metadata ? 'semester' AND NEW.type_metadata ? 'assignment_type') THEN
        RAISE EXCEPTION 'Course tasks must have course_code, semester, and assignment_type in metadata';
      END IF;
    WHEN 'project' THEN  
      IF NOT (NEW.type_metadata ? 'methodology' AND NEW.type_metadata ? 'phase') THEN
        RAISE EXCEPTION 'Project tasks must have methodology and phase in metadata';
      END IF;
    WHEN 'club' THEN
      IF NOT (NEW.type_metadata ? 'club_name' AND NEW.type_metadata ? 'role') THEN
        RAISE EXCEPTION 'Club tasks must have club_name and role in metadata';
      END IF;
    -- 'todo' tasks can have any metadata structure or empty
  END CASE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate metadata on insert/update
CREATE TRIGGER validate_task_metadata 
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION validate_task_type_metadata();

-- Update RLS policies to work with new fields (existing policies should still work)
-- No changes needed as the policies are based on user_id which remains unchanged

-- Add comments for documentation
COMMENT ON COLUMN tasks.task_type IS 'Type of task: course, project, club, or todo';
COMMENT ON COLUMN tasks.type_metadata IS 'Type-specific metadata stored as JSONB for flexibility';