# Release Milestones

TraceLoop development is organized into four milestones that progressively bring the platform from prototype to production-ready.

## M1: Live Execution — Complete

**Goal:** Replace fixture data with a live backend that can execute real firmware builds and simulations.

**Phases:** 1–2

### Features

- tRPC backend API with Supabase Auth and PostgreSQL
- Drizzle ORM schema for projects, tasks, runs, and patches
- Inngest durable job execution for build/simulate/analyze pipeline
- Modal compute plane for remote firmware compilation and simulation
- Supabase Realtime for live run status updates
- Supabase Storage for artifact persistence

### Success Criteria

- User can create a project via the API
- User can trigger a real Modal build and simulation
- Run status updates stream to the client in real time
- Build logs and simulation traces are stored and retrievable

### Status: Complete

---

## M2: Agent Loop — Complete

**Goal:** Implement the full authoring loop — failure analysis, patch generation, and approval-gated reruns.

**Phases:** 3, 3B

### Features

- Task state machine with 11 states covering the full authoring lifecycle
- Permission profiles (`review`, `guided`, `autonomous`) controlling agent autonomy
- Resource controls: iteration limits, time limits, cost budgets
- Activity log audit trail tracking every state transition
- Vercel AI SDK integration for provider-agnostic LLM access
- Support for Anthropic (Claude) and OpenAI providers
- Structured causal analysis output parsing
- Patch proposal, approval, and rejection workflow

### Success Criteria

- User can run the full cycle: failure → analysis → patch → rerun
- Agent respects permission profile boundaries
- Resource controls prevent runaway execution
- All state transitions are recorded in the activity log
- LLM provider can be swapped via environment variable

### Status: Complete

---

## M3: Production Polish — Complete

**Goal:** Multi-board support, frontend polish, and production observability.

**Phases:** 4, 5, 6

### Features

**Phase 4 — Frontend:**
- React + Vite single-page application
- TanStack Query for server state management
- shadcn/ui component library with Tailwind CSS
- Monaco Editor for in-browser source editing
- xterm.js terminal emulator for build/simulation logs
- Keyboard shortcut support

**Phase 5 — Multi-Board:**
- Board schema with hardware capabilities (MCU, architecture, peripherals)
- Board capability validation middleware
- DockerRunner for local board builds
- CIRunner for remote board builds
- Project-to-board association

**Phase 6 — Observability:**
- Pino structured logging with contextual child loggers
- Sentry error tracking integration
- Health check endpoints (system, queue, metrics)
- Rate limiting middleware
- Input validation middleware
- Contract tests for health endpoints

### Success Criteria

- Platform supports 3+ distinct board configurations
- Frontend provides responsive, polished UX with live updates
- Health monitoring reports system status accurately
- Rate limiting prevents API abuse
- Structured logs are queryable in production
- Sentry captures and reports errors with context

### Status: Complete

---

## M4: Public Release — In Progress

**Goal:** Production-ready platform with comprehensive test coverage and complete documentation.

**Phase:** 7

### Features

- End-to-end test suite with Playwright
- Contract tests for all API endpoints
- Release documentation (CHANGELOG, migration guide, deployment guide)
- Milestone definitions and success criteria tracking

### Success Criteria

- All E2E tests pass against a live backend
- Contract tests validate API shape stability
- Documentation covers setup, migration, deployment, and architecture
- Platform is ready for public demo and external contributors

### Status: In Progress
