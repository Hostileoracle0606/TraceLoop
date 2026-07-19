-- Migration 0004: Agent runtime selection
-- Adds per-project default runtime and per-task pinned runtime columns

ALTER TABLE projects
  ADD COLUMN agent_runtime_default VARCHAR(16) NOT NULL DEFAULT 'legacy';

ALTER TABLE tasks
  ADD COLUMN agent_runtime VARCHAR(16) NOT NULL DEFAULT 'legacy';

-- Add index for efficient runtime lookups
CREATE INDEX idx_tasks_agent_runtime ON tasks(agent_runtime);
