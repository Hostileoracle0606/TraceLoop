# 11 — Integration tests for the real pipeline (Task C2)

**What to build:** `backend/inngest/pipeline.integration.test.ts` driving the actual `firmwareRunPipeline` (mock Modal + DB) through the shipped path — not the parallel engine modules.

**Blocked by:** 05 (loop), 06 (cancel), 07 (approve→rerun).

**Status:** ready-for-agent

- [ ] fail → patch → (auto)apply → rerun → pass ends `completed`.
- [ ] `review` pauses at `patching`; `approve` resumes to `rerunning`.
- [ ] `TASK_CANCELLED` aborts and leaves `stopped`.
- [ ] build-fail loops to `editing`, stops at `blocked` on budget.

Full contract: plan → Workstream C, Task C2.
