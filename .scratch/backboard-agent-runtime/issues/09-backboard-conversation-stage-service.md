# 09 — Backboard conversation stage service

Status: blocked

Blocked by: 06, 08

## What to build

Implement clarification, contract, planning, editing, patching, and blocker turns on the same Backboard task thread while keeping all authoritative decisions in TraceLoop.

## Scope

- Implement `BackboardAgentRuntime.runStage`, tool-result submission, multi-round/parallel tool loops, conversation retrieval, streaming, and cancellation.
- Apply stage-specific system instructions, model allowlists, token/tool budgets, timeouts, and memory modes.
- Feed stage-specific context packets and only the allowed tool definitions.
- Convert `REQUIRES_ACTION` responses into safe dispatcher calls and submit all required outputs.
- Persist provider/model/usage/cost/external IDs on activities/telemetry.
- Implement response-loss reconciliation and stable provider error mapping.
- Keep raw build/simulation/log transfer memory-off and bounded.
- Keep a legacy runtime fallback for configured tasks; never silently switch a task mid-run.

## Acceptance

- [ ] One thread supports clarification -> contract -> plan -> edit -> patch conversational continuity.
- [ ] Multi-round and parallel calls dispatch safely and submit the complete output set.
- [ ] Stage/model/tool/memory policy is locally enforced and cannot be widened by the model.
- [ ] Cancellation stops the active Backboard run as far as supported and remains locally idempotent.
- [ ] Provider timeout/rate-limit/malformed/service failures do not become firmware failures or duplicate prior work.
- [ ] Conversation retrieval occurs only through the authenticated backend after ownership checks.
- [ ] No Backboard key or provider-specific type reaches the frontend/domain core.
- [ ] Fake-boundary tests and isolated opt-in live tests pass.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Backboard integration model and Phase 3.
