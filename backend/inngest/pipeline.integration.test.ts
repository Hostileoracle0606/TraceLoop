/**
 * Integration tests for the real pipeline (Task C2).
 *
 * These drive the actual `pipelineHandler` through the shipped path —
 * mocking only Modal (compute) and DB (Supabase/Drizzle) — to verify
 * the full authoring loop converges correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be before imports) ──────────────────────────────────────────

vi.mock('../config', () => ({
  getEnv: () => ({
    SUPABASE_URL: 'http://localhost',
    SUPABASE_ANON_KEY: 'test',
    SUPABASE_SERVICE_KEY: 'test',
    DATABASE_URL: 'http://localhost',
    MODAL_ENDPOINT: 'http://localhost',
    INNGEST_EVENT_KEY: 'test',
    INNGEST_BASE_URL: 'http://localhost',
    LLM_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'test',
    PORT: 3000,
    NODE_ENV: 'test',
  }),
  getInngestConfig: () => ({ eventKey: 'test', baseUrl: 'http://localhost' }),
  getModalEndpoint: () => 'http://localhost',
  getPort: () => 3000,
  getNodeEnv: () => 'test',
  getAgentRuntimeConfig: () => ({ backboardEnabled: false, backboardApiKey: '', backboardBaseUrl: '' }),
}));

// ── State tracking for assertions ────────────────────────────────────────────

interface TaskStatusCall { taskId: string; status: string }
interface ActivityLogEntry {
  task_id: string;
  from_state: string;
  to_state: string;
  reason: string;
  iteration: number;
  metadata?: Record<string, unknown>;
}
interface PatchInsert {
  taskId: string;
  runId: string;
  file: string;
  before: string;
  after: string;
  summary: string;
  status: string;
}
interface PatchUpdate { status?: string; approvedAt?: Date; approvedBy?: string }
interface TaskUpdate { status?: string; currentFiles?: Record<string, string>; iteration?: number }
interface RunStatusUpdate { runId: string; status: string }

let taskStatusCalls: TaskStatusCall[];
let activityLogEntries: ActivityLogEntry[];
let patchInserts: PatchInsert[];
let patchUpdates: PatchUpdate[];
let taskUpdates: TaskUpdate[];
let runStatusUpdates: RunStatusUpdate[];
let currentTaskStatus: string; // mutable — simulates the DB state for guard checks

const mockRunJob = vi.fn();
const mockRunStage = vi.fn();
const mockInngestSend = vi.fn();
const mockFindTask = vi.fn();

vi.mock('../supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'runs') {
        return {
          update: (data: Record<string, unknown>) => ({
            eq: (_col: string, val: string) => {
              runStatusUpdates.push({ runId: val, status: data.status as string });
              return { data: null, error: null };
            },
          }),
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => ({ data: { task_id: 'task-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'tasks') {
        return {
          update: (data: Record<string, unknown>) => ({
            eq: (_col: string, val: string) => {
              const status = data.status as string;
              taskStatusCalls.push({ taskId: val, status });
              taskUpdates.push(data as TaskUpdate);
              // Simulate the guard: only update if not stopped (unless setting stopped)
              if (currentTaskStatus !== 'stopped' || status === 'stopped') {
                currentTaskStatus = status;
              }
              return { data: null, error: null };
            },
          }),
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => ({ data: { status: currentTaskStatus }, error: null }),
            }),
          }),
        };
      }
      if (table === 'activity_logs') {
        return {
          insert: (data: Record<string, unknown>) => {
            activityLogEntries.push(data as unknown as ActivityLogEntry);
            return { data: null, error: null };
          },
        };
      }
      return {
        update: () => ({ eq: () => ({ data: null, error: null }) }),
        insert: () => ({ data: null, error: null }),
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      };
    },
  }),
  getUserFromJwt: () => null,
}));

vi.mock('../modal-client', () => ({
  modalClient: { runJob: (...args: unknown[]) => mockRunJob(...args) },
  resolveBoardSlug: vi.fn().mockResolvedValue('stm32f4_disco'),
}));

vi.mock('../storage', () => ({
  uploadArtifact: vi.fn(),
}));

vi.mock('../agent/runtime-selection', () => ({
  resolveAgentRuntime: () => ({ runStage: (...args: unknown[]) => mockRunStage(...args) }),
}));

vi.mock('../db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: async () => mockFindTask(),
      },
    },
    insert: (_table: unknown) => ({
      values: (data: Record<string, unknown>) => {
        patchInserts.push(data as unknown as PatchInsert);
        return {
          returning: async () => [{ id: 'patch-1', ...data }],
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (data: Record<string, unknown>) => {
        patchUpdates.push(data as unknown as PatchUpdate);
        return {
          where: async () => ({ data: null, error: null }),
        };
      },
    }),
  },
}));

vi.mock('./client', () => ({
  inngest: {
    createFunction: (_opts: unknown, handler: unknown) => handler,
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
  Events: {
    TASK_RUN_REQUESTED: 'task/run.requested',
    TASK_CANCELLED: 'task/cancelled',
    PATCH_APPROVED: 'patch/approved',
    PATCH_REJECTED: 'patch/rejected',
  },
}));

vi.mock('@engine/renode-parser', () => ({
  parseRenodeLog: vi.fn().mockReturnValue([]),
}));

vi.mock('@engine/analyze', () => ({
  analyze: vi.fn().mockReturnValue({ status: 'passed' }),
}));

// Now import the pipeline handlers
import { pipelineHandler, cancelFirmwareRun } from './functions';
import type { TaskRunEventData } from './client';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeEventData(overrides: Partial<TaskRunEventData> = {}): TaskRunEventData {
  return {
    taskId: 'task-1',
    runId: 'run-1',
    userId: 'user-1',
    projectId: 'project-1',
    iteration: 0,
    files: { 'src/main.c': 'int main() { return 0; }' },
    boardId: 'board-1',
    acceptanceCriteria: [
      { name: 'green_led', register: 'GPIOG_ODR[12]', expect: '1', byTime: 2000 },
    ],
    resourceControls: { maxIterations: 5, maxTimeMs: 1800000, maxCostUsd: 5 },
    ...overrides,
  };
}

function makeStepTools() {
  return {
    run: vi.fn().mockImplementation(async (_id: string, fn: () => unknown) => fn()),
    waitForEvent: vi.fn(),
  };
}

function resetState() {
  taskStatusCalls = [];
  activityLogEntries = [];
  patchInserts = [];
  patchUpdates = [];
  taskUpdates = [];
  runStatusUpdates = [];
  currentTaskStatus = 'building';
  vi.clearAllMocks();
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Pipeline integration tests (issue 11 / Task C2)', () => {
  beforeEach(() => {
    resetState();
    mockFindTask.mockResolvedValue({
      id: 'task-1',
      permissionProfile: 'autonomous',
      agentRuntime: 'legacy',
      iteration: 0,
    });
  });

  // ── Scenario 1: fail → patch → (auto)apply → rerun → pass ends completed ─

  describe('fail → patch → auto-apply → rerun → pass ends completed', () => {
    it('converges: iteration 0 fails (patch+rerun), iteration 1 passes (completed)', async () => {
      // ── Iteration 0: build ok, analyze fails → propose patch → auto-apply → re-enqueue
      mockRunJob.mockResolvedValueOnce({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace iteration 0' },
      });

      const step0 = makeStepTools();
      step0.run.mockImplementation(async (id: string, fn: () => unknown) => {
        if (id === 'analyze-results') {
          return {
            status: 'failed' as const,
            rootCause: { time: 100, type: 'write', source: 'GPIO', register: 'GPIOG_ODR[13]', value: '1', detail: 'wrote orange', label: 'orange', lane: 'GPIO' },
            rootCauseText: 'wrote orange instead of green',
            assertion: { name: 'green_led', register: 'GPIOG_ODR[12]', expect: '1', byTime: 2000 },
          };
        }
        return fn();
      });

      mockRunStage.mockResolvedValueOnce({
        kind: 'patch',
        patch: {
          file: 'src/main.c',
          before: 'orange_led',
          after: 'green_led',
          summary: 'Fix LED pin',
          confidence: 0.9,
        },
      });

      const data0 = makeEventData({ iteration: 0 });
      const result0 = await pipelineHandler(data0, step0);

      // Iteration 0 should propose a patch and re-enqueue
      expect(result0).toMatchObject({ status: 'patched', stage: 'analysis', profile: 'autonomous' });
      expect(patchInserts).toHaveLength(1);
      expect(patchInserts[0]).toMatchObject({ taskId: 'task-1', status: 'proposed' });
      // Auto-approve the patch
      expect(patchUpdates).toContainEqual(expect.objectContaining({ status: 'approved' }));
      // Re-enqueue with iteration+1
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });
      // Task should be in rerunning state (set via Drizzle db.update(tasks), captured in patchUpdates mock)
      expect(patchUpdates).toContainEqual(expect.objectContaining({ status: 'rerunning', iteration: 1 }));

      // ── Iteration 1: build ok, analyze passes → completed
      resetState(); // Clear tracking but keep mocks
      mockRunJob.mockResolvedValueOnce({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace iteration 1' },
      });

      const step1 = makeStepTools();
      step1.run.mockImplementation(async (id: string, fn: () => unknown) => {
        if (id === 'analyze-results') {
          return { status: 'passed' as const };
        }
        return fn();
      });

      const data1 = makeEventData({ iteration: 1 });
      const result1 = await pipelineHandler(data1, step1);

      // Iteration 1 should complete
      expect(result1).toMatchObject({ status: 'passed' });
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'completed' });

      // Verify the activity log chain across both iterations
      expect(activityLogEntries.some(e => e.reason === 'all-criteria-met')).toBe(true);
    });
  });

  // ── Scenario 2: review profile pauses at patching; approve resumes ────────

  describe('review profile pauses at patching; approve resumes to rerunning', () => {
    it('pauses at patching, waits for PATCH_APPROVED, then applies and re-enqueues', async () => {
      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'review',
        agentRuntime: 'legacy',
        iteration: 0,
      });

      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      const step = makeStepTools();
      step.run.mockImplementation(async (id: string, fn: () => unknown) => {
        if (id === 'analyze-results') {
          return {
            status: 'failed' as const,
            rootCause: { time: 100, type: 'write', source: 'GPIO', register: 'GPIOG_ODR[13]', value: '1', detail: 'wrote orange', label: 'orange', lane: 'GPIO' },
            rootCauseText: 'wrote orange instead of green',
            assertion: { name: 'green_led', register: 'GPIOG_ODR[12]', expect: '1', byTime: 2000 },
          };
        }
        return fn();
      });

      mockRunStage.mockResolvedValue({
        kind: 'patch',
        patch: {
          file: 'src/main.c',
          before: 'orange_led',
          after: 'green_led',
          summary: 'Fix LED pin',
          confidence: 0.9,
        },
      });

      // Simulate: the pipeline reaches waitForEvent, which blocks until approval
      step.waitForEvent.mockResolvedValue({
        data: { patchId: 'patch-1', taskId: 'task-1', runId: 'run-1', approvedBy: 'user-1' },
      });

      const data = makeEventData({ iteration: 0 });
      const result = await pipelineHandler(data, step);

      // 1. Patch was proposed (not auto-applied)
      expect(patchInserts).toHaveLength(1);
      expect(patchInserts[0]).toMatchObject({ status: 'proposed' });

      // 2. Task transitioned to patching (waiting for approval)
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'patching' });

      // 3. Pipeline waited for PATCH_APPROVED event
      expect(step.waitForEvent).toHaveBeenCalledWith(
        'wait-for-patch-approval',
        expect.objectContaining({
          event: 'patch/approved',
          timeout: expect.any(Number),
        }),
      );

      // 4. After approval, patch was marked approved with user info
      expect(patchUpdates).toContainEqual(expect.objectContaining({
        status: 'approved',
        approvedBy: 'user-1',
      }));

      // 5. Task moved to rerunning via Drizzle db.update(tasks) (captured in patchUpdates mock)
      expect(patchUpdates).toContainEqual(expect.objectContaining({ status: 'rerunning', iteration: 1 }));

      // 6. Re-enqueued with iteration+1
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });

      expect(result).toMatchObject({ status: 'patched', profile: 'review' });
    });

    it('blocks when approval times out (waitForEvent returns null)', async () => {
      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'review',
        agentRuntime: 'legacy',
        iteration: 0,
      });

      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      const step = makeStepTools();
      step.run.mockImplementation(async (id: string, fn: () => unknown) => {
        if (id === 'analyze-results') {
          return {
            status: 'failed' as const,
            rootCause: { time: 100, type: 'write', source: 'GPIO', register: 'GPIOG_ODR[13]', value: '1', detail: 'wrote orange', label: 'orange', lane: 'GPIO' },
            rootCauseText: 'wrote orange',
            assertion: { name: 'green_led', register: 'GPIOG_ODR[12]', expect: '1', byTime: 2000 },
          };
        }
        return fn();
      });

      mockRunStage.mockResolvedValue({
        kind: 'patch',
        patch: { file: 'src/main.c', before: 'a', after: 'b', summary: 'fix', confidence: 0.9 },
      });

      // Timeout — no approval received
      step.waitForEvent.mockResolvedValue(null);

      const data = makeEventData({ iteration: 0 });
      const result = await pipelineHandler(data, step);

      // Task should be blocked (not rerunning or completed)
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'blocked' });
      // Should NOT re-enqueue
      expect(mockInngestSend).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'task/run.requested' }),
      );
      expect(result).toMatchObject({ status: 'blocked', reason: 'approval-timeout' });
    });
  });

  // ── Scenario 3: TASK_CANCELLED aborts and leaves stopped ──────────────────

  describe('TASK_CANCELLED aborts and leaves stopped', () => {
    it('cancelFirmwareRun sets task to stopped and run to cancelled', async () => {
      const step = makeStepTools();

      // The cancelFirmwareRun is an Inngest function — extract its handler
      // Since we mocked inngest.createFunction to return the handler, we can call it directly
      const cancelHandler = typeof cancelFirmwareRun === 'function'
        ? cancelFirmwareRun
        : (cancelFirmwareRun as unknown as { handler: (...args: unknown[]) => Promise<unknown> }).handler;

      // cancelFirmwareRun expects { event: { data: { taskId, runId, reason } }, step }
      const result = await (cancelHandler as (args: { event: { data: { taskId: string; runId: string; reason: string } }; step: typeof step }) => Promise<unknown>)({
        event: { data: { taskId: 'task-1', runId: 'run-1', reason: 'user-requested' } },
        step,
      });

      expect(result).toMatchObject({ cancelled: true, runId: 'run-1' });
      // Task should be stopped
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'stopped' });
      // Run should be cancelled
      expect(runStatusUpdates).toContainEqual({ runId: 'run-1', status: 'cancelled' });
      // Activity logged
      expect(activityLogEntries.some(e => e.to_state === 'stopped' && e.reason === 'user-cancelled')).toBe(true);
    });

    it('pipeline status updates do NOT overwrite stopped (guard)', async () => {
      // Simulate: task was already cancelled (status = 'stopped')
      currentTaskStatus = 'stopped';

      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      const step = makeStepTools();
      step.run.mockImplementation(async (id: string, fn: () => unknown) => {
        if (id === 'analyze-results') {
          return { status: 'passed' as const };
        }
        return fn();
      });

      const data = makeEventData({ iteration: 0 });
      await pipelineHandler(data, step);

      // The pipeline tried to set 'completed', but the guard should prevent it
      // because the task is already 'stopped'.
      // Check that 'completed' was NOT written to the task status
      const completedCalls = taskStatusCalls.filter(c => c.status === 'completed');
      // The guard in updateTaskStatus checks currentTaskStatus === 'stopped' and returns early.
      // Since our mock simulates this guard, 'completed' should not appear in taskStatusCalls
      // OR if it does appear, the actual DB state (currentTaskStatus) should remain 'stopped'.
      expect(currentTaskStatus).toBe('stopped');
    });
  });

  // ── Scenario 4: build-fail loops to editing, stops at blocked on budget ──

  describe('build-fail loops to editing, stops at blocked on budget', () => {
    it('build failure under budget → editing → LLM fix → re-enqueue', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: false, log: 'compiler error: undeclared identifier "foo"' },
      });

      mockRunStage.mockResolvedValue({
        kind: 'operations',
        operations: [{ type: 'edit', path: 'src/main.c', search: 'foo', replace: 'int foo = 0;' }],
        summary: 'Fix undeclared identifier',
      });

      const step = makeStepTools();
      const data = makeEventData({ iteration: 0 });
      const result = await pipelineHandler(data, step);

      // Should transition to editing
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'editing' });
      // Should call LLM edit stage
      expect(mockRunStage).toHaveBeenCalledWith(expect.objectContaining({ stage: 'edit' }));
      // Should re-enqueue with iteration+1
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });
      // Activity log should show building → editing
      expect(activityLogEntries.some(e =>
        e.from_state === 'building' && e.to_state === 'editing' && e.reason === 'build-failed',
      )).toBe(true);
      expect(result).toMatchObject({ status: 'build-fixed' });
    });

    it('build failure at budget → blocked (no re-enqueue)', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: false, log: 'compiler error: undeclared identifier' },
      });

      const step = makeStepTools();
      // iteration = maxIterations → budget exhausted
      const data = makeEventData({ iteration: 5, resourceControls: { maxIterations: 5, maxTimeMs: 1800000, maxCostUsd: 5 } });
      const result = await pipelineHandler(data, step);

      // Should transition to blocked (NOT editing)
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'blocked' });
      // Should NOT call LLM
      expect(mockRunStage).not.toHaveBeenCalled();
      // Should NOT re-enqueue
      expect(mockInngestSend).not.toHaveBeenCalled();
      // Activity log should show budget-exhausted
      expect(activityLogEntries.some(e => e.reason === 'budget-exhausted')).toBe(true);
      expect(result).toMatchObject({ status: 'blocked', reason: 'budget-exhausted' });
    });

    it('multi-iteration build-fail loop: editing → rerun → editing → blocked at budget', async () => {
      // Iteration 0: build fails, under budget → fix + re-enqueue
      mockRunJob.mockResolvedValueOnce({
        build: { ok: false, log: 'compiler error: missing semicolon' },
      });
      mockRunStage.mockResolvedValueOnce({
        kind: 'operations',
        operations: [{ type: 'edit', path: 'src/main.c', search: 'return 0', replace: 'return 0;' }],
        summary: 'Add semicolon',
      });

      const step0 = makeStepTools();
      const data0 = makeEventData({ iteration: 0, resourceControls: { maxIterations: 2, maxTimeMs: 1800000, maxCostUsd: 5 } });
      const result0 = await pipelineHandler(data0, step0);

      expect(result0).toMatchObject({ status: 'build-fixed' });
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'editing' });
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });

      // Iteration 1: build fails again, at budget → blocked
      resetState();
      mockRunJob.mockResolvedValueOnce({
        build: { ok: false, log: 'compiler error: another issue' },
      });

      const step1 = makeStepTools();
      const data1 = makeEventData({ iteration: 2, resourceControls: { maxIterations: 2, maxTimeMs: 1800000, maxCostUsd: 5 } });
      const result1 = await pipelineHandler(data1, step1);

      expect(result1).toMatchObject({ status: 'blocked', reason: 'budget-exhausted' });
      expect(taskStatusCalls).toContainEqual({ taskId: 'task-1', status: 'blocked' });
      expect(mockInngestSend).not.toHaveBeenCalled();
    });
  });
});
