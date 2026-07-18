# 06 — Stopping a task cancels its running job (Task A4)

**What to build:** `tasks.stop` emits `TASK_CANCELLED {taskId, runId, reason}`; add `cancelOn` (match `taskId`) to `firmwareRunPipeline`; guard every status write behind `status !== 'stopped'` so a cancelled task isn't overwritten.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `tasks.stop` sends `TASK_CANCELLED` (test).
- [ ] The pipeline has a `cancelOn` condition keyed on `taskId`.
- [ ] A mid-run cancel leaves the task `stopped`, not overwritten by `simulating`/`completed`.

Full contract: plan → Workstream A, Task A4.
