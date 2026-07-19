# 10 — Durable one-shot authoring-loop coordinator

Status: blocked

Blocked by: 05, 08, 09

External prerequisite: applicable blocking issues under `.scratch/productization/` for the real loop, permission enforcement, cancellation, idempotency/budgets, Modal hardening, and shipped-path integration tests.

## What to build

Create one Inngest coordinator for the complete authoring loop and one pure reducer shared by production and tests. Remove or wrap duplicate transition/orchestration logic so the tested and shipped paths cannot diverge.

## Scope

- Add agent requested/continue, clarification resolved, approval resolved, run requested/finished, cancellation, and memory-consolidation events.
- Orchestrate Backboard scope/thread, contract, ambiguity, attempt/workspace, context, plan, edits, snapshot, firmware worker, verification, causal assessment, patch/replan, and terminal behavior.
- Keep the existing firmware-run pipeline as an independently durable worker that always emits one terminal outcome.
- Use deterministic step IDs containing task, attempt, stage, and contract revision.
- Use durable waits for run results, approvals, and clarification.
- Enforce budgets before every model turn, tool call, mutation, and run dispatch.
- Handle cancellation, late events, provider/compute failure, timeout, inconclusive evidence, and no-progress.
- Preserve existing manual/legacy execution until rollout completion.

## Acceptance

- [ ] One initial request can reach pass, clarification, approval, blocker, cancellation, budget, or no-progress terminal behavior without an open HTTP request.
- [ ] Process/provider retries do not duplicate tool outputs, mutations, attempts, or firmware runs.
- [ ] Clarification/approval resumes from a stored continuation instead of replaying prior side effects.
- [ ] Review/guided pause; autonomous proceeds only within the same safety policies.
- [ ] Every run outcome, including cancellation/infrastructure failure, wakes the coordinator exactly once.
- [ ] Late results cannot overwrite stopped/superseded state.
- [ ] Pure reducer unit tests and real Inngest integration tests exercise the same transition rules.
- [ ] Existing tasks and legacy runtime remain compatible.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Durable authoring-loop coordinator and Phase 4.
