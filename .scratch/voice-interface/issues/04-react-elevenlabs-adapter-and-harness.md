# 04 — Build the React/ElevenLabs adapter and isolated harness

Status: ready-for-agent
Blocked by: 01, 02, 03

## Objective

Build a reusable Voice Dock driven by the core controller and demonstrate it
against fakes before importing it into `TraceLoop.tsx`.

## Files

- `frontend/src/features/voice/VoiceProvider.tsx`
- `frontend/src/features/voice/VoiceDock.tsx`
- `frontend/src/features/voice/VoiceStatus.tsx`
- `frontend/src/features/voice/TranscriptDraft.tsx`
- `frontend/src/features/voice/VoiceFallback.tsx`
- `frontend/src/features/voice/hooks/useVoice.ts`
- `frontend/src/features/voice/adapters/elevenlabs-transport.ts`
- `frontend/src/features/voice/harness/*`
- `frontend/src/features/voice/__tests__/*`
- `frontend/package.json`

## Work

- Add `@elevenlabs/react` only to the frontend package.
- Implement `ElevenLabsTransport` as a mapper from SDK callbacks to core events.
- Capture the exact final user transcript from `onMessage`, assign a local
  `clientTurnId`, and keep it pending until the blocking
  `submit_traceloop_turn` client tool is called.
- Register only that client tool. Ignore LLM-authored transcript arguments, call
  the bound core turn handler with the captured transcript, and return its
  `spokenText` as the blocking tool result.
- If the tool fires without a pending final transcript, return a fixed retry
  message and do not call the host.
- Keep the SDK provider inside the adapter/provider boundary.
- Implement accessible push-to-talk, mute, cancel, status, tentative transcript,
  retry, and text-fallback presentation.
- Request microphone permission only after the user activates voice and after an
  explanatory message is visible.
- Add a development harness that injects `FakeVoiceTransport`, `FakeHost`, and
  scripted events. It must render without Supabase, tRPC, ElevenLabs, or a task.
- Do not import `TraceLoop.tsx`, task hooks, or tRPC from presentation files.

## Acceptance criteria

- The harness demonstrates idle, listening, tentative transcript, submitting,
  speaking, interruption, confirmation-required, and recoverable-error states.
- A transcript containing board/pin literals reaches the fake host byte-for-byte
  from the captured final SDK message.
- Keyboard users can focus and operate every control; status changes use an
  appropriate live region without announcing every partial transcript.
- Denied microphone permission shows text fallback and does not reconnect-loop.
- Unmounting ends the session and releases SDK listeners.
- A static import check finds `@elevenlabs/react` only inside the adapter/provider
  boundary.

## Tests

- Component tests with injected fakes; no real browser microphone.
- Adapter contract tests translating representative ElevenLabs callbacks,
  missing transcript/tool ordering, and repeated blocking tool calls.
- Frontend build verifies vendor code bundles only when the feature is imported.

## Out of scope

- Mounting in the Agent workspace, real task behavior, always-listening,
  waveform decoration, voice selection, and production visual polish.

## Exit gate

The standalone harness completes the scripted voice journey, and the frontend
build passes without vendor credentials.
