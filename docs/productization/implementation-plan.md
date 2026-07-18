# TraceLoop Productization — Implementation Plan

> **For agentic workers:** use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Each task is TDD-first: write the failing test, watch it fail, implement minimally, watch it pass, commit. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the gap between "convincing demo" and "trustworthy agentic firmware IDE" — make the core authoring loop actually close through the product, enforce the human-in-the-loop and safety contracts, and make every UI affordance truthful.

**Architecture:** Control plane (React + tRPC + Supabase/Drizzle) drives a durable Inngest pipeline that calls the Modal compute plane (isolated Zephyr build + Renode sim) and the deterministic causal engine (`src/engine/*`). The LLM (Vercel AI SDK) serves 4 of the FSM's 11 states; the FSM owns transitions. See `docs/adr/0001`–`0006`.

**Tech stack:** TypeScript, React 18 + Vite, tRPC v11, Drizzle + Supabase (Postgres/Auth/Storage/Realtime), Inngest, Modal (Python), Vitest, Playwright.

**Source of gaps:** three validated reviews — the P0–P2 backend/security review (10 findings), the element-by-element UI review (~40 items), and the user-centric productization summary. This plan covers all of them.

---

## Guiding principle (the acceptance lens for every task)

> At every moment, show the user **what TraceLoop is doing, what evidence it has, whether they need to decide anything, and what it will do next.** Every control is one of: **wired to live data**, **labelled demo**, **disabled with a reason**, or **removed**. No affordance may imply a completed backend action it did not perform.

## Sequencing (why this order)

The reviews converge on one root cause: **two parallel implementations** — a well-tested engine (`runStatefulAuthoringLoop`, permissions, LLM router, `proposePatch`, Zod tool schemas) and a production Inngest pipeline that never calls them. The plan therefore fixes the **shipped path first**, then hardens boundaries, then makes the UI honest.

| Phase | Workstream | Why it's here |
|---|---|---|
| 1 | **A — Close the loop** | The autonomous fix-and-reprove *is* the product. Nothing else matters if it doesn't close. |
| 1 | **B — Boundary safety** | The loop will run LLM-authored code in the cloud; permission-before-apply, LLM validation, and Modal containment must land *with* the loop, not after. |
| 2 | **C — Bootstrap & tests** | A fresh install must run; integration tests must cover the *shipped* path (not the parallel modules) so Phase 1 doesn't regress. |
| 3 | **D — Truthfulness pass** | Once actions are real, remove every remaining fake affordance so the UI can be trusted. |
| 3 | **E — Journey & legibility** | Reorder the arc around the user (onboarding, attention bar, calm failure view) so the now-real product is usable by a non-expert. |

Phases 1 tasks are mostly parallel-safe by file; within a workstream, follow the listed order.

---

# Workstream A — Close the loop

**Why:** A user can currently reach *intent → firmware → build → simulate → failure analysis + a proposed patch*, but the loop does not close: the Inngest pipeline doesn't propose/apply patches or rerun, and approving a patch doesn't enqueue anything. This is the single highest-value gap.

### Functional contracts (A)

**Compute job (single endpoint — matches the deployed Modal app):**
```ts
// backend/modal-client.ts
interface FirmwareJobRequest { files: Record<string, string>; board: string; /* SLUG, e.g. "stm32f4_disco" */ }
interface FirmwareJobResult  { build: { ok: boolean; log: string }; trace?: { log: string } }
modalClient.runJob(req: FirmwareJobRequest): Promise<FirmwareJobResult>
```

**Pipeline event (extended):**
```ts
type TaskRunEventData = {
  taskId: string; runId: string; userId: string; projectId: string;
  iteration: number; files: Record<string,string>;
  boardSlug: string;                 // resolved from board UUID
  acceptanceCriteria: AcceptanceCriterion[];
  profile: 'review'|'guided'|'autonomous';
  resourceControls: { maxIterations: number; maxTimeMs: number; maxCostUsd: number };
};
```

**Pipeline state machine (durable):**
```
building ─ build.ok=false ─► editing (agent fixes) ──► re-enqueue(iter+1)   [until maxIterations → blocked]
   │ build.ok=true
   ▼
simulating ─► analyzing ─► analyze.status=passed ─► completed
                          └ failed ─► patching ─► proposePatch
                                        │ profile=autonomous ─► apply ─► rerunning ─► re-enqueue(iter+1)
                                        └ profile=review|guided ─► persist patch(proposed) ─► waitForEvent(PATCH_APPROVED, 24h)
                                              │ approved ─► apply ─► rerunning ─► re-enqueue(iter+1)
                                              └ timeout/rejected ─► editing | blocked
cancelOn TASK_CANCELLED where async.data.taskId == event.data.taskId  (all states)
```

### Tasks (A)

### Task A1 — Collapse the Modal client to the deployed single-job contract
**Files:** Modify `backend/modal-client.ts`, `backend/inngest/functions.ts:33-120`; Test `backend/modal-client.test.ts`.
- [ ] Failing test: `runJob({files, board:'stm32f4_disco'})` posts to the root endpoint and returns `{build, trace}` (mock `fetch`).
- [ ] Replace `build`/`simulate`/`analyze` methods with `runJob`. Delete `elfPath`/`SimulateRequest`/`AnalyzeRequest`.
- [ ] In the pipeline, replace the 3 steps with one `run-firmware-job` step calling `runJob`; drop the `firmware.elf`/`elfPath` artifact handoff (upload `build.log`/`trace.log` only).
- [ ] Resolve `boardSlug` from the board UUID (Task C1's `boards.slug`) in `tasks.execute` before sending the event.
- [ ] Analysis moves in-process: the pipeline calls the engine `outcomeFromJob` + `analyze` (import from `@engine`), not a Modal `/analyze`.
**Acceptance:** pipeline compiles; a mocked job flows build→trace→analyze; no reference to `elfPath` remains. **Why:** the deployed endpoint does build+sim in one isolated job; separate calls + an ephemeral container path can never work.

### Task A2 — Make the pipeline the authoring loop
**Files:** Modify `backend/inngest/functions.ts`, `backend/inngest/client.ts` (event types); Test `backend/inngest/functions.test.ts`.
- [ ] Failing test: given a mocked failing job, the pipeline creates a `patches` row (status `proposed`) and, for `autonomous`, applies it and re-sends `TASK_RUN_REQUESTED` with `iteration+1`.
- [ ] On `build.ok=false`: transition task→`editing`, call the LLM patcher/`proposePatch` with the compiler log, re-enqueue — until `iteration >= maxIterations` → `blocked`.
- [ ] On `analyze.status=failed`: `patching` → `proposePatch(files, rootCause.register, criterion.register)` → persist patch → branch by `profile` (see contract).
- [ ] On `analyze.status=passed`: `completed`.
**Acceptance:** an integration test (Task C2) drives fail→patch→rerun→pass. **Why:** without this, the product's core promise is unfulfilled.

### Task A3 — Enforce permissions inside the loop
**Files:** Modify `src/engine/authoring-loop.ts:297-316`; Modify `src/engine/authoring-loop-stateful.test.ts:171`; `backend/inngest/functions.ts`.
- [ ] Failing test: with `profile='review'`, the loop **pauses** (returns `awaiting-approval`, does NOT mutate `files`) instead of proceeding.
- [ ] Reorder: `checkPermission(profile, 'apply-patch')` **before** `files = patch.files`. If `requiresApproval`, stop and surface `awaiting-approval`; only apply after real approval. Record actor `user` only on actual approval, else `system`.
- [ ] Rewrite the mis-encoded test to assert the pause.
**Acceptance:** review/guided pause; autonomous proceeds; audit actor is truthful. **Why:** current code applies the patch before checking, ignores denial, and forges a `user` approval — violating the central human-in-the-loop contract.

### Task A4 — Cancellation actually cancels
**Files:** Modify `backend/trpc/routers/tasks.ts:345-397` (`stop`), `backend/inngest/functions.ts:22-27` (add `cancelOn`).
- [ ] Failing test: `tasks.stop` sends `TASK_CANCELLED {taskId, runId, reason}`.
- [ ] Add `cancelOn: [{ event: Events.TASK_CANCELLED, if: 'async.data.taskId == event.data.taskId' }]` to `firmwareRunPipeline`.
- [ ] Guard every status write with `if task.status !== 'stopped'` (compare-and-set) so a cancelled task isn't overwritten.
**Acceptance:** stopping mid-run aborts the function and leaves `stopped`. **Why:** today `stop` only flips a DB flag; the pipeline keeps running and overwrites `stopped`.

### Task A5 — Patch approve/reject drive task state + rerun
**Files:** Modify `backend/trpc/routers/patches.ts:122-238`; Test `backend/trpc/routers/patches.test.ts`.
- [ ] Failing test: `approve` sets `tasks.status='rerunning'`, updates `currentFiles`, and sends `TASK_RUN_REQUESTED` (iteration+1) — all in one transaction.
- [ ] `reject(reason)` sets `tasks.status='editing'` consistent with the `→editing` log.
- [ ] Wrap both in `db.transaction`.
**Acceptance:** activity log and `tasks.status` never disagree; approving reruns. **Why:** today the log says `rerunning`/`editing` while `tasks.status` is unchanged, and approval enqueues nothing.

### Task A6 — Idempotent execute + resource controls + cost units
**Files:** Modify `backend/trpc/routers/tasks.ts:269-343`; `src/engine/authoring-loop.ts:188,208`; `backend/db/schema.ts:88,165`; Test `backend/trpc/routers/tasks.test.ts`.
- [ ] Failing test: `execute` from `completed`/`stopped`/`building` throws; two rapid calls create exactly one run.
- [ ] Guard `execute` to `status ∈ {created, editing, blocked}`; atomic compare-and-set `status→building`.
- [ ] Pipeline passes `task.resourceControls` into the loop; fold `opts.maxIterations` into `controls`; accumulate per-run cost; convert **cents↔dollars** at the DB boundary (`/100`, `*100`).
**Acceptance:** no duplicate runs; budget actually enforced; cost math consistent. **Why:** double-clicks spawn duplicate runs; controls are stored but ignored; DB cents vs engine dollars silently disagree.

---

# Workstream B — Boundary safety

**Why:** Phase 1 makes the agent edit real code and run it in the cloud. The two trust boundaries — LLM output and the public Modal endpoint — are currently unvalidated.

### Functional contracts (B)

**LLM output:** every model response is parsed with a Zod schema and policy-checked before use.
```ts
// backend/llm/validate.ts
validatePlan(raw: unknown, currentFiles: string[]): Plan            // throws on schema/policy violation
validateOperations(raw: unknown, plan: Plan, files: Record<string,string>): FileOperation[]
// policy: path ∈ plan; !isProtectedFile(path); no absolute/'..'; edit.search must exist in file; confidence ∈ [0,1]
```

**Modal endpoint:** authenticated, contained, capped, quiet on internal errors.
```
POST /  headers: { X-TraceLoop-Token: <secret> }
body: { files: {<=64 files, <=1MB total>}, board }
containment: (workdir/relpath).resolve() ⊆ workdir; reject absolute or '..'
errors: return { build:{ok:false, log:"firmware build failed"} }  (no Python traceback); log detail server-side
```

### Tasks (B)

### Task B1 — Validate & enforce LLM outputs
**Files:** Create `backend/llm/validate.ts`; Modify `backend/llm/functions.ts:96-159` (use `generateObject`/`safeParse` + validators); use existing `backend/llm/tools.ts` schemas and `src/engine/permissions.ts:isProtectedFile`; Test `backend/llm/validate.test.ts`.
- [ ] Failing tests: rejects out-of-plan path, protected test file, `../` traversal, missing `search` string, confidence `1.5`, malformed JSON.
- [ ] Prefer AI-SDK `generateObject({schema})`; else `schema.safeParse(JSON.parse(text))`; then the policy checks; retry once on failure, then throw a typed `LLMValidationError`.
**Acceptance:** every listed malformed output is rejected. **Why:** prompts are guidance, not enforcement — today outputs are `JSON.parse` + `as` casts; `isProtectedFile` and the Zod schemas are used only in tests.

### Task B2 — Harden the Modal boundary
**Files:** Modify `modal/app.py:135-228`; Test `backend/modal-client.test.ts` (contract) + a Python unit if present.
- [ ] Containment: resolve each write path, assert `is_relative_to(workdir)`, reject absolute/`..` → `{build:{ok:false, log:"invalid file path"}}`.
- [ ] Auth: require `X-TraceLoop-Token` == `os.environ["TRACELOOP_TOKEN"]` (Modal Secret); 401 otherwise. Client sends it.
- [ ] Caps: reject >64 files or >1MB total.
- [ ] Replace the traceback-returning `except` with a generic message; keep the *compiler* log (user-facing), drop the *harness* traceback.
**Acceptance:** traversal/oversized/unauthenticated requests are rejected; no tracebacks leak. **Why:** the endpoint is public, writes user-controlled paths with no containment, and leaks internal tracebacks.

---

# Workstream C — Bootstrap & tests

**Why:** a clean checkout must run, and the test suite must cover the *shipped* pipeline (not the parallel engine modules) so Phase 1 can't silently regress.

### Tasks (C)

### Task C1 — Committed migrations + board seed + slug
**Files:** `backend/db/migrations/*` (generated), `backend/db/seed.ts`, `backend/db/schema.ts` (ensure `boards.slug`), `package.json` scripts (`db:migrate`, `db:seed`); Test `backend/db/seed.test.ts`.
- [ ] Failing test: after `db:seed`, `boards.list` returns ≥1 board with `slug='stm32f4_disco'`.
- [ ] Commit `drizzle-kit generate` output; write a seed inserting STM32F4 Discovery (name, `slug`, mcu, arch, `verified:true`).
- [ ] Verify `boards.list` (public) already exists (it does) and returns the seed.
**Acceptance:** fresh DB → project creation has a valid board. **Why:** finding 10 — no committed migrations/seed means a fresh DB can't create a project. (`boards.ts` router now exists; this closes the data half.)

### Task C2 — Integration tests for the real pipeline
**Files:** Create `backend/inngest/pipeline.integration.test.ts` (mock Modal + DB via `inngest/test` or a fake step runner); Test that path only.
- [ ] fail→patch→(auto)apply→rerun→pass converges and ends `completed`.
- [ ] `review` profile pauses at `patching` awaiting `PATCH_APPROVED`; `approve` resumes to `rerunning`.
- [ ] `TASK_CANCELLED` aborts and leaves `stopped` (not overwritten).
- [ ] build-fail loops to `editing` and stops at `blocked` on budget.
**Acceptance:** these four assertions pass against the actual `firmwareRunPipeline`. **Why:** the 98 green tests exercise parallel modules the pipeline never calls — false confidence.

### Task C3 — Quick correctness fixes
**Files:** Create `frontend/src/vite-env.d.ts`; Modify root `package.json` (drizzle bump).
- [ ] `frontend/src/vite-env.d.ts`: `/// <reference types="vite/client" />` (declares `*?raw`) — or remove the unused `firmwareSource` import in `TraceLoop.tsx:5`. Frontend `tsc --noEmit` passes.
- [ ] Bump `drizzle-orm` to `>=0.45.2` (fixes the high-severity SQL-injection advisory); run the suite to catch breaking changes.
**Acceptance:** frontend typecheck green; `npm audit` clear of the Drizzle high. **Why:** finding 11 tail — a broken frontend build and a known-vulnerable ORM.

---

# Workstream D — Truthfulness pass (UI trust)

**Why:** once actions are real, every remaining fake affordance is now the *biggest* trust risk. Apply the four-way rule (wire / label / disable-with-reason / remove) to each control.

### Tasks (D)

### Task D1 — Health-derived system status
**Files:** Modify `TraceLoop.tsx` (sidebar "Renode connected" badge, Settings "All systems ready"); use `/api/health`; Test Playwright.
- [ ] Replace hardcoded "Renode connected · local" with health-derived `Simulator ready` / `Compute unavailable` / `Checking systems`. Versions in a popover.
- [ ] Settings shows live per-dependency status; never "All core systems ready" unless all health checks pass.
**Acceptance:** with the backend down, the badge reads unavailable, not connected. **Why:** a fake "connected" badge poisons trust in the real analysis beside it.

### Task D2 — Disable/label unimplemented affordances
**Files:** Modify `TraceLoop.tsx` (New-project firmware-source choices; Custom Renode board; commit; reports; project/board/branch selectors).
- [ ] Git connect / Upload ZIP / Upload ELF / Custom Renode / Commit patch → `disabled` with a one-line "Not connected yet" reason (until their flows exist).
- [ ] Static Project/Board/Branch selectors → context **chips** (non-interactive) until wired.
**Acceptance:** no control changes only the screen while implying a backend action. **Why:** false affordances are the review's "most stressful" issue.

### Task D3 — Notifications & metrics from real data
**Files:** Modify `TraceLoop.tsx` (notifications, dashboard "Needs attention"); use `tasks.getActivityLog` / `/api/metrics`.
- [ ] Derive notifications from `activity_logs`, grouped by task, summarised as "1 decision needed" (not every pipeline event).
- [ ] Confirm dashboard metrics use `/api/metrics` with skeleton + "No runs yet" empty state (already wired — verify + add empty state).
**Acceptance:** notifications reflect real logs; zero-state shows "No runs yet," never invented numbers. **Why:** metrics/notifications that invent activity mislead the user about system state.

---

# Workstream E — Journey & legibility

**Why:** the now-real product must open where the user's journey starts, keep them oriented during long runs, and lead with the calm root-cause answer.

### Tasks (E)

### Task E1 — Initial view, sidebar, and FSM placement
**Files:** Modify `TraceLoop.tsx:897` (initial view), sidebar nav, FSM entry.
- [ ] Open on **Projects** (or a "Resume active task" card if one is active), not failure analysis.
- [ ] Sidebar: keep Projects/Agent/Runs prominent; group Platforms/Tests/Reports under "Project resources"; move FSM under "Advanced."
**Acceptance:** cold load lands on Projects. **Why:** the spec's center is the authoring loop, not a dense failed trace.

### Task E2 — Persistent task-attention bar
**Files:** Create `frontend/src/components/TaskAttentionBar.tsx`; mount across Agent/Build/Analysis/Patch.
```ts
interface TaskAttention {
  state: string; iteration: number; maxIterations: number;
  profile: 'review'|'guided'|'autonomous'; budget?: string;
  actionRequired?: { label: string; cta: { text: string; onClick: () => void } };
  onStop: () => void;
}
```
- [ ] Renders `Analyzing trace · Iteration 2/5 · Guided · No action needed · Stop`, or `Patch ready · Your approval is required · Review patch`. Data from `tasks.get` + `getActivityLog`; Stop → `tasks.stop`.
**Acceptance:** the bar shows live state on every loop screen; Stop works. **Why:** long runs need continuous, honest status + a reachable Stop — the biggest anxiety-reducer.

### Task E3 — Calm failure view (progressive disclosure)
**Files:** Modify `TraceLoop.tsx` FailureAnalysis.
- [ ] Default focus: plain-language **root cause** + **recommended next action** (Review proposed fix, if a patch exists). Demote "Rerun" to "Rerun unchanged."
- [ ] Show **one** of Timeline / Virtual Board / Causal Graph at a time (tabs, not a competing wide grid). Filters default to the failed assertion + implicated components; the rest under "Advanced filters." Confidence shown once; raw Renode under "Technical evidence."
**Acceptance:** first paint answers what failed / why / what to do / evidence, with the rest disclosed on demand. **Why:** your most differentiated screen should lead, not overwhelm.

### Task E4 — New-project wizard: progressive disclosure + honest choices
**Files:** Modify `TraceLoop.tsx` CreateProject; use `boards.list`, `agent.plan`.
- [ ] Default path requires only board + behavior + permission mode. Register-level assertions/timed inputs behind "Review generated test details."
- [ ] Present **C + Zephyr as a fixed project fact** (not a Bare-Metal choice). Board picker loads seeded boards; "Recommended for this objective," not a hardcoded recommendation.
- [ ] Agent proposes structured acceptance criteria from the plain-language objective, shown as an editable interpretation card. Rename primary CTA "Generate and run firmware" → **"Create project and review plan."**
- [ ] Real Review/Guided/Autonomous options with one-line consequences + a collapsed "Safety limits" (iteration/time/cost).
**Acceptance:** a beginner creates a project with 3 decisions; no choice the backend won't honor. **Why:** false choices and repeated technical fields are onboarding friction the backend can't back.

### Task E5 — Patch review wired + factual scope
**Files:** Modify `TraceLoop.tsx` PatchReview; use `patches.approve`/`reject`.
- [ ] Approve → `patches.approve` (then the rerun from Task A5); Reject → `patches.reject` with optional reason. "Edit patch" → "Request changes" for the default profile.
- [ ] Replace hardcoded "Low risk" with a factual scope badge: `1 file · 1 line · tests unchanged` until risk is computed.
**Acceptance:** approve/reject hit the real endpoints and move task state; no invented risk label. **Why:** the endpoints exist; the UI must stop navigating straight to success.

### Task E6 — FSM screen: typed, auto-loaded, styled
**Files:** Modify `frontend/src/components/fsm/FSMIntegration.tsx:31-45`; reuse app panel/form CSS.
- [ ] Remove the UUID input; auto-load the current task. Replace `fetch('http://localhost:3000/tasks.get')` with typed tRPC hooks (`tasks.get`, `tasks.getActivityLog`). Read-only activity timeline + one control: Stop / Take over.
- [ ] Restyle with existing `traceloop.css` panel/form classes (drop the unbuilt Tailwind utility classes).
**Acceptance:** FSM loads the active task via authenticated tRPC and is visibly styled. **Why:** it hardcodes localhost, sends no JWT, bypasses tRPC, and renders unstyled.

### Task E7 — Agent composer: one turn path + onboarding
**Files:** Modify `TraceLoop.tsx:461-478` (composer), `AuthGate`.
- [ ] Single `submitTurn(text)` mutation for typed input (voice later shares it); remove the canned delayed response. Suggested prompts: "Explain this failure," "What needs my approval?," "Stop task."
- [ ] Add a guest/demo path (read-only sample project) past the auth wall; Success/commit toasts only after the backend op succeeds; commit requires the separate Git permission or is disabled-with-reason.
**Acceptance:** a visitor can see a sample without an account; no success shown before a real result. **Why:** the composer fakes agent replies and the auth wall blocks any first look.

---

## Self-review — spec coverage

| Review item | Covered by |
|---|---|
| P0-1 Modal API mismatch / elfPath | A1 |
| P0-2 workflow isn't a loop | A2 |
| P0-3 permissions ignored | A3 |
| P0-4 stop doesn't cancel | A4 |
| P0-5 LLM outputs trusted | B1 |
| P1-6 patch state inconsistent | A5 |
| P1-7 idempotency/budget/cost | A6 |
| P1-8 frontend disconnected | E5, E6, E7, D3 |
| P1-9 Modal boundary unsafe | B2 |
| P1-10 clean install can't init | C1 |
| P2-11 false-confidence tests / ?raw / drizzle | C2, C3 |
| UI: initial view, sidebar, FSM-advanced | E1 |
| UI: selectors/badges/notifications/metrics | D1, D2, D3 |
| UI: wizard/board/language/criteria/CTA | E4 |
| UI: failure view/filters/confidence/actions | E3 |
| UI: patch review/risk/edit | E5 |
| UI: settings/integrations/model/permission | D1, E4 |
| UI: run history scope, running-row Stop | E2 (+ scope note in E1) |
| Productization: truthfulness pass | D1-D3 |
| Productization: attention bar | E2 |
| Productization: calm failure default | E3 |
| Productization: onboarding + close-the-loop | A2, A5, E7 |

**Not in scope (explicit no's):** voice input (waits for a shared turn path — E7 leaves the seam), reports persistence (D2 disables it; a future `reports` router is a separate plan), multi-tenant workspace, additional boards.

## Execution handoff

Recommended: **subagent-driven** — one fresh subagent per task, two-stage review between tasks, starting with Workstream A in order (A1→A6), then B, then C, then D/E in parallel. Alternatively inline with checkpoints after each workstream.
