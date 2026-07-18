# 05 — Create the TraceLoop host bridge and shared turn seam

Status: ready-for-agent
Blocked by: 01

## Objective

Give both typed and spoken messages one application-owned conversation entry
point, then implement `HostConversationPort` as a thin adapter to that entry
point. This ticket contains all TraceLoop-specific voice knowledge.

## Files

- `backend/conversation/contracts.ts`
- `backend/conversation/service.ts`
- `backend/trpc/routers/conversation.ts`
- `backend/trpc/router.ts`
- `frontend/src/features/voice/adapters/traceloop-host.ts`
- `frontend/src/features/voice/adapters/traceloop-events.ts`
- Focused backend and frontend adapter tests

## Work

- Define one authenticated `conversation.submitTurn` request with `text`,
  `inputSource`, `clientTurnId`, and optional active task ID.
- Define one structured reply matching `HostReply`; typed UI may ignore
  `spokenText`, but receives the same `displayText` and UI effects.
- Move message routing out of React. Do not reproduce FSM branching in the voice
  adapter.
- For the first slice, support only:
  - the existing conversational/task entry path;
  - clarification answers supported by the current agent API;
  - current task status;
  - latest deterministic root-cause explanation;
  - safe UI effects for source/evidence/patch review;
  - dedicated active-task stop.
- Recognize only a narrow documented stop/cancel phrase set before invoking an
  LLM, then call the existing authenticated `tasks.stop` behavior. All other
  intent interpretation remains application-owned.
- Return a clear unsupported response for commits, pushes, deploys, permission
  changes, and voice patch approval.
- Create concise `spokenText` from structured application state, never from raw
  build logs or trace contents.
- Audit task-affecting voice turns in existing `activity_logs.metadata` without a
  schema migration.
- Map task/run changes from the existing realtime layer into host events. Do not
  speak progress events in this ticket.

## Acceptance criteria

- The typed composer and `TraceLoopHostAdapter` call the same backend service.
- Ownership and FSM validation happen server-side for every task-scoped turn.
- A root-cause reply is grounded in stored `analysisResult.rootCauseText`.
- Stop uses the existing task stop path and is idempotent.
- An approval utterance returns a pending visual action; it cannot call the patch
  approval mutation.
- The host adapter sends no source, raw log, trace, Supabase token, or service
  credential to the provider context.
- Existing agent, task, patch, Inngest, and Modal code does not import voice code.

## Tests

- Backend contract tests for auth, ownership, supported intents, unsupported
  mutations, deterministic explanation, stop, and audit metadata.
- Adapter tests proving typed and voice requests produce equivalent host input.
- Verify repeated `clientTurnId` values do not repeat a task-affecting action.

## Out of scope

- Completing unrelated gaps in the coding agent, redesigning agent prompts,
  rewriting the FSM, and adding general-purpose intent classification beyond the
  listed first-slice requests.

## Exit gate

The shared entry point works from a contract test for both `text` and `voice`,
and no voice-only route can mutate task state except stop.
