-- Migration: Multi-Agent Supervision Architecture
-- Description: Creates tables for agent threads, messages, and async job queue
-- This enables the supervisor-worker pattern for distributed agent processing

-- ==========================================
-- Agent Threads Table
-- Stores conversation context between user and agent
-- ==========================================

CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user's threads
CREATE INDEX IF NOT EXISTS idx_agent_threads_user
  ON agent_threads(user_id, status, last_message_at DESC);

-- ==========================================
-- Agent Messages Table
-- Stores individual messages within threads
-- ==========================================

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  context_state JSONB,
  job_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching thread messages
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread
  ON agent_messages(thread_id, created_at ASC);

-- ==========================================
-- Agent Jobs Table (Async Queue)
-- Stores jobs for background processing by workers
-- ==========================================

CREATE TABLE IF NOT EXISTS agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id UUID REFERENCES agent_threads(id),
  message_id UUID REFERENCES agent_messages(id),
  intent TEXT NOT NULL,
  worker_type TEXT NOT NULL CHECK (worker_type IN ('calendar', 'task', 'project')),
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'claimed', 'processing', 'completed', 'failed', 'cancelled'
  )),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  progress_message TEXT,
  input_data JSONB NOT NULL,
  output_data JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  claimed_by TEXT,
  claimed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Critical index for job claiming (pending jobs by type)
CREATE INDEX IF NOT EXISTS idx_agent_jobs_pending
  ON agent_jobs(worker_type, created_at ASC)
  WHERE status = 'pending';

-- Index for user's jobs
CREATE INDEX IF NOT EXISTS idx_agent_jobs_user
  ON agent_jobs(user_id, created_at DESC);

-- Index for thread's jobs
CREATE INDEX IF NOT EXISTS idx_agent_jobs_thread
  ON agent_jobs(thread_id, created_at DESC)
  WHERE thread_id IS NOT NULL;

-- ==========================================
-- Atomic Job Claiming Function
-- Uses SELECT FOR UPDATE SKIP LOCKED for safe concurrent claiming
-- ==========================================

CREATE OR REPLACE FUNCTION claim_next_job(
  p_worker_type TEXT,
  p_worker_id TEXT
)
RETURNS agent_jobs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed_job agent_jobs;
BEGIN
  -- Select and lock the next pending job for this worker type
  SELECT * INTO claimed_job
  FROM agent_jobs
  WHERE status = 'pending'
    AND worker_type = p_worker_type
    AND (next_retry_at IS NULL OR next_retry_at <= NOW())
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  -- If we found a job, claim it
  IF claimed_job.id IS NOT NULL THEN
    UPDATE agent_jobs
    SET
      status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = NOW(),
      updated_at = NOW()
    WHERE id = claimed_job.id;

    -- Return the updated job
    SELECT * INTO claimed_job
    FROM agent_jobs
    WHERE id = claimed_job.id;
  END IF;

  RETURN claimed_job;
END;
$$;

-- ==========================================
-- Helper Function: Increment Thread Message Count
-- ==========================================

CREATE OR REPLACE FUNCTION increment_thread_message_count(p_thread_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agent_threads
  SET
    message_count = message_count + 1,
    last_message_at = NOW(),
    updated_at = NOW()
  WHERE id = p_thread_id;
END;
$$;

-- ==========================================
-- Trigger: Update timestamps
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to agent_threads
DROP TRIGGER IF EXISTS update_agent_threads_updated_at ON agent_threads;
CREATE TRIGGER update_agent_threads_updated_at
  BEFORE UPDATE ON agent_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to agent_jobs
DROP TRIGGER IF EXISTS update_agent_jobs_updated_at ON agent_jobs;
CREATE TRIGGER update_agent_jobs_updated_at
  BEFORE UPDATE ON agent_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- Row Level Security (RLS)
-- ==========================================

ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;

-- Threads: Users can only see their own threads
CREATE POLICY agent_threads_user_policy ON agent_threads
  FOR ALL
  USING (auth.uid() = user_id);

-- Messages: Users can only see messages in their threads
CREATE POLICY agent_messages_user_policy ON agent_messages
  FOR ALL
  USING (auth.uid() = user_id);

-- Jobs: Users can only see their own jobs
CREATE POLICY agent_jobs_user_policy ON agent_jobs
  FOR ALL
  USING (auth.uid() = user_id);

-- ==========================================
-- Enable Realtime for Jobs
-- (Allows clients to subscribe to job updates)
-- ==========================================

-- Add to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'agent_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE agent_jobs;
  END IF;
END $$;

-- ==========================================
-- Grant Permissions
-- ==========================================

GRANT SELECT, INSERT, UPDATE, DELETE ON agent_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent_jobs TO authenticated;

GRANT EXECUTE ON FUNCTION claim_next_job(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_thread_message_count(UUID) TO authenticated;

-- ==========================================
-- Comments for Documentation
-- ==========================================

COMMENT ON TABLE agent_threads IS 'Conversation threads between users and AI agent';
COMMENT ON TABLE agent_messages IS 'Individual messages within agent threads';
COMMENT ON TABLE agent_jobs IS 'Async job queue for agent worker processing';
COMMENT ON FUNCTION claim_next_job IS 'Atomically claim the next pending job for a worker type';
COMMENT ON FUNCTION increment_thread_message_count IS 'Helper to increment thread message count';
