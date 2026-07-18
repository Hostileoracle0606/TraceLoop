# 03 — Add the authenticated ElevenLabs session adapter

Status: ready-for-agent
Blocked by: 01

## Objective

Create the only server-side path that knows the ElevenLabs API key and mints a
private browser conversation session for an authenticated TraceLoop user.

## Files

- `backend/voice/config.ts`
- `backend/voice/elevenlabs-token-provider.ts`
- `backend/voice/session-service.ts`
- `backend/voice/__tests__/*.test.ts`
- `backend/trpc/routers/voice.ts`
- `backend/trpc/router.ts`
- `backend/config.ts`
- `.env.example`

## Work

- Add optional `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` configuration.
- Implement the `SessionTokenPort` against the ElevenLabs conversation-token
  endpoint using an injected `fetch` for tests.
- Add a rate-limited `voice.createSession` procedure.
- If `activeTaskId` is present, load the task/project and enforce ownership
  before contacting ElevenLabs.
- Return only the short-lived token; never return API keys or authorization
  headers.
- Map missing configuration, denied access, upstream authentication, rate limit,
  timeout, and unexpected response failures to stable tRPC errors.
- Log provider request IDs and TraceLoop trace IDs without logging tokens.

## Acceptance criteria

- Anonymous users receive `UNAUTHORIZED`.
- A user cannot mint a task-scoped session for another user's task.
- Missing optional voice configuration does not prevent the non-voice backend
  from starting; only `voice.createSession` reports unavailable.
- The API key is used only in backend request headers and is absent from returned
  JSON and logs.
- Upstream calls use a bounded timeout and do not retry authentication failures.

## Tests

- Contract tests for auth, ownership, rate limiting, success, missing config,
  timeout, malformed upstream response, and upstream 401/429/5xx.
- Assert the token is redacted from structured logs.

## Out of scope

- TTS proxying, post-call webhooks, database migrations, agent creation through
  the API, and frontend SDK code.

## Exit gate

Backend tests and root typecheck pass with `fetch` mocked and no ElevenLabs key.
