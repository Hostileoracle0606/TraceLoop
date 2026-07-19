# 04 — Idempotent activity ledger and external reconciliation

Status: blocked

Blocked by: 02

## What to build

Extend the existing activity log into the authoritative record of meaningful requests and side effects. Every provider call, file mutation, approval, run dispatch, cancellation, tool result, and memory operation must be claimable exactly once by stable idempotency key.

## Scope

- Preserve current transition fields and historical rows while adding event type, status, idempotency key, attempt/run/patch links, external provider/ID, timestamps, result reference, and stable error class.
- Add unique constraints appropriate to logical operation identity.
- Implement `claim`, `start`, `complete`, `fail`, `awaitInput`, `awaitApproval`, and `cancel` services.
- Define response-loss reconciliation behavior using stored external references.
- Prevent duplicate Backboard messages/tool outputs, source mutations, firmware runs, approvals, and memory writes under retries.
- Keep conversation turns and activities distinct: tokens/chunks are not activities.
- Update RLS/ownership and migration/backfill behavior.

## Acceptance

- [ ] Two concurrent claims for the same logical operation resolve to one activity.
- [ ] Retrying a completed activity returns/references its prior result without repeating the side effect.
- [ ] Retrying a remotely successful but locally incomplete activity enters reconciliation rather than creating a duplicate.
- [ ] Approval and cancellation are idempotent.
- [ ] Existing state-transition history remains readable after migration.
- [ ] No external ID is treated as the local activity identity.
- [ ] Ownership/RLS tests prevent cross-project activity access.
- [ ] Rollback/compatibility notes cover deployed databases.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Activity and Phase 1.

