# 17 — End-to-end qualification and staged rollout

Status: blocked

Blocked by: 13, 15, 16

## What to build

Qualify the complete architecture against deterministic, live-provider, operational, security, and user-journey gates; then roll it out by pinned runtime flags with tested rollback.

## Scope

- Run full typecheck, unit, contract, Inngest, workspace, Modal, causal, tRPC/RLS, Playwright, eval, and red-team suites.
- Run opt-in live Backboard assistant/thread/tool/memory/document/cancellation/reconciliation tests with cleanup evidence.
- Shadow Backboard planning/context against the legacy runtime with no shadow side effects.
- Define concrete promotion thresholds for completion, attempts, clarification, policy violations, latency, cost, provider errors, duplicates, no-progress, and memory precision.
- Canary selected new internal tasks, then a limited percentage of new external tasks.
- Pin runtime per task and keep the legacy adapter deployable.
- Exercise rollback without reverting forward migrations or losing domain/source/evidence state.
- Document deployment, secrets, migrations, flags, monitoring, incident response, retention, deletion, and operator reconciliation.
- Set legacy removal criteria no earlier than two stable release cycles unless separately approved with evidence.

## Acceptance

- [ ] Required end-to-end authoring-loop scenarios pass through the production coordinator.
- [ ] Clarification and approval pause/resume on the same Backboard thread.
- [ ] Retries/cancellation/provider outages do not duplicate or corrupt side effects.
- [ ] Quality, security, cost, and latency thresholds hold through internal and canary windows.
- [ ] Runtime rollback is demonstrated without data loss or task migration.
- [ ] Existing tasks remain on their original runtime.
- [ ] All live Backboard resources created for qualification are accounted for and cleaned/retained intentionally.
- [ ] Backboard default and eventual legacy removal are separate explicit decisions.
- [ ] Final handoff includes ownership map, component map, known limitations, and deferred work.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Phase 7, Release gates, and Completion criteria.

