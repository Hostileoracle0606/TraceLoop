# Backboard Feasibility Spike + Managed-Runtime Ports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute in an isolated worktree (superpowers:using-git-worktrees).

**Goal:** Verify Backboard's live behavior against TraceLoop's needs (issue 01) and introduce provider-neutral `AgentRuntime` ports with a zero-drift legacy adapter, feature flags, and ADR-0008 (issue 02) — without changing any production default.

**Architecture:** All Backboard-specific types live inside `backend/agent/adapters/backboard/`; the rest of the codebase sees only the `AgentRuntime` port. The legacy Vercel AI SDK path (`clarifyIntent`/`generatePlan`/`editSource`/`proposePatchLLM`) is wrapped by `LegacyAiSdkRuntime` and proven drift-free by parity tests. The spike is an env-gated live probe harness whose captured responses become the permanent contract-test fixtures.

**Tech Stack:** TypeScript, Zod, Vitest (`vi.mock('ai')` pattern already used in `backend/llm/__tests__/functions.test.ts`), Drizzle + hand-written SQL migrations, tsx for spike CLI, `zod-to-json-schema` (new dev dep).

**Scope:** Issues 01 and 02 only (`.scratch/backboard-agent-runtime/issues/`). Issues 03–17 get separate plans after the go/no-go report exists.

---

## Hard constraints (each one is enforced by a named test or gate)

| # | Constraint | Enforced by |
|---|---|---|
| C1 | No production default changes; Backboard cannot be selected unless `AGENT_RUNTIME_BACKBOARD_ENABLED=true` AND project opts in | Task 10 tests |
| C2 | Backboard SDK/HTTP types never escape `backend/agent/adapters/backboard/` (and spike dirs) | Task 8 architecture scan test |
| C3 | Zero behavior drift through `LegacyAiSdkRuntime`: identical results AND identical AI-SDK call arguments | Task 9 parity tests |
| C4 | Runtime is pinned at task creation and immutable mid-task | Task 10 immutability test |
| C5 | Provider errors map to stable local classes and are never classified as firmware failures | Task 1 tests |
| C6 | Spike uses only isolated resources named `traceloop-spike-*`, write-ahead-ledgered, deleted by `cleanup.ts` | Task 5 tests + Task 6 runner guard |
| C7 | No live network calls in CI: live probes require `BACKBOARD_LIVE=1` + credentials and exit otherwise | Task 6 runner guard test |
| C8 | Spike tools are fake/read-only; no repository source, secrets, or personal data leave the machine | Task 6 probe design (canned tool outputs only) |
| C9 | The model never mutates state: the Backboard skeleton rejects every call before any network I/O | Task 11 tests |
| C10 | Production runtime migration is gated on the productization fixes (B2/C1/C2/C3 of `implementation-plan.md`); only the spike may run in parallel | Plan ordering; ADR-0008 records the gate |

## Anticipated failures → test design map

Design tests for these *before* implementation. Each ID is referenced from the task that owns it.

| ID | Anticipated failure | Test to design | Layer |
|----|---|---|---|
| F1 | Tool arguments arrive as double-encoded JSON strings (`"{\"a\":1}"`), or already-parsed objects, inconsistently | `parseToolArguments` accepts object AND string forms; caps nested string-parse at 2; unparseable → `provider-malformed-response`; parseable-but-invalid → `validation-failed` | Unit (Task 2) |
| F2 | Submitting partial parallel tool outputs makes the provider reject or hang the run | `driveToolLoop` always submits ALL outputs of a batch together, substituting `{ error }` payloads for failed tools; never calls `submitOutputs` twice for one round | Unit (Task 3) + live P4 |
| F3 | Chained tool rounds loop forever | `driveToolLoop` throws `budget-exceeded` after `maxRounds` | Unit (Task 3) |
| F4 | Response lost after remote success → orphaned assistants/threads/duplicate resources | Ledger writes the *intent* record BEFORE the network call (write-ahead); live P10 proves remote listing can find orphans; report documents the reconciliation strategy or a blocker | Unit (Task 5) + live P10 |
| F5 | A Backboard/provider outage is recorded as a firmware failure and poisons the causal record | `classifyProviderError` covers timeout/429/401/404/5xx/abort/malformed; `classifyFailure` (Inngest) maps `AgentProviderError` to the infra class, never a build/criteria class | Unit (Task 1) |
| F6 | `z.coerce.boolean()` footgun: env string `"false"` coerces to `true`, silently enabling Backboard | Flag is `z.enum(['true','false'])` + transform; test asserts `"false"` → disabled | Unit (Task 10) |
| F7 | Backboard wire types leak into routers/FSM/schema, blocking rollback | Architecture test walks `backend/` + `src/` and fails on `backboard` imports outside the allowlist | Static (Task 8) |
| F8 | A task switches runtime mid-flight, losing thread/context continuity | `tasks.update`-style procedures expose no `agentRuntime` field; resolver reads only the pinned column; test attempts an update and asserts rejection | Unit (Task 10) |
| F9 | The legacy wrapper subtly changes prompts/args/results (drift) | Parity tests: mock `ai`, call direct fn and `runStage`, deep-equal results AND `mock.calls` args | Unit (Task 9) |
| F10 | Mocks encode wishful provider behavior | Normalizer fixtures are REPLACED with live-captured JSON in Task 7; Gate A requires live evidence | Process (Tasks 6–7) |
| F11 | Cancellation is only effective on provider yield; late results overwrite state | `driveToolLoop` stops submitting once status is `cancelled`; live P7 measures when cancel takes effect and whether late completions arrive | Unit (Task 3) + live P7 |
| F12 | Memory bleeds across assistants (tenant isolation failure) | Unmockable — live P8 only: two assistants, write memory to one, search the other; MUST be empty | Live only |
| F13 | Rate-limit storm: naive retries amplify 429s | Client honors `Retry-After`, exponential backoff, max 3 attempts, never retries 4xx≠429 | Unit (Task 4) |
| F14 | Spike resources orphaned after crashes | `cleanup.ts` is idempotent (re-run deletes nothing twice, tolerates 404) | Unit (Task 5) |
| F15 | Call-site swap breaks existing test mocks | Legacy runtime imports the SAME module path (`backend/llm/functions`) that contract tests `vi.mock`, so mocks keep intercepting; verified by the existing 28-test agent contract suite staying green | Regression (Task 12) |
| F16 | Skeleton adapter becomes reachable in production | Every `BackboardAgentRuntime` method throws `runtime-disabled` before any I/O when the flag is off; resolver refuses `'backboard'` when flag off | Unit (Tasks 10–11) |

## File structure

```
backend/agent/
  ports/
    agent-runtime.ts          # AgentRuntime port + stage request/response types
    semantic-memory.ts        # SemanticMemoryStore port (types only this phase)
    document-index.ts         # KnowledgeDocumentIndex port (types only this phase)
    index.ts                  # sole import surface for ports
  errors.ts                   # StableErrorClass, AgentProviderError, HttpResponseError, classifyProviderError
  runtime-selection.ts        # feature flag + per-project/per-task resolver
  tools/
    schemas.ts                # canonical Zod schemas for the 6 spike tools + parseToolArguments + toJsonSchema
    schemas.test.ts
  adapters/
    legacy-ai-sdk.ts          # LegacyAiSdkRuntime (wraps backend/llm/functions.ts)
    legacy-ai-sdk.test.ts     # parity/characterization tests
    backboard/
      types.ts                # internal wire types — NEVER exported outside this dir
      endpoints.ts            # single endpoint table, amended during spike
      client.ts               # thin HTTP client (fetch-injectable)
      client.test.ts
      normalize.ts            # normalizeRun + driveToolLoop (pure)
      normalize.test.ts
      __fixtures__/run-shapes/*.json   # doc-derived now, live-captured after spike
      runtime.ts              # BackboardAgentRuntime skeleton (always rejects this phase)
      runtime.test.ts
  spike/
    ledger.ts                 # write-ahead resource ledger (JSONL)
    ledger.test.ts
    transcript.ts             # probe transcript recorder
    transcript.test.ts
  __tests__/
    architecture.test.ts      # import-boundary scan (F7)
    errors.test.ts
    runtime-selection.test.ts
spikes/backboard-feasibility/
  run.ts                      # env-gated CLI: --probe <name> | --all
  probes.ts                   # P1..P10 definitions (fake tools only)
  cleanup.ts                  # deletes every undeleted ledger resource
docs/adr/0008-managed-conversation-runtime.md
backend/db/migrations/0004_agent_runtime.sql
.scratch/backboard-agent-runtime/backboard-feasibility-report.md   # Task 7 output
```

Modified: `backend/config.ts`, `backend/db/schema.ts`, `backend/llm/functions.ts` (export-only change), `backend/trpc/routers/agent.ts`, `backend/trpc/routers/tasks.ts` (one line), `backend/inngest/functions.ts` (one call site), `docs/agents/backboard-agent-runtime-implementation.md` (header note), `package.json` (dev dep).

Branch: `backboard-runtime-phase0` off `main`.

---

## Part A — Issue 01: feasibility spike infrastructure

### Task 1: Stable provider-error taxonomy (F5)

**Files:**
- Create: `backend/agent/errors.ts`
- Test: `backend/agent/__tests__/errors.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/agent/__tests__/errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  AgentProviderError,
  HttpResponseError,
  classifyProviderError,
} from '../errors';
import { classifyFailure } from '../../inngest/failures';
import { ZodError, z } from 'zod';

describe('classifyProviderError', () => {
  it('passes through an existing AgentProviderError unchanged', () => {
    const e = new AgentProviderError('provider-timeout', 'slow');
    expect(classifyProviderError(e)).toBe(e);
  });

  it('classifies HTTP statuses to stable classes', () => {
    expect(classifyProviderError(new HttpResponseError(401, 'no')).errorClass).toBe('provider-auth');
    expect(classifyProviderError(new HttpResponseError(403, 'no')).errorClass).toBe('provider-auth');
    expect(classifyProviderError(new HttpResponseError(404, 'gone')).errorClass).toBe('provider-resource-missing');
    expect(classifyProviderError(new HttpResponseError(429, 'later')).errorClass).toBe('provider-rate-limited');
    expect(classifyProviderError(new HttpResponseError(503, 'down')).errorClass).toBe('provider-unavailable');
  });

  it('marks retryable classes correctly', () => {
    expect(classifyProviderError(new HttpResponseError(429, '')).retryable).toBe(true);
    expect(classifyProviderError(new HttpResponseError(503, '')).retryable).toBe(true);
    expect(classifyProviderError(new HttpResponseError(401, '')).retryable).toBe(false);
    expect(classifyProviderError(new HttpResponseError(404, '')).retryable).toBe(false);
  });

  it('classifies aborts as cancelled', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(classifyProviderError(abort).errorClass).toBe('cancelled');
  });

  it('classifies timeouts', () => {
    const t = new DOMException('timed out', 'TimeoutError');
    expect(classifyProviderError(t).errorClass).toBe('provider-timeout');
  });

  it('classifies JSON syntax errors as malformed responses', () => {
    let syntaxErr: unknown;
    try { JSON.parse('{nope'); } catch (e) { syntaxErr = e; }
    expect(classifyProviderError(syntaxErr).errorClass).toBe('provider-malformed-response');
  });

  it('classifies ZodErrors as validation-failed', () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 });
    expect(r.success).toBe(false);
    expect(classifyProviderError((r as { error: ZodError }).error).errorClass).toBe('validation-failed');
  });

  it('classifies unknown network failures as provider-unavailable', () => {
    expect(classifyProviderError(new TypeError('fetch failed')).errorClass).toBe('provider-unavailable');
  });
});

describe('provider errors never become firmware failures (F5)', () => {
  it('classifyFailure treats AgentProviderError as infrastructure, not build/criteria', () => {
    const e = new AgentProviderError('provider-timeout', 'backboard timed out');
    const cls = classifyFailure(e, 'firmware-job');
    expect(cls).toBe('infra-failure');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run backend/agent/__tests__/errors.test.ts`
Expected: FAIL — `Cannot find module '../errors'`.

Note: first read `backend/inngest/failures.ts` to confirm `classifyFailure`'s exact signature and the infra class constant. If the constant is not the string `'infra-failure'`, update the assertion to the actual infra class — the invariant under test is "not a build/criteria class."

- [ ] **Step 3: Implement**

```ts
// backend/agent/errors.ts
/**
 * Stable provider-error taxonomy (issue 02 acceptance: provider errors map to
 * stable local classes instead of firmware failures).
 */

export const STABLE_ERROR_CLASSES = [
  'provider-timeout',
  'provider-rate-limited',
  'provider-auth',
  'provider-unavailable',
  'provider-malformed-response',
  'provider-resource-missing',
  'validation-failed',
  'budget-exceeded',
  'runtime-disabled',
  'runtime-unsupported',
  'cancelled',
] as const;

export type StableErrorClass = (typeof STABLE_ERROR_CLASSES)[number];

const RETRYABLE: ReadonlySet<StableErrorClass> = new Set([
  'provider-timeout',
  'provider-rate-limited',
  'provider-unavailable',
]);

export class AgentProviderError extends Error {
  readonly errorClass: StableErrorClass;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(errorClass: StableErrorClass, message: string, cause?: unknown) {
    super(message);
    this.name = 'AgentProviderError';
    this.errorClass = errorClass;
    this.retryable = RETRYABLE.has(errorClass);
    this.cause = cause;
  }
}

export class HttpResponseError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`HTTP ${status}`);
    this.name = 'HttpResponseError';
  }
}

export function classifyProviderError(error: unknown): AgentProviderError {
  if (error instanceof AgentProviderError) return error;

  if (error instanceof HttpResponseError) {
    if (error.status === 401 || error.status === 403)
      return new AgentProviderError('provider-auth', error.message, error);
    if (error.status === 404)
      return new AgentProviderError('provider-resource-missing', error.message, error);
    if (error.status === 429)
      return new AgentProviderError('provider-rate-limited', error.message, error);
    return new AgentProviderError('provider-unavailable', error.message, error);
  }

  if (error instanceof DOMException && error.name === 'AbortError')
    return new AgentProviderError('cancelled', error.message, error);
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return new AgentProviderError('provider-timeout', error.message, error);
  if (error instanceof SyntaxError)
    return new AgentProviderError('provider-malformed-response', error.message, error);
  // ZodError without importing zod here: duck-type on `issues`
  if (typeof error === 'object' && error !== null && 'issues' in error && Array.isArray((error as { issues: unknown }).issues))
    return new AgentProviderError('validation-failed', 'schema validation failed', error);

  const message = error instanceof Error ? error.message : String(error);
  return new AgentProviderError('provider-unavailable', message, error);
}
```

Then confirm `backend/inngest/failures.ts` classifies unrecognized `AgentProviderError` as infra. If it does not already (it likely keys on message/stage), add one early check at the top of `classifyFailure`:

```ts
// in backend/inngest/failures.ts, inside classifyFailure, before existing checks:
if (error instanceof Error && error.name === 'AgentProviderError') {
  return 'infra-failure';
}
```

(Use a name check, not `instanceof`, so `failures.ts` does not import from `backend/agent/` — keeps the dependency direction clean.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run backend/agent/__tests__/errors.test.ts backend/inngest/failures.test.ts`
Expected: PASS (all, including the pre-existing failures suite).

- [ ] **Step 5: Commit**

```bash
git add backend/agent/errors.ts backend/agent/__tests__/errors.test.ts backend/inngest/failures.ts
git commit -m "feat(agent): stable provider-error taxonomy; provider errors classify as infra, never firmware"
```

### Task 2: Canonical tool schemas + argument parsing (F1)

**Files:**
- Create: `backend/agent/tools/schemas.ts`
- Modify: `backend/llm/functions.ts` (export `planSchema`, `patchProposalSchema`, and the `AcceptanceCriterion`/`RootCause` interfaces — add `export` keywords only, no behavior change)
- Test: `backend/agent/tools/schemas.test.ts`

- [ ] **Step 1: Add the dev dependency**

Run: `npm install --save-dev zod-to-json-schema`
Expected: added to `package.json` devDependencies.

- [ ] **Step 2: Write the failing tests**

```ts
// backend/agent/tools/schemas.test.ts
import { describe, it, expect } from 'vitest';
import {
  agentStageTools,
  parseToolArguments,
  toJsonSchema,
} from './schemas';
import { AgentProviderError } from '../errors';

describe('agentStageTools', () => {
  it('defines exactly the six issue-01 tools', () => {
    expect(Object.keys(agentStageTools).sort()).toEqual([
      'report_blocker',
      'request_clarification',
      'submit_file_operations',
      'submit_patch',
      'submit_plan',
      'submit_task_contract',
    ]);
  });

  it('submit_plan accepts a valid plan and rejects an empty steps array', () => {
    const valid = { steps: [{ file: 'src/main.c', action: 'modify', description: 'fix pin' }], summary: 's' };
    expect(agentStageTools.submit_plan.schema.safeParse(valid).success).toBe(true);
    expect(agentStageTools.submit_plan.schema.safeParse({ steps: [], summary: 's' }).success).toBe(false);
  });

  it('submit_patch rejects confidence outside [0,1]', () => {
    const bad = { file: 'src/main.c', before: 'a', after: 'b', summary: 's', confidence: 1.5 };
    expect(agentStageTools.submit_patch.schema.safeParse(bad).success).toBe(false);
  });

  it('submit_task_contract requires at least one acceptance criterion', () => {
    const bad = { objective: 'blink LED', boardBuildTarget: 'stm32f4_disco', acceptanceCriteria: [] };
    expect(agentStageTools.submit_task_contract.schema.safeParse(bad).success).toBe(false);
  });
});

describe('parseToolArguments (F1)', () => {
  const schema = agentStageTools.submit_plan.schema;
  const plan = { steps: [{ file: 'src/main.c', action: 'modify', description: 'd' }], summary: 's' };

  it('accepts an already-parsed object', () => {
    expect(parseToolArguments(plan, schema)).toEqual(plan);
  });

  it('accepts single-encoded JSON string', () => {
    expect(parseToolArguments(JSON.stringify(plan), schema)).toEqual(plan);
  });

  it('accepts double-encoded JSON string', () => {
    expect(parseToolArguments(JSON.stringify(JSON.stringify(plan)), schema)).toEqual(plan);
  });

  it('throws provider-malformed-response on unparseable JSON', () => {
    try {
      parseToolArguments('{nope', schema);
      expect.unreachable();
    } catch (e) {
      expect((e as AgentProviderError).errorClass).toBe('provider-malformed-response');
    }
  });

  it('throws validation-failed on parseable but schema-invalid args', () => {
    try {
      parseToolArguments({ steps: [], summary: 's' }, schema);
      expect.unreachable();
    } catch (e) {
      expect((e as AgentProviderError).errorClass).toBe('validation-failed');
    }
  });
});

describe('toJsonSchema', () => {
  it('produces an object schema with required fields for submit_patch', () => {
    const js = toJsonSchema(agentStageTools.submit_patch) as { type: string; required?: string[] };
    expect(js.type).toBe('object');
    expect(js.required).toEqual(expect.arrayContaining(['file', 'before', 'after', 'summary', 'confidence']));
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run backend/agent/tools/schemas.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Export the existing schemas (no behavior change)**

In `backend/llm/functions.ts`, change the four declarations to exported (keep names, keep everything else identical):

```ts
export interface AcceptanceCriterion { ... }   // was: interface AcceptanceCriterion
export interface RootCause { ... }             // was: interface RootCause
export const planSchema = z.object({ ... });   // was: const planSchema
export const patchProposalSchema = z.object({ ... }); // was: const patchProposalSchema
```

- [ ] **Step 5: Implement schemas.ts**

```ts
// backend/agent/tools/schemas.ts
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fileOperationSchema } from '../../llm/tools';
import { planSchema, patchProposalSchema } from '../../llm/functions';
import { AgentProviderError } from '../errors';

/**
 * Canonical tool definitions for the Backboard feasibility spike (issue 01).
 * These seed the issue-08 capability registry; Zod is the single source of
 * truth and JSON Schema is generated, never hand-written.
 */

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
}

const acceptanceCriterionSchema = z.object({
  name: z.string().min(1),
  register: z.string().min(1),
  expect: z.string().min(1),
  byTime: z.number().int().positive(),
});

export const agentStageTools = {
  request_clarification: {
    name: 'request_clarification',
    description: 'Ask the minimum blocking clarification questions.',
    schema: z.object({
      questions: z.array(z.object({
        question: z.string().min(1),
        why: z.string().min(1),
        options: z.array(z.object({
          value: z.string(),
          consequence: z.string(),
        })).optional(),
        recommendedDefault: z.string().optional(),
      })).min(1),
    }),
  },
  submit_task_contract: {
    name: 'submit_task_contract',
    description: 'Submit a draft executable task contract.',
    schema: z.object({
      objective: z.string().min(1),
      boardBuildTarget: z.string().min(1),
      acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
      assumptions: z.array(z.string()).default([]),
      ambiguities: z.array(z.string()).default([]),
    }),
  },
  submit_plan: {
    name: 'submit_plan',
    description: 'Submit a structured implementation plan.',
    schema: planSchema,
  },
  submit_file_operations: {
    name: 'submit_file_operations',
    description: 'Submit validated search/replace file operations (ADR-0007).',
    schema: z.object({
      operations: z.array(fileOperationSchema).min(1),
      summary: z.string().min(1),
    }),
  },
  submit_patch: {
    name: 'submit_patch',
    description: 'Submit a minimal patch for the identified root cause.',
    schema: patchProposalSchema,
  },
  report_blocker: {
    name: 'report_blocker',
    description: 'Report that progress is blocked and why.',
    schema: z.object({
      reason: z.string().min(1),
      evidence: z.array(z.string()).default([]),
    }),
  },
} satisfies Record<string, ToolDefinition>;

/**
 * F1: providers deliver tool arguments as objects, JSON strings, or
 * double-encoded JSON strings. Normalize, then validate.
 */
export function parseToolArguments<S extends z.ZodTypeAny>(
  raw: unknown,
  schema: S,
): z.infer<S> {
  let value: unknown = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch (e) {
      throw new AgentProviderError('provider-malformed-response', 'tool arguments are not valid JSON', e);
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AgentProviderError('validation-failed', 'tool arguments failed schema validation', parsed.error);
  }
  return parsed.data;
}

export function toJsonSchema(def: ToolDefinition): object {
  return zodToJsonSchema(def.schema, { $refStrategy: 'none' });
}
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run backend/agent/tools/schemas.test.ts backend/llm/__tests__/functions.test.ts`
Expected: PASS (including the untouched LLM function tests — proves the export-only change didn't drift).

- [ ] **Step 7: Commit**

```bash
git add backend/agent/tools/ backend/llm/functions.ts package.json package-lock.json
git commit -m "feat(agent): canonical spike tool schemas with resilient argument parsing"
```

### Task 3: Run normalizer + tool-loop driver (F2, F3, F11)

**Files:**
- Create: `backend/agent/adapters/backboard/normalize.ts`
- Create: `backend/agent/adapters/backboard/__fixtures__/run-shapes/requires-action.json`, `completed.json`, `cancelled.json` (hand-derived from docs.backboard.io now; REPLACED by live captures in Task 7)
- Test: `backend/agent/adapters/backboard/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/agent/adapters/backboard/normalize.test.ts
import { describe, it, expect, vi } from 'vitest';
import { normalizeRun, driveToolLoop, type NormalizedRun } from './normalize';
import { AgentProviderError } from '../../errors';
import requiresAction from './__fixtures__/run-shapes/requires-action.json';
import completed from './__fixtures__/run-shapes/completed.json';

describe('normalizeRun', () => {
  it('normalizes a REQUIRES_ACTION run with tool calls', () => {
    const run = normalizeRun(requiresAction);
    expect(run.status).toBe('requires_action');
    expect(run.toolCalls.length).toBeGreaterThan(0);
    expect(run.toolCalls[0]).toHaveProperty('id');
    expect(run.toolCalls[0]).toHaveProperty('name');
    expect(run.toolCalls[0]).toHaveProperty('argumentsRaw');
  });

  it('normalizes a completed run with final text', () => {
    const run = normalizeRun(completed);
    expect(run.status).toBe('completed');
    expect(typeof run.finalText).toBe('string');
  });

  it('throws provider-malformed-response on an unrecognizable shape', () => {
    try {
      normalizeRun({ nothing: 'here' });
      expect.unreachable();
    } catch (e) {
      expect((e as AgentProviderError).errorClass).toBe('provider-malformed-response');
    }
  });
});

function makeRun(partial: Partial<NormalizedRun>): NormalizedRun {
  return { id: 'r1', status: 'in_progress', toolCalls: [], raw: {}, ...partial };
}

describe('driveToolLoop', () => {
  it('F2: submits ALL parallel outputs together, including error payloads', async () => {
    const states: NormalizedRun[] = [
      makeRun({
        status: 'requires_action',
        toolCalls: [
          { id: 'c1', name: 'submit_plan', argumentsRaw: '{}' },
          { id: 'c2', name: 'report_blocker', argumentsRaw: '{}' },
        ],
      }),
      makeRun({ status: 'completed', finalText: 'done' }),
    ];
    let i = 0;
    const submitOutputs = vi.fn(async () => {});
    const result = await driveToolLoop({
      getRun: async () => states[i++]!,
      submitOutputs,
      executeTool: async (call) => {
        if (call.id === 'c2') throw new Error('tool exploded');
        return { toolCallId: call.id, output: { ok: true } };
      },
      maxRounds: 3,
      sleep: async () => {},
    });
    expect(result.status).toBe('completed');
    expect(submitOutputs).toHaveBeenCalledTimes(1);
    const batch = submitOutputs.mock.calls[0]![0];
    expect(batch).toHaveLength(2);
    expect(batch.find((o: { toolCallId: string }) => o.toolCallId === 'c2').output).toHaveProperty('error');
  });

  it('F3: throws budget-exceeded after maxRounds', async () => {
    const requiresForever = makeRun({
      status: 'requires_action',
      toolCalls: [{ id: 'c1', name: 'submit_plan', argumentsRaw: '{}' }],
    });
    await expect(
      driveToolLoop({
        getRun: async () => requiresForever,
        submitOutputs: async () => {},
        executeTool: async (c) => ({ toolCallId: c.id, output: {} }),
        maxRounds: 2,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ errorClass: 'budget-exceeded' });
  });

  it('F11: stops without submitting when the run is cancelled', async () => {
    const submitOutputs = vi.fn(async () => {});
    const result = await driveToolLoop({
      getRun: async () => makeRun({ status: 'cancelled' }),
      submitOutputs,
      executeTool: async (c) => ({ toolCallId: c.id, output: {} }),
      maxRounds: 3,
      sleep: async () => {},
    });
    expect(result.status).toBe('cancelled');
    expect(submitOutputs).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the doc-derived fixtures**

`requires-action.json` (shape from docs.backboard.io/concepts/tool-calling — flagged as provisional):

```json
{
  "id": "run_spikefixture01",
  "status": "REQUIRES_ACTION",
  "required_action": {
    "tool_calls": [
      { "id": "call_1", "name": "submit_plan", "arguments": "{\"steps\":[{\"file\":\"src/main.c\",\"action\":\"modify\",\"description\":\"d\"}],\"summary\":\"s\"}" }
    ]
  }
}
```

`completed.json`:

```json
{ "id": "run_spikefixture02", "status": "COMPLETED", "output": { "text": "All criteria satisfied." } }
```

`cancelled.json`:

```json
{ "id": "run_spikefixture03", "status": "CANCELLED" }
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run backend/agent/adapters/backboard/normalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// backend/agent/adapters/backboard/normalize.ts
import { AgentProviderError } from '../../errors';

/** Provider-shape-agnostic view of a Backboard run. */
export interface NormalizedRun {
  id: string;
  status: 'in_progress' | 'requires_action' | 'completed' | 'failed' | 'cancelled' | 'expired';
  toolCalls: Array<{ id: string; name: string; argumentsRaw: unknown }>;
  finalText?: string;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  raw: unknown;
}

export interface ToolOutput {
  toolCallId: string;
  output: unknown;
}

const STATUS_MAP: Record<string, NormalizedRun['status']> = {
  IN_PROGRESS: 'in_progress',
  QUEUED: 'in_progress',
  REQUIRES_ACTION: 'requires_action',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

export function normalizeRun(raw: unknown): NormalizedRun {
  if (typeof raw !== 'object' || raw === null) {
    throw new AgentProviderError('provider-malformed-response', 'run is not an object', raw);
  }
  const r = raw as Record<string, unknown>;
  const status = STATUS_MAP[String(r.status ?? '').toUpperCase()];
  if (!r.id || !status) {
    throw new AgentProviderError('provider-malformed-response', `unrecognized run shape (status=${String(r.status)})`, raw);
  }

  const requiredAction = r.required_action as { tool_calls?: unknown[] } | undefined;
  const toolCalls = (requiredAction?.tool_calls ?? []).map((c) => {
    const call = c as Record<string, unknown>;
    return {
      id: String(call.id ?? ''),
      name: String(call.name ?? ''),
      argumentsRaw: call.arguments,
    };
  });

  const output = r.output as { text?: string } | undefined;

  return {
    id: String(r.id),
    status,
    toolCalls,
    finalText: typeof output?.text === 'string' ? output.text : undefined,
    raw,
  };
}

/**
 * Drive the REQUIRES_ACTION loop. F2: all outputs of a round are submitted
 * together (failed tools submit `{ error }` payloads). F3: bounded rounds.
 * F11: a cancelled run stops the loop without submission.
 */
export async function driveToolLoop(opts: {
  getRun: () => Promise<NormalizedRun>;
  submitOutputs: (outputs: ToolOutput[]) => Promise<void>;
  executeTool: (call: NormalizedRun['toolCalls'][number]) => Promise<ToolOutput>;
  maxRounds: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<NormalizedRun> {
  const sleep = opts.sleep ?? ((ms) => new Promise((res) => setTimeout(res, ms)));
  const interval = opts.pollIntervalMs ?? 1000;

  for (let round = 0; round < opts.maxRounds; round++) {
    let run = await opts.getRun();
    while (run.status === 'in_progress') {
      await sleep(interval);
      run = await opts.getRun();
    }
    if (run.status !== 'requires_action') return run;

    const outputs: ToolOutput[] = [];
    for (const call of run.toolCalls) {
      try {
        outputs.push(await opts.executeTool(call));
      } catch (e) {
        outputs.push({
          toolCallId: call.id,
          output: { error: e instanceof Error ? e.message : String(e) },
        });
      }
    }
    await opts.submitOutputs(outputs);
  }
  throw new AgentProviderError('budget-exceeded', `tool loop exceeded ${opts.maxRounds} rounds`);
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run backend/agent/adapters/backboard/normalize.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/agent/adapters/backboard/
git commit -m "feat(agent): backboard run normalizer and bounded all-or-nothing tool loop"
```

### Task 4: Thin Backboard HTTP client mechanics (F13)

**Files:**
- Create: `backend/agent/adapters/backboard/endpoints.ts`, `backend/agent/adapters/backboard/client.ts`, `backend/agent/adapters/backboard/types.ts`
- Test: `backend/agent/adapters/backboard/client.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/agent/adapters/backboard/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BackboardClient } from './client';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function makeClient(fetchImpl: typeof fetch) {
  return new BackboardClient({
    baseUrl: 'https://backboard.example/api',
    apiKey: 'sk-spike-test',
    fetchImpl,
    retryBaseMs: 0, // no real waiting in tests
  });
}

describe('BackboardClient mechanics', () => {
  it('sends the API key header and parses JSON', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://backboard.example/api/threads');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-spike-test');
      return jsonResponse(200, { id: 'th_1' });
    });
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.post<{ id: string }>('/threads', { name: 'traceloop-spike-t' });
    expect(out.id).toBe('th_1');
  });

  it('F13: retries 429 honoring Retry-After, then succeeds', async () => {
    const calls: number[] = [];
    const fetchImpl = vi.fn(async () => {
      calls.push(Date.now());
      return calls.length < 3
        ? jsonResponse(429, { error: 'rate' }, { 'retry-after': '0' })
        : jsonResponse(200, { ok: true });
    });
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    const out = await client.post<{ ok: boolean }>('/threads', {});
    expect(out.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('F13: gives up after 3 attempts with provider-rate-limited', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(429, {}, { 'retry-after': '0' }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.post('/threads', {})).rejects.toMatchObject({ errorClass: 'provider-rate-limited' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-429 4xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, {}));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.post('/threads', {})).rejects.toMatchObject({ errorClass: 'provider-auth' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx then classifies as provider-unavailable when exhausted', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(503, {}));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.post('/threads', {})).rejects.toMatchObject({ errorClass: 'provider-unavailable' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('classifies invalid JSON bodies as provider-malformed-response', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 200 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);
    await expect(client.get('/threads/t1')).rejects.toMatchObject({ errorClass: 'provider-malformed-response' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run backend/agent/adapters/backboard/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// backend/agent/adapters/backboard/endpoints.ts
/**
 * Single endpoint table. Paths are derived from docs.backboard.io as of
 * 2026-07-18 and are PROVISIONAL until the live spike (issue 01) verifies
 * them. Amend here only — no inline paths anywhere else.
 */
export const ENDPOINTS = {
  assistants: '/assistants',
  assistant: (id: string) => `/assistants/${id}`,
  threads: '/threads',
  thread: (id: string) => `/threads/${id}`,
  threadMessages: (id: string) => `/threads/${id}/messages`,
  threadRuns: (id: string) => `/threads/${id}/runs`,
  run: (threadId: string, runId: string) => `/threads/${threadId}/runs/${runId}`,
  submitToolOutputs: (threadId: string, runId: string) => `/threads/${threadId}/runs/${runId}/tool-outputs`,
  cancelRun: (threadId: string, runId: string) => `/threads/${threadId}/runs/${runId}/cancel`,
  memories: '/memories',
  memory: (id: string) => `/memories/${id}`,
  documents: '/documents',
  document: (id: string) => `/documents/${id}`,
} as const;
```

```ts
// backend/agent/adapters/backboard/client.ts
import { AgentProviderError, HttpResponseError, classifyProviderError } from '../../errors';

export interface BackboardClientConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryBaseMs?: number;
}

const MAX_ATTEMPTS = 3;

export class BackboardClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retryBaseMs: number;

  constructor(private readonly cfg: BackboardClientConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    this.retryBaseMs = cfg.retryBaseMs ?? 500;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.cfg.apiKey}`,
            'content-type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (!response.ok) {
          const err = new HttpResponseError(response.status, await response.text());
          const retryable = response.status === 429 || response.status >= 500;
          if (retryable && attempt < MAX_ATTEMPTS) {
            lastError = err;
            const retryAfterHeader = response.headers.get('retry-after');
            const retryAfterMs = retryAfterHeader !== null
              ? Number(retryAfterHeader) * 1000
              : this.retryBaseMs * 2 ** (attempt - 1);
            await new Promise((res) => setTimeout(res, retryAfterMs));
            continue;
          }
          throw err;
        }

        const text = await response.text();
        try {
          return (text === '' ? undefined : JSON.parse(text)) as T;
        } catch (e) {
          throw new AgentProviderError('provider-malformed-response', 'response body is not JSON', e);
        }
      } catch (e) {
        if (e instanceof AgentProviderError) throw e;
        if (e instanceof HttpResponseError) throw classifyProviderError(e);
        // AbortError / network errors are terminal for this attempt chain
        throw classifyProviderError(e);
      }
    }
    throw classifyProviderError(lastError);
  }
}
```

```ts
// backend/agent/adapters/backboard/types.ts
/**
 * Internal Backboard wire types. NEVER export these outside
 * backend/agent/adapters/backboard/ (enforced by architecture.test.ts).
 * Populated with verified shapes during the issue-01 spike.
 */
export interface WireAssistant { id: string; name?: string }
export interface WireThread { id: string; assistant_id?: string }
export interface WireMessage { id: string; role: string; content?: unknown }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run backend/agent/adapters/backboard/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/agent/adapters/backboard/
git commit -m "feat(agent): backboard http client with bounded retry, Retry-After, stable error classes"
```

### Task 5: Write-ahead resource ledger + idempotent cleanup (F4, F14)

**Files:**
- Create: `backend/agent/spike/ledger.ts`
- Test: `backend/agent/spike/ledger.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/agent/spike/ledger.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpikeLedger } from './ledger';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'spike-ledger-'));
});

describe('SpikeLedger', () => {
  it('F4: recordIntent persists BEFORE any id is known (write-ahead)', () => {
    const ledger = new SpikeLedger(join(dir, 'ledger.jsonl'));
    const intent = ledger.recordIntent({ kind: 'assistant', probe: 'P1', name: 'traceloop-spike-a1' });
    const onDisk = readFileSync(join(dir, 'ledger.jsonl'), 'utf8');
    expect(onDisk).toContain('traceloop-spike-a1');
    expect(onDisk).toContain('"externalId":null');
    ledger.confirm(intent.intentId, 'asst_123');
    expect(ledger.pendingDeletions()).toHaveLength(1);
    expect(ledger.pendingDeletions()[0]!.externalId).toBe('asst_123');
  });

  it('an unconfirmed intent still appears as an orphan candidate', () => {
    const ledger = new SpikeLedger(join(dir, 'ledger.jsonl'));
    ledger.recordIntent({ kind: 'thread', probe: 'P2', name: 'traceloop-spike-t1' });
    expect(ledger.orphanCandidates()).toHaveLength(1);
  });

  it('F14: markDeleted is idempotent and removes from pendingDeletions', () => {
    const ledger = new SpikeLedger(join(dir, 'ledger.jsonl'));
    const i = ledger.recordIntent({ kind: 'assistant', probe: 'P1', name: 'traceloop-spike-a2' });
    ledger.confirm(i.intentId, 'asst_9');
    ledger.markDeleted(i.intentId);
    ledger.markDeleted(i.intentId); // second call must not throw
    expect(ledger.pendingDeletions()).toHaveLength(0);
  });

  it('reloads state from disk (crash recovery)', () => {
    const path = join(dir, 'ledger.jsonl');
    const a = new SpikeLedger(path);
    const i = a.recordIntent({ kind: 'memory', probe: 'P8', name: 'traceloop-spike-m1' });
    a.confirm(i.intentId, 'mem_1');
    const b = new SpikeLedger(path); // fresh instance, same file
    expect(b.pendingDeletions().map((r) => r.externalId)).toEqual(['mem_1']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run backend/agent/spike/ledger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// backend/agent/spike/ledger.ts
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type SpikeResourceKind = 'assistant' | 'thread' | 'message' | 'memory' | 'document';

interface LedgerEvent {
  event: 'intent' | 'confirm' | 'deleted';
  intentId: string;
  kind?: SpikeResourceKind;
  probe?: string;
  name?: string;
  externalId?: string | null;
  at: string;
}

export interface LedgerRecord {
  intentId: string;
  kind: SpikeResourceKind;
  probe: string;
  name: string;
  externalId: string | null;
  deleted: boolean;
}

/**
 * Write-ahead JSONL ledger for spike resources (F4/F14): the intent to create
 * is durable BEFORE the network call, so a crash between request and response
 * still leaves a searchable orphan candidate.
 */
export class SpikeLedger {
  private records = new Map<string, LedgerRecord>();

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
        this.apply(JSON.parse(line) as LedgerEvent);
      }
    }
  }

  recordIntent(input: { kind: SpikeResourceKind; probe: string; name: string }): LedgerRecord {
    const event: LedgerEvent = {
      event: 'intent',
      intentId: randomUUID(),
      ...input,
      externalId: null,
      at: new Date().toISOString(),
    };
    this.write(event);
    return this.records.get(event.intentId)!;
  }

  confirm(intentId: string, externalId: string): void {
    this.write({ event: 'confirm', intentId, externalId, at: new Date().toISOString() });
  }

  markDeleted(intentId: string): void {
    if (this.records.get(intentId)?.deleted) return;
    this.write({ event: 'deleted', intentId, at: new Date().toISOString() });
  }

  /** Confirmed, not-yet-deleted resources — the cleanup work list. */
  pendingDeletions(): LedgerRecord[] {
    return [...this.records.values()].filter((r) => r.externalId !== null && !r.deleted);
  }

  /** Intents that never confirmed — candidates for remote-listing reconciliation. */
  orphanCandidates(): LedgerRecord[] {
    return [...this.records.values()].filter((r) => r.externalId === null && !r.deleted);
  }

  private write(event: LedgerEvent): void {
    appendFileSync(this.path, JSON.stringify(event) + '\n');
    this.apply(event);
  }

  private apply(event: LedgerEvent): void {
    if (event.event === 'intent') {
      this.records.set(event.intentId, {
        intentId: event.intentId,
        kind: event.kind!,
        probe: event.probe!,
        name: event.name!,
        externalId: null,
        deleted: false,
      });
    } else {
      const record = this.records.get(event.intentId);
      if (!record) return;
      if (event.event === 'confirm') record.externalId = event.externalId ?? null;
      if (event.event === 'deleted') record.deleted = true;
    }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run backend/agent/spike/ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/agent/spike/
git commit -m "feat(agent): write-ahead spike resource ledger with idempotent cleanup state"
```

### Task 6: Live probe harness (env-gated CLI)

**Files:**
- Create: `backend/agent/spike/transcript.ts` + `backend/agent/spike/transcript.test.ts`
- Create: `spikes/backboard-feasibility/run.ts`, `spikes/backboard-feasibility/probes.ts`, `spikes/backboard-feasibility/cleanup.ts`

- [ ] **Step 1: TDD the transcript recorder**

```ts
// backend/agent/spike/transcript.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranscriptRecorder } from './transcript';

describe('TranscriptRecorder', () => {
  it('writes numbered steps with redacted auth material to <probe>.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spike-tr-'));
    const t = new TranscriptRecorder(dir, 'P3-tool-loop');
    t.step('create-run', { request: { headers: { authorization: 'Bearer sk-secret' } }, response: { id: 'run_1' } });
    t.flush();
    const written = JSON.parse(readFileSync(join(dir, 'P3-tool-loop.json'), 'utf8'));
    expect(written.probe).toBe('P3-tool-loop');
    expect(written.steps).toHaveLength(1);
    expect(JSON.stringify(written)).not.toContain('sk-secret');
    expect(JSON.stringify(written)).toContain('[REDACTED]');
  });
});
```

Run: `npx vitest run backend/agent/spike/transcript.test.ts` → FAIL, then implement:

```ts
// backend/agent/spike/transcript.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_PATTERN = /(Bearer\s+)[A-Za-z0-9._-]+|(sk-[A-Za-z0-9._-]+)/g;

function redact(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value).replace(SECRET_PATTERN, '$1[REDACTED]'));
}

export class TranscriptRecorder {
  private steps: Array<{ n: number; label: string; at: string; data: unknown }> = [];

  constructor(private readonly outDir: string, private readonly probe: string) {
    mkdirSync(outDir, { recursive: true });
  }

  step(label: string, data: unknown): void {
    this.steps.push({ n: this.steps.length + 1, label, at: new Date().toISOString(), data: redact(data) });
  }

  flush(): void {
    writeFileSync(
      join(this.outDir, `${this.probe}.json`),
      JSON.stringify({ probe: this.probe, capturedAt: new Date().toISOString(), steps: this.steps }, null, 2),
    );
  }
}
```

Run: `npx vitest run backend/agent/spike/transcript.test.ts` → PASS. Commit:

```bash
git add backend/agent/spike/transcript.ts backend/agent/spike/transcript.test.ts
git commit -m "feat(agent): redacting transcript recorder for spike probes"
```

- [ ] **Step 2: Write the probe definitions**

`spikes/backboard-feasibility/probes.ts` defines the ten probes. Every probe: (a) records intents in the ledger before creating anything, (b) names every resource `traceloop-spike-<probe>-<suffix>`, (c) executes ONLY canned fake tools (constant outputs; nothing reads the repo or DB), (d) records every request/response via `TranscriptRecorder`.

| Probe | Verifies (issue-01 scope bullet) | Evidence captured |
|---|---|---|
| P1-lifecycle | assistant+thread create/retrieve/list/delete | ids, shapes, deletion status codes |
| P2-basic-turn | message → run → completion | run states over time, usage/cost fields, final message shape |
| P3-tool-loop | single `REQUIRES_ACTION` round with `submit_plan` | raw run JSON (replaces `requires-action.json` fixture), argument encoding observed (F1) |
| P4-parallel-tools | parallel calls; partial-submission behavior | provider response to partial vs full submission (F2) |
| P5-chained-rounds | tool → tool → completion | round count, state transitions |
| P6-malformed-args | prompt-engineered invalid args + local Zod rejection | whether provider retries; our `parseToolArguments` verdicts |
| P7-cancellation | cancel mid-run; when effective; late results | timing, post-cancel run status, any late completion (F11) |
| P8-memory | add/search/update/delete, async status, `Readonly`/`off`, two-assistant isolation | operation statuses; isolation result (F12 — MUST be empty across assistants) |
| P9-documents | assistant+thread scoped upload, indexing states, deletion | indexing state sequence, retrieval-before-indexed behavior |
| P10-reconciliation | response loss after remote success; rate/timeout observations | whether listing APIs can find orphans by name (F4); observed limits (F13) |

Skeleton (implement all ten following this pattern; each probe is an async function taking `{ client, ledger, recorder }`):

```ts
// spikes/backboard-feasibility/probes.ts
import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { ENDPOINTS } from '../../backend/agent/adapters/backboard/endpoints';
import { SpikeLedger } from '../../backend/agent/spike/ledger';
import { TranscriptRecorder } from '../../backend/agent/spike/transcript';
import { agentStageTools, parseToolArguments } from '../../backend/agent/tools/schemas';
import { normalizeRun, driveToolLoop } from '../../backend/agent/adapters/backboard/normalize';

export interface ProbeContext {
  client: BackboardClient;
  ledger: SpikeLedger;
  recorder: TranscriptRecorder;
}

export type Probe = (ctx: ProbeContext) => Promise<void>;

export const probes: Record<string, Probe> = {
  'P1-lifecycle': async ({ client, ledger, recorder }) => {
    const intent = ledger.recordIntent({ kind: 'assistant', probe: 'P1', name: 'traceloop-spike-P1-assistant' });
    const assistant = await client.post<{ id: string }>(ENDPOINTS.assistants, {
      name: 'traceloop-spike-P1-assistant',
      instructions: 'You are a spike fixture. Answer briefly.',
    });
    ledger.confirm(intent.intentId, assistant.id);
    recorder.step('create-assistant', { response: assistant });

    const threadIntent = ledger.recordIntent({ kind: 'thread', probe: 'P1', name: 'traceloop-spike-P1-thread' });
    const thread = await client.post<{ id: string }>(ENDPOINTS.threads, { assistantId: assistant.id });
    ledger.confirm(threadIntent.intentId, thread.id);
    recorder.step('create-thread', { response: thread });

    recorder.step('get-thread', { response: await client.get(ENDPOINTS.thread(thread.id)) });
    recorder.step('delete-thread', { response: await client.delete(ENDPOINTS.thread(thread.id)) });
    ledger.markDeleted(threadIntent.intentId);
    recorder.step('delete-assistant', { response: await client.delete(ENDPOINTS.assistant(assistant.id)) });
    ledger.markDeleted(intent.intentId);
  },
  // P2..P10 follow the same pattern; P3/P4/P5 use driveToolLoop with
  // executeTool = (call) => ({ toolCallId: call.id,
  //   output: { received: parseToolArguments(call.argumentsRaw, agentStageTools[call.name as keyof typeof agentStageTools].schema) } })
  // P8 creates TWO assistants and asserts memory search on the second returns nothing.
};
```

- [ ] **Step 3: Write the env-gated runner (C7)**

```ts
// spikes/backboard-feasibility/run.ts
// Usage: BACKBOARD_LIVE=1 BACKBOARD_API_KEY=... BACKBOARD_BASE_URL=... \
//          npx tsx spikes/backboard-feasibility/run.ts --probe P1-lifecycle | --all
import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { SpikeLedger } from '../../backend/agent/spike/ledger';
import { TranscriptRecorder } from '../../backend/agent/spike/transcript';
import { probes } from './probes';

const RESULTS_DIR = '.scratch/backboard-agent-runtime/spike-results';
const LEDGER_PATH = '.scratch/backboard-agent-runtime/spike-resources.jsonl';

async function main() {
  const { BACKBOARD_LIVE, BACKBOARD_API_KEY, BACKBOARD_BASE_URL } = process.env;
  if (BACKBOARD_LIVE !== '1' || !BACKBOARD_API_KEY || !BACKBOARD_BASE_URL) {
    console.error('Refusing to run: set BACKBOARD_LIVE=1, BACKBOARD_API_KEY, BACKBOARD_BASE_URL. (C7: never runs in CI.)');
    process.exit(1);
  }

  const argIndex = process.argv.indexOf('--probe');
  const selected = process.argv.includes('--all')
    ? Object.keys(probes)
    : argIndex !== -1 ? [process.argv[argIndex + 1]!] : [];
  if (selected.length === 0) {
    console.error(`Usage: --probe <${Object.keys(probes).join('|')}> | --all`);
    process.exit(1);
  }

  const client = new BackboardClient({ baseUrl: BACKBOARD_BASE_URL, apiKey: BACKBOARD_API_KEY });
  const ledger = new SpikeLedger(LEDGER_PATH);

  for (const name of selected) {
    const probe = probes[name];
    if (!probe) { console.error(`Unknown probe: ${name}`); process.exit(1); }
    const recorder = new TranscriptRecorder(RESULTS_DIR, name);
    console.log(`▶ ${name}`);
    try {
      await probe({ client, ledger, recorder });
      console.log(`✓ ${name}`);
    } catch (e) {
      recorder.step('probe-error', { error: e instanceof Error ? { name: e.name, message: e.message } : String(e) });
      console.error(`✗ ${name}:`, e);
    } finally {
      recorder.flush();
    }
  }
  console.log(`Pending deletions: ${ledger.pendingDeletions().length} (run cleanup.ts)`);
}

main();
```

```ts
// spikes/backboard-feasibility/cleanup.ts
// Deletes every confirmed, undeleted spike resource. Idempotent (F14): 404s count as deleted.
import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { ENDPOINTS } from '../../backend/agent/adapters/backboard/endpoints';
import { SpikeLedger } from '../../backend/agent/spike/ledger';
import { AgentProviderError } from '../../backend/agent/errors';

const paths = {
  assistant: ENDPOINTS.assistant,
  thread: ENDPOINTS.thread,
  memory: ENDPOINTS.memory,
  document: ENDPOINTS.document,
} as const;

async function main() {
  const { BACKBOARD_LIVE, BACKBOARD_API_KEY, BACKBOARD_BASE_URL } = process.env;
  if (BACKBOARD_LIVE !== '1' || !BACKBOARD_API_KEY || !BACKBOARD_BASE_URL) {
    console.error('Refusing to run: set BACKBOARD_LIVE=1, BACKBOARD_API_KEY, BACKBOARD_BASE_URL.');
    process.exit(1);
  }
  const client = new BackboardClient({ baseUrl: BACKBOARD_BASE_URL, apiKey: BACKBOARD_API_KEY });
  const ledger = new SpikeLedger('.scratch/backboard-agent-runtime/spike-resources.jsonl');

  for (const record of ledger.pendingDeletions()) {
    const toPath = paths[record.kind as keyof typeof paths];
    if (!toPath || !record.externalId) continue;
    try {
      await client.delete(toPath(record.externalId));
      ledger.markDeleted(record.intentId);
      console.log(`deleted ${record.kind} ${record.externalId}`);
    } catch (e) {
      if (e instanceof AgentProviderError && e.errorClass === 'provider-resource-missing') {
        ledger.markDeleted(record.intentId); // already gone — count as deleted
      } else {
        console.error(`FAILED ${record.kind} ${record.externalId}:`, e);
      }
    }
  }
  const orphans = ledger.orphanCandidates();
  if (orphans.length > 0) {
    console.warn(`⚠ ${orphans.length} unconfirmed intents — reconcile by listing remote resources named 'traceloop-spike-*' (P10).`);
  }
}

main();
```

- [ ] **Step 4: Verify the guard and typecheck**

Run: `npx tsx spikes/backboard-feasibility/run.ts` (no env vars)
Expected: exits 1 with the refusal message — proves C7.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add spikes/ backend/agent/spike/
git commit -m "feat(spike): env-gated backboard live probe harness with ledger and cleanup"
```

### Task 7: Execute the spike, capture fixtures, write the go/no-go report

This task requires `BACKBOARD_API_KEY` — a human supplies it. Everything before this line works without credentials.

- [ ] **Step 1: Run probes in order**

```bash
BACKBOARD_LIVE=1 BACKBOARD_API_KEY=<key> BACKBOARD_BASE_URL=<url from docs> \
  npx tsx spikes/backboard-feasibility/run.ts --all
```

Expected: transcripts in `.scratch/backboard-agent-runtime/spike-results/`. Amend `endpoints.ts` (and `types.ts`) whenever a real path/shape differs from the provisional table, and re-run the failing probe until it captures clean evidence.

- [ ] **Step 2: Replace the provisional fixtures with live captures (F10)**

Copy the raw run JSON captured by P3/P2/P7 over `backend/agent/adapters/backboard/__fixtures__/run-shapes/{requires-action,completed,cancelled}.json` (redacted transcripts contain the raw shapes). Then:

Run: `npx vitest run backend/agent/adapters/backboard/normalize.test.ts`
Expected: PASS. If it fails, fix `normalizeRun` to match reality — this is the entire point of the fixture swap.

- [ ] **Step 3: Run cleanup and verify zero remaining resources**

```bash
BACKBOARD_LIVE=1 BACKBOARD_API_KEY=<key> BACKBOARD_BASE_URL=<url> \
  npx tsx spikes/backboard-feasibility/cleanup.ts
```

Expected: every ledger record deleted or explicitly retained with a documented reason (C6).

- [ ] **Step 4: Write the report**

Create `.scratch/backboard-agent-runtime/backboard-feasibility-report.md` with exactly these sections (mirrors issue 01 acceptance):

```markdown
# Backboard feasibility report — <date>
## 1. Observed request/response shapes vs documentation   (per-endpoint table, diffs highlighted)
## 2. Tool calling                                        (REQUIRES_ACTION mechanics, argument encoding (F1), parallel all-outputs rule (F2), chained rounds, failure behavior)
## 3. Threads                                             (continuation, cancellation timing (F11), deletion, ownership/retrieval)
## 4. Memory                                              (explicit CRUD, async status, Readonly/off, ISOLATION VERDICT (F12), deletion)
## 5. Documents                                           (scopes, indexing states, incomplete-context behavior, deletion)
## 6. Reconciliation after response loss                  (strategy proven via P10, or the documented blocker) (F4)
## 7. Usage, cost, model identifiers, limits              (sufficient for policy/telemetry, or the gap)
## 8. Local Zod rejection evidence                        (P6: malformed args rejected before any fake mutation)
## 9. Resource ledger final state                         (all deleted / retained-with-reason)
## 10. GO/NO-GO DECISION — one of:
   (a) full Backboard runtime
   (b) conversation/memory only; schema-critical model calls stay on the legacy AI SDK
   (c) no production Backboard adoption
   With: which Gate A criteria passed/failed, and what issue 02+ must adapt.
```

- [ ] **Step 5: Commit**

```bash
git add backend/agent/adapters/backboard/__fixtures__/ backend/agent/adapters/backboard/endpoints.ts backend/agent/adapters/backboard/types.ts
git commit -m "feat(spike): live-captured run fixtures; endpoints verified against live Backboard"
```

(The report lives in `.scratch/` and is intentionally not committed unless the repo convention changes.)

---

## Part B — Issue 02: ports, legacy adapter, flags, ADR

Tasks 8, 9, 10, 12 do not depend on the go/no-go outcome (the legacy path must run through ports regardless). Task 11's skeleton and Task 13's ADR consume the report.

### Task 8: AgentRuntime ports + architecture boundary test (F7)

**Files:**
- Create: `backend/agent/ports/agent-runtime.ts`, `backend/agent/ports/semantic-memory.ts`, `backend/agent/ports/document-index.ts`, `backend/agent/ports/index.ts`
- Test: `backend/agent/__tests__/architecture.test.ts`

- [ ] **Step 1: Write the failing architecture test**

```ts
// backend/agent/__tests__/architecture.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '../../..');

/** Directories whose files MAY reference backboard (adapter + spike + this test). */
const ALLOWLIST = [
  'backend/agent/adapters/backboard',
  'backend/agent/spike',
  'backend/agent/__tests__',
  'spikes',
];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', '.claude', '.scratch', 'graphify-out'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

describe('C2/F7: backboard types never escape the adapter', () => {
  it('no source outside the allowlist mentions backboard imports', () => {
    const violations: string[] = [];
    for (const dir of ['backend', 'src', 'frontend/src']) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).replace(/\\/g, '/');
        if (ALLOWLIST.some((allowed) => rel.startsWith(allowed))) continue;
        const source = readFileSync(file, 'utf8');
        if (/from\s+['"][^'"]*backboard[^'"]*['"]/i.test(source)) violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — it should PASS already** (nothing imports backboard outside the allowlist yet). This test's value is as a tripwire; verify it can fail by temporarily adding `import '../adapters/backboard/client'` to `backend/agent/errors.ts`, watching it fail, then reverting.

Run: `npx vitest run backend/agent/__tests__/architecture.test.ts`
Expected: PASS (and FAIL during the tripwire check, then PASS again).

- [ ] **Step 3: Write the ports**

```ts
// backend/agent/ports/agent-runtime.ts
import type { Plan, PatchProposal, AcceptanceCriterion, RootCause } from '../../llm/functions';
import type { FileOperation } from '../../llm/tools';

/**
 * Provider-neutral agent runtime port (spec § Agent runtime ports).
 * The legacy AI SDK and Backboard adapters both implement this; nothing
 * outside backend/agent/ may depend on a specific provider.
 */

export type AgentRuntimeName = 'legacy' | 'backboard';

export type AgentStageRequest =
  | { stage: 'clarify'; taskId: string; intent: string; files: Record<string, string> }
  | { stage: 'plan'; taskId: string; intent: string; files: Record<string, string>;
      board: { name: string; mcu: string; architecture: string }; criteria: AcceptanceCriterion[] }
  | { stage: 'edit'; taskId: string; plan: Plan; files: Record<string, string>; rootCause?: RootCause }
  | { stage: 'propose-patch'; taskId: string; rootCause: RootCause; files: Record<string, string>;
      assertion: AcceptanceCriterion };

export type AgentStageResponse =
  | { kind: 'clarification'; questions: string[] | null }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'operations'; operations: FileOperation[]; summary: string }
  | { kind: 'patch'; patch: PatchProposal }
  | { kind: 'tool-calls-required'; providerRunRef: string;
      toolCalls: Array<{ id: string; name: string; argumentsRaw: unknown }> };

export interface ProjectRuntimeRef { provider: AgentRuntimeName; projectId: string; assistantId?: string }
export interface TaskConversationRef { provider: AgentRuntimeName; taskId: string; threadId?: string }
export interface ConversationView {
  messages: Array<{ id: string; role: 'user' | 'assistant' | 'tool'; text: string; createdAt?: string }>;
}

export interface AgentRuntime {
  readonly name: AgentRuntimeName;
  ensureProjectConversationScope(input: { projectId: string; userId: string }): Promise<ProjectRuntimeRef>;
  ensureTaskConversation(input: { projectId: string; taskId: string; userId: string }): Promise<TaskConversationRef>;
  runStage(request: AgentStageRequest): Promise<AgentStageResponse>;
  submitToolResults(input: {
    taskId: string; providerRunRef: string;
    outputs: Array<{ toolCallId: string; output: unknown }>;
  }): Promise<AgentStageResponse>;
  getConversation(input: { taskId: string }): Promise<ConversationView>;
  cancel(input: { taskId: string; providerRunRef?: string }): Promise<void>;
}
```

```ts
// backend/agent/ports/semantic-memory.ts
export interface MemorySearch { projectId: string; query: string; limit?: number }
export interface MemoryResult { externalId: string; content: string; score?: number }
export interface ValidatedMemory { projectId: string; content: string; sourceEvidenceRefs: string[] }
export interface MemoryUpdate { externalId: string; content: string }
export interface MemoryDelete { externalId: string }

export interface SemanticMemoryStore {
  search(input: MemorySearch): Promise<MemoryResult[]>;
  add(input: ValidatedMemory): Promise<{ externalId: string }>;
  update(input: MemoryUpdate): Promise<void>;
  delete(input: MemoryDelete): Promise<void>;
}
```

```ts
// backend/agent/ports/document-index.ts
export interface DocumentSyncRequest { projectId: string; name: string; content: string; version: string }
export interface DocumentSyncResult { externalId: string; indexingState: 'pending' | 'indexed' | 'failed' }
export interface DocumentDeleteRequest { externalId: string }

export interface KnowledgeDocumentIndex {
  synchronize(input: DocumentSyncRequest): Promise<DocumentSyncResult>;
  delete(input: DocumentDeleteRequest): Promise<void>;
}
```

```ts
// backend/agent/ports/index.ts
export * from './agent-runtime';
export * from './semantic-memory';
export * from './document-index';
```

- [ ] **Step 4: Typecheck and run the boundary test**

Run: `npx tsc --noEmit && npx vitest run backend/agent/__tests__/architecture.test.ts`
Expected: clean + PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/agent/ports/ backend/agent/__tests__/architecture.test.ts
git commit -m "feat(agent): provider-neutral AgentRuntime ports + import-boundary tripwire"
```

### Task 9: LegacyAiSdkRuntime with parity tests (C3, F9)

**Files:**
- Create: `backend/agent/adapters/legacy-ai-sdk.ts`
- Test: `backend/agent/adapters/legacy-ai-sdk.test.ts`

- [ ] **Step 1: Write the failing parity tests** (same mock pattern as `backend/llm/__tests__/functions.test.ts`)

```ts
// backend/agent/adapters/legacy-ai-sdk.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('ai', () => ({ generateText: vi.fn(), generateObject: vi.fn() }));
vi.mock('../../llm/provider', () => ({ getLLMProvider: vi.fn(() => ({ modelId: 'test-model' })) }));

import { generateText, generateObject } from 'ai';
import { clarifyIntent, generatePlan, editSource, proposePatchLLM } from '../../llm/functions';
import { LegacyAiSdkRuntime } from './legacy-ai-sdk';

const mockGenerateText = vi.mocked(generateText);
const mockGenerateObject = vi.mocked(generateObject);

const runtime = new LegacyAiSdkRuntime();
const files = { 'src/main.c': 'int main() { return 0; }' };
const board = { name: 'STM32F4 Discovery', mcu: 'STM32F407VG', architecture: 'ARM Cortex-M4' };
const criteria = [{ name: 'led_on', register: 'GPIOD_ODR', expect: '1', byTime: 2000 }];
const rootCause = { time: 100, type: 'write', source: 'src/main.c', register: 'GPIOD_ODR',
  value: '0x2000', detail: 'wrote pin 13 not 12', label: 'GPIO write', lane: 'gpio' };

beforeEach(() => { vi.clearAllMocks(); });

describe('C3/F9: LegacyAiSdkRuntime parity with direct functions', () => {
  it('clarify: identical result and identical generateText args', async () => {
    mockGenerateText.mockResolvedValue({ text: '- Which LED?\n- What frequency?' } as never);
    const direct = await clarifyIntent('blink it', files);
    const directArgs = structuredClone(mockGenerateText.mock.calls[0]);
    vi.clearAllMocks();
    mockGenerateText.mockResolvedValue({ text: '- Which LED?\n- What frequency?' } as never);
    const viaRuntime = await runtime.runStage({ stage: 'clarify', taskId: 't1', intent: 'blink it', files });
    expect(viaRuntime).toEqual({ kind: 'clarification', questions: direct!.questions });
    expect(mockGenerateText.mock.calls[0]).toEqual(directArgs);
  });

  it('clarify: NO_CLARIFICATION_NEEDED maps to questions: null', async () => {
    mockGenerateText.mockResolvedValue({ text: 'NO_CLARIFICATION_NEEDED' } as never);
    const viaRuntime = await runtime.runStage({ stage: 'clarify', taskId: 't1', intent: 'clear', files });
    expect(viaRuntime).toEqual({ kind: 'clarification', questions: null });
  });

  it('plan: identical result and identical generateObject args', async () => {
    const planObj = { steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'd' }], summary: 's' };
    mockGenerateObject.mockResolvedValue({ object: planObj } as never);
    const direct = await generatePlan('intent', files, board, criteria);
    const directArgs = structuredClone(mockGenerateObject.mock.calls[0]);
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: planObj } as never);
    const viaRuntime = await runtime.runStage({ stage: 'plan', taskId: 't1', intent: 'intent', files, board, criteria });
    expect(viaRuntime).toEqual({ kind: 'plan', plan: direct });
    expect(mockGenerateObject.mock.calls[0]).toEqual(directArgs);
  });

  it('edit: identical operations/summary and identical args (including policy filtering)', async () => {
    const plan = { steps: [{ file: 'src/main.c', action: 'modify' as const, description: 'd' }], summary: 's' };
    const editResult = {
      operations: [
        { type: 'edit' as const, path: 'src/main.c', search: 'a', replace: 'b' },
        { type: 'edit' as const, path: '../escape.c', search: 'a', replace: 'b' }, // must be filtered by policy
      ],
      summary: 'edited',
    };
    mockGenerateObject.mockResolvedValue({ object: editResult } as never);
    const direct = await editSource(plan, files);
    const directArgs = structuredClone(mockGenerateObject.mock.calls[0]);
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: editResult } as never);
    const viaRuntime = await runtime.runStage({ stage: 'edit', taskId: 't1', plan, files });
    expect(viaRuntime).toEqual({ kind: 'operations', operations: direct.operations, summary: direct.summary });
    expect((viaRuntime as { operations: unknown[] }).operations).toHaveLength(1); // traversal filtered
    expect(mockGenerateObject.mock.calls[0]).toEqual(directArgs);
  });

  it('propose-patch: identical result; protected-file error passes through unwrapped', async () => {
    const patch = { file: 'src/main.c', before: 'a', after: 'b', summary: 's', confidence: 0.9 };
    mockGenerateObject.mockResolvedValue({ object: patch } as never);
    const direct = await proposePatchLLM(rootCause, files, criteria[0]!);
    const directArgs = structuredClone(mockGenerateObject.mock.calls[0]);
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: patch } as never);
    const viaRuntime = await runtime.runStage({ stage: 'propose-patch', taskId: 't1', rootCause, files, assertion: criteria[0]! });
    expect(viaRuntime).toEqual({ kind: 'patch', patch: direct });
    expect(mockGenerateObject.mock.calls[0]).toEqual(directArgs);

    // C3: errors must NOT be rewrapped — same message as the direct call
    vi.clearAllMocks();
    mockGenerateObject.mockResolvedValue({ object: { ...patch, file: 'tests/protected.test.c' } } as never);
    await expect(
      runtime.runStage({ stage: 'propose-patch', taskId: 't1', rootCause, files, assertion: criteria[0]! }),
    ).rejects.toThrow(/protected file/i);
  });
});

describe('unsupported operations fail with stable classes', () => {
  it('submitToolResults throws runtime-unsupported', async () => {
    await expect(
      runtime.submitToolResults({ taskId: 't1', providerRunRef: 'r', outputs: [] }),
    ).rejects.toMatchObject({ errorClass: 'runtime-unsupported' });
  });

  it('getConversation returns an empty view; cancel is a no-op', async () => {
    expect(await runtime.getConversation({ taskId: 't1' })).toEqual({ messages: [] });
    await expect(runtime.cancel({ taskId: 't1' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run backend/agent/adapters/legacy-ai-sdk.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// backend/agent/adapters/legacy-ai-sdk.ts
import type {
  AgentRuntime, AgentStageRequest, AgentStageResponse,
  ProjectRuntimeRef, TaskConversationRef, ConversationView,
} from '../ports/agent-runtime';
import { clarifyIntent, generatePlan, editSource, proposePatchLLM } from '../../llm/functions';
import { AgentProviderError } from '../errors';

/**
 * Wraps the existing Vercel AI SDK functions behind the AgentRuntime port.
 * C3: transparent — no prompt changes, no error rewrapping, no added logic.
 * Domain/policy errors thrown by the wrapped functions pass through as-is.
 */
export class LegacyAiSdkRuntime implements AgentRuntime {
  readonly name = 'legacy' as const;

  async ensureProjectConversationScope(input: { projectId: string; userId: string }): Promise<ProjectRuntimeRef> {
    return { provider: 'legacy', projectId: input.projectId };
  }

  async ensureTaskConversation(input: { projectId: string; taskId: string; userId: string }): Promise<TaskConversationRef> {
    return { provider: 'legacy', taskId: input.taskId };
  }

  async runStage(request: AgentStageRequest): Promise<AgentStageResponse> {
    switch (request.stage) {
      case 'clarify': {
        const result = await clarifyIntent(request.intent, request.files);
        return { kind: 'clarification', questions: result === null ? null : result.questions };
      }
      case 'plan': {
        const plan = await generatePlan(request.intent, request.files, request.board, request.criteria);
        return { kind: 'plan', plan };
      }
      case 'edit': {
        const result = await editSource(request.plan, request.files, request.rootCause);
        return { kind: 'operations', operations: result.operations, summary: result.summary };
      }
      case 'propose-patch': {
        const patch = await proposePatchLLM(request.rootCause, request.files, request.assertion);
        return { kind: 'patch', patch };
      }
    }
  }

  async submitToolResults(): Promise<AgentStageResponse> {
    throw new AgentProviderError('runtime-unsupported', 'legacy runtime has no provider tool loop');
  }

  async getConversation(): Promise<ConversationView> {
    return { messages: [] };
  }

  async cancel(): Promise<void> {
    // Legacy AI SDK calls are single-shot; nothing to cancel.
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run backend/agent/adapters/legacy-ai-sdk.test.ts backend/llm/__tests__/functions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/agent/adapters/legacy-ai-sdk.ts backend/agent/adapters/legacy-ai-sdk.test.ts
git commit -m "feat(agent): LegacyAiSdkRuntime with strict parity tests (zero drift)"
```

### Task 10: Feature flags, migration, runtime selection (C1, C4, F6, F8, F16)

**Files:**
- Modify: `backend/config.ts` (env schema + convenience getter + test reset)
- Modify: `backend/db/schema.ts` (two columns)
- Create: `backend/db/migrations/0004_agent_runtime.sql`
- Create: `backend/agent/runtime-selection.ts`
- Modify: `backend/trpc/routers/tasks.ts` (one field in the create insert)
- Test: `backend/agent/__tests__/runtime-selection.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/agent/__tests__/runtime-selection.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isBackboardEnabled,
  resolveRuntimeForNewTask,
  resolveAgentRuntime,
  __resetRuntimeSelectionForTests,
} from '../runtime-selection';
import { LegacyAiSdkRuntime } from '../adapters/legacy-ai-sdk';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => { __resetRuntimeSelectionForTests(); });
afterEach(() => { process.env = { ...ORIGINAL_ENV }; __resetRuntimeSelectionForTests(); });

describe('F6: flag parsing has no boolean-coercion footgun', () => {
  it('unset → disabled', () => {
    delete process.env.AGENT_RUNTIME_BACKBOARD_ENABLED;
    expect(isBackboardEnabled()).toBe(false);
  });
  it('the string "false" → disabled (z.coerce.boolean would say true)', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'false';
    expect(isBackboardEnabled()).toBe(false);
  });
  it('the string "true" → enabled', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'true';
    expect(isBackboardEnabled()).toBe(true);
  });
});

describe('C1: selection for new tasks', () => {
  it('flag off → always legacy regardless of project default', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'false';
    expect(resolveRuntimeForNewTask('backboard')).toBe('legacy');
  });
  it('flag on → honors the project default', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'true';
    expect(resolveRuntimeForNewTask('backboard')).toBe('backboard');
    expect(resolveRuntimeForNewTask('legacy')).toBe('legacy');
  });
});

describe('C4/F8/F16: resolving a pinned task runtime', () => {
  it('legacy task resolves to LegacyAiSdkRuntime', () => {
    expect(resolveAgentRuntime({ agentRuntime: 'legacy' })).toBeInstanceOf(LegacyAiSdkRuntime);
  });
  it('backboard task with flag off → runtime-disabled (F16)', () => {
    process.env.AGENT_RUNTIME_BACKBOARD_ENABLED = 'false';
    expect(() => resolveAgentRuntime({ agentRuntime: 'backboard' }))
      .toThrowError(expect.objectContaining({ errorClass: 'runtime-disabled' }));
  });
  it('unknown value → runtime-unsupported, never a silent legacy fallback', () => {
    expect(() => resolveAgentRuntime({ agentRuntime: 'surprise' }))
      .toThrowError(expect.objectContaining({ errorClass: 'runtime-unsupported' }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run backend/agent/__tests__/runtime-selection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Add to the `envSchema` object in `backend/config.ts` (after the LLM block):

```ts
  // Agent runtime (issue 02) — F6: enum, NOT z.coerce.boolean(), because
  // Boolean('false') === true would silently enable Backboard.
  AGENT_RUNTIME_BACKBOARD_ENABLED: z.enum(['true', 'false']).default('false'),
  BACKBOARD_API_KEY: z.string().min(1).optional(),
  BACKBOARD_BASE_URL: z.string().url().optional(),
```

Add alongside the other convenience getters in `backend/config.ts`:

```ts
export function getAgentRuntimeConfig() {
  const e = getEnv();
  return {
    backboardEnabled: e.AGENT_RUNTIME_BACKBOARD_ENABLED === 'true',
    backboardApiKey: e.BACKBOARD_API_KEY,
    backboardBaseUrl: e.BACKBOARD_BASE_URL,
  };
}

/** Test-only: clear the cached env so per-test process.env changes apply. */
export function __resetEnvForTests(): void {
  env = undefined;
}
```

```ts
// backend/agent/runtime-selection.ts
import { getAgentRuntimeConfig, __resetEnvForTests } from '../config';
import { AgentProviderError } from './errors';
import { LegacyAiSdkRuntime } from './adapters/legacy-ai-sdk';
import type { AgentRuntime, AgentRuntimeName } from './ports/agent-runtime';

let legacySingleton: LegacyAiSdkRuntime | undefined;

export function isBackboardEnabled(): boolean {
  return getAgentRuntimeConfig().backboardEnabled;
}

/** C1: what runtime a NEW task gets, given the project default. */
export function resolveRuntimeForNewTask(projectDefault: string): AgentRuntimeName {
  if (!isBackboardEnabled()) return 'legacy';
  return projectDefault === 'backboard' ? 'backboard' : 'legacy';
}

/** C4: tasks carry a pinned runtime; resolution never falls back silently. */
export function resolveAgentRuntime(task: { agentRuntime: string }): AgentRuntime {
  switch (task.agentRuntime) {
    case 'legacy':
      return (legacySingleton ??= new LegacyAiSdkRuntime());
    case 'backboard':
      if (!isBackboardEnabled()) {
        throw new AgentProviderError('runtime-disabled', 'Backboard runtime is not enabled in this environment');
      }
      throw new AgentProviderError('runtime-unsupported', 'BackboardAgentRuntime is not implemented (issue 09)');
    default:
      throw new AgentProviderError('runtime-unsupported', `Unknown agent runtime: ${task.agentRuntime}`);
  }
}

export function __resetRuntimeSelectionForTests(): void {
  legacySingleton = undefined;
  __resetEnvForTests();
}
```

(After Task 11 lands, the `'backboard'` branch returns the skeleton instead of throwing `runtime-unsupported` — Task 11 updates it.)

Schema columns — in `backend/db/schema.ts` add to `projects`:

```ts
  agentRuntimeDefault: varchar('agent_runtime_default', { length: 16 }).notNull().default('legacy'),
```

and to `tasks` (next to `permissionProfile`):

```ts
  // Pinned at creation; never changes mid-task (C4)
  agentRuntime: varchar('agent_runtime', { length: 16 }).notNull().default('legacy'),
```

```sql
-- backend/db/migrations/0004_agent_runtime.sql
-- Issue 02: per-project runtime default + per-task pinned runtime.
-- Both default 'legacy'; Backboard is opt-in behind AGENT_RUNTIME_BACKBOARD_ENABLED.
ALTER TABLE projects ADD COLUMN agent_runtime_default varchar(16) NOT NULL DEFAULT 'legacy';
ALTER TABLE tasks ADD COLUMN agent_runtime varchar(16) NOT NULL DEFAULT 'legacy';
```

In `backend/trpc/routers/tasks.ts`, locate the `create` mutation's `.insert(tasks).values({ ... })` object and add one field (import `resolveRuntimeForNewTask` from `'../../agent/runtime-selection'`; the surrounding create already loads `project`):

```ts
        agentRuntime: resolveRuntimeForNewTask(project.agentRuntimeDefault ?? 'legacy'),
```

- [ ] **Step 4: F8 immutability check**

Grep every task-mutating procedure input schema:

Run: `grep -n "agentRuntime\|agent_runtime" backend/trpc/routers/tasks.ts`
Expected: it appears ONLY in the create insert — no update/transition procedure accepts it. If any does, remove it.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run backend/agent/__tests__/runtime-selection.test.ts backend/trpc/__tests__/contracts/tasks.test.ts && npx tsc --noEmit`
Expected: PASS + clean typecheck (tasks contract tests confirm the added column didn't break creation).

- [ ] **Step 6: Commit**

```bash
git add backend/config.ts backend/db/schema.ts backend/db/migrations/0004_agent_runtime.sql backend/agent/runtime-selection.ts backend/trpc/routers/tasks.ts backend/agent/__tests__/runtime-selection.test.ts
git commit -m "feat(agent): runtime feature flags, pinned per-task selection, agent_runtime migration"
```

### Task 11: BackboardAgentRuntime skeleton that cannot mutate (C9, F16)

**Files:**
- Create: `backend/agent/adapters/backboard/runtime.ts`
- Modify: `backend/agent/runtime-selection.ts` (return the skeleton for `'backboard'` when enabled)
- Test: `backend/agent/adapters/backboard/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/agent/adapters/backboard/runtime.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BackboardAgentRuntime } from './runtime';

describe('C9/F16: skeleton rejects everything before any I/O', () => {
  const fetchSpy = vi.fn();
  const runtime = new BackboardAgentRuntime({
    enabled: false,
    apiKey: 'sk-test',
    baseUrl: 'https://backboard.example/api',
    fetchImpl: fetchSpy as unknown as typeof fetch,
  });

  it('every method throws runtime-disabled when the flag is off', async () => {
    await expect(runtime.ensureProjectConversationScope({ projectId: 'p', userId: 'u' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.ensureTaskConversation({ projectId: 'p', taskId: 't', userId: 'u' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.runStage({ stage: 'clarify', taskId: 't', intent: 'x', files: {} }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.submitToolResults({ taskId: 't', providerRunRef: 'r', outputs: [] }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.getConversation({ taskId: 't' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
    await expect(runtime.cancel({ taskId: 't' }))
      .rejects.toMatchObject({ errorClass: 'runtime-disabled' });
  });

  it('performs zero network I/O while rejecting', () => {
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('when enabled, stage methods throw runtime-unsupported (implemented in issue 09) — still no I/O', async () => {
    const enabled = new BackboardAgentRuntime({
      enabled: true, apiKey: 'sk-test', baseUrl: 'https://backboard.example/api',
      fetchImpl: fetchSpy as unknown as typeof fetch,
    });
    await expect(enabled.runStage({ stage: 'clarify', taskId: 't', intent: 'x', files: {} }))
      .rejects.toMatchObject({ errorClass: 'runtime-unsupported' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run backend/agent/adapters/backboard/runtime.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// backend/agent/adapters/backboard/runtime.ts
import type {
  AgentRuntime, AgentStageRequest, AgentStageResponse,
  ProjectRuntimeRef, TaskConversationRef, ConversationView,
} from '../../ports/agent-runtime';
import { AgentProviderError } from '../../errors';
import { BackboardClient } from './client';

export interface BackboardRuntimeConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

/**
 * Issue 02 skeleton: holds config and a client but implements NO behavior.
 * C9/F16: every method rejects before any network I/O. Issue 09 implements
 * the conversational stages after the feasibility gate.
 */
export class BackboardAgentRuntime implements AgentRuntime {
  readonly name = 'backboard' as const;
  private readonly client: BackboardClient;

  constructor(private readonly cfg: BackboardRuntimeConfig) {
    this.client = new BackboardClient({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, fetchImpl: cfg.fetchImpl });
  }

  private guard(): never {
    if (!this.cfg.enabled) {
      throw new AgentProviderError('runtime-disabled', 'Backboard runtime is not enabled');
    }
    throw new AgentProviderError('runtime-unsupported', 'BackboardAgentRuntime stages are implemented in issue 09');
  }

  async ensureProjectConversationScope(_input: { projectId: string; userId: string }): Promise<ProjectRuntimeRef> { this.guard(); }
  async ensureTaskConversation(_input: { projectId: string; taskId: string; userId: string }): Promise<TaskConversationRef> { this.guard(); }
  async runStage(_request: AgentStageRequest): Promise<AgentStageResponse> { this.guard(); }
  async submitToolResults(_input: { taskId: string; providerRunRef: string; outputs: Array<{ toolCallId: string; output: unknown }> }): Promise<AgentStageResponse> { this.guard(); }
  async getConversation(_input: { taskId: string }): Promise<ConversationView> { this.guard(); }
  async cancel(_input: { taskId: string; providerRunRef?: string }): Promise<void> { this.guard(); }
}
```

Update the `'backboard'` branch in `backend/agent/runtime-selection.ts`:

```ts
    case 'backboard': {
      if (!isBackboardEnabled()) {
        throw new AgentProviderError('runtime-disabled', 'Backboard runtime is not enabled in this environment');
      }
      const { backboardApiKey, backboardBaseUrl } = getAgentRuntimeConfig();
      if (!backboardApiKey || !backboardBaseUrl) {
        throw new AgentProviderError('runtime-disabled', 'BACKBOARD_API_KEY / BACKBOARD_BASE_URL are not configured');
      }
      return (backboardSingleton ??= new BackboardAgentRuntime({
        enabled: true, apiKey: backboardApiKey, baseUrl: backboardBaseUrl,
      }));
    }
```

with `let backboardSingleton: BackboardAgentRuntime | undefined;` at module scope, the import added, and `backboardSingleton = undefined;` added to `__resetRuntimeSelectionForTests()`.

NOTE: this import means `runtime-selection.ts` (outside the allowlist) imports from the backboard adapter — that is the ONE sanctioned composition point. Add `'backend/agent/runtime-selection.ts'` to the architecture test's allowlist as an exact-file entry:

```ts
const ALLOWLIST = [
  'backend/agent/adapters/backboard',
  'backend/agent/spike',
  'backend/agent/__tests__',
  'backend/agent/runtime-selection.ts', // sole composition point
  'spikes',
];
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run backend/agent/ && npx tsc --noEmit`
Expected: PASS (skeleton, selection, architecture, errors, parity, schemas) + clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add backend/agent/
git commit -m "feat(agent): BackboardAgentRuntime skeleton that rejects before any I/O"
```

### Task 12: Route production call sites through the runtime port (F15)

**Files:**
- Modify: `backend/trpc/routers/agent.ts` (4 call sites)
- Modify: `backend/inngest/functions.ts` (1 call site)
- Test: existing suites are the characterization net — `backend/trpc/__tests__/contracts/agent.test.ts` (28 tests), `backend/inngest/functions.test.ts`, `backend/llm/__tests__/functions.test.ts`

F15 rationale: contract tests mock the module `backend/llm/functions`; `LegacyAiSdkRuntime` imports that same path, so existing mocks keep intercepting. No test rewrites should be needed — if one becomes necessary, that is drift and must be investigated, not patched over.

- [ ] **Step 1: Swap the router import and call sites**

In `backend/trpc/routers/agent.ts` replace the LLM import (line 5) with:

```ts
import { resolveAgentRuntime } from '../../agent/runtime-selection';
```

`clarify` (line 46):

```ts
      // was: const result = await clarifyIntent(task.intent, task.currentFiles ?? {});
      const response = await resolveAgentRuntime(task).runStage({
        stage: 'clarify', taskId: task.id, intent: task.intent, files: task.currentFiles ?? {},
      });
      if (response.kind !== 'clarification') throw new Error(`Unexpected stage response: ${response.kind}`);
      const result = response.questions === null ? null : { questions: response.questions };
      return result;
```

`plan` (line 87):

```ts
      // was: const plan = await generatePlan(...)
      const planResponse = await resolveAgentRuntime(task).runStage({
        stage: 'plan', taskId: task.id, intent: task.intent, files: task.currentFiles ?? {},
        board: { name: board.name, mcu: board.mcu, architecture: board.architecture },
        criteria: task.acceptanceCriteria,
      });
      if (planResponse.kind !== 'plan') throw new Error(`Unexpected stage response: ${planResponse.kind}`);
      const plan = planResponse.plan;
```

`edit` (line 155):

```ts
      // was: const result = await editSource(input.plan, task.currentFiles ?? {});
      const editResponse = await resolveAgentRuntime(task).runStage({
        stage: 'edit', taskId: task.id, plan: input.plan, files: task.currentFiles ?? {},
      });
      if (editResponse.kind !== 'operations') throw new Error(`Unexpected stage response: ${editResponse.kind}`);
      const result = { operations: editResponse.operations, summary: editResponse.summary };
```

`patch` (line 245):

```ts
      // was: const patch = await proposePatchLLM(input.rootCause, task.currentFiles ?? {}, input.assertion);
      const patchResponse = await resolveAgentRuntime(task).runStage({
        stage: 'propose-patch', taskId: task.id, rootCause: input.rootCause,
        files: task.currentFiles ?? {}, assertion: input.assertion,
      });
      if (patchResponse.kind !== 'patch') throw new Error(`Unexpected stage response: ${patchResponse.kind}`);
      const patch = patchResponse.patch;
```

- [ ] **Step 2: Swap the Inngest call site**

In `backend/inngest/functions.ts` `propose-patch` step (the `task` row is already loaded there), replace:

```ts
          const patchProposal = await proposePatchLLM(rootCause as unknown as Parameters<typeof proposePatchLLM>[0], data.files, assertion);
```

with:

```ts
          const stageResponse = await resolveAgentRuntime(task).runStage({
            stage: 'propose-patch',
            taskId: data.taskId,
            rootCause: rootCause as unknown as RootCause,
            files: data.files,
            assertion,
          });
          if (stageResponse.kind !== 'patch') throw new Error(`Unexpected stage response: ${stageResponse.kind}`);
          const patchProposal = stageResponse.patch;
```

adding imports `import { resolveAgentRuntime } from '../agent/runtime-selection';` and `import type { RootCause } from '../llm/functions';`, and removing the now-unused `proposePatchLLM` import.

- [ ] **Step 3: Run the full characterization net**

Run: `npx vitest run backend/ && npx tsc --noEmit`
Expected: ALL backend suites PASS unchanged. Any agent-contract failure = wrapper drift → fix the wrapper, never the test.

- [ ] **Step 4: Commit**

```bash
git add backend/trpc/routers/agent.ts backend/inngest/functions.ts
git commit -m "refactor(agent): route router and pipeline LLM calls through the AgentRuntime port"
```

### Task 13: ADR-0008 + implementer-brief alignment

**Files:**
- Create: `docs/adr/0008-managed-conversation-runtime.md`
- Modify: `docs/agents/backboard-agent-runtime-implementation.md` (prepend a status header)

- [ ] **Step 1: Write the ADR** (fill the Decision section from the Task 7 go/no-go — the bracketed choice is the only open slot):

```markdown
# ADR-0008: Managed conversation runtime behind provider-neutral ports

**Status:** Accepted — <date>
**Supersedes:** ADR-0006's provider/runtime *selection* only. "The LLM serves the FSM" (ADR-0006), the real execution path (ADR-0005), and search/replace edit validation (ADR-0007) remain in force.

## Decision
[One of, per the issue-01 feasibility report: full Backboard runtime / conversation+memory only with
legacy schema-critical calls / no production adoption.] All model access flows through the
`AgentRuntime` port (`backend/agent/ports/`). The legacy Vercel AI SDK path is the default runtime,
wrapped drift-free by `LegacyAiSdkRuntime`. Backboard is selectable only when
`AGENT_RUNTIME_BACKBOARD_ENABLED=true` AND the project opts in; tasks pin their runtime at creation.

## Ownership map (unchanged authorities)
Task truth, FSM transitions, source, runs, artifacts, causal evidence: Supabase + pure reducer + Inngest.
Conversation continuity and (if adopted) semantic memory: Backboard, behind ports, never authoritative.

## Rollback
Setting the flag to 'false' strands no state: every authoritative record is local; existing tasks
remain pinned to the runtime they started with; `LegacyAiSdkRuntime` serves all new tasks.

## Gate
Production Backboard adoption is additionally gated on the productization baseline
(`docs/productization/blocking-fixes-plan.md` + remaining B2/C1/C2/C3 of `implementation-plan.md`).
```

- [ ] **Step 2: Prepend to `docs/agents/backboard-agent-runtime-implementation.md`:**

```markdown
> **Status note (issue 02):** This brief is subordinate to
> `.scratch/backboard-agent-runtime/spec.md`. Where they conflict on sequencing or
> system-wide architecture, the spec is authoritative. See ADR-0008.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0008-managed-conversation-runtime.md docs/agents/backboard-agent-runtime-implementation.md
git commit -m "docs: ADR-0008 managed conversation runtime; subordinate the implementer brief to the spec"
```

### Task 14: Full verification + handoff report

- [ ] **Step 1: Full gate**

```bash
npx tsc --noEmit && npx vitest run src/ && npx vitest run backend/
```

Expected: typecheck clean; every suite green (baseline was 367 tests before this plan; every task added more).

- [ ] **Step 2: Constraint sweep**

```bash
# C2: boundary tripwire is active
npx vitest run backend/agent/__tests__/architecture.test.ts
# C1: no default changed
grep -rn "agent_runtime" backend/db/migrations/0004_agent_runtime.sql   # both DEFAULT 'legacy'
# C7: live guard refuses without env
npx tsx spikes/backboard-feasibility/run.ts; echo "exit=$?"             # expect exit=1
```

- [ ] **Step 3: Write the handoff** (spec § Implementer handoff format): externally observable behavior changed (none for existing tasks — that is the point), boundaries added, files/migrations/flags, tests run (mock vs live separated), Backboard resources created + cleanup status, unresolved provider risks, deployment/rollback implications (run migration 0004; no env changes required for legacy operation), next unblocked issue (03 and 04 per the ticket map).

- [ ] **Step 4: Merge decision** — use superpowers:finishing-a-development-branch (PR to `main` recommended; do not touch production env flags).

---

## Self-review

**Spec coverage (issues 01 + 02):** issue 01 scope bullets → probes P1–P10 (Task 6 table) + Tasks 1–5 infrastructure + Task 7 report/acceptance; issue 02 bullets → ADR (13), ports (8), legacy wrapper zero-drift (9, 12), skeleton with no type leak (11, 8), flags + pinned selection (10), retry/timeout/redaction/error centralization (1, 4, Task 6 transcript redaction), brief alignment (13). Deliberately deferred to later issues, per the spec's own ticket map: real Backboard stages (09), capability dispatcher (08), TaskContract (03), activities (04).
**Placeholder scan:** every code step contains complete code; the two intentionally open slots (ADR decision bracket, report findings) are outputs of the live spike by definition, not placeholders.
**Type consistency:** `AgentProviderError.errorClass` used consistently; `NormalizedRun`/`ToolOutput` shared between Tasks 3–4–6; `AcceptanceCriterion`/`RootCause`/`planSchema`/`patchProposalSchema` exported once in Task 2 and imported thereafter; `resolveAgentRuntime({ agentRuntime })` signature identical in Tasks 10–12.
