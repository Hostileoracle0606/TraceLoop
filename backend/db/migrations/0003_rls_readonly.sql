-- B1: Make RLS read-only for users on state-mutating tables.
-- Users can SELECT their own data, but all writes go through the backend
-- service-role client (which bypasses RLS). This prevents clients from
-- forging task/run/patch/audit state directly.

-- Tasks: drop insert/update/delete, keep select
DROP POLICY IF EXISTS "tasks_insert_own" ON tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON tasks;
DROP POLICY IF EXISTS "tasks_delete_own" ON tasks;

-- Runs: drop insert/update/delete, keep select
DROP POLICY IF EXISTS "runs_insert_own" ON runs;
DROP POLICY IF EXISTS "runs_update_own" ON runs;
DROP POLICY IF EXISTS "runs_delete_own" ON runs;

-- Patches: drop insert/update/delete, keep select
DROP POLICY IF EXISTS "patches_insert_own" ON patches;
DROP POLICY IF EXISTS "patches_update_own" ON patches;
DROP POLICY IF EXISTS "patches_delete_own" ON patches;

-- Activity logs: drop insert/update/delete, keep select
DROP POLICY IF EXISTS "activity_logs_insert_own" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_update_own" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_delete_own" ON activity_logs;

-- Projects: keep user write policies (users create/update their own projects)
-- Boards: already service-role only (boards_insert_admin, etc.)
