# 02 — Managed-runtime ADR, ports, and feature flags

Status: blocked

Blocked by: 01

## What to build

Record the Backboard decision and introduce provider-neutral boundaries without changing existing task behavior. The legacy Vercel AI SDK path must run through the same domain-facing ports before Backboard becomes selectable.

## Scope

- Add ADR-0008 for the managed conversation/runtime decision. It may supersede only ADR-0006's provider selection; preserve `LLM serves the FSM`, ADR-0005, and ADR-0007.
- Define ports for `AgentRuntime`, `SemanticMemoryStore`, `KnowledgeDocumentIndex`, stage/model policy, and runtime configuration.
- Wrap current AI SDK functions in `LegacyAiSdkRuntime` without behavior drift.
- Add a `BackboardAgentRuntime` skeleton whose SDK/HTTP types do not escape the adapter.
- Add per-project default and per-task pinned runtime selection behind disabled-by-default feature flags.
- Centralize retry, timeout, redaction, and provider error classification contracts.
- Align `docs/agents/backboard-agent-runtime-implementation.md` with the umbrella spec.

## Acceptance

- [ ] A new ADR explicitly maps ownership and rollback behavior.
- [ ] Routers, FSM, domain services, and database types do not import Backboard-specific types.
- [ ] Existing LLM behavior passes through `LegacyAiSdkRuntime` with characterization tests green.
- [ ] Runtime selection is fixed when a task starts and cannot change mid-task.
- [ ] Backboard is not the default and cannot perform production mutations.
- [ ] Provider errors map to stable local classes instead of firmware failures.
- [ ] Typecheck and affected repository suites pass.

Full contract: `.scratch/backboard-agent-runtime/spec.md` → Agent runtime ports and Phase 1.
