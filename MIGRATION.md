# Migration Guide

This document covers breaking changes and migration steps for each version of TraceLoop.

## v1.0.0 (2026-07-18)

### Initial Setup

#### Prerequisites
- Node.js 18+
- A Supabase project (URL, anon key, service role key)
- A Modal account (for compute plane)
- An Inngest account (for durable job orchestration)
- An LLM provider API key (Anthropic or OpenAI)

#### Step 1: Clone and Install

```bash
git clone <repository-url> traceloop
cd traceloop
npm install
cd frontend && npm install && cd ..
```

#### Step 2: Configure Environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

See the [Environment Variables](#environment-variables) section below for details.

#### Step 3: Set Up the Database

Push the Drizzle schema to your Supabase PostgreSQL instance:

```bash
npm run db:push
```

This creates all tables: `projects`, `boards`, `tasks`, `runs`, `patches`, `activity_logs`.

To generate a migration file instead of a direct push:

```bash
npm run db:generate
npm run db:migrate
```

#### Step 4: Deploy Modal Compute Plane

```bash
modal deploy modal/app.py
```

Set the resulting endpoint URL as `MODAL_ENDPOINT` in your `.env`.

#### Step 5: Start Development Servers

```bash
# Backend (tRPC API + Inngest functions)
npm run backend:dev

# Frontend (Vite dev server)
cd frontend && npm run dev
```

#### Step 6: Verify

Open the health endpoint to confirm connectivity:

```bash
curl http://localhost:3000/api/health
```

Expected response: `{"status":"ok","checks":{"supabase":"ok","inngest":"ok"},...}`

---

### Environment Variables

All environment variables are validated at startup via Zod (`backend/config.ts`). The server will refuse to start if required variables are missing or invalid.

#### Supabase (Required)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (e.g. `https://your-project.supabase.co`) |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only, keep secret) |

#### Database (Required)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Direct PostgreSQL connection URL for Drizzle ORM |

#### Modal (Optional)

| Variable | Description |
|---|---|
| `MODAL_ENDPOINT` | Modal compute plane endpoint URL. Required for real build/simulate; omit for local development with fixture data. |

#### Inngest (Optional)

| Variable | Description |
|---|---|
| `INNGEST_EVENT_KEY` | Inngest event key for sending events. Required in production. |
| `INNGEST_BASE_URL` | Inngest base URL. Defaults to `http://localhost:8288` (Inngest Dev Server) in development. |

#### LLM (Required — one provider key)

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | LLM provider: `anthropic` (default) or `openai` |
| `ANTHROPIC_API_KEY` | Anthropic API key (required if `LLM_PROVIDER=anthropic`) |
| `OPENAI_API_KEY` | OpenAI API key (required if `LLM_PROVIDER=openai`) |

#### Observability (Optional)

| Variable | Description |
|---|---|
| `LOG_LEVEL` | Pino log level: `trace`, `debug`, `info` (default), `warn`, `error` |
| `SENTRY_DSN` | Sentry DSN for error tracking. Omit to disable Sentry. |

#### Server (Optional)

| Variable | Description |
|---|---|
| `PORT` | Server port. Default: `3000` |
| `NODE_ENV` | Environment: `development` (default), `production`, `test` |

---

### Database Schema

#### Schema Overview

The database is managed via Drizzle ORM. The schema is defined in `backend/db/schema.ts` and migrations live in `backend/db/migrations/`.

Tables:

- **`projects`** — Top-level project container, owned by a user, linked to a board
- **`boards`** — Hardware board definitions (MCU, architecture, peripherals, capabilities)
- **`tasks`** — Authoring sessions with state machine, permission profile, and resource controls
- **`runs`** — Individual build → simulate → analyze executions within a task
- **`patches`** — Code patches proposed by the agent, with approval workflow
- **`activity_logs`** — Audit trail of state transitions with actor tracking

#### Running Migrations

```bash
# Generate migration files from schema changes
npm run db:generate

# Apply pending migrations
npm run db:migrate

# Push schema directly (development only, no migration files)
npm run db:push

# Visual schema inspector
npm run db:studio
```

#### Phase 5 Board Schema Additions

The `boards` table includes hardware capability fields added in Phase 5:

- `led_mappings` (JSONB) — LED name/color/GPIO mappings
- `gpio_ports` (JSONB) — Available GPIO port list
- `timer_count` (integer) — Number of hardware timers
- `has_ble` (boolean) — BLE capability flag
- `has_wifi` (boolean) — WiFi capability flag
- `renode_platform_description` (text) — Renode `.repl` file path
- `status` (varchar) — Board status: `active`, `deprecated`, `beta`

---

### API Changes

#### tRPC Routers

The following routers are available at `/api/trpc`:

| Router | Phase | Description |
|---|---|---|
| `projects` | 1 | CRUD for projects |
| `tasks` | 1 | Task management and state queries |
| `runs` | 1 | Run lifecycle and result retrieval |
| `patches` | 1 | Patch proposal, approval, rejection |
| `boards` | 5 | Board CRUD with capability validation |
| `agent` | 3 | Agent state transitions, approval flows |

#### Middleware (Phase 6)

Two middleware layers were added to tRPC procedures:

1. **Rate Limiting** (`backend/trpc/middleware/rateLimit.ts`) — Limits requests per user to prevent abuse. Applied to mutation procedures.
2. **Input Validation** (`backend/trpc/middleware/validate.ts`) — Zod schema validation on procedure inputs.

#### Health Endpoints (Phase 6)

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | System health: Supabase + Inngest connectivity |
| `/api/health/queue` | GET | Queue depth: pending and running run counts |
| `/api/metrics` | GET | 24h metrics: run count, success rate, avg duration, active tasks |

---

### Breaking Changes

As v1.0.0 is the initial release, there are no prior-version breaking changes. Future breaking changes will be documented here with migration steps.
