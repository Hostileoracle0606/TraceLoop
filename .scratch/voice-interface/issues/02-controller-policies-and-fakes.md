# 02 — Implement the controller, safety policies, and fakes

Status: ready-for-agent
Blocked by: 01

## Objective

Implement and TDD the entire vendor-neutral voice lifecycle. At completion, a
test can conduct a full conversation using fake speech and fake host adapters.

## Files

- `src/voice/core/controller.ts`
- `src/voice/core/machine.ts`
- `src/voice/core/narration-policy.ts`
- `src/voice/core/confirmation-policy.ts`
- `src/voice/testing/fake-transport.ts`
- `src/voice/testing/fake-host.ts`
- `src/voice/testing/manual-clock.ts`
- `src/voice/__tests__/*.test.ts`

## Work

- Build `createVoiceController(dependencies)` using injected transport, host,
  token provider, UI-effect sink, clock, and ID source.
- Bind exactly one transport turn handler; use it to submit the captured final
  transcript to the host and return a bounded `TransportReply`.
- Implement the state rules in the spec as a transition table, not scattered
  component booleans.
- De-duplicate completed turns by `clientTurnId` for the lifetime of a session;
  return the cached reply when the transport retries its blocking tool.
- Make partial transcript handling replace the previous partial text.
- Interrupt active speech before starting push-to-talk.
- Implement the 280-character/two-sentence narration budget.
- Suppress repeat speech for the same host reply ID.
- Treat every `pendingAction` as visual-confirmation-only.
- Provide deterministic fakes and a manual clock; tests must not use timers,
  microphones, DOM APIs, or network calls.

## Acceptance criteria

- A fake session moves through connect, listen, submit, reply, speak, and ready.
- Duplicate final events or handler retries submit exactly once.
- Starting input while speaking records `interrupt` before `beginInput`.
- A pending action emits an allowlisted confirmation UI effect but invokes no
  action callback.
- Recoverable errors preserve a usable text fallback snapshot.
- `dispose()` is idempotent and leaves no subscribed listener.
- No core file imports application or vendor code.

## Tests

- Table-driven state-machine tests.
- Controller orchestration tests covering partial, final, duplicate, empty,
  interruption, pending action, mute, error, and disposal paths.
- Narration-policy boundary tests at 279, 280, and 281 characters and at one,
  two, and three sentences.

## Out of scope

- React rendering, ElevenLabs behavior, tRPC, task ownership, and browser E2E.

## Exit gate

All new tests pass through the root Vitest configuration without credentials.
