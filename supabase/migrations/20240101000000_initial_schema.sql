-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  encrypted_settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content JSONB, -- Encrypted rich text content
  status VARCHAR(50) DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  due_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Scheduling
  scheduled_for TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  
  -- Recurrence
  recurrence_pattern JSONB,
  recurrence_parent_id UUID REFERENCES tasks(id),
  
  -- AI Context
  ai_context JSONB, -- Encrypted AI suggestions/context
  embedding VECTOR(384), -- For semantic search
  
  -- Metadata
  tags TEXT[],
  dependencies UUID[],
  position REAL, -- For ordering
  
  -- Versioning
  version INTEGER DEFAULT 1,
  version_history JSONB[],
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create sync_log table for CRDT operations
CREATE TABLE sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  operation VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  changes JSONB NOT NULL,
  vector_clock JSONB NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create automation_rules table
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_config JSONB NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_user_status ON tasks(user_id, status);
CREATE INDEX idx_due_date ON tasks(due_date);
CREATE INDEX idx_scheduled ON tasks(scheduled_for);
CREATE INDEX idx_position ON tasks(user_id, position);
CREATE INDEX idx_sync_user_device ON sync_log(user_id, device_id, synced_at);
CREATE INDEX idx_automation_active ON automation_rules(user_id, is_active);

-- Materialized View for Performance
CREATE MATERIALIZED VIEW task_statistics AS
SELECT 
  user_id,
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_tasks,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600)::INTEGER as avg_completion_hours
FROM tasks
GROUP BY user_id, DATE_TRUNC('day', created_at);

CREATE INDEX idx_task_stats ON task_statistics(user_id, date);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own data" ON users FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users can view own tasks" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own sync log" ON sync_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own automation rules" ON automation_rules FOR ALL USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_task_statistics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY task_statistics;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh every hour (requires pg_cron extension)
-- SELECT cron.schedule('refresh-task-stats', '0 * * * *', 'SELECT refresh_task_statistics();');