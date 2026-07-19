# 06 — Backboard assistant/thread provisioning and reconciliation

Status: blocked

Blocked by: 01, 02, 04

## What to build

Provision and reconcile one Backboard assistant per TraceLoop project and one Backboard thread per task without duplicates under concurrency or response loss.

## Scope

- Add project/task runtime binding fields and safe forward migrations.
- Build lazy assistant provisioning with versioned instructions, tools, memory restrictions, document/embedding configuration, and stage model defaults.
- Build lazy task-thread provisioning with opaque metadata only.
- Claim provisioning activities before remote calls and reconcile partial success.
- Enforce ownership before retrieving, continuing, listing, cancelling, or deleting remote resources.
- Add assistant configuration-version reconciliation without silently rewriting active tasks.
- Define project/task deletion, retention, tombstone, and retry behavior.
- Keep the Backboard credential server-side.

## Acceptance

- [ ] Concurrent project/task creation associates exactly one assistant/thread locally.
- [ ] Response loss after remote creation is reconciled or surfaced without silent duplication.
- [ ] A thread is tied to exactly one project assistant and one TraceLoop task.
- [ ] Existing tasks remain on their original runtime.
- [ ] Cross-owner assistant/thread retrieval is rejected.
- [ ] Assistant configuration changes are versioned and do not mutate an in-progress task unexpectedly.
- [ ] Deletion/retention retries are observable and do not corrupt domain task state.
- [ ] Normal CI uses a fake boundary; opt-in live tests create and clean isolated resources.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Backboard integration model and Phase 2.
