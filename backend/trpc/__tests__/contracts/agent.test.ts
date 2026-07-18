import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { agentRouter } from '../../routers/agent';
import { createMockDb, createMockContext, VALID_UUID, VALID_TASK_UUID, testUser, otherUser } from './helpers';

// Mock LLM functions
vi.mock('../../llm/functions', () => ({
  clarifyIntent: vi.fn().mockResolvedValue({ questions: [] }),
  generatePlan: vi.fn().mockResolvedValue({ steps: [], summary: '' }),
  editSource: vi.fn().mockResolvedValue({ files: {} }),
  proposePatchLLM: vi.fn().mockResolvedValue({ file: 'main.c', diff: '' }),
}));

// Mock validate middleware
vi.mock('../../middleware/validate', () => ({
  sanitizePath: vi.fn(),
  validatePlanLimits: vi.fn(),
}));

function createCaller(user: { id: string } | null, db?: ReturnType<typeof createMockDb>) {
  const mockDb = db ?? createMockDb();
  const ctx = createMockContext(user, mockDb);
  return { caller: agentRouter.createCaller(ctx), db: mockDb };
}

describe('agent router contracts', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  // ── Auth enforcement ───────────────────────────────────────────────

  describe('authentication', () => {
    it('clarify requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.clarify({ taskId: VALID_TASK_UUID })).rejects.toThrow(TRPCError);
    });

    it('plan requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.plan({ taskId: VALID_TASK_UUID })).rejects.toThrow(TRPCError);
    });

    it('edit requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        plan: { steps: [], summary: 'test' },
      })).rejects.toThrow(TRPCError);
    });

    it('patch requires authentication', async () => {
      const { caller } = createCaller(null, mockDb);
      await expect(caller.patch({
        taskId: VALID_TASK_UUID,
        rootCause: {
          time: 100, type: 'error', source: 'main.c',
          register: 'R0', value: '0x0', detail: 'test',
          label: 'test', lane: 'main',
        },
        assertion: { name: 'test', register: 'GPIOA', expect: '0x1', byTime: 1000 },
      })).rejects.toThrow(TRPCError);
    });
  });

  // ── Input validation ───────────────────────────────────────────────

  describe('input validation', () => {
    it('clarify validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.clarify({ taskId: 'bad' })).rejects.toThrow();
    });

    it('plan validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.plan({ taskId: 'bad' })).rejects.toThrow();
    });

    it('edit validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.edit({
        taskId: 'bad',
        plan: { steps: [], summary: 'test' },
      })).rejects.toThrow();
    });

    it('edit validates plan structure - steps required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        // @ts-expect-error - testing missing required field
        plan: { summary: 'test' },
      })).rejects.toThrow();
    });

    it('edit validates plan structure - summary required', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        // @ts-expect-error - testing missing required field
        plan: { steps: [] },
      })).rejects.toThrow();
    });

    it('edit validates plan step structure', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        plan: {
          steps: [{ file: 'main.c' }] as any, // missing action, description
          summary: 'test',
        },
      })).rejects.toThrow();
    });

    it('edit validates plan step action enum', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        plan: {
          steps: [{ file: 'main.c', action: 'invalid' as any, description: 'test' }],
          summary: 'test',
        },
      })).rejects.toThrow();
    });

    it('patch validates taskId UUID', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.patch({
        taskId: 'bad',
        rootCause: {
          time: 100, type: 'error', source: 'main.c',
          register: 'R0', value: '0x0', detail: 'test',
          label: 'test', lane: 'main',
        },
        assertion: { name: 'test', register: 'GPIOA', expect: '0x1', byTime: 1000 },
      })).rejects.toThrow();
    });

    it('patch validates rootCause structure', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.patch({
        taskId: VALID_TASK_UUID,
        rootCause: { time: 100 } as any, // missing required fields
        assertion: { name: 'test', register: 'GPIOA', expect: '0x1', byTime: 1000 },
      })).rejects.toThrow();
    });

    it('patch validates assertion structure', async () => {
      const { caller } = createCaller(testUser, mockDb);
      await expect(caller.patch({
        taskId: VALID_TASK_UUID,
        rootCause: {
          time: 100, type: 'error', source: 'main.c',
          register: 'R0', value: '0x0', detail: 'test',
          label: 'test', lane: 'main',
        },
        assertion: { name: 'test' } as any, // missing required fields
      })).rejects.toThrow();
    });
  });

  // ── Ownership enforcement ──────────────────────────────────────────

  describe('ownership', () => {
    it('clarify throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.clarify({ taskId: VALID_TASK_UUID })).rejects.toThrow('Task not found');
    });

    it('clarify throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'clarification-needed',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.clarify({ taskId: VALID_TASK_UUID })).rejects.toThrow('Access denied');
    });

    it('plan throws access denied for different user', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'planning',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: otherUser.id,
      });

      await expect(caller.plan({ taskId: VALID_TASK_UUID })).rejects.toThrow('Access denied');
    });
  });

  // ── FSM state checks ──────────────────────────────────────────────

  describe('FSM state enforcement', () => {
    it('clarify rejects wrong FSM state (planning)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'planning',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.clarify({ taskId: VALID_TASK_UUID })).rejects.toThrow(
        "Cannot clarify: task is in 'planning' state, expected 'clarification-needed'"
      );
    });

    it('clarify rejects wrong FSM state (editing)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'editing',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.clarify({ taskId: VALID_TASK_UUID })).rejects.toThrow(
        "Cannot clarify: task is in 'editing' state"
      );
    });

    it('plan rejects wrong FSM state (editing)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'editing',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.plan({ taskId: VALID_TASK_UUID })).rejects.toThrow(
        "Cannot plan: task is in 'editing' state, expected 'planning'"
      );
    });

    it('plan rejects wrong FSM state (building)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'building',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.plan({ taskId: VALID_TASK_UUID })).rejects.toThrow(
        "Cannot plan: task is in 'building' state"
      );
    });

    it('edit rejects wrong FSM state (planning)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'planning',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        plan: { steps: [], summary: 'test' },
      })).rejects.toThrow(
        "Cannot edit: task is in 'planning' state, expected 'editing'"
      );
    });

    it('edit rejects wrong FSM state (building)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'building',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        plan: { steps: [], summary: 'test' },
      })).rejects.toThrow(
        "Cannot edit: task is in 'building' state"
      );
    });

    it('patch rejects wrong FSM state (planning)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'planning',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.patch({
        taskId: VALID_TASK_UUID,
        rootCause: {
          time: 100, type: 'error', source: 'main.c',
          register: 'R0', value: '0x0', detail: 'test',
          label: 'test', lane: 'main',
        },
        assertion: { name: 'test', register: 'GPIOA', expect: '0x1', byTime: 1000 },
      })).rejects.toThrow(
        "Cannot patch: task is in 'planning' state, expected 'patching'"
      );
    });

    it('patch rejects wrong FSM state (editing)', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue({
        id: VALID_TASK_UUID, projectId: VALID_UUID, status: 'editing',
      });
      db.query.projects.findFirst.mockResolvedValue({
        id: VALID_UUID, userId: testUser.id,
      });

      await expect(caller.patch({
        taskId: VALID_TASK_UUID,
        rootCause: {
          time: 100, type: 'error', source: 'main.c',
          register: 'R0', value: '0x0', detail: 'test',
          label: 'test', lane: 'main',
        },
        assertion: { name: 'test', register: 'GPIOA', expect: '0x1', byTime: 1000 },
      })).rejects.toThrow(
        "Cannot patch: task is in 'editing' state"
      );
    });

    it('plan throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.plan({ taskId: VALID_TASK_UUID })).rejects.toThrow('Task not found');
    });

    it('edit throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.edit({
        taskId: VALID_TASK_UUID,
        plan: { steps: [], summary: 'test' },
      })).rejects.toThrow('Task not found');
    });

    it('patch throws for non-existent task', async () => {
      const { caller, db } = createCaller(testUser, mockDb);
      db.query.tasks.findFirst.mockResolvedValue(null);

      await expect(caller.patch({
        taskId: VALID_TASK_UUID,
        rootCause: {
          time: 100, type: 'error', source: 'main.c',
          register: 'R0', value: '0x0', detail: 'test',
          label: 'test', lane: 'main',
        },
        assertion: { name: 'test', register: 'GPIOA', expect: '0x1', byTime: 1000 },
      })).rejects.toThrow('Task not found');
    });
  });
});
