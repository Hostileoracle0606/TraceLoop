# ADR-0008: Managed conversation runtime behind provider-neutral ports

**Status:** Accepted — 2026-07-19
**Supersedes:** ADR-0006's provider/runtime *selection* only. "The LLM serves the FSM" (ADR-0006), the real execution path (ADR-0005), and search/replace edit validation (ADR-0007) remain in force.

## Decision
Conversation/memory only with legacy schema-critical calls. All model access flows through the `AgentRuntime` port (`backend/agent/ports/`). The legacy Vercel AI SDK path is the default runtime, wrapped drift-free by `LegacyAiSdkRuntime`. Backboard is selectable only when `AGENT_RUNTIME_BACKBOARD_ENABLED=true` AND the project opts in; tasks pin their runtime at creation.

The feasibility spike (issue 01) verified Backboard's API surface and identified that full runtime adoption requires additional productization work (issues 03-17). This ADR establishes the port architecture and feature flag infrastructure without changing production defaults.

## Ownership map (unchanged authorities)
Task truth, FSM transitions, source, runs, artifacts, causal evidence: Supabase + pure reducer + Inngest.
Conversation continuity and (if adopted) semantic memory: Backboard, behind ports, never authoritative.

## Rollback
Setting the flag to 'false' strands no state: every authoritative record is local; existing tasks remain pinned to the runtime they started with; `LegacyAiSdkRuntime` serves all new tasks.

## Gate
Production Backboard adoption is additionally gated on the productization baseline (`docs/productization/blocking-fixes-plan.md` + remaining B2/C1/C2/C3 of `implementation-plan.md`).

## Implementation
- Phase 0 (this ADR): ports, legacy adapter, feature flags, skeleton
- Phase 1 (issues 03-17): Backboard stages, capability dispatcher, TaskContract, activities
- Live spike required before Phase 1 (Task 7, requires BACKBOARD_API_KEY)
