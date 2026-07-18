# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Comprehensive E2E test suite with Playwright
- Additional board configurations
- Multi-tenant workspace support

## [1.0.0] - 2026-07-18

### Added

- **Phase 1 — Backend API (tRPC + Supabase + Drizzle)**
  - tRPC routers: `projects`, `tasks`, `runs`, `patches`, `boards`, `agent`
  - JWT authentication via Supabase Auth
  - Row-level security for tenant isolation
  - Drizzle ORM schema: `projects`, `boards`, `tasks`, `runs`, `patches`, `activity_logs`
  - Zod-based environment variable validation (`backend/config.ts`)
  - Supabase client with admin and anon variants (`backend/supabase.ts`)
  - Database migrations via `drizzle-kit` (`backend/db/migrations/`)

- **Phase 2 — Real Execution Path**
  - Inngest integration for durable job execution (`backend/inngest/`)
  - Supabase Realtime subscriptions for live run updates (`backend/realtime.ts`)
  - Modal compute client for remote build and simulate (`backend/modal-client.ts`)
  - Supabase Storage integration for artifact persistence (`backend/storage.ts`)
  - End-to-end run lifecycle: pending → building → simulating → analyzing → passed/failed

- **Phase 3 — Agent State Machine + Permissions**
  - Task state machine with 11 states: `clarification-needed`, `planning`, `editing`, `building`, `simulating`, `analyzing`, `patching`, `rerunning`, `completed`, `blocked`, `stopped`
  - Permission profiles: `review`, `guided`, `autonomous`
  - Resource controls: `maxIterations`, `maxTimeMs`, `maxCostUsd`
  - Activity log audit trail with actor tracking (`user`, `agent`, `system`)
  - Agent tRPC router for state transitions and approval flows

- **Phase 3B — Vercel AI SDK LLM Layer**
  - Provider-agnostic LLM abstraction via Vercel AI SDK (`backend/llm/`)
  - Support for Anthropic (Claude) and OpenAI providers
  - Configurable via `LLM_PROVIDER` environment variable
  - Structured output parsing for causal analysis results

- **Phase 4 — Frontend Polish**
  - React + Vite single-page application (`frontend/`)
  - TanStack Query integration for server state management
  - shadcn/ui component library with Tailwind CSS
  - Monaco Editor for in-browser source file editing
  - xterm.js terminal emulator for build/simulation logs
  - tRPC React Query bindings for type-safe API calls
  - Keyboard shortcut support via `react-hotkeys-hook`

- **Phase 5 — Multi-Board Support**
  - Board schema with hardware capabilities: MCU, architecture, flash/RAM, peripherals
  - Board capability fields: `ledMappings`, `gpioPorts`, `timerCount`, `hasBLE`, `hasWiFi`
  - Capability validation middleware (`backend/trpc/middleware/validate.ts`)
  - Docker-based runner for local board builds (`DockerRunner`)
  - CI-based runner for remote board builds (`CIRunner`)
  - Boards tRPC router for CRUD operations
  - Project-to-board association

- **Phase 6 — Observability**
  - Pino structured logging with child loggers (`backend/logger.ts`)
  - Sentry error tracking integration (`@sentry/node`)
  - Health check endpoint: Supabase + Inngest connectivity (`backend/health.ts`)
  - Queue health: pending and running run counts
  - Metrics endpoint: 24h run count, success rate, avg duration, active tasks
  - Rate limiting middleware for tRPC procedures (`backend/trpc/middleware/rateLimit.ts`)
  - Input validation middleware (`backend/trpc/middleware/validate.ts`)
  - Contract tests for health endpoints (`backend/health.test.ts`)

### Changed
- Database schema evolved from simple project/task model to include boards, activity logs, and resource controls
- Frontend migrated from fixture data to live tRPC API bindings
- LLM layer abstracted from direct provider SDK to Vercel AI SDK for provider portability

### Security
- JWT authentication on all tRPC procedures via Supabase Auth
- Row-level security ensuring tenant isolation on all database queries
- Zod schema validation on all environment variables at startup
- Rate limiting middleware to prevent API abuse
- Input validation middleware on tRPC procedures
