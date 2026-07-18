# 19 — Patch review wired + factual scope badge (Task E5)

**What to build:** Wire Approve → `patches.approve` (then the rerun from Task 07); Reject → `patches.reject` (+ optional reason); "Edit patch" → "Request changes" for the default profile; replace hardcoded "Low risk" with a factual scope badge (`1 file · 1 line · tests unchanged`).

**Blocked by:** 07 (approve → rerun path).

**Status:** ready-for-agent

- [ ] Approve/Reject hit the real endpoints and move task state (no direct nav to success).
- [ ] The risk label is factual scope, not an invented severity.

Full contract: plan → Workstream E, Task E5.
