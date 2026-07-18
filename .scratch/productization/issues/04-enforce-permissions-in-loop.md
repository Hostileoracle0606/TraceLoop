# 04 — Enforce permissions inside the authoring loop (Task A3)

**What to build:** In `src/engine/authoring-loop.ts`, check `apply-patch` permission **before** mutating files; on review/guided, pause (return `awaiting-approval`, do not apply); record actor `user` only on real approval. Rewrite the test that wrongly expects review to proceed.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `profile='review'` → loop pauses, `files` unchanged, no forged `patch-approved`.
- [ ] `autonomous` → applies and proceeds.
- [ ] `authoring-loop-stateful.test.ts` asserts the pause (not silent proceed).

Full contract: plan → Workstream A, Task A3.
