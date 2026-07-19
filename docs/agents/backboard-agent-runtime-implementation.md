> **Status note (issue 02):** This brief is subordinate to
> `.scratch/backboard-agent-runtime/spec.md`. Where they conflict on sequencing or
> system-wide architecture, the spec is authoritative. See ADR-0008.

# Implementer prompt: Backboard agent runtime, causal provenance, and memory

Use this document as the implementation brief for the TraceLoop managed-agent architectural pivot. It is intentionally written as a prompt for one or more implementer agents working in sequence.

This is not an issue tracker. If the work is decomposed into tickets, put the spec and tickets under `.scratch/backboard-agent-runtime/` according to `docs/agents/issue-tracker.md`. Keep this document aligned with any architectural decisions made during implementation.

## Role

You are implementing a managed agent runtime for TraceLoop, an agentic firmware IDE. The result must let a user submit one task and have TraceLoop durably plan, edit, build, simulate, test, causally assess failures, patch, and rerun until one of these terminal conditions occurs:

- All acceptance criteria pass.
- User input or approval is required.
- A resource limit is reached.
- The task is cancelled.
- TraceLoop can demonstrate that it cannot make safe progress.

Backboard supplies managed conversation persistence, model access/routing, assistant-scoped semantic memory, document retrieval, and tool-call dialogue. TraceLoop remains authoritative for task state, permissions, source mutations, durable execution, evidence, causal conclusions, budgets, and completion.

Implement the pivot incrementally behind interfaces and feature flags. Do not replace working control-plane components wholesale.

## Required reading before implementation

Read these files before changing code:

- `AGENTS.md`
- `CONTEXT.md`
- `docs/agents/domain.md`
- `docs/agents/issue-tracker.md`
- `docs/adr/0001-agentic-firmware-ide.md`
- `docs/adr/0005-real-execution-path.md`
- `docs/adr/0006-vercel-ai-sdk-llm-layer.md`
- `docs/adr/0007-llm-edit-reliability.md`
- `src/engine/agent-state.ts`
- `src/engine/authoring-loop.ts`
- `backend/db/schema.ts`
- `backend/inngest/client.ts`
- `backend/inngest/functions.ts`
- `backend/llm/functions.ts`
- `backend/llm/validate.ts`
- `backend/llm/apply-file-operations.ts`
- `backend/trpc/routers/agent.ts`
- `backend/trpc/routers/tasks.ts`

Use the vocabulary in `CONTEXT.md`. In particular, use **authoring loop**, **root cause**, **divergence**, **missing-write failure**, **expected path**, **substrate**, and **producer** as defined there.

Backboard behavior must be verified against its current official documentation before implementation because it is an external, evolving service:

- <https://docs.backboard.io/concepts/architecture>
- <https://docs.backboard.io/concepts/assistants>
- <https://docs.backboard.io/concepts/threads>
- <https://docs.backboard.io/concepts/messages>
- <https://docs.backboard.io/concepts/tool-calling>
- <https://docs.backboard.io/concepts/memory>
- <https://docs.backboard.io/concepts/documents>
- <https://docs.backboard.io/concepts/models>

Record any material discrepancy between this brief and the current Backboard API before depending on it.

## Existing decisions that remain in force

The following are not reopened by this work:

1. The explicit FSM is the authority for task transitions. The model serves the FSM; it does not choose arbitrary state transitions.
2. Inngest remains the durable orchestration layer.
3. Supabase remains the authoritative database, artifact store, and realtime source.
4. Modal remains the isolated firmware compute plane.
5. The causal engine remains the source of firmware failure explanations.
6. Search/replace file operations, centralized validation, protected-file enforcement, path-safety checks, plan-scope checks, and apply-or-reflect behavior remain mandatory.
7. Permission profiles and resource limits must be enforced outside the model.
8. A model response is a proposal until TraceLoop validates and records it.

Add a new ADR for the managed agent runtime. It should supersede only the provider/runtime selection portion of ADR-0006. Preserve ADR-0006's `LLM serves the FSM` contract and preserve ADR-0005 and ADR-0007.

## Target architecture

The target relationship is:

```text
TraceLoop task
  -> one Backboard task thread
  -> many TraceLoop activities
  -> zero or more firmware runs, where iteration is the attempt number
  -> zero or more causal episodes
  -> zero or more validated semantic-memory promotions

TraceLoop project
  -> one Backboard project assistant
  -> shared project documents
  -> shared validated project memories
  -> many task threads
```

Backboard is a managed agent substrate, not TraceLoop's state machine, job queue, policy engine, source store, evidence store, or causal database.

## Architectural invariants

The implementation must maintain all of these invariants:

### Task and conversation

- A TraceLoop task is the durable user goal and lifecycle aggregate.
- A Backboard thread is the conversational projection of exactly one task.
- A Backboard assistant is the managed conversational and semantic-memory scope of exactly one project.
- Do not introduce a second local message-history table.
- Store only the Backboard identifiers needed to retrieve or reconcile the external conversation.
- Existing tasks must continue using the runtime on which they started.

### Activities and side effects

- Activities are meaningful domain actions and events, not tokens or arbitrary message chunks.
- Create or claim an idempotent activity before performing any external call or local mutation that could be duplicated.
- Every file mutation, run dispatch, tool result, approval decision, memory promotion, cancellation, and terminal transition must be attributable to an activity.
- Inngest retries must not duplicate Backboard messages, file operations, firmware runs, patch applications, or memory writes.
- A Backboard message or tool-call ID may be an external reference on an activity; it is not the activity's identity.

### Provenance and causality

- Do not build a parallel general-purpose provenance graph.
- Activity logs are operational provenance: they record what the user, agent, or system did.
- The causal graph is evidence and diagnostic provenance: it records how observations, hypotheses, interventions, and outcomes support a root cause or invalidate an approach.
- Extend the causal representation across runs so it can connect an agent hypothesis, proposed intervention, source mutation, firmware result, validation run, and outcome.
- A semantic memory may be promoted only from a validated causal conclusion, an explicit user preference, or an approved stable project decision.
- The only additional memory persistence should be a minimal synchronization ledger mapping a TraceLoop conclusion to a Backboard memory identifier and lifecycle state.

### Memory

- Working memory belongs to the Backboard task thread.
- Project semantic memory belongs to the Backboard project assistant.
- Stable project documents may use Backboard document retrieval, but authoritative copies remain in the repository or TraceLoop-controlled storage.
- User preferences must not be placed into a shared project assistant when that could expose them to another user.
- Operational state, resource budgets, locks, current source snapshots, raw logs, unverified diagnoses, failed patches, and secrets are never semantic memory.
- Agent execution stages should retrieve memory without automatically writing it.
- Memory promotion is an explicit, auditable post-validation operation.
- Memory synchronization failure must not turn a successfully completed firmware task into a failed task.

### Tool contracts

- Zod is the canonical contract authoring and runtime-validation system in the TypeScript control plane.
- Generate Backboard-compatible JSON Schema from the same canonical contracts. Do not hand-maintain divergent Zod and JSON Schema definitions.
- Pydantic may be used at a Python/Modal worker boundary when Python validation is useful, but Python models should consume or be generated from the same language-neutral schema.
- Do not introduce a Python agent-control service solely to obtain Pydantic tool definitions.
- Schema validation improves argument correctness; it does not replace state, permission, idempotency, or side-effect checks.
- Version externally visible tool contracts.

### Model policy

- Backboard may provide access to many providers and models, but TraceLoop chooses an allowlisted model policy per stage.
- Persist the actual provider, model, token usage, cost, and external run/message identifiers for observability.
- A model cannot select a model outside the stage policy.
- Do not persist hidden reasoning or chain-of-thought.

### Long-running work

- Do not hold a Backboard tool call open while Modal builds or simulates firmware.
- Complete the structured planning/editing/patching turn, dispatch the durable firmware run, and send the resulting evidence in a later turn on the same thread.
- Cancellation must address both the durable Inngest work and any active Backboard run.

## Non-goals

Do not include these in the initial pivot unless a separately approved requirement demands them:

- Replacing Inngest with Backboard orchestration.
- Replacing Supabase or Modal.
- Replacing the FSM with a model-controlled loop.
- Building a general graph database before the cross-run causal relationships require one.
- Uploading the current source tree into Backboard documents after every edit.
- Automatically learning new agent procedures from conversations.
- Migrating all existing tasks and conversations to Backboard.
- Removing the existing AI SDK runtime before rollback criteria are met.
- Adopting a generic coding-agent harness as the orchestrator.
- Exposing arbitrary shell, filesystem, database, or deployment tools to Backboard.

## Test-driven implementation method

Use test-driven development for every increment. The implementer owns the exact test design and test names; this brief defines behaviors and risk areas to verify, not individual tests.

For each increment:

1. Identify the smallest externally observable contract being changed.
2. Characterize any existing behavior that must remain stable.
3. Add a failing verification of the new behavior at the narrowest useful boundary.
4. Implement the minimum production change that satisfies the behavior.
5. Refactor only after the affected verification is green.
6. Run the narrow suite while iterating, then the affected integration/contract suites, then repository-wide type checking and tests.
7. Record any behavior that cannot be tested deterministically and explain the alternative verification used.

Testing should favor boundaries over implementation details:

- Test domain services through their public ports.
- Test the Backboard adapter against a controlled fake HTTP/service boundary in normal CI.
- Keep live Backboard tests opt-in and isolated from normal deterministic CI.
- Test Inngest behavior through events, checkpoints, stored state, and visible side effects.
- Test permission and FSM behavior independently from model quality.
- Test causal outcome classification independently from semantic-memory summarization.
- Test generated JSON Schema against the same valid and invalid payload corpus as the Zod contract.
- Avoid snapshots that mask semantically important changes to tool contracts or prompts.

Do not weaken or delete existing tests merely because the runtime boundary changes. If an existing test encodes an obsolete implementation detail, replace it with a behavior-level assertion in the same change and explain why.

## Work sequence

Complete the work in the following dependency order. Each phase has a required output and an exit condition. Do not begin irreversible migration work before the feasibility gate passes.

### Phase 0: establish baseline and feasibility

Build a bounded Backboard integration spike outside the production path.

Verify these risk areas:

- Structured tool-call reliability for clarification, plan, file operations, patch, and blocker outputs.
- Multi-round tool dialogue and tool-result submission.
- Behavior when tools and document retrieval are active together.
- Thread creation, continuation, retrieval, and deletion.
- Assistant-scoped memory isolation.
- Explicit memory add, search, update, and delete.
- Delayed responses, cancellation, timeouts, rate limiting, malformed responses, and service errors.
- Recovery when the remote operation succeeds but TraceLoop loses the response.
- Availability of stable external identifiers for reconciliation.
- Model capability discovery and model pinning.
- Usage and cost reporting.

Expected outputs:

- A written spike result recording observed API behavior and unresolved risks.
- A go/no-go decision for schema-constrained Backboard tool calls.
- A documented fallback: Backboard conversations/memory/model access with the existing AI SDK retained for schema-critical outputs.
- No production default change.

Exit condition:

- The chosen Backboard integration path can be made idempotent and its structured-output reliability is acceptable for validated file mutation.

### Phase 1: record the decision and introduce runtime ports

Add the managed-runtime ADR and narrow provider-neutral ports.

Use at least these conceptual boundaries, although exact filenames may vary if repository conventions demand it:

```text
backend/agent/
  contracts
  stage service
  context builder
  model policy
  tool registry
  tool dispatcher
  activity service
  memory policy
  backboard adapter
  legacy AI SDK adapter
```

Separate these responsibilities:

- Conversation/tool-turn runtime
- Semantic-memory store
- Knowledge-document index
- Local stage orchestration
- Domain tool execution

Do not expose Backboard SDK types outside the Backboard adapter.

Expected outputs:

- New ADR.
- Provider-neutral contracts.
- Backboard adapter skeleton with controlled configuration.
- Legacy adapter wrapping the current AI SDK behavior.
- Runtime selection feature flag.
- Deterministic adapter-level verification.

Exit condition:

- Existing behavior still passes through the legacy adapter, and Backboard-specific types do not leak into routers, the FSM, the database schema, or domain services.

### Phase 2: add external references and idempotent activities

Extend persistence without creating a local conversation store.

Projects need enough state to reconcile the Backboard assistant and its configuration version. Tasks need enough state to reconcile the task thread, active remote run, last observed message, and selected agent runtime.

Extend the existing activity log rather than creating a second audit stream. It must be able to represent:

- Event type
- Activity status
- Stable idempotency key
- External provider and identifier
- Related run or patch
- Start and completion timestamps
- Stable error classification

Preserve existing transition fields and historical records. Backfill new required fields safely.

Add a minimal memory synchronization ledger containing only what is necessary to trace, update, supersede, and delete a Backboard memory. It should reference a causal conclusion or an explicitly approved non-causal source. It must not duplicate the full evidence graph or memory text history unnecessarily.

Expected outputs:

- Forward database migration.
- Updated Drizzle schema and inferred types.
- Safe backfill behavior.
- Unique idempotency constraints.
- Persistence services that centralize activity creation/completion and external-reference reconciliation.
- Rollback or compatibility notes for deployed environments.

Exit condition:

- Retrying the same logical operation resolves to the same activity and cannot create a duplicate side effect.

### Phase 3: provision project assistants and task threads

Provision one Backboard assistant per project and one thread per task. Provision lazily and reconcile after partial failure.

Assistant configuration must include:

- Versioned system instructions
- Versioned tool definitions
- Memory extraction/update restrictions
- Project document retrieval configuration
- Embedding configuration chosen before creation
- Model-policy defaults that TraceLoop may override per turn

Prevent concurrent task creation from producing duplicate project assistants. Store the external ID only after ownership and scope are known. If an assistant is created remotely but the local write fails, the next attempt must reconcile rather than silently create another assistant.

Task-thread creation follows the same rule. Thread metadata should contain opaque TraceLoop identifiers when the API supports it, but must not contain secrets or source content.

Expected outputs:

- Project assistant provisioning service.
- Task thread provisioning service.
- Configuration-version reconciliation.
- Ownership enforcement on thread retrieval.
- Deletion/retention behavior for project and task removal.
- Realtime-visible activities for provisioning failures without corrupting task state.

Exit condition:

- Concurrent and retried provisioning produces one locally associated assistant per project and one locally associated thread per task.

### Phase 4: define and validate agent-stage tools

Implement structured output as narrow agent-stage tools. Begin with:

- `request_clarification`
- `submit_plan`
- `submit_file_operations`
- `submit_patch`
- `report_blocker`

Read-only context tools may be added when they materially reduce prompt size or stale context:

- `list_project_files`
- `read_project_files`
- `inspect_board`
- `get_acceptance_criteria`
- `get_previous_attempts`
- `query_causal_history`

Do not expose build and simulation as unconstrained model-controlled ordering decisions. Once valid edits are accepted, the FSM and durable coordinator determine when the firmware run occurs.

For every tool call, the dispatcher must:

1. Resolve the task and verify ownership.
2. Verify the expected FSM state.
3. Verify that the tool is allowed in that state.
4. Claim an idempotent activity.
5. Validate arguments against the canonical Zod contract.
6. Apply permission-profile requirements.
7. Run existing plan/edit/patch policy validation.
8. Execute the allowed domain operation.
9. Persist artifacts and external references.
10. Complete or fail the activity with a stable reason.
11. Return a bounded tool result to the Backboard thread.

Expected outputs:

- Versioned canonical tool schemas.
- Generated Backboard JSON Schema.
- Stage-to-tool allowlist.
- Dispatcher connected to existing validation and file-application services.
- No direct model-authored state transitions.
- No direct file mutation inside the Backboard adapter.

Exit condition:

- Invalid, unauthorized, out-of-state, out-of-plan, protected-path, traversal, duplicate, or malformed operations cannot cause a source mutation.

### Phase 5: implement the durable agent coordinator

Add an Inngest coordinator for the full authoring loop. Keep the existing firmware run pipeline as an independently durable worker.

Introduce events equivalent to:

```text
task/agent.requested
task/agent.continue
task/agent.cancelled
task/approval.resolved
task/run.finished
memory/consolidation.requested
```

The coordinator must support this flow:

```text
receive task
  -> ensure assistant and thread
  -> clarify when required
  -> obtain and validate plan
  -> obtain and validate file operations
  -> apply allowed operations
  -> dispatch firmware run
  -> durably wait for run outcome
  -> causally assess the outcome
  -> complete, request approval/input, patch, or block
  -> rerun within resource limits
```

The firmware run worker must emit a terminal outcome event for every run result, including pass, build failure, simulation failure, analysis failure, assertion failure, infrastructure failure, and cancellation.

Use deterministic step identities that include the task stage and iteration. A coordinator retry must discover prior completed work through activities and stored external references.

Permission behavior:

- Represent pending review as an activity with `awaiting-approval` status.
- Keep the task in its meaningful FSM state while it waits.
- Resume from an approval event rather than replaying preceding work.
- Autonomous mode still obeys all validation, state, budget, and idempotency rules.

Expected outputs:

- Durable agent coordinator.
- Run-finished rendezvous between coordinator and firmware worker.
- Approval, resume, cancellation, timeout, and budget handling.
- Deterministic checkpoints and iteration behavior.
- Existing manual execution path retained until rollout completion.

Exit condition:

- A task can complete the authoring loop from one initial request without an HTTP request remaining open, and it can resume safely after process or provider failure.

### Phase 6: extend causal provenance across iterations

Treat the causal graph as the authoritative evidence lineage. Extend it just enough to relate agent behavior to firmware outcomes across runs.

Represent or derive these concepts:

- Observed failure
- Firmware root cause or absence attribution
- Agent hypothesis
- Proposed intervention
- Applied source mutation and source version
- Validation run
- Outcome: `resolved`, `unchanged`, `regressed`, or `inconclusive`
- Evidence activity and artifact references
- Confidence and validation status

Prefer deterministic outcome classification where possible:

- `resolved`: the previously failed criterion now passes.
- `unchanged`: the same failure/root-cause signature remains.
- `regressed`: the original issue remains or an earlier/new failure appears.
- `inconclusive`: infrastructure, simulation, trace collection, or analysis did not produce comparable evidence.

Feed the relevant causal history into the next planning or patching turn. Explicitly identify interventions that produced an unchanged or regressed outcome so the agent does not repeat them without new evidence.

Do not require a graph database initially. A relational or structured representation is acceptable if it preserves node identity and evidence relationships and can evolve without rewriting the agent runtime.

Expected outputs:

- Cross-run causal episode representation.
- Deterministic outcome assessor where evidence permits it.
- Query boundary for relevant prior causal episodes.
- References from causal conclusions to source activities, runs, patches, and artifacts.
- No separate general provenance graph.

Exit condition:

- TraceLoop can explain why a prior intervention is considered successful, ineffective, harmful, or inconclusive using stored evidence references.

### Phase 7: implement controlled memory consolidation

Backboard memory is a retrieval projection of validated TraceLoop knowledge. It is not the source of truth.

Use this stage policy unless verified Backboard behavior requires a documented change:

| Stage | Memory behavior |
| --- | --- |
| Clarification and explicit preference capture | Strict automatic extraction or explicit manual capture |
| Planning | Read-only retrieval |
| Editing | Read-only retrieval |
| Raw build/simulation/log transfer | Off |
| Diagnosis and patching | Read-only retrieval |
| Consolidation | Explicit manual add/update/delete |

The consolidation flow must:

1. Receive an explicit user preference, approved stable decision, or validated causal conclusion.
2. Classify its scope and memory kind.
3. Reject speculation, volatile state, sensitive data, or evidence without validation.
4. Claim a memory-promotion activity and synchronization-ledger entry.
5. Add or update the Backboard memory with minimal metadata.
6. Save the external memory identifier.
7. Mark superseded memories without deleting their causal provenance.
8. Support user-requested correction and deletion.

Do not promote:

- Unverified hypotheses
- Raw model reasoning
- Raw logs and traces
- Failed patches represented as facts
- Current task or run state
- Credentials, tokens, or secrets
- Automatically inferred procedures that have not been reviewed

If a durable procedure improves, change versioned code, prompts, schemas, or runbooks rather than relying on semantic memory.

Expected outputs:

- Memory classification and promotion policy.
- Explicit consolidation workflow.
- Minimal Backboard synchronization ledger.
- Correction, supersession, deletion, and retry behavior.
- Project/user scope isolation.
- Memory failure decoupled from task success.

Exit condition:

- Every active Backboard memory can be traced to a validated causal conclusion or explicit approved source, and every memory can be corrected or deleted without losing the underlying evidence.

### Phase 8: expose conversation and activity APIs

Refactor the agent router away from direct provider-specific model calls. Expose task-oriented commands equivalent to:

- Start agent work
- Respond to clarification
- Approve or reject an activity
- Resume a paused task
- Cancel a task
- Retrieve the task conversation

Retrieve Backboard conversations through the authenticated backend after project ownership checks. Never expose the Backboard API key to the frontend.

Present conversation and activity as distinct views:

- Conversation explains what the user and agent communicated.
- Activity explains what TraceLoop actually executed and observed.

Use existing Supabase Realtime patterns for task, run, and activity progress. Do not make the Backboard thread the frontend's source for authoritative task status.

Expected outputs:

- Provider-neutral agent router.
- Authenticated conversation proxy.
- Activity/approval/resume APIs.
- Realtime progress behavior.
- Compatibility path for existing tasks and current frontend consumers.

Exit condition:

- The frontend can reconstruct the user-visible conversation and the authoritative execution timeline without conflating or duplicating them.

### Phase 9: observability, security, and lifecycle

Instrument each provider and domain boundary with identifiers that allow one task iteration to be reconstructed without recording secrets or hidden reasoning.

Capture:

- Task, iteration, run, activity, patch, and causal node identifiers
- Backboard assistant, thread, message, run, tool-call, memory, and document identifiers where applicable
- Inngest function and step identifiers
- Modal job identifiers
- Provider and model
- Input/output token counts and cost
- Latency, retry count, cancellation, timeout, and stable error class

Enforce:

- Server-only Backboard credentials
- Ownership checks before every assistant/thread/memory/document operation
- Project and user memory isolation
- Source/document size and content policies
- Redaction of secrets from provider-bound context
- Retention and deletion behavior for threads, assistants, documents, memories, and local synchronization references
- No persistence of hidden reasoning

Expected outputs:

- Structured logs and metrics at each boundary.
- Cost attribution to task and iteration.
- Provider error taxonomy.
- Retention/deletion workflow.
- Operational guidance for stuck remote runs and reconciliation.

Exit condition:

- An operator can determine what occurred, what was retried, what was charged, and which external records remain without accessing raw hidden reasoning.

### Phase 10: staged rollout and removal criteria

Roll out by runtime flag, not by destructive migration.

Recommended order:

1. Internal projects only.
2. Backboard planning in shadow evaluation with no shadow side effects.
3. Full Backboard authoring loop for selected new internal tasks.
4. Limited percentage of new external tasks.
5. Backboard default for new tasks.
6. Legacy runtime removal only after stable operation across at least two release cycles or an explicitly approved alternative threshold.

Do not switch an in-progress task between runtimes unless a separately designed migration path preserves thread and activity continuity.

Expected outputs:

- Per-task or per-project runtime selection.
- Observable rollout metrics.
- Documented rollback operation.
- Clear criteria for retaining, deprecating, or removing the legacy adapter.

Exit condition:

- The runtime can be rolled back without reverting database migrations or losing authoritative task, activity, run, causal, or source state.

## Behaviors that must be verified

The implementer must design an appropriate verification strategy for at least these areas. This list defines things to test, not individual tests or required test names.

### Runtime and external-service behavior

- Backboard assistant and thread provisioning under concurrency and retries.
- Structured tool-call conformance and invalid argument handling.
- Multi-round tool output handling.
- Response loss after remote success.
- Provider rate limiting, timeout, cancellation, malformed response, and service failure.
- Model-policy allowlisting and usage reporting.
- Thread retrieval and ownership enforcement.

### Task, activity, and orchestration behavior

- FSM enforcement at every agent stage.
- Idempotency across Inngest retries and repeated API requests.
- Exactly-once observable file mutation and firmware-run dispatch.
- Approval pause/resume behavior.
- Budget and iteration enforcement.
- Cancellation during agent reasoning and during firmware compute.
- Recovery after process restart or delayed events.
- Compatibility of existing manual and legacy paths during rollout.

### Tool and mutation safety

- Contract compatibility between Zod validation and generated JSON Schema.
- State-to-tool allowlists.
- Ownership, permission profile, plan scope, protected paths, traversal, size, and malformed-operation rejection.
- Apply-or-reflect behavior without partial unrecorded mutation.
- Bounded tool-result and prompt context.

### Causal and memory behavior

- Cross-run linkage between hypothesis, intervention, evidence, and outcome.
- Correct distinction among resolved, unchanged, regressed, and inconclusive outcomes.
- Relevant causal-history retrieval.
- Prevention of repeated ineffective interventions when no new evidence exists.
- Rejection of speculative, volatile, sensitive, or unverified memory candidates.
- Project/user memory isolation.
- Memory correction, supersession, deletion, and synchronization retry.
- Task completion remaining successful when memory synchronization fails.

### End-to-end authoring-loop behavior

- First-pass successful implementation.
- Clarification-required work.
- Build-failure repair.
- Simulation/test failure followed by causal patching.
- Ineffective patch followed by a materially revised intervention.
- Guided/review approval behavior.
- Autonomous completion within limits.
- Genuine blocker and no-progress handling.
- Cancellation and resumption.

## Completion criteria

The architectural pivot is complete only when all of these are true:

- A new task can execute the complete authoring loop from one initial user request.
- The task can pause for clarification or approval and resume on the same Backboard thread.
- The FSM remains the sole authority for task transitions.
- Inngest remains the sole durable authoring-loop orchestrator.
- Backboard owns the full conversational history without a duplicate local message layer.
- Every side effect is represented by an idempotent activity.
- Retries do not duplicate source mutations, firmware runs, tool outputs, or memories.
- Causal provenance links agent interventions to validation outcomes across iterations.
- Semantic memories are traceable to causal conclusions or explicit approved sources.
- User and project memory scopes do not leak.
- Tool schemas have one canonical definition and are validated on receipt.
- Backboard model access is constrained by local stage policy.
- Existing edit reliability and security rules still pass.
- Existing tasks remain compatible with the runtime on which they began.
- The new runtime can be disabled without losing authoritative TraceLoop state.
- Type checking, repository tests, affected contract tests, and configured live integration checks pass.

## Required final handoff from implementer agents

At the end of each implementation slice, report:

1. The externally observable behavior added or changed.
2. The architectural boundary affected.
3. The files and migrations changed.
4. The behaviors verified and the commands used.
5. Any live Backboard verification performed and the isolated resources it created.
6. Any unresolved provider behavior or architectural risk.
7. Any feature flag, deployment step, data migration, or rollback consideration.
8. The next unblocked implementation slice.

At final completion, also provide:

- The final runtime/component map.
- The final task/activity/thread/memory/causal ownership map.
- The ADR and configuration changes.
- Deployment and rollback instructions.
- Retention and deletion behavior.
- Known limitations and explicitly deferred work.

Do not claim completion based only on mocked provider calls. Deterministic tests should carry normal CI, but the final handoff must distinguish those results from opt-in live Backboard verification.
