# 12 — Controlled Backboard semantic-memory consolidation

Status: blocked

Blocked by: 06, 11

## What to build

Treat Backboard semantic memory as a controlled projection of validated TraceLoop knowledge. Retrieval is read-only during the authoring loop; writes happen only in an explicit, auditable consolidation activity.

## Scope

- Define memory kind/scope/candidate/classification policy.
- Add a minimal `memory_sync` ledger containing source evidence, scope, external ID, status, and supersession/deletion lifecycle without duplicating the evidence graph.
- Support project-safe decisions/constraints, validated causal conclusions, scoped ineffective-intervention history, and explicit user preferences only in a safe user scope.
- Configure stage memory policy: `Readonly` for reasoning stages, `off` for raw logs, explicit CRUD for consolidation.
- Implement add/update/search/supersede/delete with asynchronous-operation reconciliation and idempotent activities.
- Keep authoritative project documents in the repository/storage; synchronize only stable approved versions.
- Ensure memory failure never changes a successful task to failed.
- Provide correction/deletion paths and preserve underlying evidence after external memory deletion.

## Acceptance

- [ ] Unverified hypotheses, raw reasoning/logs/traces/source, secrets, volatile state, and failed patches as facts are rejected.
- [ ] Every active project memory traces to an approved decision or comparable validated attempt.
- [ ] Project assistant memory cannot contain a personal preference that would leak to another project user.
- [ ] Authoring stages cannot automatically write memory.
- [ ] Duplicate consolidation requests create/update one external memory.
- [ ] Supersession prevents stale memory retrieval while preserving provenance.
- [ ] User-requested correction/deletion reconciles local and remote lifecycle.
- [ ] Backboard memory outage leaves task completion successful and schedules observable retry.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Memory architecture and Phase 5.

