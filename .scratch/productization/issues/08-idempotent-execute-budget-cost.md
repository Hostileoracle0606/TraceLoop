# 08 — Idempotent execute + resource controls + cost units (Task A6)

**What to build:** Guard `tasks.execute` to `status ∈ {created, editing, blocked}` with an atomic compare-and-set to `building`; pass `task.resourceControls` into the loop; fold `opts.maxIterations` into controls; accumulate per-run cost; convert cents↔dollars at the DB boundary.

**Blocked by:** None — can start immediately (interacts with 05).

**Status:** ready-for-agent

- [ ] `execute` from `completed`/`stopped`/`building` throws; two rapid calls create exactly one run.
- [ ] The loop honours DB `resourceControls` (iteration/time/cost) — not `DEFAULT_RESOURCE_CONTROLS`.
- [ ] Cost is accumulated and converted (cents↔dollars) consistently.

Full contract: plan → Workstream A, Task A6.
