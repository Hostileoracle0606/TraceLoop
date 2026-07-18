# 07 — Patch approve/reject drive task state + rerun (Task A5)

**What to build:** In one transaction, `patches.approve` sets `tasks.status='rerunning'`, updates `currentFiles`, and sends `TASK_RUN_REQUESTED` (iter+1); `patches.reject(reason)` sets `tasks.status='editing'` consistent with its log.

**Blocked by:** 05 (pipeline loop + rerun event).

**Status:** ready-for-agent

- [ ] Approve → `tasks.status='rerunning'` + a rerun is enqueued (test).
- [ ] Reject → `tasks.status='editing'`.
- [ ] Activity log `to_state` and `tasks.status` never disagree.

Full contract: plan → Workstream A, Task A5.
