# 08 — Typed capability registry and safe dispatcher

Status: blocked

Blocked by: 03, 04, 07

## What to build

Define agent capabilities once with canonical Zod schemas, generate Backboard-compatible JSON Schema, and route every tool call through one state-, permission-, and idempotency-aware dispatcher.

## Scope

- Add versioned schemas for clarification, task contract, plan, file operations, patch, blocker, and read-only context tools.
- Generate external JSON Schema from the canonical definitions and test both against one valid/invalid corpus.
- Add stage-to-tool allowlists and model-visible bounded descriptions.
- Dispatch through ownership, state, activity claim, Zod validation, permission/approval, plan/path/protected-file/size policy, domain execution, persistence, and bounded-result steps.
- Reuse ADR-0007 search/replace validation and apply-or-reflect behavior.
- Keep build/simulation/evaluation/memory promotion coordinator-owned.
- Expose no generic shell, root filesystem, database, deployment, credential, or unrestricted network tool.

## Acceptance

- [ ] Zod and generated JSON Schema accept/reject the same corpus.
- [ ] Unknown, out-of-state, unauthorized, duplicate, malformed, traversal, oversized, protected-path, and out-of-plan calls cannot mutate source.
- [ ] A Backboard tool-call ID is linked to, but cannot replace, an activity ID.
- [ ] Apply failures are atomic or fully recorded; partial unrecorded mutation is impossible.
- [ ] Tool results are bounded, redacted, and safe to return to the thread.
- [ ] The model cannot order a firmware run or memory promotion by bypassing the coordinator.
- [ ] Contract versions appear in telemetry and assistant configuration.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Capability registry and tool gateway.

