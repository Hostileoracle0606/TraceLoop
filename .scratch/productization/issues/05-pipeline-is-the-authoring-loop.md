# 05 — Make the Inngest pipeline the authoring loop (Task A2)

**What to build:** On test-fail, propose a patch, persist a `patches` row, then branch by profile (autonomous → apply + re-enqueue iter+1; review/guided → `waitForEvent(PATCH_APPROVED)`); on build-fail, loop to `editing` with the compiler log until `maxIterations` → `blocked`; on pass → `completed`.

**Blocked by:** 03 (single-job client), 04 (permission pause).

**Status:** ready-for-agent

- [ ] Failing mocked job → a `patches` row (status `proposed`) is created.
- [ ] Autonomous run re-sends `TASK_RUN_REQUESTED` with `iteration+1`.
- [ ] Build-fail transitions to `editing`, and to `blocked` at the iteration budget.

Full contract: plan → Workstream A, Task A2 (+ state diagram).
