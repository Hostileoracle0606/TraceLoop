# Deployment Guide

This document covers the deployment process for each TraceLoop component.

## Architecture Overview

TraceLoop consists of three deployable components:

1. **Frontend** — React SPA deployed to Vercel
2. **Backend** — Node.js tRPC server (self-hosted or containerized)
3. **Modal Compute Plane** — Serverless Python functions on Modal

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│    Modal      │
│   (Vercel)   │     │  (Node.js)   │     │  (Compute)    │
└─────────────┘     └──────┬──────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │  Supabase    │
                    │ (DB + Auth)  │
                    └─────────────┘
                           │
                    ┌──────┴──────┐
                    │   Inngest    │
                    │  (Jobs)      │
                    └─────────────┘
```

---

## Frontend Deployment (Vercel)

### Configuration

- **Build command:** `npm run build` (runs `vite build`)
- **Output directory:** `dist`
- **Framework:** Vite with React plugin
- **Root directory:** `frontend/`

### Environment Variables

The frontend requires the backend URL at build time:

| Variable | Description |
|---|---|
| `VITE_TRPC_URL` | Backend tRPC API URL (e.g. `https://api.traceloop.dev/api/trpc`) |

### Deploy Steps

1. Connect the repository to Vercel
2. Set the root directory to `frontend/`
3. Add environment variables in Vercel project settings
4. Deploy — Vercel auto-deploys on push to `main`

### Preview Deployments

Vercel automatically creates preview deployments for every pull request. Each PR gets a unique URL for testing before merge.

### Local Preview

```bash
cd frontend
npm run dev      # Development server with HMR
npm run build    # Production build
npm run preview  # Preview production build locally
```

---

## Backend Deployment

### Runtime

- **Runtime:** Node.js 18+ with `tsx` (TypeScript execution)
- **Start command:** `npm run backend:start` (runs `tsx backend/trpc/server.ts`)
- **Default port:** 3000 (configurable via `PORT`)

### Environment Variables

All variables from `.env.example` are required. See `MIGRATION.md` for the complete list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `MODAL_ENDPOINT` | No | Modal compute plane URL |
| `INNGEST_EVENT_KEY` | Production | Inngest event key |
| `LLM_PROVIDER` | No | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | Conditional | Required if provider is `anthropic` |
| `OPENAI_API_KEY` | Conditional | Required if provider is `openai` |
| `SENTRY_DSN` | No | Sentry error tracking |
| `LOG_LEVEL` | No | `trace`, `debug`, `info`, `warn`, `error` |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development`, `production`, `test` |

### Health Checks

The backend exposes health endpoints for monitoring:

| Endpoint | Description |
|---|---|
| `GET /api/health` | System health (Supabase + Inngest connectivity) |
| `GET /api/health/queue` | Queue depth (pending/running runs) |
| `GET /api/metrics` | 24h metrics (run count, success rate, avg duration, active tasks) |

Use `/api/health` as the liveness probe in container orchestration.

### Monitoring

- **Logging:** Pino structured JSON logs in production, pretty-printed in development
- **Error tracking:** Sentry integration via `@sentry/node` (set `SENTRY_DSN`)
- **Log level:** Configurable via `LOG_LEVEL` environment variable

### Container Deployment (Docker)

Example `Dockerfile`:

```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY backend/ ./backend/
COPY drizzle.config.ts ./
EXPOSE 3000
CMD ["npm", "run", "backend:start"]
```

---

## Modal Compute Plane

### Overview

The Modal compute plane runs firmware build and simulation jobs in isolated containers. It is deployed as a serverless Python application.

### Deploy Command

```bash
modal deploy modal/app.py
```

### Environment Variables

Modal functions require these environment variables (set via Modal secrets or the Modal dashboard):

| Variable | Description |
|---|---|
| `ZEPHYR_BASE` | Path to the Zephyr RTOS source tree |
| `PATH` | Must include Zephyr toolchain binaries |

### Board Configurations

Each board target requires:

- A Zephyr board definition (e.g. `stm32f4_disco`)
- Appropriate toolchain installed in the Modal image
- Sufficient memory and timeout settings for the target architecture

### Local Development

For local development without Modal, the backend falls back to `DockerRunner` which uses a local Docker container with the Zephyr toolchain.

---

## Database Migrations

### Workflow

TraceLoop uses Drizzle ORM with PostgreSQL (Supabase). Migrations are managed via `drizzle-kit`.

### Commands

```bash
# Generate migration files from schema changes
npm run db:generate

# Apply pending migrations to the database
npm run db:migrate

# Push schema directly (development only — no migration files created)
npm run db:push

# Visual schema inspector (opens Drizzle Studio in browser)
npm run db:studio
```

### Migration Strategy

1. Modify the schema in `backend/db/schema.ts`
2. Run `npm run db:generate` to create a migration file in `backend/db/migrations/`
3. Review the generated SQL migration
4. Run `npm run db:migrate` to apply
5. Commit the migration file to version control

### Production Migrations

Run migrations before deploying new backend code:

```bash
NODE_ENV=production npm run db:migrate
```

The `db:migrate` command reads `DATABASE_URL` from the environment and applies any pending migrations in order.

---

## CI/CD Recommendations

### GitHub Actions Workflow

```yaml
name: CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
      - run: npm ci
      - run: npm test

  test-e2e:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
        working-directory: frontend

  deploy-staging:
    if: github.ref == 'refs/heads/main'
    needs: [test, test-e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Deploy backend to staging
      # Deploy frontend via Vercel (automatic on push)
      # Run database migrations
      # Deploy Modal functions

  deploy-production:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [test, test-e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Deploy backend to production
      # Run database migrations
      # Deploy Modal functions
      # Tag Vercel deployment
```

### Pipeline Stages

| Stage | Trigger | Description |
|---|---|---|
| Lint | Every PR/push | TypeScript type checking (`tsc --noEmit`) |
| Unit Tests | Every PR/push | Vitest test suite (`npm test`) |
| E2E Tests | Every PR/push | Playwright tests (`npx playwright test`) |
| Deploy Staging | Push to `main` | Deploy to staging environment |
| Deploy Production | Git tag (`v*`) | Deploy to production environment |

### Environment Strategy

| Environment | Branch | Database | Notes |
|---|---|---|---|
| Development | Feature branches | Local/dev Supabase | Uses Inngest Dev Server |
| Staging | `main` | Staging Supabase | Full integration testing |
| Production | Git tags | Production Supabase | Monitored with Sentry |
