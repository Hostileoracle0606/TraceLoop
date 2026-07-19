-- Pipeline state is mutated exclusively by the backend service role.
-- Authenticated clients retain the ownership-scoped SELECT policies created
-- by 20260718154200_rls_policies.sql, but cannot forge task/run/patch/audit
-- state directly through the Supabase data API.

BEGIN;

DROP POLICY IF EXISTS "tasks_insert_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_own" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_own" ON public.tasks;

DROP POLICY IF EXISTS "runs_insert_own" ON public.runs;
DROP POLICY IF EXISTS "runs_update_own" ON public.runs;
DROP POLICY IF EXISTS "runs_delete_own" ON public.runs;

DROP POLICY IF EXISTS "patches_insert_own" ON public.patches;
DROP POLICY IF EXISTS "patches_update_own" ON public.patches;
DROP POLICY IF EXISTS "patches_delete_own" ON public.patches;

DROP POLICY IF EXISTS "activity_logs_insert_own" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_update_own" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_delete_own" ON public.activity_logs;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.tasks,
  public.runs,
  public.patches,
  public.activity_logs
FROM anon, authenticated;

COMMIT;
