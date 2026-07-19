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

// Track DB operations for assertions
const mockUpdateTaskStatus = vi.fn();
const mockLogActivity = vi.fn();
const mockInsertPatch = vi.fn();
const mockUpdatePatch = vi.fn();
const mockUpdateTask = vi.fn();
const mockFindTask = vi.fn();

vi.mock('../supabase', () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      if (table === 'runs') {
        return {
          update: (_data: unknown) => ({
            eq: (_col: string, _val: string) => ({ data: null, error: null }),
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
          update: (data: unknown) => ({
            eq: (_col: string, _val: string) => {
              mockUpdateTaskStatus(_val, (data as Record<string, unknown>).status);
              mockUpdateTask(_val, data);
              return { data: null, error: null };
            },
          }),
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => ({ data: { status: 'building' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'activity_logs') {
        return {
          insert: (data: unknown) => {
            mockLogActivity(data);
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

const mockRunJob = vi.fn();
vi.mock('../modal-client', () => ({
  modalClient: { runJob: (...args: unknown[]) => mockRunJob(...args) },
  resolveBoardSlug: vi.fn().mockResolvedValue('stm32f4_disco'),
}));

vi.mock('../storage', () => ({
  uploadArtifact: vi.fn(),
}));

// Mock agent runtime
const mockRunStage = vi.fn();
vi.mock('../agent/runtime-selection', () => ({
  resolveAgentRuntime: () => ({ runStage: (...args: unknown[]) => mockRunStage(...args) }),
}));

// Mock db for patches insert/update and task queries
vi.mock('../db', () => ({
  db: {
    query: {
      tasks: {
        findFirst: async () => mockFindTask(),
      },
    },
    insert: (_table: unknown) => ({
      values: (data: unknown) => {
        mockInsertPatch(data);
        return {
          returning: async () => [{ id: 'patch-1', ...(data as object) }],
        };
      },
    }),
    update: (_table: unknown) => ({
      set: (data: unknown) => {
        mockUpdatePatch(data);
        return {
          where: async () => ({ data: null, error: null }),
        };
      },
    }),
  },
}));

const mockInngestSend = vi.fn();

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

// Mock engine imports
vi.mock('@engine/renode-parser', () => ({
  parseRenodeLog: vi.fn().mockReturnValue([]),
}));

vi.mock('@engine/analyze', () => ({
  analyze: vi.fn().mockReturnValue({ status: 'passed' }),
}));

// Now import the pipeline handler directly
import { pipelineHandler } from './functions';
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Pipeline authoring loop (issue 05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindTask.mockResolvedValue({
      id: 'task-1',
      permissionProfile: 'autonomous',
      agentRuntime: 'legacy',
      iteration: 0,
    });
  });

  describe('pass case', () => {
    it('transitions to completed when tests pass', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      const step = makeStepTools();
      // analyzeResults step returns passed
      step.run.mockImplementation(async (id: string, fn: () => unknown) => {
        if (id === 'analyze-results') {
          return { status: 'passed' as const };
        }
        return fn();
      });

      const result = await pipelineHandler(makeEventData(), step);

      expect(result).toMatchObject({ status: 'passed' });
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'completed');
    });
  });

  describe('build failure handling', () => {
    it('transitions to editing and re-enqueues when build fails (under budget)', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: false, log: 'compiler error: undeclared identifier' },
      });

      // LLM edit stage returns file operations
      mockRunStage.mockResolvedValue({
        kind: 'operations',
        operations: [{ type: 'edit', path: 'src/main.c', search: 'undeclared', replace: 'int x;' }],
        summary: 'Fix undeclared identifier',
      });

      const step = makeStepTools();
      const data = makeEventData({ iteration: 0 });
      const result = await pipelineHandler(data, step);

      // Should transition to editing
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'editing');
      // Should call LLM to fix
      expect(mockRunStage).toHaveBeenCalledWith(expect.objectContaining({ stage: 'edit' }));
      // Should re-enqueue with iteration+1
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });
      expect(result).toMatchObject({ status: 'build-fixed' });
    });

    it('transitions to blocked when build fails at max iterations (budget exhausted)', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: false, log: 'compiler error: undeclared identifier' },
      });

      const step = makeStepTools();
      // iteration 5, maxIterations 5 → should block
      const data = makeEventData({ iteration: 5 });
      const result = await pipelineHandler(data, step);

      // Should transition to blocked (not editing)
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'blocked');
      // Should NOT re-enqueue
      expect(mockInngestSend).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'blocked' });
    });

    it('transitions to blocked when build fails and iteration >= maxIterations', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: false, log: 'compiler error' },
      });

      const step = makeStepTools();
      // iteration 5, maxIterations 5 → should block
      const data = makeEventData({ iteration: 5 });
      await pipelineHandler(data, step);

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'blocked');
      expect(mockInngestSend).not.toHaveBeenCalled();
    });
  });

  describe('test failure handling — autonomous profile', () => {
    it('proposes patch, auto-applies, and re-enqueues with iteration+1', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'autonomous',
        agentRuntime: 'legacy',
        iteration: 0,
      });

      const step = makeStepTools();
      // Analysis returns failed with root cause
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

      // propose-patch stage returns a patch
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

      const data = makeEventData({ iteration: 0 });
      await pipelineHandler(data, step);

      // Should persist a patch
      expect(mockInsertPatch).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
        status: 'proposed',
      }));

      // Should auto-approve the patch for autonomous
      expect(mockUpdatePatch).toHaveBeenCalledWith(expect.objectContaining({
        status: 'approved',
      }));

      // Should re-enqueue with iteration+1
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });
    });

    it('does NOT re-enqueue when iteration >= maxIterations (budget)', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'autonomous',
        agentRuntime: 'legacy',
        iteration: 5,
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

      const data = makeEventData({ iteration: 5 });
      await pipelineHandler(data, step);

      // Should transition to blocked, NOT re-enqueue
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'blocked');
      expect(mockInngestSend).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'task/run.requested' })
      );
    });
  });

  describe('test failure handling — review/guided profile', () => {
    it('persists patch as proposed and waits for PATCH_APPROVED event', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'review',
        agentRuntime: 'legacy',
        iteration: 0,
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

      // waitForEvent returns an approval event
      step.waitForEvent.mockResolvedValue({
        data: { patchId: 'patch-1', taskId: 'task-1', runId: 'run-1', approvedBy: 'user-1' },
      });

      const data = makeEventData({ iteration: 0 });
      await pipelineHandler(data, step);

      // Should persist patch as proposed
      expect(mockInsertPatch).toHaveBeenCalledWith(expect.objectContaining({
        status: 'proposed',
      }));

      // Should wait for PATCH_APPROVED
      expect(step.waitForEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          event: 'patch/approved',
          timeout: expect.any(Number),
        }),
      );

      // After approval, should re-enqueue
      expect(mockInngestSend).toHaveBeenCalledWith({
        name: 'task/run.requested',
        data: expect.objectContaining({ iteration: 1 }),
      });
    });

    it('transitions to blocked when PATCH_APPROVED times out', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'review',
        agentRuntime: 'legacy',
        iteration: 0,
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

      // waitForEvent returns null (timeout)
      step.waitForEvent.mockResolvedValue(null);

      const data = makeEventData({ iteration: 0 });
      await pipelineHandler(data, step);

      // Should transition to blocked on timeout
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'blocked');
      // Should NOT re-enqueue
      expect(mockInngestSend).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'task/run.requested' })
      );
    });

    it('works the same for guided profile (waits for approval)', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: true, log: 'build ok' },
        trace: { log: 'trace data' },
      });

      mockFindTask.mockResolvedValue({
        id: 'task-1',
        permissionProfile: 'guided',
        agentRuntime: 'legacy',
        iteration: 0,
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

      step.waitForEvent.mockResolvedValue({
        data: { patchId: 'patch-1', taskId: 'task-1', runId: 'run-1', approvedBy: 'user-1' },
      });

      const data = makeEventData({ iteration: 0 });
      await pipelineHandler(data, step);

      // Guided should also wait for approval
      expect(step.waitForEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ event: 'patch/approved' }),
      );
    });
  });

  describe('budget enforcement', () => {
    it('uses resourceControls.maxIterations from event data', async () => {
      mockRunJob.mockResolvedValue({
        build: { ok: false, log: 'compiler error' },
      });

      const step = makeStepTools();
      // maxIterations = 3, iteration = 3 → should block
      const data = makeEventData({ iteration: 3, resourceControls: { maxIterations: 3, maxTimeMs: 1800000, maxCostUsd: 5 } });
      await pipelineHandler(data, step);

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-1', 'blocked');
      expect(mockInngestSend).not.toHaveBeenCalled();
    });
  });
});
