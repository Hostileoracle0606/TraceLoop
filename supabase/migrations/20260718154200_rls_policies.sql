-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "projects_select_own" ON projects;
DROP POLICY IF EXISTS "projects_insert_own" ON projects;
DROP POLICY IF EXISTS "projects_update_own" ON projects;
DROP POLICY IF EXISTS "projects_delete_own" ON projects;

DROP POLICY IF EXISTS "boards_select_all" ON boards;
DROP POLICY IF EXISTS "boards_insert_admin" ON boards;
DROP POLICY IF EXISTS "boards_update_admin" ON boards;
DROP POLICY IF EXISTS "boards_delete_admin" ON boards;

DROP POLICY IF EXISTS "tasks_select_own" ON tasks;
DROP POLICY IF EXISTS "tasks_insert_own" ON tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_own" ON tasks;

DROP POLICY IF EXISTS "runs_select_own" ON runs;
DROP POLICY IF EXISTS "runs_insert_own" ON runs;
DROP POLICY IF EXISTS "runs_update_own" ON runs;
DROP POLICY IF EXISTS "runs_delete_own" ON runs;

DROP POLICY IF EXISTS "patches_select_own" ON patches;
DROP POLICY IF EXISTS "patches_insert_own" ON patches;
DROP POLICY IF EXISTS "patches_update_own" ON patches;
DROP POLICY IF EXISTS "patches_delete_own" ON patches;

DROP POLICY IF EXISTS "activity_logs_select_own" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert_own" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_update_own" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_delete_own" ON activity_logs;

-- Projects: users can only access their own
CREATE POLICY "projects_select_own" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "projects_insert_own" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "projects_update_own" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "projects_delete_own" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Boards: readable by all authenticated users, writable by service role only
CREATE POLICY "boards_select_all" ON boards FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "boards_insert_admin" ON boards FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "boards_update_admin" ON boards FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "boards_delete_admin" ON boards FOR DELETE USING (auth.role() = 'service_role');

-- Tasks: users can only access tasks in their own projects
CREATE POLICY "tasks_select_own" ON tasks FOR SELECT USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);
CREATE POLICY "tasks_insert_own" ON tasks FOR INSERT WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);
CREATE POLICY "tasks_update_own" ON tasks FOR UPDATE USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);
CREATE POLICY "tasks_delete_own" ON tasks FOR DELETE USING (
  project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);

-- Runs: users can only access runs in their own tasks
CREATE POLICY "runs_select_own" ON runs FOR SELECT USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "runs_insert_own" ON runs FOR INSERT WITH CHECK (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "runs_update_own" ON runs FOR UPDATE USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "runs_delete_own" ON runs FOR DELETE USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);

-- Patches: users can only access patches in their own tasks
CREATE POLICY "patches_select_own" ON patches FOR SELECT USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "patches_insert_own" ON patches FOR INSERT WITH CHECK (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "patches_update_own" ON patches FOR UPDATE USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "patches_delete_own" ON patches FOR DELETE USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);

-- Activity logs: users can only access logs in their own tasks
CREATE POLICY "activity_logs_select_own" ON activity_logs FOR SELECT USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "activity_logs_insert_own" ON activity_logs FOR INSERT WITH CHECK (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "activity_logs_update_own" ON activity_logs FOR UPDATE USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);
CREATE POLICY "activity_logs_delete_own" ON activity_logs FOR DELETE USING (
  task_id IN (SELECT id FROM tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
);

-- Service role bypasses RLS (already default in Supabase, but explicit for clarity)
-- No additional policies needed; service_role uses BYPASSRLS
