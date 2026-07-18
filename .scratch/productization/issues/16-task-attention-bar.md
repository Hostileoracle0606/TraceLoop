# 16 — Persistent task-attention bar (Task E2)

**What to build:** `TaskAttentionBar` mounted across Agent/Build/Analysis/Patch: `state · iteration x/y · profile · budget · Stop`, or `Patch ready · approval required · Review`. Data from `tasks.get` + `getActivityLog`; Stop → `tasks.stop`.

**Blocked by:** None — can start immediately (richer once 05/07 land).

**Status:** ready-for-agent

- [ ] The bar shows live state on every loop screen; a running row exposes Stop directly.
- [ ] When input is required, it says so with a single CTA.

Full contract: plan → Workstream E, Task E2 (+ `TaskAttention` interface).
