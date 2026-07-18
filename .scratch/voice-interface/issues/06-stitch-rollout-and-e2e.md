# 06 — Stitch voice into the Agent workspace and prove safe fallback

Status: ready-for-agent
Blocked by: 04, 05

## Objective

Mount the completed framework at the two intended seams, verify the end-to-end
journey, and keep rollback to one feature flag.

## Files

- `frontend/src/lib/providers.tsx`
- `frontend/src/main.tsx`
- `frontend/src/TraceLoop.tsx`
- `frontend/src/traceloop.css` only for required states and layout
- `frontend/e2e/voice-interface.spec.ts`
- Deployment/configuration documentation

## Work

- Ensure the existing query/tRPC provider is mounted, then mount
  `VoiceProvider` behind `VITE_VOICE_ENABLED`.
- Add a `VoiceDock` slot beside the current Agent message composer without
  moving task logic into `TraceLoop.tsx`.
- Replace the current canned `sendMessage` timeout with the shared conversation
  entry point; preserve existing keyboard submission and text fallback.
- Supply the active task ID and allowlisted navigation callbacks through the
  TraceLoop host adapter.
- Show a visual confirmation card for every pending mutation.
- Add an environment readiness indicator: unavailable voice must not mark the
  rest of TraceLoop unhealthy.
- Document ElevenLabs agent creation, private auth, interruption settings,
  retention, environment variables, manual smoke test, and rollback.

## Acceptance criteria

- With the flag off, there is no microphone control, session request, or
  ElevenLabs bundle initialization; text behavior remains usable.
- With the flag on and fake transport selected, the complete browser scenario
  passes deterministically.
- A spoken turn and typed turn render through the same conversation stream.
- Starting push-to-talk while speech is playing interrupts it.
- Voice can open evidence and patch review but cannot apply the patch.
- Voice can stop an owned active task.
- Network, SDK, microphone, or permission failures leave the typed composer
  usable and explain recovery once.
- No raw audio is stored; no secrets appear in frontend assets or browser logs.

## Tests

- Playwright fake-transport journey from the feature spec.
- Regression coverage for keyboard submit, text-only mode, flag-off mode, and
  microphone denial.
- Backend and frontend typechecks, root tests, frontend production build.
- Gated manual smoke test with a real private ElevenLabs session; it is not part
  of normal CI.

## Out of scope

- Visual redesign of the IDE, generalized chat history, multilingual support,
  always-listening mode, voice-only mutation approval, usage billing UI, and
  production analytics dashboards.

## Exit gate

All automated checks pass against fakes, the manual smoke test completes one
status/explanation turn, and disabling `VITE_VOICE_ENABLED` fully removes the
integration at runtime.

