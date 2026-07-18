# Spec: Stitchable Voice Interface Framework

Status: ready-for-agent

## Outcome

Create an extractable voice-interface feature that lets a browser user speak to
TraceLoop through ElevenLabs without allowing ElevenLabs, React components, or
speech-specific state to become part of the firmware agent's control plane.

The framework must be usable against fakes before it is mounted in the current
Agent workspace. The final stitch is a thin adapter and one provider/component
mount, not a rewrite of the agent loop.

## Design principle

TraceLoop remains the only authority for task state, permissions, code changes,
builds, simulations, patches, and completion. The voice layer transports turns,
presents short responses, and requests UI effects. It does not decide what the
coding agent may do.

The dependency direction is one-way:

```text
voice-core <- ElevenLabs adapter
voice-core <- React presentation
voice-core <- TraceLoop host adapter -> tRPC/FSM/task APIs

voice-core must not import React, ElevenLabs, tRPC, Supabase, Drizzle, Inngest,
TraceLoop task types, or browser globals.
```

## Scope

### Included in the first usable slice

- Desktop browser, English, one active TraceLoop task.
- Push-to-talk interaction; no always-listening mode.
- Private ElevenLabs sessions minted through the authenticated backend.
- Tentative transcript shown while speaking and one final submitted turn.
- Spoken and written TraceLoop response.
- Voice requests for:
  - submitting a normal conversational turn;
  - answering a clarification;
  - asking for task status;
  - asking for the latest failure explanation;
  - opening source, evidence, or patch-review UI;
  - stopping the active task.
- Existing permission profile remains authoritative.
- A voice request may open an approval dialog but cannot confirm a mutating
  action in the first slice.
- Text input remains available when voice is unavailable or disconnected.
- Task-affecting voice actions are recorded in the existing activity log.
- Raw audio is not stored by TraceLoop.

### Explicitly excluded

- Wake words, background listening, telephone calls, mobile-native clients.
- Multiple simultaneous tasks or cross-project voice control.
- Multilingual behavior, voice cloning, custom voices, or offline speech.
- Direct ElevenLabs access to Modal, Inngest, Supabase, Git, the filesystem, or
  the firmware agent's LLM tools.
- Voice-only approval of patches, test changes, permission changes, commits,
  pushes, deployments, or other external side effects.
- A new chat-history or audio database schema.
- Narrating raw compiler, simulator, trace, or source-code content.
- Replacing the existing coding-model provider with an ElevenLabs-hosted LLM.
- Broad refactoring of the current frontend outside the provider mount, Agent
  composer slot, and host adapter needed for this feature.

## Module layout

The framework stays inside the existing repository layout to avoid introducing
a workspace/package-manager migration. Its public barrels make later extraction
to packages mechanical.

```text
src/voice/
  core/
    contracts.ts
    controller.ts
    machine.ts
    narration-policy.ts
    confirmation-policy.ts
    index.ts
  testing/
    fake-transport.ts
    fake-host.ts
    manual-clock.ts
    index.ts
  __tests__/

backend/voice/
  config.ts
  elevenlabs-token-provider.ts
  session-service.ts
  __tests__/
backend/trpc/routers/voice.ts

frontend/src/features/voice/
  VoiceProvider.tsx
  VoiceDock.tsx
  VoiceStatus.tsx
  TranscriptDraft.tsx
  VoiceFallback.tsx
  hooks/useVoice.ts
  adapters/elevenlabs-transport.ts
  adapters/traceloop-host.ts
  adapters/traceloop-events.ts
  __tests__/
```

Only `frontend/src/features/voice/adapters/elevenlabs-transport.ts` and its
provider wrapper may import `@elevenlabs/react`. Only
`adapters/traceloop-*.ts` may import TraceLoop/tRPC types. Presentation
components import the core view model and local UI primitives only.

## Core contracts

The contracts below describe the required shapes. Exact naming may change only
if the same dependency boundaries and behavior are preserved.

```ts
export type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'submitting'
  | 'speaking'
  | 'awaiting-confirmation'
  | 'error';

export type VoiceTransportEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'partial-transcript'; text: string }
  | { type: 'final-transcript'; text: string; clientTurnId: string }
  | { type: 'speech-started' }
  | { type: 'speech-ended' }
  | { type: 'interrupted' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; code: string; recoverable: boolean };

export interface TransportTurn {
  text: string;
  clientTurnId: string;
}

export interface TransportReply {
  replyId: string;
  spokenText?: string;
}

export interface VoiceTransportPort {
  start(input: { sessionToken: string }): Promise<void>;
  stop(): Promise<void>;
  beginInput(): Promise<void>;
  endInput(): Promise<void>;
  interrupt(): Promise<void>;
  setMuted(muted: boolean): void;
  subscribe(listener: (event: VoiceTransportEvent) => void): () => void;
  bindTurnHandler(
    handler: (turn: TransportTurn) => Promise<TransportReply>,
  ): () => void;
}

export interface HostTurn {
  text: string;
  source: 'voice';
  clientTurnId: string;
  activeTaskId?: string;
}

export interface HostReply {
  id: string;
  kind: 'answer' | 'clarification' | 'status' | 'decision' | 'outcome';
  displayText: string;
  spokenText?: string;
  uiEffects?: HostUiEffect[];
  pendingAction?: {
    id: string;
    label: string;
    risk: 'low' | 'medium' | 'high';
    requiresVisualConfirmation: true;
  };
}

export type HostUiEffect =
  | { type: 'open-source'; file: string; line?: number }
  | { type: 'open-evidence'; runId: string; eventId?: string }
  | { type: 'open-patch-review'; patchId: string }
  | { type: 'open-confirmation'; actionId: string };

export interface HostConversationPort {
  submitTurn(turn: HostTurn): Promise<HostReply>;
}

export interface SessionTokenPort {
  createSession(input: {
    activeTaskId?: string;
  }): Promise<{ token: string }>;
}
```

`HostReply.spokenText` is authored by the TraceLoop host, not generated from raw
logs in the voice layer. It is optional so a host response can be display-only.
The voice core does not receive a generic `executeTool` or `applyAction` port.
That absence is an intentional security boundary.

## Voice controller responsibilities

`createVoiceController` is the cohesive orchestration unit. It owns:

- the voice phase and user-visible view model;
- transport connection and teardown;
- push-to-talk lifecycle;
- tentative transcript replacement;
- final-turn de-duplication using `clientTurnId`;
- forwarding final turns to `HostConversationPort`;
- returning the host's bounded `spokenText` through the transport's registered
  turn handler;
- interrupting agent speech when the user starts speaking;
- dispatching allowlisted `HostUiEffect` values to the UI bridge;
- applying the narration and confirmation policies;
- recoverable error state and text fallback.

It does not own task interpretation, LLM prompts, task state transitions,
permission checks, navigation implementation, persistence, or vendor API calls.

## State rules

- `idle -> connecting -> ready` after a session token and transport connection.
- `ready -> listening` only from an explicit press/push-to-talk action.
- Starting input while `speaking` first calls `interrupt()`, then enters
  `listening`.
- A partial transcript updates display state only.
- A final transcript updates the committed display text. When the transport's
  bound turn handler is invoked, the controller enters `submitting` and calls
  the host.
- The same `clientTurnId` calls the host once. A transport retry receives the
  cached `TransportReply` rather than triggering another application turn.
- Empty final transcripts return to `ready` without calling the host.
- A host reply with a pending action enters `awaiting-confirmation` and emits an
  `open-confirmation` UI effect. The controller has no method to approve it.
- A recoverable transport failure returns a visible error with text fallback.
- Stop/dispose removes every subscription and ends the transport exactly once.

## Cognitive-load policy

The framework speaks only `HostReply.spokenText` and never synthesizes a raw log.

- At most two sentences or 280 characters of spoken content per reply.
- Clarification replies contain one question.
- Progress updates are display-only in the first slice.
- Decision and blocked-state replies may speak once; repeated identical host
  reply IDs are suppressed.
- Completion speaks the observed outcome and passing-test count when supplied.
- User speech interrupts agent speech.
- Muted mode continues to display transcripts and replies without audio.

The host is responsible for producing the concise `spokenText`; the core rejects
or suppresses content outside the budget rather than attempting an LLM summary.

## Safety boundary

Voice is an input source, not a permission source.

| Request | First-slice behavior |
|---|---|
| Ask/explain/status | Submit normally |
| Open source/evidence/diff | Apply allowlisted UI effect |
| Stop active task | Execute through an authenticated host-turn fast path |
| Start an already-approved plan | Pass to host; host enforces current profile |
| Apply/reject/edit patch | Open visual review; no voice confirmation |
| Modify tests/acceptance criteria | Host must use existing explicit policy |
| Change permission profile | Display settings link only |
| Commit/push/deploy | Unsupported |

The TraceLoop adapter must recheck authentication, task ownership, FSM state,
and permission profile. It must not trust task IDs or action IDs supplied by the
voice provider.

## ElevenLabs boundary

The ElevenLabs adapter maps SDK events to `VoiceTransportEvent` and nothing else.
The backend token provider owns `ELEVENLABS_API_KEY` and
`ELEVENLABS_AGENT_ID`; neither is bundled into frontend code. Sessions are
private and minted only for an authenticated TraceLoop user.

For the first slice, the ElevenLabs conversational agent is a speech/dialogue
shell. Its only host-facing capability is a blocking client tool named
`submit_traceloop_turn`. The adapter captures the exact final user transcript
from the SDK message stream, associates it with a local `clientTurnId`, and
ignores any LLM-authored paraphrase. When the tool is called, the adapter invokes
the bound turn handler with that captured transcript and returns the resulting
`spokenText`; ElevenLabs speaks the blocking tool result. If there is no pending
final transcript, the tool returns a safe request to repeat instead of guessing.
It has no direct server webhook tools for TraceLoop mutations.

Required external setup:

- Private ElevenLabs agent.
- English conversation and interruption enabled.
- Retention for audio and provider transcripts set to scheduled deletion for
  development unless a later privacy decision changes it.
- Prompt requires the agent to use the host reply and not invent build state,
  test results, causal evidence, or approval outcomes.

## TraceLoop host bridge

The host adapter is the only place where voice meets application concepts.

- It converts the active project/task/run view into safe, minimal session
  context: IDs, board display name, current task state, iteration, and pending
  decision label.
- It forwards turns through the same application conversation entry point used
  by typed messages.
- It maps structured host UI effects to existing navigation callbacks.
- Its conversation service recognizes the narrow reserved stop request before
  any LLM call and maps it to `tasks.stop`.
- It records task-affecting voice turns in `activity_logs.metadata` with
  `inputSource`, `clientTurnId`, and provider conversation ID.
- It never sends source files, secrets, raw build logs, or full traces to
  ElevenLabs by default.

If a real shared text/voice conversation entry point is not available when this
ticket begins, create that host seam first. Do not encode task-state branching in
the React voice components.

## Testing strategy

### Core tests, no network or DOM

- State-transition table covers every allowed transition.
- Duplicate final transcript calls the host once.
- A retried blocking tool receives the cached transport reply.
- Partial transcripts never call the host.
- Empty transcripts never call the host.
- Push-to-talk during speech interrupts before listening.
- Over-budget or absent `spokenText` is display-only.
- Pending actions enter `awaiting-confirmation` without executing anything.
- Disposal ends the session once and removes subscribers.

### Adapter contract tests

- Fake and ElevenLabs transports emit the same core event shapes.
- The ElevenLabs tool uses the captured final transcript rather than a
  model-generated tool parameter.
- Session-token service keeps credentials server-side, validates ownership, and
  maps upstream errors to stable application errors.
- TraceLoop host adapter maps typed and voice turns to the same host entry point.
- Reserved stop is authenticated, owned, idempotent, and audited.
- UI effects outside the union are rejected.

### Browser end-to-end

Use a fake transport in Playwright for deterministic CI. Cover:

1. Start voice session.
2. Show tentative transcript.
3. Submit one final turn.
4. Render and speak a host reply.
5. Interrupt speech with push-to-talk.
6. Open evidence from a structured UI effect.
7. Request a patch and verify only the visual confirmation opens.
8. Stop the active task.
9. Simulate transport failure and continue with text.

One separately gated manual smoke test may use a real ElevenLabs key. Normal CI
must not require network access, paid minutes, a microphone, or vendor secrets.

## Definition of done

- Core tests run with the root Vitest suite.
- Frontend production build and both TypeScript configurations pass.
- Playwright fake-transport journey passes.
- No ElevenLabs import exists outside the ElevenLabs adapter/provider boundary.
- No tRPC or TraceLoop task import exists in voice core or presentation files.
- No mutating action can be completed through voice alone.
- Removing the Voice provider and dock mount restores the application to its
  prior text-only behavior without changes to agent, task, or pipeline code.
- Text input works when voice is disabled, denied, disconnected, or unconfigured.

## Delivery sequence

| Ticket | Deliverable | Relative size | Depends on |
|---|---|---:|---|
| 01 | Pure contracts and public boundary | S | — |
| 02 | Controller, policies, fakes, core tests | M | 01 |
| 03 | Authenticated ElevenLabs session adapter | S | 01 |
| 04 | React/ElevenLabs transport and standalone harness | M | 01, 02, 03 |
| 05 | TraceLoop host adapter and shared text/voice turn seam | M/L | 01 |
| 06 | Thin Agent-workspace stitch and end-to-end tests | M | 04, 05 |

The framework is demonstrable against fakes after ticket 04. TraceLoop production
behavior is not touched until tickets 05 and 06.

## Rollback

The stitch is controlled by `VITE_VOICE_ENABLED`. When false or missing, the
provider is not started and the microphone control is absent. Rollback consists
of disabling the flag; typed interaction and all backend task APIs remain intact.

## References

- ElevenLabs React SDK: https://elevenlabs.io/docs/eleven-agents/libraries/react
- Conversation-token endpoint: https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
- Conversation flow: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- Retention controls: https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention
- Current TraceLoop interaction contract: `docs/user-interaction-flow.md`
- Current TraceLoop FSM: `src/engine/agent-state.ts`
