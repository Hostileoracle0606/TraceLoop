# 03 — Executable TaskContract and ambiguity lifecycle

Status: blocked

Blocked by: 02

## What to build

Compile a user's objective into a versioned, executable `TaskContract` before planning. Resolve discoverable ambiguity, record bounded assumptions, pause for blocking ambiguity, and resume from the correct checkpoint when ambiguity appears mid-loop.

## Scope

- Define canonical Zod schemas for `TaskContract`, acceptance criteria, assumptions, ambiguities, test strategy, budgets, protected paths, and terminal policy.
- Add `task_contract_revisions` with draft/confirmed/superseded lifecycle and source Backboard message references.
- Add a deterministic contract validator/compiler boundary around model proposals.
- Require at least one executable acceptance criterion.
- Implement the discoverable/bounded/blocking/evidence ambiguity policy.
- Add a continuation cursor containing prior state, attempt, activity, and contract revision.
- Permit relevant active states to enter `clarification-needed` and resume from the earliest invalidated checkpoint.
- Add task-oriented APIs for contract inspection and clarification response.
- Make acceptance-criteria and contract changes explicit diffs; protect confirmed criteria from silent weakening.

## Acceptance

- [ ] Planning cannot begin without a confirmed, valid contract.
- [ ] Empty, contradictory, non-executable, or unsupported criteria are rejected.
- [ ] Discoverable board/devicetree facts are resolved without user interruption in fixtures.
- [ ] A behavior-defining timing ambiguity pauses with a concise question, rationale, options, and recommended choice.
- [ ] A bounded reversible default is recorded as an assumption and visible to the user.
- [ ] A clarification answer creates revision N+1 and never directly changes source/tests.
- [ ] Mid-loop clarification resumes from a deterministic continuation point.
- [ ] A contract change invalidates incompatible plan/attempt state but preserves historical evidence.
- [ ] Review, guided, and autonomous policies differ only where explicitly configured.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Domain contracts / TaskContract and Structured ambiguity.
