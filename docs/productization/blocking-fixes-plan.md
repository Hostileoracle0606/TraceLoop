# TraceLoop Blocking Fixes — Integrity, Correctness & the Edit-Reliability Decision

> **For agentic workers:** implement task-by-task, TDD-first (write the failing test, watch it fail, minimal impl, watch it pass, commit). Steps use `- [ ]`.

**Goal:** Make the shipped path actually work end-to-end for a real user, close the integrity holes that let clients forge state, correct the FSM/orchestration bugs, and record the coding-agent decision — in a safe sequence.

**Relationship to the prior plan:** This plan is **authoritative and sequenced for the blocking findings** and **supersedes** the overlapping tasks in `implementation-plan.md` (its cancellation / execute-idempotency / patch-atomicity tasks are re-specified here more precisely, plus new P0/security tasks). Do this plan first.

**The decision (do first, it shapes the edit tasks):** `docs/adr/0007-llm-edit-reliability.md` — keep the AI SDK loop; adopt **search/replace edits + validation**; do **not** fork a harness as the orchestrator (wrap Aider/SWE-agent as a contained Modal editor tool only if autonomous multi-file editing later becomes the bottleneck).

**Guiding principle:** No path may report success it did not achieve, no client may write state the FSM didn't authorize, and no user may confuse demo evidence for their own run.

## Sequence (why this order)

| Phase | Why here |
|---|---|
| **A — Unblock the core path (P0)** | Nothing works today: successful runs can't reach analysis (F1), and new projects dead-end empty (F2). You can't secure or test a system that doesn't run. |
| **B — Integrity boundary (P1 security)** | Before any multi-user exposure: today a client can forge completed/passing/audit records directly (F3). Lock writes to the backend FSM. |
| **C — FSM correctness (P1)** | With a working, secured path, fix the orchestration bugs: execute guards (F4), cancellation (F5), atomic patch approval (F7), real acceptance criteria (F6). |
| **D — UX continuity & truthfulness** | Persistence, the `pass`/`passed` split, demo-data isolation, prod networking — the divergences that mislead or lose the user. |

---

# Phase A — Unblock the core path

### Task A1 — Successful runs reach analysis (F1 + F6 backend)
**Files:** Modify `backend/inngest/functions.ts:153-170`; Test `backend/inngest/functions.test.ts`.
**Why:** The pipeline `JSON.parse()`s Modal's **raw Renode text** (throws on every success) and bypasses `parseRenodeLog()`; it also treats empty criteria as `passed` and evaluates only `acceptanceCriteria[0]`.
**Contract:**
```ts
import { parseRenodeLog } from '@engine/renode-parser';
import { analyze } from '@engine/analyze';
const events = parseRenodeLog(jobResult.trace?.log ?? '');   // NOT JSON.parse
if (data.acceptanceCriteria.length === 0)
  return { status: 'failed', rootCauseText: 'No acceptance criteria to prove' }; // empty ≠ passed
const results = data.acceptanceCriteria.map((c) => analyze(events, c));
const status = results.every((r) => r.status === 'passed') ? 'passed' : 'failed';
const firstFail = results.find((r) => r.status === 'failed');
return { status, rootCause: firstFail?.rootCause, rootCauseText: firstFail?.rootCauseText, chain: firstFail?.chain };
```
- [ ] Failing test: given a real Renode trace string, the step returns `passed`/`failed` via `parseRenodeLog`+`analyze` (not JSON.parse).
- [ ] Failing test: empty criteria → `failed`; multi-criteria → fails if **any** fails.
- [ ] Fix the import to the `@engine` alias (not the brittle `../../../src/engine` relative path).
**Acceptance:** a successful Modal run produces a real pass/fail with a root cause; no `JSON.parse` on trace text remains.

### Task A2 — Project creation reaches a working workspace (F2)
**Files:** Modify `frontend/src/TraceLoop.tsx:342` (create flow), `backend/trpc/routers/agent.ts:85` (`plan`/`edit`); add `agent.applyPlan`; Test `backend/trpc/routers/agent.test.ts`.
**Why:** Create makes an empty task, calls `agent.plan`, **discards** the plan, and opens an empty workspace — no persisted plan, no state advance, no files applied. The beginner has no next action.
**Contract:**
```ts
// on create: project+task created → agent.plan(intent,...) → PERSIST plan on task
//   → agent.edit(plan) returns FileOperation[] (search/replace, per ADR-0007, VALIDATED)
//   → apply ops to task.currentFiles → transition planning → editing → ready-to-build
// open workspace only after files exist.
```
- [ ] Failing test: after create, the task has a persisted `plan`, `currentFiles` is non-empty, and status is past `planning`.
- [ ] `agent.edit` outputs are validated (Zod + policy) and applied as search/replace edits.
**Acceptance:** creating a project lands on a workspace containing the agent's firmware, with a viable "Build & run" next step.

---

# Phase B — Integrity boundary (security)

### Task B1 — RLS is read-only for users; writes go through the backend (F3)
**Files:** Create `backend/db/migrations/0003_rls_readonly.sql`; verify all mutating tRPC procedures use the **service-role** client; Test an RLS integration check.
**Why:** RLS grants owners `INSERT/UPDATE/DELETE` on tasks/runs/patches/activity_logs. The browser's anon key + user JWT are public, so a client can bypass the FSM and forge completed/passing/audit records.
**Contract:**
```sql
-- tasks, runs, patches, activity_logs:
--   KEEP: FOR SELECT USING (owner)
--   DROP: *_insert_own, *_update_own, *_delete_own   (no user write policies)
-- All writes performed by the backend via the service-role client (bypasses RLS),
-- authorized in tRPC by ownership AND state/role — never by the client directly.
```
- [ ] Failing test: a user-token Supabase client cannot `update tasks set status='completed'` (RLS denies).
- [ ] Every mutating router uses `createSupabaseAdminClient()` (service role), not the anon client.
**Acceptance:** direct client writes to task/run/patch/log are denied; only the backend FSM can mutate them.

### Task B2 — Remove privileged mutations from the user API (F3 reinforcement + boards)
**Files:** Modify `backend/trpc/routers/runs.ts:91` (remove/relocate `updateStatus`); `backend/trpc/routers/boards.ts:68` (gate writes); Test both.
**Why:** `runs.updateStatus` lets any owner submit arbitrary pass/fail/trace/analysis via tRPC (a forge vector even through the backend). `boards.create/update/delete` are exposed to any authenticated user though RLS says service-role only — any user can rewrite the shared board catalogue.
**Contract:**
```ts
// runs.updateStatus: DELETE from the public router. Run status is written ONLY by the pipeline
//   (service role) inside firmwareRunPipeline.
// boards.create/update/delete: gate behind an adminProcedure (role='service_role'/admin claim),
//   or remove from the public API entirely (seed-managed catalogue).
```
- [ ] Failing test: a normal authenticated user calling `boards.create` is rejected (not admin).
- [ ] `runs.updateStatus` no longer exists on the public router; the pipeline still updates runs.
**Acceptance:** no user-facing endpoint can forge run results or edit the global board catalogue.

---

# Phase C — FSM correctness

### Task C1 — Execute enforces state, budgets, and idempotency (F4)
**Files:** Modify `backend/trpc/routers/tasks.ts:276`; Test `tasks.test.ts`.
**Why:** `execute` checks only ownership + files — it can launch from `stopped`/`completed`, ignore iteration/time/cost budgets, and start concurrent Modal jobs.
**Contract:**
```ts
// guard: task.status ∈ {created, editing, blocked}; else throw
// guard: no active run for (taskId, iteration) — reject concurrent
// enforce: resourceControls (iteration/time/cost) before enqueue
// atomic: compare-and-set status → 'building' (one winner)
```
- [ ] Failing test: execute from `completed`/`stopped`/`building` throws; two rapid calls → exactly one run; over-budget → rejected.
**Acceptance:** one run per iteration; terminal/over-budget tasks can't launch.

### Task C2 — Stop cancels the running pipeline (F5)
**Files:** Modify `backend/trpc/routers/tasks.ts` (`stop` emits `TASK_CANCELLED`), `backend/inngest/functions.ts:22-27` (`cancelOn`), `backend/inngest/client.ts` + the shared run-status contract (add `cancelled`); Test.
**Why:** `stop` starts a *second* function that flips DB status, but the original pipeline has no `cancelOn` and keeps running — later overwriting `stopped` with `patching`/`completed`. The pipeline also writes a `cancelled` run status absent from the shared contract.
**Contract:**
```ts
// stop → inngest.send(TASK_CANCELLED, { taskId, runId, reason })
// firmwareRunPipeline: cancelOn: [{ event: TASK_CANCELLED, if: 'async.data.taskId == event.data.taskId' }]
// every status write guarded by `status !== 'stopped'`
// add 'cancelled' to the RunStatus union + the shared contract used by UI + pipeline
```
- [ ] Failing test: a mid-run cancel aborts the pipeline; task stays `stopped`; `cancelled` is a valid run status everywhere.
**Acceptance:** stopping actually stops; no post-stop overwrite; the status enum is consistent.

### Task C3 — Atomic, backend-driven patch approval (F7)
**Files:** Modify `backend/trpc/routers/patches.ts:151`; `frontend/src/TraceLoop.tsx:888` (stop calling `execute` from the UI); Test.
**Why:** Approval updates the patch+files and logs `→rerunning` but never sets `tasks.status`; the UI *separately* calls `tasks.execute`, jumping to `building`. If execution fails, re-approving fails (patch already approved). Rejection logs `editing` without changing status.
**Contract:**
```ts
// approve: db.transaction → patch.status='approved', task.currentFiles=filesAfterPatch,
//          task.status='rerunning', log(→rerunning, actor user), send TASK_RUN_REQUESTED(iter+1)
//          — the BACKEND enqueues the rerun; the UI does NOT call execute.
// reject(reason): task.status='editing', patch.status='rejected'.
// retry-safe: a failed rerun re-opens patching so a NEW patch can be proposed.
```
- [ ] Failing test: approve sets `tasks.status='rerunning'` and enqueues the rerun in one transaction; UI no longer calls `execute` after approve.
- [ ] Failing test: reject sets `tasks.status='editing'`; a failed rerun allows a new patch.
**Acceptance:** approval is atomic, drives the rerun, and log/status never disagree.

### Task C4 — Real acceptance criteria (F6 frontend)
**Files:** Modify `frontend/src/TraceLoop.tsx:351` (wizard), `backend/trpc/routers/tasks.ts` (`create` validation); Test.
**Why:** The wizard promises derived defaults but submits `[]`, which A1 (and today's pipeline) would otherwise treat as success.
**Contract:**
```ts
// wizard: agent derives ≥1 acceptance criterion from the objective (editable card); never submit []
// tasks.create: reject empty acceptanceCriteria (z.array(...).min(1))
```
- [ ] Failing test: `tasks.create` with `acceptanceCriteria: []` is rejected.
- [ ] The wizard shows agent-derived, editable criteria before create.
**Acceptance:** every task carries at least one real criterion; "no criteria" can never read as passed.

---

# Phase D — UX continuity & truthfulness

### Task D1 — Task/project persistence and reopen
**Files:** Modify `frontend/src/TraceLoop.tsx:260,1128`; add URL param or `localStorage` for the active `taskId`; wire "open project" to load its task.
**Why:** `taskId` lives only in React memory (lost on refresh); existing projects can't be reopened; FSM/tests are passed `undefined` even after creation.
**Contract:** active `taskId` persists (URL `?task=<id>` preferred); opening a project loads its latest task; FSM/analysis receive a real id.
- [ ] Refresh keeps the active task; opening an existing project resumes it; no `undefined` taskId reaches child screens.
**Acceptance:** the user never loses their place.

### Task D2 — Unify the run-status enum (`passed`/`failed`)
**Files:** Create `src/engine/status.ts` (or a shared const) exporting the canonical union; Modify `frontend/src/TraceLoop.tsx:668` (and every `pass`/`fail` check) to use it; align `backend/db/schema.ts:126`.
**Why:** Backend uses `passed`/`failed`; UI checks `pass`/`fail` — so failed runs get the wrong badge, filter, nav, and analysis action.
**Contract:** one canonical `RunStatus = 'pending'|'building'|'simulating'|'analyzing'|'passed'|'failed'|'cancelled'|'error'`, imported by both sides; no bare `'pass'`/`'fail'` literals.
- [ ] Failing test/grep: no `=== 'pass'`/`'fail'` literals remain; a `failed` run renders the failure badge + analysis action.
**Acceptance:** status is one vocabulary end to end.

### Task D3 — Isolate demo data from real execution
**Files:** Modify `frontend/src/TraceLoop.tsx:278,682`; gate `RUN-1042` (`run.ts`) and all fabricated evidence.
**Why:** Live projects/metrics are mixed with fabricated `RUN-1042` failures, logs, success screens, board metadata, integrations, and model status — a new user can mistake demo evidence for their own run.
**Contract:** the authenticated app shows only the user's real records; any retained sample is behind an explicit "Demo" label/route (or removed). The `RUN-1042` static trace is not shown as a user's own run.
- [ ] A fresh account sees "No runs yet," never `RUN-1042` or invented counts.
**Acceptance:** no fabricated evidence appears inside a real user's workspace.

### Task D4 — Production networking via env
**Files:** Modify `frontend/src/lib/trpc.ts:10`; align `docs/release/deployment.md:47`.
**Why:** The client hardcodes `/trpc` (only the Vite dev proxy defines it); the documented `VITE_TRPC_URL` is unused, so a separately deployed frontend calls itself.
**Contract:** `const url = import.meta.env.VITE_TRPC_URL ?? '/trpc'`; deployment doc matches; prod build sets the env.
- [ ] With `VITE_TRPC_URL` set, the client calls the configured backend; docs and code agree.
**Acceptance:** a separately hosted frontend reaches the real backend.

---

## Coverage

| Finding | Task |
|---|---|
| F1 runs can't reach analysis (double bug) | A1 |
| F2 project dead-ends in `planning` | A2 |
| F3 forgeable state/evidence (RLS) | B1 |
| F3/runs.updateStatus + boards writes | B2 |
| F4 execute bypasses FSM/limits | C1 |
| F5 stop doesn't cancel | C2 |
| F6 empty criteria = success | A1 (backend) + C4 (frontend) |
| F7 non-atomic patch approval | C3 |
| UX: taskId in memory / reopen | D1 |
| UX: `pass`/`passed` split | D2 |
| UX: demo data mixed with real | D3 |
| UX: `/trpc` hardcode vs env | D4 |
| Edit-reliability decision (Aider?) | ADR-0007 + applied in A2, C3 |

## Execution
Recommended: **subagent-driven**, strictly in phase order A→B→C→D (A and B are gating). ADR-0007's search/replace+validation lands inside A2 and C3. Start at Task A1.
