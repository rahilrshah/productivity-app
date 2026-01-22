-- V3.0 Schema Migration for Productivity App
-- Adds all missing columns for graph architecture
-- Run this in Supabase SQL Editor

-- Enable pgvector extension (required for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add missing columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS rich_content JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS root_id UUID REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manual_priority INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS computed_priority INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS node_type TEXT CHECK (node_type IN ('container', 'item'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('course', 'project', 'club', 'routine', 'todo', 'journal'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version_history TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_pattern TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_context TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies TEXT[] DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'todo' CHECK (task_type IN ('course', 'project', 'club', 'todo'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type_metadata JSONB DEFAULT '{}';

-- Create task_relations table if not exists
CREATE TABLE IF NOT EXISTS task_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  predecessor_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'blocks' CHECK (relation_type IN ('blocks', 'relates_to', 'duplicate_of')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(predecessor_id, successor_id)
);

-- Create agent_logs table if not exists
CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id UUID NOT NULL,
  turn_index INTEGER NOT NULL,
  user_input TEXT NOT NULL,
  ai_response TEXT,
  intent TEXT DEFAULT '',
  context_state JSONB,
  actions_executed JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_tasks_node_type ON tasks(node_type);
CREATE INDEX IF NOT EXISTS idx_tasks_root_id ON tasks(root_id);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(position);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON tasks(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tasks_computed_priority ON tasks(computed_priority);
CREATE INDEX IF NOT EXISTS idx_task_relations_predecessor ON task_relations(predecessor_id);
CREATE INDEX IF NOT EXISTS idx_task_relations_successor ON task_relations(successor_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_thread ON agent_logs(thread_id);

-- Priority scoring function
CREATE OR REPLACE FUNCTION compute_task_priority(task_row tasks)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Base: manual priority (0-10 scale, weighted heavily)
  score := COALESCE(task_row.manual_priority, 0) * 10;

  -- Due date urgency (closer = higher priority)
  IF task_row.due_date IS NOT NULL THEN
    IF task_row.due_date < NOW() THEN
      score := score + 50; -- Overdue
    ELSIF task_row.due_date < NOW() + INTERVAL '1 day' THEN
      score := score + 40; -- Due today
    ELSIF task_row.due_date < NOW() + INTERVAL '3 days' THEN
      score := score + 30; -- Due within 3 days
    ELSIF task_row.due_date < NOW() + INTERVAL '7 days' THEN
      score := score + 20; -- Due within a week
    END IF;
  END IF;

  -- Category weights
  CASE task_row.category
    WHEN 'course' THEN score := score + 15;
    WHEN 'project' THEN score := score + 10;
    WHEN 'routine' THEN score := score + 5;
    ELSE score := score + 0;
  END CASE;

  -- Status adjustments
  IF task_row.status = 'blocked' THEN
    score := score - 20;
  ELSIF task_row.status = 'in_progress' THEN
    score := score + 25;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-update computed_priority
CREATE OR REPLACE FUNCTION update_computed_priority()
RETURNS TRIGGER AS $$
BEGIN
  NEW.computed_priority := compute_task_priority(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_priority ON tasks;
CREATE TRIGGER trigger_update_priority
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_computed_priority();

-- ============================================
-- LOCAL DEVELOPMENT SETUP (Optional)
-- Run these if testing without authentication
-- ============================================

-- Disable Row Level Security for local development
-- ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE task_relations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_logs DISABLE ROW LEVEL SECURITY;

-- Remove foreign key constraints for local development
-- ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_user_id_fkey;
-- ALTER TABLE task_relations DROP CONSTRAINT IF EXISTS task_relations_user_id_fkey;
-- ALTER TABLE agent_logs DROP CONSTRAINT IF EXISTS agent_logs_user_id_fkey;
