# Inngest orchestrates the build-simulate-analyze pipeline; Supabase provides storage and realtime

The firmware execution pipeline (build → simulate → analyze) runs as a **durable Inngest function** that orchestrates Modal compute calls, persists artifacts to **Supabase Storage**, and streams progress via **Supabase Realtime**. The tRPC API triggers pipelines by sending Inngest events; it does not run jobs directly.

Why: (1) Inngest provides durable execution with automatic retries, step-level state persistence, and timeout enforcement — the pipeline survives server restarts without custom queue infrastructure; (2) Supabase Storage gives authenticated, signed-URL access to build logs, ELF binaries, and trace logs without building a custom file server; (3) Supabase Realtime (Postgres CDC + broadcast channels) lets the frontend subscribe to task/run state changes without polling or WebSocket server code.

## The pipeline

```
User triggers task.execute (tRPC)
  → Creates a Run row (status: pending)
  → Sends Inngest event: task/run.requested
  → Returns { runId, taskId }

Inngest function: firmware-run-pipeline
  Step 1: build-firmware
    → POST to Modal /build
    → Upload build.log + firmware.elf to Supabase Storage
    → Update run status → building
  Step 2: simulate-firmware
    → POST to Modal /simulate
    → Upload trace.log to Supabase Storage
    → Update run status → simulating
  Step 3: analyze-results
    → POST to Modal /analyze
    → Update run status → analyzing
  Step 4: finalize-run
    → Write full results to runs table
    → Update task state → completed or patching
    → Log activity
```

Each step is individually retried (up to 2 retries). If a step fails after all retries, the function records the failure and transitions the task to `blocked`.

## Storage layout

Artifacts are stored in the `artifacts` Supabase Storage bucket at:
```
{taskId}/{runId}/{filename}
```

Standard artifacts per run:
- `build.log` — compiler output (text/plain)
- `firmware.elf` — compiled binary (application/octet-stream)
- `trace.log` — Renode simulation trace (text/plain)

Signed download URLs are generated with a 1-hour expiry. The storage module (`backend/storage.ts`) provides upload, download (text + binary), list, and delete operations.

## Realtime channels

Two subscription patterns:

1. **Broadcast channels** — server pushes state changes to all connected clients:
   - `task:{taskId}` — task state transitions
   - `run:{taskId}` — run status changes, build progress, analysis completion

2. **Postgres CDC** — clients subscribe to actual row changes in `tasks` and `runs` tables, filtered by task ID. This provides a fallback when broadcast events are missed.

The realtime module (`backend/realtime.ts`) provides broadcast helpers and a `subscribeToTaskChanges()` function for CDC subscriptions.

## Server architecture

The HTTP server (`backend/trpc/server.ts`) combines two handlers on a single port:
- `/api/inngest` → Inngest serve handler (function discovery + execution)
- Everything else → tRPC handler

In development, the Inngest Dev Server polls `/api/inngest` to discover functions. In production, Inngest Cloud calls the endpoint directly.

## Consequences

- The tRPC API is thin: it validates, creates DB rows, and sends events. No long-running HTTP requests.
- Pipeline state survives server restarts — Inngest persists step outputs and resumes from the last completed step.
- The Modal compute plane (ADR 0004) is unchanged — it remains a stateless HTTP API. Inngest is the orchestration layer above it.
- Frontend can stream progress without polling — subscribe to Realtime channels via the Supabase JS client.
- Adding new pipeline steps (e.g., static analysis, size reporting) means adding a new `step.run()` block to the Inngest function.
- The Inngest Dev Server provides a local UI for inspecting function runs, retries, and step outputs during development.
