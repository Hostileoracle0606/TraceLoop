# 01 — Define the vendor-neutral voice boundary

Status: ready-for-agent

## Objective

Create the pure TypeScript contracts and public exports that every later voice
module depends on. This ticket introduces no runtime behavior and no dependency.

## Files

- `src/voice/core/contracts.ts`
- `src/voice/core/index.ts`
- `src/voice/index.ts`
- Root and frontend TypeScript/Vite aliases for `@voice/*`

## Work

- Define `VoicePhase`, `VoiceTransportEvent`, `TransportTurn`,
  `TransportReply`, `VoiceTransportPort`, `HostTurn`, `HostReply`,
  `HostUiEffect`, `HostConversationPort`, and `SessionTokenPort` from the feature
  spec.
- Define `VoiceSnapshot`, containing only data required to render the Voice Dock:
  phase, muted state, partial transcript, last submitted transcript, current
  reply, recoverable error, and whether push-to-talk is available.
- Export the contracts through explicit barrels; do not export internal helpers.
- Add `@voice/*` resolution without altering existing engine/backend aliases.

## Acceptance criteria

- Contracts compile under both root and frontend TypeScript configurations.
- `src/voice` has no runtime dependency and no imports from React, browser APIs,
  ElevenLabs, tRPC, backend, database, or TraceLoop agent-state modules.
- The frontend can type-import a contract from `@voice/core` in a compile-only
  fixture.
- `HostConversationPort` exposes no generic tool execution or mutating approval
  method.
- The transport exposes a bounded turn-handler registration, not a generic tool
  registry.

## Tests

- Compile/typecheck is the primary test.
- Add a small contract-shape test only if runtime discriminated-union guards are
  required; do not test TypeScript syntax with runtime assertions.

## Out of scope

- Controller behavior, React, ElevenLabs, network calls, UI, and TraceLoop task
  mapping.

## Exit gate

`npm run typecheck` and the frontend typecheck command both pass.
